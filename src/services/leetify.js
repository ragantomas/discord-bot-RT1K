async function fetchLeetifyProfile(steam64Id) {
    const res = await fetch(`https://api-public.cs-prod.leetify.com/v3/profile?steam64_id=${steam64Id}`, {
        headers: { 'User-Agent': 'CS2-Discord-Bot/1.0' }
    });
    if (!res.ok) return null;
    return await res.json();
}

module.exports = { fetchLeetifyProfile };
