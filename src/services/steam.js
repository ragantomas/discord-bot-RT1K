// Vytiahne 17-miestne Steam64 ID z ID, Leetify URL, Steam /profiles/ aj /id/custom
async function resolveSteam64Id(input) {
    const cleaned = input.trim();

    // 1. Priame Steam64 ID, Steam /profiles/ alebo Leetify link
    const directMatch = cleaned.match(/7656119\d{10}/);
    if (directMatch) return directMatch[0];

    // 2. Steam custom URL (napr. https://steamcommunity.com/id/svetrikk)
    const customMatch = cleaned.match(/steamcommunity\.com\/id\/([^/?#]+)/i);
    const vanity = customMatch ? customMatch[1] : (!cleaned.includes('/') && !cleaned.includes(' ') ? cleaned : null);

    if (!vanity) return null;

    try {
        const res = await fetch(`https://steamcommunity.com/id/${encodeURIComponent(vanity)}/?xml=1`, {
            headers: { 'User-Agent': 'CS2-Discord-Bot/1.0' }
        });
        if (!res.ok) return null;
        const xml = await res.text();
        const idMatch = xml.match(/<steamID64>(\d{17})<\/steamID64>/);
        return idMatch ? idMatch[1] : null;
    } catch {
        return null;
    }
}

module.exports = { resolveSteam64Id };
