const { EmbedBuilder, ChannelType } = require('discord.js');
const { CS2_ICON_URL } = require('../config');
const {
    getPatchBotSettings,
    markPatchGidsPosted
} = require('../storage/settingsStore');
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
    const config = getPatchBotSettings();
    if (!config?.enabled || !config.channelId) return;

    const guild = client.guilds.cache.first();
    if (!guild) return;

    const channel = guild.channels.cache.get(config.channelId)
        || await guild.channels.fetch(config.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const mode = config.mode || 'all';
    const items = await fetchCs2News({ mode, count: 10 });

    if (!Array.isArray(items) || items.length === 0) return;

    const postedSet = new Set((config.postedGids || []).map(String));

    if (postedSet.size === 0) {
        const baselineGids = items.map(item => item?.gid).filter(Boolean).map(String);
        if (baselineGids.length > 0) {
            markPatchGidsPosted(baselineGids);
        }
        return;
    }

    const unseenItems = items
        .filter(item => item?.gid && !postedSet.has(String(item.gid)))
        .sort((a, b) => (a.date || 0) - (b.date || 0));

    for (const item of unseenItems) {
        try {
            await sendPatchToChannel(channel, item, config.roleId || null);
            markPatchGidsPosted([String(item.gid)], item);
        } catch (err) {
            console.error(`Chyba pri posielaní CS2 updatu na server ${guild.id}:`, err);
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
