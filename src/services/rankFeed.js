const { EmbedBuilder } = require('discord.js');
const { getRankFeedSettings, getRankSettings } = require('../storage/settingsStore');
const { addActivityLog } = require('./activityLog');

function getTierForElo(elo) {
    if (typeof elo !== 'number' || elo < 1000) return null;
    const { rankRoles } = getRankSettings();
    return rankRoles.find(r => elo >= r.min) ?? null;
}

async function notifyRankChange(member, previousElo, newElo) {
    if (!member?.guild || typeof previousElo !== 'number' || typeof newElo !== 'number') {
        return false;
    }

    const config = getRankFeedSettings();
    if (!config?.enabled || !config.channelId) return false;

    const prevTier = getTierForElo(previousElo);
    const newTier = getTierForElo(newElo);

    if ((prevTier?.min ?? null) === (newTier?.min ?? null)) {
        return false;
    }

    const isRankUp = newElo > previousElo;
    if (isRankUp && !config.notifyRankUp) return false;
    if (!isRankUp && !config.notifyDerank) return false;

    const channel = member.guild.channels.cache.get(config.channelId)
        || await member.guild.channels.fetch(config.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return false;

    const { unrankedRoleId } = getRankSettings();
    const newRoleId = newTier?.roleId || unrankedRoleId;
    const embedColor = newTier?.color ?? (isRankUp ? 0x57F287 : 0xED4245);

    const diff = newElo - previousElo;
    const diffText = `${diff >= 0 ? '+' : ''}${diff.toLocaleString('sk-SK')}`;

    const embed = new EmbedBuilder()
        .setTitle(isRankUp ? '📈 CS2 Rank-Up!' : '📉 CS2 Derank')
        .setColor(embedColor)
        .setThumbnail(member.displayAvatarURL({ size: 128 }))
        .setDescription(
            isRankUp
                ? `Gratulujeme <@${member.id}> k postupu do nového Premier pásma!`
                : `<@${member.id}> klesol do nižšieho Premier pásma.`
        )
        .addFields(
            { name: 'Predtým', value: `${previousElo.toLocaleString('sk-SK')}`, inline: true },
            { name: 'Teraz', value: `**${newElo.toLocaleString('sk-SK')}** (${diffText})`, inline: true },
            { name: 'Nový rank', value: newRoleId ? `<@&${newRoleId}>` : '*Unranked*', inline: true }
        )
        .setTimestamp();

    await channel.send({ embeds: [embed] });

    addActivityLog({
        level: isRankUp ? 'success' : 'warn',
        category: 'elo',
        message: `${isRankUp ? 'Rank-Up' : 'Derank'}: ${member.displayName} (${previousElo.toLocaleString('sk-SK')} → ${newElo.toLocaleString('sk-SK')}).`
    });

    return true;
}

async function sendTestRankFeedMessage(guild, member) {
    const config = getRankFeedSettings();
    if (!config?.channelId) {
        return { ok: false, error: 'Najprv vyber cieľový kanál pre Rank-Up / Derank oznámenia.' };
    }

    const channel = guild.channels.cache.get(config.channelId)
        || await guild.channels.fetch(config.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
        return { ok: false, error: 'Nastavený kanál sa nenašiel alebo nie je textový.' };
    }

    const { rankRoles } = getRankSettings();
    const sampleTier = rankRoles[Math.floor(rankRoles.length / 2)] || rankRoles[0];
    const targetMention = member ? `<@${member.id}>` : '@Hráč';
    const thumb = member ? member.displayAvatarURL({ size: 128 }) : guild.iconURL({ size: 128 });

    const embed = new EmbedBuilder()
        .setTitle('📈 CS2 Rank-Up! (Test)')
        .setColor(sampleTier?.color ?? 0x57F287)
        .setDescription(`Gratulujeme ${targetMention} k postupu do nového Premier pásma!`)
        .addFields(
            { name: 'Predtým', value: '14 820', inline: true },
            { name: 'Teraz', value: '**15 240** (+420)', inline: true },
            { name: 'Nový rank', value: sampleTier?.roleId ? `<@&${sampleTier.roleId}>` : '*Premier*', inline: true }
        )
        .setFooter({ text: 'Testovacie oznámenie z webového dashboardu' })
        .setTimestamp();

    if (thumb) embed.setThumbnail(thumb);

    await channel.send({ embeds: [embed] });
    return { ok: true };
}

module.exports = {
    notifyRankChange,
    sendTestRankFeedMessage
};
