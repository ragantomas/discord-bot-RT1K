const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getWelcomeSettings } = require('../storage/settingsStore');
const { pickSlovakPlural } = require('./botStatus');
const { addActivityLog } = require('./activityLog');

function hexToInt(hex, fallback = 0x5865F2) {
    if (typeof hex !== 'string') return fallback;
    const match = hex.trim().match(/^#?([0-9a-fA-F]{6})$/);
    if (!match) return fallback;
    return parseInt(match[1], 16);
}

function formatWelcomeText(template, member) {
    const raw = typeof template === 'string' ? template : '';
    if (!raw) return '';

    const userMention = member?.id ? `<@${member.id}>` : 'Hráč';
    const displayName = member?.displayName || member?.user?.globalName || member?.user?.username || 'Hráč';
    const username = member?.user?.username || 'hrac';
    const serverName = member?.guild?.name || 'Server';
    const memberCount = Number(member?.guild?.memberCount ?? 0);

    return raw
        .replace(/\{members:([^{}]+)\}/gi, (_, formsStr) => pickSlovakPlural(memberCount, formsStr))
        .replace(/\{user\}/gi, userMention)
        .replace(/\{displayname\}/gi, displayName)
        .replace(/\{username\}/gi, username)
        .replace(/\{server\}/gi, serverName)
        .replace(/\{members\}/gi, String(memberCount));
}

function buildChannelWelcomeEmbed(config, member) {
    const title = formatWelcomeText(config.channelTitle, member).trim().slice(0, 256);
    const description = formatWelcomeText(config.channelDescription, member).trim().slice(0, 4096);
    if (!title && !description) return null;

    const embed = new EmbedBuilder()
        .setColor(hexToInt(config.channelColor, 0x5865F2))
        .setTimestamp();

    if (title) embed.setTitle(title);
    if (description) embed.setDescription(description);
    if (config.channelShowAvatar !== false && member?.displayAvatarURL) {
        embed.setThumbnail(member.displayAvatarURL({ size: 256 }));
    }
    return embed;
}

function buildDmWelcomeEmbed(config, member) {
    const title = formatWelcomeText(config.dmTitle, member).trim().slice(0, 256);
    const description = formatWelcomeText(config.dmDescription, member).trim().slice(0, 4096);
    if (!title && !description) return null;

    const embed = new EmbedBuilder()
        .setColor(hexToInt(config.dmColor, 0x57F287))
        .setTimestamp();

    if (title) embed.setTitle(title);
    if (description) embed.setDescription(description);
    if (member?.guild?.iconURL) {
        const iconUrl = member.guild.iconURL({ size: 256 });
        if (iconUrl) embed.setThumbnail(iconUrl);
    }
    return embed;
}

function buildGoodbyeEmbed(config, member) {
    const title = formatWelcomeText(config.goodbyeTitle, member).trim().slice(0, 256);
    const description = formatWelcomeText(config.goodbyeDescription, member).trim().slice(0, 4096);
    if (!title && !description) return null;

    const embed = new EmbedBuilder()
        .setColor(hexToInt(config.goodbyeColor, 0xED4245))
        .setTimestamp();

    if (title) embed.setTitle(title);
    if (description) embed.setDescription(description);
    if (member?.user?.displayAvatarURL) {
        embed.setThumbnail(member.user.displayAvatarURL({ size: 256 }));
    }
    return embed;
}

async function resolveTextChannelWithPerms(guild, channelId) {
    if (!guild || !channelId) return null;
    const channel = guild.channels.cache.get(channelId)
        || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return null;

    const me = guild.members.me;
    const perms = me ? channel.permissionsFor(me) : null;
    if (perms && (!perms.has(PermissionFlagsBits.ViewChannel) || !perms.has(PermissionFlagsBits.SendMessages))) {
        return null;
    }
    return channel;
}

async function handleMemberWelcome(member) {
    if (!member?.guild || !member.user) return;
    const config = getWelcomeSettings();
    if (!config?.enabled) return;
    if (config.ignoreBots !== false && member.user.bot) return;

    if (config.channelEnabled && config.channelId) {
        const channel = await resolveTextChannelWithPerms(member.guild, config.channelId);
        const embed = channel ? buildChannelWelcomeEmbed(config, member) : null;
        if (channel && embed) {
            const sent = await channel.send({ embeds: [embed] }).catch(() => null);
            if (sent) {
                addActivityLog({
                    level: 'info',
                    category: 'welcome',
                    message: `Odoslaná uvítacia správa do #${channel.name} pre ${member.user.tag}.`
                });
            }
        }
    }

    if (config.dmEnabled) {
        const dmEmbed = buildDmWelcomeEmbed(config, member);
        if (dmEmbed) {
            const sentDm = await member.send({ embeds: [dmEmbed] }).catch(() => null);
            if (sentDm) {
                addActivityLog({
                    level: 'info',
                    category: 'welcome',
                    message: `Odoslaná uvítacia DM správa používateľovi ${member.user.tag}.`
                });
            }
        }
    }
}

async function handleMemberGoodbye(member) {
    if (!member?.guild || !member.user) return;
    const config = getWelcomeSettings();
    if (!config?.enabled || !config.goodbyeEnabled || !config.goodbyeChannelId) return;
    if (config.ignoreBots !== false && member.user.bot) return;

    const channel = await resolveTextChannelWithPerms(member.guild, config.goodbyeChannelId);
    const embed = channel ? buildGoodbyeEmbed(config, member) : null;
    if (channel && embed) {
        const sent = await channel.send({ embeds: [embed] }).catch(() => null);
        if (sent) {
            addActivityLog({
                level: 'info',
                category: 'welcome',
                message: `Odoslaná rozlúčková správa do #${channel.name} (${member.user.tag}).`
            });
        }
    }
}

async function sendTestWelcome(guild, member, target) {
    const config = getWelcomeSettings();
    if (!guild || !member) {
        return { ok: false, error: 'Nepodarilo sa načítať server alebo tvoj Discord profil.' };
    }

    if (target === 'dm') {
        const embed = buildDmWelcomeEmbed(config, member);
        if (!embed) {
            return { ok: false, error: 'Vyplň aspoň nadpis alebo text DM uvítacej správy.' };
        }
        try {
            await member.send({ content: '🧪 **Test DM uvítacej správy:**', embeds: [embed] });
            return { ok: true };
        } catch {
            return { ok: false, error: 'Nepodarilo sa poslať DM (máš pravdepodobne zablokované súkromné správy zo servera).' };
        }
    }

    if (target === 'goodbye') {
        if (!config.goodbyeChannelId) {
            return { ok: false, error: 'Najprv vyber cieľový kanál pre rozlúčkovú správu a ulož nastavenia.' };
        }
        const channel = await resolveTextChannelWithPerms(guild, config.goodbyeChannelId);
        if (!channel) {
            return { ok: false, error: 'Kanál pre rozlúčkovú správu neexistuje alebo v ňom bot nemá právo písať.' };
        }
        const embed = buildGoodbyeEmbed(config, member);
        if (!embed) {
            return { ok: false, error: 'Vyplň nadpis alebo text rozlúčkovej správy.' };
        }
        await channel.send({ content: '🧪 **Test rozlúčkovej správy:**', embeds: [embed] });
        return { ok: true };
    }

    if (!config.channelId) {
        return { ok: false, error: 'Najprv vyber kanál pre uvítaciu správu do roomky a ulož nastavenia.' };
    }
    const channel = await resolveTextChannelWithPerms(guild, config.channelId);
    if (!channel) {
        return { ok: false, error: 'Kanál pre uvítaciu správu neexistuje alebo v ňom bot nemá právo písať.' };
    }
    const embed = buildChannelWelcomeEmbed(config, member);
    if (!embed) {
        return { ok: false, error: 'Vyplň nadpis alebo text uvítacej správy do roomky.' };
    }
    await channel.send({ content: '🧪 **Test uvítacej správy:**', embeds: [embed] });
    return { ok: true };
}

module.exports = {
    formatWelcomeText,
    handleMemberWelcome,
    handleMemberGoodbye,
    sendTestWelcome
};
