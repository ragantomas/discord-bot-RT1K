const { CS2_APP_ID } = require('../config');

const STEAM_NEWS_URL = 'https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/';
const STEAM_CLAN_IMAGE_BASE = 'https://clan.fastly.steamstatic.com/images';
const REQUEST_TIMEOUT_MS = 10000;

/**
 * Stiahne CS2 novinky z verejného Steam News API.
 * Pri zlyhaní siete alebo API vracia null, aby volajúci nezmenil uložený stav.
 */
async function fetchCs2News({ mode = 'all', count = 10 } = {}) {
    const params = new URLSearchParams({
        appid: String(CS2_APP_ID),
        count: String(count),
        maxlength: '0',
        feeds: 'steam_community_announcements'
    });

    if (mode === 'patchnotes') {
        params.set('tags', 'patchnotes');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const res = await fetch(`${STEAM_NEWS_URL}?${params.toString()}`, {
            headers: { 'User-Agent': 'CS2-Discord-Bot/1.0' },
            signal: controller.signal
        });

        if (!res.ok) {
            console.error(`Steam News API vrátilo status ${res.status} (mode=${mode}).`);
            return null;
        }

        const data = await res.json();
        return Array.isArray(data?.appnews?.newsitems) ? data.appnews.newsitems : [];
    } catch (err) {
        console.error(`Chyba pri sťahovaní Steam CS2 noviniek (mode=${mode}):`, err);
        return null;
    } finally {
        clearTimeout(timeoutId);
    }
}

function resolveSteamImageUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return null;

    const normalized = rawUrl
        .trim()
        .replace(/\{STEAM_CLAN_IMAGE\}\/?/gi, `${STEAM_CLAN_IMAGE_BASE}/`);

    return /^https?:\/\//i.test(normalized) ? normalized : null;
}

function extractFirstImageUrl(contents) {
    if (!contents || typeof contents !== 'string') return null;

    const bbMatch = contents.match(/\[img\]([^\[]+?)\[\/img\]/i);
    if (bbMatch) {
        const url = resolveSteamImageUrl(bbMatch[1]);
        if (url) return url;
    }

    const htmlMatch = contents.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (htmlMatch) {
        const url = resolveSteamImageUrl(htmlMatch[1]);
        if (url) return url;
    }

    return null;
}

function decodeHtmlEntities(text) {
    return text
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&nbsp;/gi, ' ');
}

function formatSteamContentsToMarkdown(contents) {
    if (!contents || typeof contents !== 'string') return '';

    let text = contents.replace(/\r\n/g, '\n');

    // YouTube náhľady a obrázky (obrázok sa zobrazí samostatne v embede)
    text = text.replace(/\[previewyoutube=([^;\]]+)[^\]]*\]\[\/previewyoutube\]/gi, (_, videoId) => {
        return `https://youtu.be/${videoId.trim()}`;
    });
    text = text.replace(/\[img\][\s\S]*?\[\/img\]/gi, '');
    text = text.replace(/<img[^>]*>/gi, '');

    // Odkazy (BBCode aj HTML)
    text = text.replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, (_, url, label) => {
        const cleanUrl = url.trim().replace(/^["']|["']$/g, '');
        const cleanLabel = label.trim() || cleanUrl;
        return `[${cleanLabel}](${cleanUrl})`;
    });
    text = text.replace(/\[url\]([\s\S]*?)\[\/url\]/gi, (_, url) => url.trim());
    text = text.replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, url, label) => {
        const cleanLabel = label.trim() || url.trim();
        return `[${cleanLabel}](${url.trim()})`;
    });

    // Nadpisy
    text = text.replace(/\[h[1-3]\]([\s\S]*?)\[\/h[1-3]\]/gi, '\n### $1\n');
    text = text.replace(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi, '\n### $1\n');

    // Základné formátovanie textu
    text = text.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '**$1**');
    text = text.replace(/<(?:b|strong)[^>]*>([\s\S]*?)<\/(?:b|strong)>/gi, '**$1**');
    text = text.replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '*$1*');
    text = text.replace(/<(?:i|em)[^>]*>([\s\S]*?)<\/(?:i|em)>/gi, '*$1*');
    text = text.replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '__$1__');
    text = text.replace(/<u[^>]*>([\s\S]*?)<\/u>/gi, '__$1__');
    text = text.replace(/\[strike\]([\s\S]*?)\[\/strike\]/gi, '~~$1~~');
    text = text.replace(/<(?:s|del|strike)[^>]*>([\s\S]*?)<\/(?:s|del|strike)>/gi, '~~$1~~');
    text = text.replace(/\[code\]([\s\S]*?)\[\/code\]/gi, '`$1`');
    text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

    // Zoznamy a oddeľovače
    text = text.replace(/\[\/?(?:list|olist)\]/gi, '\n');
    text = text.replace(/<\/?(?:ul|ol)[^>]*>/gi, '\n');
    text = text.replace(/\[\*\]/gi, '\n• ');
    text = text.replace(/\[\/\*\]/gi, '');
    text = text.replace(/<li[^>]*>/gi, '\n• ');
    text = text.replace(/<\/li>/gi, '');

    text = text.replace(/\[hr\]\[\/hr\]/gi, '\n───\n');
    text = text.replace(/<hr[^>]*>/gi, '\n───\n');
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/p>/gi, '\n');
    text = text.replace(/<p[^>]*>/gi, '');

    // Odstránenie zvyšných HTML a BBCode značiek bez rozbitia Markdown odkazov [text](url)
    text = text.replace(/<[^>]+>/g, '');
    text = text.replace(/\[\/?(?:quote|spoiler|table|tr|td|th|noparse|p|expand|dynamiclink|carousel)[^\]]*\]/gi, '');

    text = decodeHtmlEntities(text);

    return text
        .split('\n')
        .map(line => line.trimEnd())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function truncateForEmbed(text, maxLength = 3800, readMoreUrl = null) {
    if (!text || text.length <= maxLength) return text || '';

    const suffix = readMoreUrl
        ? `\n\n… [Čítať celý changelog na Steame](${readMoreUrl})`
        : '\n\n…';

    const budget = Math.max(100, maxLength - suffix.length);
    const slice = text.slice(0, budget);

    const lastNewline = slice.lastIndexOf('\n');
    const lastSpace = slice.lastIndexOf(' ');

    let cutAt = budget;
    if (lastNewline > budget * 0.6) {
        cutAt = lastNewline;
    } else if (lastSpace > budget * 0.6) {
        cutAt = lastSpace;
    }

    return `${slice.slice(0, cutAt).trimEnd()}${suffix}`;
}

module.exports = {
    fetchCs2News,
    extractFirstImageUrl,
    formatSteamContentsToMarkdown,
    truncateForEmbed
};
