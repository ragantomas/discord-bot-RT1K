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

const SPECIAL_UPPER_TOKENS = new Map([
    'UI', 'HUD', 'CS2', 'CS:GO', 'FPS', 'VAC', 'VR', 'AI', 'GSI', 'HDR',
    'DX11', 'GOTV', 'CSTV', 'XP', 'API', 'SDK', 'PGL', 'ESL', 'IEM', 'BLAST',
    'AWP', 'AK-47', 'M4A4', 'M4A1-S', 'MP9', 'MP7', 'MP5-SD', 'P90', 'P250',
    'CZ75-Auto', 'USP-S', 'SSG', 'SG', 'AUG', 'MAC-10', 'MAG-7', 'XM1014', 'R8'
].map(token => [token.toUpperCase(), token]));

function formatSectionTitle(rawTitle) {
    return rawTitle
        .trim()
        .split(/\s+/)
        .map(word => {
            const exact = SPECIAL_UPPER_TOKENS.get(word.toUpperCase());
            if (exact) return exact;

            if (word.includes('-')) {
                return word
                    .split('-')
                    .map(seg => {
                        if (!seg) return seg;
                        const segExact = SPECIAL_UPPER_TOKENS.get(seg.toUpperCase());
                        if (segExact) return segExact;
                        return seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase();
                    })
                    .join('-');
            }

            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(' ');
}

function extractFirstImageUrl(contents) {
    if (!contents || typeof contents !== 'string') return null;

    const candidates = [];
    const patterns = [
        /\[img\]([^\[]+?)\[\/img\]/gi,
        /<img[^>]+src=["']([^"']+)["']/gi,
        /\[video\b[^\]]*\bposter=["']([^"']+)["'][^\]]*\]/gi
    ];

    for (const pattern of patterns) {
        for (const match of contents.matchAll(pattern)) {
            const url = resolveSteamImageUrl(match[1]);
            if (url) {
                candidates.push({ index: match.index ?? 0, url });
                break;
            }
        }
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.index - b.index);
    return candidates[0].url;
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

function isPlainSubheading(line) {
    if (!line || line.length > 60) return false;
    if (line.startsWith('- ') || /^\*\*.*\*\*$/.test(line)) return false;
    if (/[.!?,]$/.test(line)) return false;
    if (/https?:\/\//i.test(line)) return false;
    return true;
}

function formatLinesLikePatchBot(rawText) {
    const rawLines = rawText.split('\n').map(line => line.trim());

    // 1. Prvý priechod: rozpoznanie sekcií [ SECTION ], odrážok a nadpisov
    const classified = rawLines.map(line => {
        if (!line) return { type: 'blank', text: '' };

        const sectionMatch = line.match(/^\*{0,2}\[\s*([^\[\]]+?)\s*\]\*{0,2}$/);
        if (sectionMatch) {
            return { type: 'section', text: `**${formatSectionTitle(sectionMatch[1])}**` };
        }

        if (line.startsWith('- ')) {
            return { type: 'bullet', text: line };
        }

        if (/^\*\*.+\*\*$/.test(line)) {
            return { type: 'heading', text: line };
        }

        return { type: 'text', text: line };
    });

    // 2. Rozpoznanie krátkych podnadpisov (napr. "Cobblestone", "Inferno") pred odrážkami
    for (let i = 0; i < classified.length; i++) {
        if (classified[i].type !== 'text') continue;

        let nextNonBlank = null;
        for (let j = i + 1; j < classified.length; j++) {
            if (classified[j].type !== 'blank') {
                nextNonBlank = classified[j];
                break;
            }
        }

        if (nextNonBlank?.type === 'bullet' && isPlainSubheading(classified[i].text)) {
            classified[i] = { type: 'subheading', text: `**${classified[i].text}**` };
        }
    }

    // 3. Druhý priechod: čisté medzery medzi sekciami, podnadpismi a odrážkami
    const output = [];
    let pendingBlank = false;
    let lastType = null;

    for (let i = 0; i < classified.length; i++) {
        const item = classified[i];

        if (item.type === 'blank') {
            if (lastType !== null) pendingBlank = true;
            continue;
        }

        let nextNonBlankType = null;
        for (let j = i + 1; j < classified.length; j++) {
            if (classified[j].type !== 'blank') {
                nextNonBlankType = classified[j].type;
                break;
            }
        }

        let addBlankBefore = false;

        if (lastType !== null) {
            if (item.type === 'section') {
                addBlankBefore = true;
            } else if (item.type === 'subheading') {
                addBlankBefore = lastType === 'bullet' || lastType === 'text';
            } else if (item.type === 'heading') {
                addBlankBefore = true;
            } else if (item.type === 'bullet') {
                addBlankBefore = false;
            } else if (pendingBlank) {
                const tightHeadingToBody = (lastType === 'section' || lastType === 'subheading' || lastType === 'heading')
                    && (item.type === 'bullet' || item.type === 'subheading');
                addBlankBefore = !tightHeadingToBody;
            }
        }

        if (addBlankBefore && output.length > 0 && output[output.length - 1] !== '') {
            output.push('');
        }

        output.push(item.text);
        lastType = item.type;
        pendingBlank = false;

        // Potlačí prázdny riadok hneď po nadpise, ak nasleduje odrážka alebo podnadpis
        if ((item.type === 'section' || item.type === 'subheading' || item.type === 'heading')
            && (nextNonBlankType === 'bullet' || nextNonBlankType === 'subheading')) {
            pendingBlank = false;
        }
    }

    return output
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function formatSteamContentsToMarkdown(contents) {
    if (!contents || typeof contents !== 'string') return '';

    let text = contents.replace(/\r\n/g, '\n');

    // Valve v príspevkoch escapuje hranaté zátvorky ako \[ MAPS ]
    text = text.replace(/\\\[/g, '[').replace(/\\\]/g, ']');

    // YouTube náhľady, videá a obrázky (obrázok sa zobrazí samostatne v embede)
    text = text.replace(/\[previewyoutube=([^;\]]+)[^\]]*\]\[\/previewyoutube\]/gi, (_, videoId) => {
        return `https://youtu.be/${videoId.trim()}`;
    });
    text = text.replace(/\[video\b[^\]]*\][\s\S]*?\[\/video\]/gi, '');
    text = text.replace(/\[video\b[^\]]*\]/gi, '');
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
    text = text.replace(/\[h[1-3]\]([\s\S]*?)\[\/h[1-3]\]/gi, '\n\n**$1**\n');
    text = text.replace(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi, '\n\n**$1**\n');

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

    // Zoznamy, odseky a oddeľovače
    text = text.replace(/\[\*\]\s*(?:\[p\]|<p[^>]*>)/gi, '\n- ');
    text = text.replace(/(?:\[\/p\]|<\/p>)\s*\[\/\*\]/gi, '\n');
    text = text.replace(/\[\*\]\s*/gi, '\n- ');
    text = text.replace(/\[\/\*\]/gi, '\n');
    text = text.replace(/<li[^>]*>\s*/gi, '\n- ');
    text = text.replace(/<\/li>/gi, '\n');
    text = text.replace(/\[\/?(?:list|olist)\]/gi, '\n');
    text = text.replace(/<\/?(?:ul|ol)[^>]*>/gi, '\n');

    text = text.replace(/\[hr\]\[\/hr\]/gi, '\n───\n');
    text = text.replace(/<hr[^>]*>/gi, '\n───\n');
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/\[p\]|<p[^>]*>/gi, '\n');
    text = text.replace(/\[\/p\]|<\/p>/gi, '\n');

    // Odstránenie zvyšných HTML a BBCode značiek bez rozbitia Markdown odkazov [text](url)
    text = text.replace(/<[^>]+>/g, '');
    text = text.replace(/\[\/?(?:quote|spoiler|table|tr|td|th|noparse|p|expand|dynamiclink|carousel|video)[^\]]*\]/gi, '');

    text = decodeHtmlEntities(text);

    return formatLinesLikePatchBot(text);
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
