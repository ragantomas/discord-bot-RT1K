const http = require('node:http');
const https = require('node:https');
const zlib = require('node:zlib');

const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function createAbortError() {
    const err = new Error('This operation was aborted');
    err.name = 'AbortError';
    return err;
}

function createHeadersWrapper(rawHeaders = {}) {
    const normalized = new Map();
    for (const [key, value] of Object.entries(rawHeaders)) {
        if (value === undefined) continue;
        const lower = key.toLowerCase();
        normalized.set(lower, Array.isArray(value) ? value.join(', ') : String(value));
    }

    return {
        get(name) {
            if (!name) return null;
            return normalized.get(String(name).toLowerCase()) ?? null;
        }
    };
}

function decompressBody(buffer, contentEncoding) {
    if (!buffer || buffer.length === 0) return buffer;
    const encoding = String(contentEncoding || '').toLowerCase().trim();
    if (!encoding) return buffer;

    if (encoding.includes('gzip')) {
        return zlib.gunzipSync(buffer);
    }
    if (encoding.includes('deflate')) {
        return zlib.inflateSync(buffer);
    }
    if (encoding.includes('br')) {
        return zlib.brotliDecompressSync(buffer);
    }
    return buffer;
}

async function cancelResponseBody(res) {
    try {
        if (res?.body && !res.bodyUsed && typeof res.body.cancel === 'function') {
            await res.body.cancel();
        }
    } catch {
        // Ignore stream cancellation errors
    }
}

function performRequest(targetUrl, options, deadlineAt, redirectsLeft) {
    return new Promise((resolve, reject) => {
        let parsedUrl;
        try {
            parsedUrl = new URL(targetUrl);
        } catch (err) {
            reject(err);
            return;
        }

        const isHttps = parsedUrl.protocol === 'https:';
        const transport = isHttps ? https : http;
        const upperMethod = String(options.method || 'GET').toUpperCase();
        const discardBody = Boolean(options.discardBody);

        const headers = {};
        if (options.headers && typeof options.headers === 'object') {
            for (const [k, v] of Object.entries(options.headers)) {
                if (v !== undefined && v !== null) {
                    headers[k] = String(v);
                }
            }
        }

        let payload = options.body ?? null;
        if (payload instanceof URLSearchParams) {
            payload = payload.toString();
            const hasContentType = Object.keys(headers).some(k => k.toLowerCase() === 'content-type');
            if (!hasContentType) {
                headers['Content-Type'] = 'application/x-www-form-urlencoded';
            }
        }
        if (payload !== null && payload !== undefined) {
            const hasContentLength = Object.keys(headers).some(k => k.toLowerCase() === 'content-length');
            if (!hasContentLength) {
                headers['Content-Length'] = String(Buffer.byteLength(payload));
            }
        }

        const remainingMs = Math.max(1, deadlineAt - Date.now());
        let settled = false;
        let timeoutTimer = null;
        let req = null;

        const cleanup = () => {
            if (timeoutTimer) {
                clearTimeout(timeoutTimer);
                timeoutTimer = null;
            }
        };

        const finishResolve = (val) => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(val);
        };

        const finishReject = (err) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(err);
        };

        req = transport.request(
            parsedUrl,
            {
                method: upperMethod,
                headers,
                agent: false
            },
            (res) => {
                const status = res.statusCode || 0;

                if (REDIRECT_STATUSES.has(status) && res.headers.location && redirectsLeft > 0) {
                    const nextUrl = new URL(res.headers.location, parsedUrl).toString();
                    const nextOrigin = new URL(nextUrl).origin;
                    res.resume();
                    res.destroy();

                    if (settled) return;
                    settled = true;
                    cleanup();

                    const nextHeaders = { ...headers };
                    delete nextHeaders['Content-Length'];
                    delete nextHeaders['content-length'];
                    if (nextOrigin !== parsedUrl.origin) {
                        for (const k of Object.keys(nextHeaders)) {
                            if (k.toLowerCase() === 'authorization') delete nextHeaders[k];
                        }
                    }

                    const switchToGet = status === 303 || ((status === 301 || status === 302) && upperMethod === 'POST');
                    const nextOptions = {
                        ...options,
                        method: switchToGet ? 'GET' : upperMethod,
                        headers: nextHeaders,
                        body: switchToGet ? null : payload
                    };

                    performRequest(nextUrl, nextOptions, deadlineAt, redirectsLeft - 1).then(resolve, reject);
                    return;
                }

                const wrappedHeaders = createHeadersWrapper(res.headers);
                const ok = status >= 200 && status < 300;

                if (upperMethod === 'HEAD' || discardBody) {
                    res.destroy();
                    finishResolve({
                        ok,
                        status,
                        headers: wrappedHeaders,
                        body: null,
                        bodyUsed: true,
                        text: async () => '',
                        json: async () => null
                    });
                    return;
                }

                const chunks = [];
                let totalBytes = 0;

                res.on('data', (chunk) => {
                    if (settled) return;
                    totalBytes += chunk.length;
                    if (totalBytes > MAX_RESPONSE_BYTES) {
                        chunks.length = 0;
                        const sizeErr = new Error(`Response body exceeded ${MAX_RESPONSE_BYTES} bytes limit`);
                        res.destroy(sizeErr);
                        finishReject(sizeErr);
                        return;
                    }
                    chunks.push(chunk);
                });

                res.on('end', () => {
                    if (settled) return;
                    try {
                        const rawBuffer = Buffer.concat(chunks);
                        chunks.length = 0;
                        const decodedBuffer = decompressBody(rawBuffer, res.headers['content-encoding']);
                        const rawText = decodedBuffer.toString('utf8');

                        const responseObj = {
                            ok,
                            status,
                            headers: wrappedHeaders,
                            body: null,
                            bodyUsed: false,
                            async text() {
                                responseObj.bodyUsed = true;
                                return rawText;
                            },
                            async json() {
                                responseObj.bodyUsed = true;
                                return JSON.parse(rawText);
                            }
                        };
                        finishResolve(responseObj);
                    } catch (err) {
                        chunks.length = 0;
                        finishReject(err);
                    }
                });

                res.on('aborted', () => {
                    chunks.length = 0;
                    finishReject(createAbortError());
                });

                res.on('error', (err) => {
                    chunks.length = 0;
                    finishReject(err);
                });
            }
        );

        timeoutTimer = setTimeout(() => {
            const abortErr = createAbortError();
            req.destroy(abortErr);
            finishReject(abortErr);
        }, remainingMs);
        if (typeof timeoutTimer.unref === 'function') {
            timeoutTimer.unref();
        }

        req.setTimeout(remainingMs, () => {
            const abortErr = createAbortError();
            req.destroy(abortErr);
            finishReject(abortErr);
        });

        req.on('error', (err) => {
            finishReject(err);
        });

        if (payload !== null && payload !== undefined) {
            req.write(payload);
        }
        req.end();
    });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const safeTimeoutMs = Math.max(1, Number(timeoutMs) || 10000);
    const maxRedirects = Number.isInteger(options.maxRedirects) ? options.maxRedirects : DEFAULT_MAX_REDIRECTS;
    return performRequest(url, options, Date.now() + safeTimeoutMs, maxRedirects);
}

module.exports = {
    cancelResponseBody,
    fetchWithTimeout
};
