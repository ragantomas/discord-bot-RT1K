const { fetchWithTimeout, cancelResponseBody } = require('./http');

const LEETIFY_TIMEOUT_MS = 10000;

function parseRetryAfterMs(headerVal) {
    if (!headerVal) return 0;
    const raw = String(headerVal).trim();
    const secs = Number(raw);
    if (Number.isFinite(secs) && secs > 0) {
        return Math.min(Math.round(secs * 1000), 10 * 60 * 1000);
    }
    const parsedDate = Date.parse(raw);
    if (Number.isFinite(parsedDate)) {
        const diff = parsedDate - Date.now();
        if (diff > 0) return Math.min(diff, 10 * 60 * 1000);
    }
    return 0;
}

async function fetchLeetifyProfileDetailed(steam64Id) {
    try {
        const res = await fetchWithTimeout(
            `https://api-public.cs-prod.leetify.com/v3/profile?steam64_id=${encodeURIComponent(steam64Id)}`,
            { headers: { 'User-Agent': 'CS2-Discord-Bot/1.0' } },
            LEETIFY_TIMEOUT_MS
        );

        if (res.status === 429) {
            const retryAfterMs = parseRetryAfterMs(res.headers.get('retry-after'));
            await cancelResponseBody(res);
            return {
                ok: false,
                status: 429,
                notFound: false,
                rateLimited: true,
                retryAfterMs,
                data: null
            };
        }

        if (res.status === 404) {
            await cancelResponseBody(res);
            return {
                ok: false,
                status: 404,
                notFound: true,
                rateLimited: false,
                retryAfterMs: 0,
                data: null
            };
        }

        if (!res.ok) {
            await cancelResponseBody(res);
            return {
                ok: false,
                status: res.status,
                notFound: false,
                rateLimited: false,
                retryAfterMs: 0,
                data: null
            };
        }

        const data = await res.json();
        return {
            ok: true,
            status: res.status,
            notFound: false,
            rateLimited: false,
            retryAfterMs: 0,
            data
        };
    } catch (err) {
        return {
            ok: false,
            status: 0,
            notFound: false,
            rateLimited: false,
            retryAfterMs: 0,
            data: null,
            error: err?.message || 'network_error'
        };
    }
}

async function fetchLeetifyProfile(steam64Id) {
    const result = await fetchLeetifyProfileDetailed(steam64Id);
    return result.ok ? result.data : null;
}

module.exports = {
    fetchLeetifyProfile,
    fetchLeetifyProfileDetailed
};
