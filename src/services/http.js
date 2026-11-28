async function cancelResponseBody(res) {
    try {
        if (res?.body && !res.bodyUsed && typeof res.body.cancel === 'function') {
            await res.body.cancel();
        }
    } catch {
        // Ignore stream cancellation errors
    }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (typeof timer.unref === 'function') {
        timer.unref();
    }

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal
        });
    } finally {
        clearTimeout(timer);
    }
}

module.exports = {
    cancelResponseBody,
    fetchWithTimeout
};
