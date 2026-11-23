const { EmbedBuilder, ChannelType } = require('discord.js');
const { CS2_ICON_URL } = require('../config');
const {
    getAllPatchGuildConfigs,
    markGidsPosted
} = require('../storage/patchBotStore');
const {
    fetchCs2News,
    extractFirstImageUrl,
    formatSteamContentsToMarkdown,
    truncateForEmbed
} = require('./steamNews');

const MODE_LABELS = {
    all: 'Všetky oficiálne CS2 oznámenia',
    patchnotes: 'Len Patch Notes (Release Notes)'
};

function isPatchNoteItem(item) {
    return (Array.isArray(item?.tags) && item.tags.includes('patchnotes'))
        || /^Release Notes/i.test(item?.title || '');
}

function buildPatchMessagePayload(item, roleId = null, guildId = null) {
    const formatted = formatSteamContentsToMarkdown(item?.contents || '');
    const description = truncateForEmbed(formatted, 3800, item?.url || null)
        || '*Bez textového popisu — pozri detail na Steame.*';

    const patchNote = isPatchNoteItem(item);
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'Counter-Strike 2' })
        .setTitle((item?.title || 'Counter-Strike 2 Update').slice(0, 256))
        .setColor(patchNote ? 0xF5A623 : 0x5865F2)
        .setThumbnail(CS2_ICON_URL)
        .setDescription(description)
        .setFooter({ text: patchNote ? 'CS2 Patch Notes • Steam' : 'CS2 Oznámenie • Steam' });

    if (item?.url) {
        embed.setURL(item.url);
    }
    if (typeof item?.date === 'number') {
        embed.setTimestamp(item.date * 1000);
    }

    const imageUrl = extractFirstImageUrl(item?.contents);
    if (imageUrl) {
        embed.setImage(imageUrl);
    }

    const payload = { embeds: [embed] };

    if (roleId) {
        if (guildId && roleId === guildId) {
            payload.content = '@everyone';
            payload.allowedMentions = { parse: ['everyone'] };
        } else {
            payload.content = `<@&${roleId}>`;
            payload.allowedMentions = { roles: [roleId] };
        }
    }

    return payload;
}

async function sendPatchToChannel(channel, item, roleId = null) {
    const payload = buildPatchMessagePayload(item, roleId, channel.guild?.id || null);
    const message = await channel.send(payload);

    if (channel.type === ChannelType.GuildAnnouncement && typeof message.crosspost === 'function') {
        await message.crosspost().catch(() => null);
    }

    return message;
}

async function checkAndPostUpdates(client) {
    const guildConfigs = getAllPatchGuildConfigs();
    const activeEntries = Object.entries(guildConfigs).filter(([, cfg]) => Boolean(cfg?.channelId));

    if (activeEntries.length === 0) return;

    const uniqueModes = new Set(activeEntries.map(([, cfg]) => cfg.mode || 'all'));
    const newsByMode = new Map();

    for (const mode of uniqueModes) {
        const items = await fetchCs2News({ mode, count: 10 });
        newsByMode.set(mode, items);
    }

    for (const [guildId, config] of activeEntries) {
        const mode = config.mode || 'all';
        const items = newsByMode.get(mode);

        // Pri chybe API tento server preskočíme bez zmeny uloženého stavu
        if (!Array.isArray(items) || items.length === 0) continue;

        const guild = client.guilds.cache.get(guildId)
            || await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) continue;

        const channel = guild.channels.cache.get(config.channelId)
            || await guild.channels.fetch(config.channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) continue;

        const postedSet = new Set((config.postedGids || []).map(String));

        // Ak chýba počiatočný baseline, uložíme aktuálne GID bez spamovania histórie
        if (postedSet.size === 0) {
            const baselineGids = items.map(item => item?.gid).filter(Boolean).map(String);
            if (baselineGids.length > 0) {
                markGidsPosted(guildId, baselineGids);
            }
            continue;
        }

        const unseenItems = items
            .filter(item => item?.gid && !postedSet.has(String(item.gid)))
            .sort((a, b) => (a.date || 0) - (b.date || 0));

        for (const item of unseenItems) {
            try {
                await sendPatchToChannel(channel, item, config.roleId || null);
                markGidsPosted(guildId, [String(item.gid)], item);
            } catch (err) {
                console.error(`Chyba pri posielaní CS2 updatu na server ${guildId}:`, err);
            }
        }
    }
}

module.exports = {
    MODE_LABELS,
    isPatchNoteItem,
    buildPatchMessagePayload,
    sendPatchToChannel,
    checkAndPostUpdates
};
