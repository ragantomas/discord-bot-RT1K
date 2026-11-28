const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    UserSelectMenuBuilder,
    MessageFlags
} = require('discord.js');
const { getTempRoom, setTempRoom } = require('../storage/settingsStore');

function buildControlPanel(channel, room) {
    const limitText = channel.userLimit === 0 ? 'Bez limitu' : `${channel.userLimit} hráčov`;

    const embed = new EmbedBuilder()
        .setTitle('🎛️ Ovládanie hlasovej miestnosti')
        .setColor(room.locked ? 0xED4245 : 0x5865F2)
        .addFields(
            { name: '👑 Majiteľ', value: `<@${room.ownerId}>`, inline: true },
            { name: '🔊 Názov', value: `\`${channel.name}\``, inline: true },
            { name: '👥 Limit', value: limitText, inline: true },
            { name: '🔒 Prístup', value: room.locked ? 'Zamknutá' : 'Odomknutá', inline: true }
        )
        .setFooter({ text: 'Ovládanie môže používať len aktuálny majiteľ miestnosti' });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`tv:rename:${channel.id}`)
            .setLabel('Premenovať')
            .setEmoji('✏️')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`tv:limit:${channel.id}`)
            .setLabel('Limit')
            .setEmoji('👥')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`tv:lock:${channel.id}`)
            .setLabel(room.locked ? 'Odomknúť' : 'Zamknúť')
            .setEmoji(room.locked ? '🔓' : '🔒')
            .setStyle(room.locked ? ButtonStyle.Success : ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`tv:permit:${channel.id}`)
            .setLabel('Povoliť vstup')
            .setEmoji('🔑')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`tv:kick:${channel.id}`)
            .setLabel('Kick')
            .setEmoji('👢')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`tv:reject:${channel.id}`)
            .setLabel('Zablokovať vstup')
            .setEmoji('🔨')
            .setStyle(ButtonStyle.Danger)
    );

    return { embeds: [embed], components: [row1, row2] };
}

async function refreshControlPanel(channel, room) {
    if (!room?.panelMessageId) return;
    const panelMessage = await channel.messages.fetch(room.panelMessageId).catch(() => null);
    if (!panelMessage) return;
    await panelMessage.edit(buildControlPanel(channel, room)).catch(() => null);
}

function buildUserSelectReply(customId, placeholder, content) {
    const row = new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
            .setCustomId(customId)
            .setPlaceholder(placeholder)
            .setMinValues(1)
            .setMaxValues(1)
    );
    return { content, components: [row], flags: MessageFlags.Ephemeral };
}

async function handleButtonAction(interaction, action, channel, room) {
    if (action === 'rename') {
        const modal = new ModalBuilder()
            .setCustomId(`tv:rename_modal:${channel.id}`)
            .setTitle('Premenovať miestnosť');

        const input = new TextInputBuilder()
            .setCustomId('new_name')
            .setLabel('Nový názov miestnosti')
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(100)
            .setValue(channel.name.slice(0, 100))
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
    }

    if (action === 'limit') {
        const modal = new ModalBuilder()
            .setCustomId(`tv:limit_modal:${channel.id}`)
            .setTitle('Limit hráčov v miestnosti');

        const input = new TextInputBuilder()
            .setCustomId('new_limit')
            .setLabel('Počet hráčov (0–99, 0 = bez limitu)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('0–99 (0 = bez limitu)')
            .setMinLength(1)
            .setMaxLength(2)
            .setValue(String(channel.userLimit))
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
    }

    if (action === 'lock') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        room.locked = !room.locked;

        await channel.permissionOverwrites.edit(room.ownerId, {
            ViewChannel: true,
            Connect: true
        });
        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
            Connect: room.locked ? false : null
        });

        setTempRoom(channel.id, room);
        await refreshControlPanel(channel, room);

        return interaction.editReply(
            room.locked
                ? '🔒 Miestnosť bola **zamknutá** pre `@everyone`.'
                : '🔓 Miestnosť bola **odomknutá** pre `@everyone`.'
        );
    }

    if (action === 'kick') {
        return interaction.reply(
            buildUserSelectReply(
                `tv:kick_select:${channel.id}`,
                'Vyber hráča na odpojenie z miestnosti',
                '👢 Vyber hráča, ktorého chceš odpojiť z miestnosti:'
            )
        );
    }

    if (action === 'permit') {
        return interaction.reply(
            buildUserSelectReply(
                `tv:permit_select:${channel.id}`,
                'Vyber hráča, ktorému povolíš vstup',
                '🔑 Vyber hráča, ktorému povolíš vstup aj do zamknutej miestnosti:'
            )
        );
    }

    if (action === 'reject') {
        return interaction.reply(
            buildUserSelectReply(
                `tv:reject_select:${channel.id}`,
                'Vyber hráča na zablokovanie',
                '🔨 Vyber hráča, ktorému chceš zakázať vstup do miestnosti:'
            )
        );
    }
}

async function handleModalAction(interaction, action, channel, room) {
    if (action === 'rename_modal') {
        const newName = interaction.fields.getTextInputValue('new_name').trim();
        if (!newName || newName.length > 100) {
            return interaction.reply({
                content: 'Názov miestnosti musí mať 1 až 100 znakov.',
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
            await channel.setName(newName);
        } catch (err) {
            console.error('Chyba pri premenovaní TempVoice kanála:', err);
            return interaction.editReply('Nepodarilo sa premenovať miestnosť (Discord môže obmedzovať časté zmeny názvu kanála).');
        }

        await refreshControlPanel(channel, room);
        return interaction.editReply(`✏️ Miestnosť bola premenovaná na **${newName}**.`);
    }

    if (action === 'limit_modal') {
        const rawValue = interaction.fields.getTextInputValue('new_limit').trim();
        if (!/^\d+$/.test(rawValue)) {
            return interaction.reply({
                content: 'Zadaj celé číslo od `0` do `99`.',
                flags: MessageFlags.Ephemeral
            });
        }

        const newLimit = Number(rawValue);
        if (newLimit < 0 || newLimit > 99) {
            return interaction.reply({
                content: 'Limit musí byť v rozsahu `0` až `99` (`0` = bez limitu).',
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await channel.setUserLimit(newLimit);
        await refreshControlPanel(channel, room);

        return interaction.editReply(
            newLimit === 0
                ? '👥 Limit miestnosti bol zrušený (**bez limitu**).'
                : `👥 Limit miestnosti bol nastavený na **${newLimit} hráčov**.`
        );
    }
}

async function handleUserSelectAction(interaction, action, channel) {
    const targetId = interaction.values[0];

    if (action === 'kick_select') {
        if (targetId === interaction.user.id) {
            return interaction.update({ content: 'Nemôžeš vyhodiť sám seba.', components: [] });
        }

        const targetMember = channel.members.get(targetId);
        if (!targetMember) {
            return interaction.update({
                content: `<@${targetId}> sa momentálne nenachádza v tejto miestnosti.`,
                components: []
            });
        }

        await targetMember.voice.disconnect('Odpojený majiteľom dočasnej miestnosti.');
        return interaction.update({
            content: `👢 Hráč <@${targetId}> bol odpojený z miestnosti.`,
            components: []
        });
    }

    if (action === 'permit_select') {
        await channel.permissionOverwrites.edit(targetId, {
            ViewChannel: true,
            Connect: true
        });
        return interaction.update({
            content: `🔑 Hráč <@${targetId}> má teraz povolený vstup aj do zamknutej miestnosti.`,
            components: []
        });
    }

    if (action === 'reject_select') {
        if (targetId === interaction.user.id || targetId === interaction.client.user.id) {
            return interaction.update({
                content: 'Nemôžeš zablokovať seba ani bota.',
                components: []
            });
        }

        await channel.permissionOverwrites.edit(targetId, {
            ViewChannel: false,
            Connect: false
        });

        const targetMember = channel.members.get(targetId);
        if (targetMember) {
            await targetMember.voice.disconnect('Prístup zamietnutý majiteľom miestnosti.').catch(() => null);
        }

        return interaction.update({
            content: `🔨 Hráčovi <@${targetId}> bol zablokovaný vstup do miestnosti.`,
            components: []
        });
    }
}

async function handleTempVoiceInteraction(interaction) {
    const [, action, channelId] = interaction.customId.split(':');
    const room = getTempRoom(channelId);

    const channel = interaction.guild?.channels.cache.get(channelId)
        || await interaction.guild?.channels.fetch(channelId).catch(() => null);

    if (!room || !channel) {
        if (interaction.isUserSelectMenu()) {
            return interaction.update({ content: 'Táto dočasná miestnosť už neexistuje.', components: [] });
        }
        return interaction.reply({ content: 'Táto dočasná miestnosť už neexistuje.', flags: MessageFlags.Ephemeral });
    }

    if (room.ownerId !== interaction.user.id) {
        return interaction.reply({
            content: 'Toto ovládanie môže používať len aktuálny majiteľ miestnosti.',
            flags: MessageFlags.Ephemeral
        });
    }

    if (interaction.isButton()) {
        return handleButtonAction(interaction, action, channel, room);
    }

    if (interaction.isModalSubmit()) {
        return handleModalAction(interaction, action, channel, room);
    }

    if (interaction.isUserSelectMenu()) {
        return handleUserSelectAction(interaction, action, channel);
    }
}

module.exports = {
    buildControlPanel,
    refreshControlPanel,
    handleTempVoiceInteraction
};
