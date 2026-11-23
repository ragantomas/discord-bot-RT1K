const crypto = require('crypto');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { ChannelType, PermissionFlagsBits } = require('discord.js');

const { OWNER_ID, DB_FILE, SETTINGS_FILE } = require('../src/config');
const { loadUsers, saveUsers, usersFileExists } = require('../src/storage/usersStore');
const {
    loadSettings,
    updateSettings,
    settingsFileExists,
    getRankSettings,
    getTempVoiceSettings,
    updateTempVoiceSettings,
    getAllTempRooms,
    deleteTempRoom,
    getPatchBotSettings,
    updatePatchBotSettings,
    mergePostedGids,
    markPatchGidsPosted,
    updateJoinRolesSettings,
    getCsStatusSettings,
    updateCsStatusSettings
} = require('../src/storage/settingsStore');
const { resolveSteam64Id } = require('../src/services/steam');
const { getRankForElo, removeRankRoles, updateMemberRank, updateAllMemberRanks } = require('../src/services/ranks');
const { updateBotStatus } = require('../src/services/botStatus');
const { toggleTempRoomLock, closeTempRoom } = require('../src/services/tempVoice');
const { fetchCs2News } = require('../src/services/steamNews');
const { sendPatchToChannel } = require('../src/services/patchBot');
const { validateAssignableRole } = require('../src/services/joinRoles');
const { parseIntervalSeconds, updateGuildStatusMessage } = require('../src/services/csStatus');
const { hasAnyBackupFile, sendBackupToOwner } = require('../src/services/backup');

const SESSION_COOKIE = 'rt1k_session';
const OAUTH_STATE_COOKIE = 'rt1k_oauth_state';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function isSecureRequest(req) {
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '')
        .split(',')[0]
        .trim()
        .toLowerCase();
    return Boolean(req.secure || forwardedProto === 'https');
}

function getCookieOptions(req, maxAge) {
    return {
        httpOnly: true,
        signed: true,
        sameSite: 'lax',
        secure: isSecureRequest(req),
        maxAge
    };
}

function getPrimaryGuild(client) {
    return client.guilds.cache.first() || null;
}

function getDiscordAvatarUrl(userObj) {
    if (!userObj?.id) return null;
    if (userObj.avatar) {
        const ext = userObj.avatar.startsWith('a_') ? 'gif' : 'png';
        return `https://cdn.discordapp.com/avatars/${userObj.id}/${userObj.avatar}.${ext}?size=128`;
    }
    const index = Number(BigInt(userObj.id) >> 22n) % 6;
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

function getOAuthConfig(client) {
    const clientId = client.user?.id || '';
    const clientSecret = process.env.CLIENT_SECRET?.trim() || '';
    const redirectUri = process.env.REDIRECT_URI?.trim() || '';
    return {
        clientId,
        clientSecret,
        redirectUri,
        configured: Boolean(clientId && clientSecret && redirectUri)
    };
}

async function verifyDashboardAccess(client, userId) {
    const isOwner = userId === OWNER_ID;
    const guild = getPrimaryGuild(client);

    if (!guild) {
        return { allowed: isOwner, isOwner, guild: null, member: null };
    }

    const member = await guild.members.fetch(userId).catch(() => null);
    const { dashboardRoleId } = loadSettings();
    const hasRole = Boolean(dashboardRoleId && member?.roles.cache.has(dashboardRoleId));

    return {
        allowed: isOwner || hasRole,
        isOwner,
        guild,
        member
    };
}

function hasChannelPermissions(guild, channel, permsList) {
    const me = guild?.members?.me;
    if (!me || !channel) return false;
    const perms = channel.permissionsFor(me);
    return Boolean(perms && perms.has(permsList));
}

function formatHexColor(colorNum) {
    const num = Number.isFinite(Number(colorNum)) ? Number(colorNum) : 0x808080;
    return `#${(num & 0xFFFFFF).toString(16).padStart(6, '0').toUpperCase()}`;
}

function parseColorValue(input) {
    if (typeof input === 'number' && Number.isFinite(input)) {
        return Math.min(Math.max(Math.round(input), 0), 0xFFFFFF);
    }
    if (typeof input === 'string') {
        const cleaned = input.trim().replace(/^#/, '');
        if (/^[0-9a-f]{6}$/i.test(cleaned)) {
            return parseInt(cleaned, 16);
        }
    }
    return null;
}

function startWebServer(client) {
    // Inicializuje / zmigruje settings.json hneď pri štarte
    loadSettings();

    const app = express();
    app.set('trust proxy', 1);

    const sessionSecret = process.env.SESSION_SECRET?.trim() || crypto.randomBytes(32).toString('hex');
    if (!process.env.SESSION_SECRET?.trim()) {
        console.warn('[WARN] SESSION_SECRET nie je nastavený v .env — používam dočasný kľúč (po reštarte sa používatelia odhlásia).');
    }

    app.use(express.json({ limit: '1mb' }));
    app.use(cookieParser(sessionSecret));

    const publicDir = path.join(__dirname, 'public');
    app.use(express.static(publicDir));

    // --- Discord OAuth2 ---
    app.get('/auth/discord', (req, res) => {
        const oauth = getOAuthConfig(client);
        if (!client.user?.id) {
            return res.redirect('/?error=bot_starting');
        }
        if (!oauth.configured) {
            return res.redirect('/?error=oauth_config');
        }

        const state = crypto.randomBytes(16).toString('hex');
        res.cookie(OAUTH_STATE_COOKIE, state, getCookieOptions(req, 10 * 60 * 1000));

        const params = new URLSearchParams({
            client_id: oauth.clientId,
            redirect_uri: oauth.redirectUri,
            response_type: 'code',
            scope: 'identify',
            state,
            prompt: 'none'
        });

        return res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
    });

    app.get('/auth/discord/callback', async (req, res) => {
        const expectedState = req.signedCookies?.[OAUTH_STATE_COOKIE];
        res.clearCookie(OAUTH_STATE_COOKIE);

        if (req.query.error) {
            return res.redirect('/?error=oauth_cancelled');
        }

        const code = String(req.query.code || '');
        const state = String(req.query.state || '');

        if (!code || !expectedState || state !== expectedState) {
            return res.redirect('/?error=oauth_state');
        }

        const oauth = getOAuthConfig(client);
        if (!oauth.configured) {
            return res.redirect('/?error=oauth_config');
        }

        try {
            const tokenRes = await fetch('https://discord.com/api/v10/oauth2/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: oauth.clientId,
                    client_secret: oauth.clientSecret,
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: oauth.redirectUri
                })
            });

            if (!tokenRes.ok) {
                console.error('Discord OAuth2 token exchange zlyhal:', tokenRes.status);
                return res.redirect('/?error=oauth_failed');
            }

            const tokenData = await tokenRes.json();
            const userRes = await fetch('https://discord.com/api/v10/users/@me', {
                headers: { Authorization: `Bearer ${tokenData.access_token}` }
            });

            if (!userRes.ok) {
                console.error('Discord /users/@me zlyhal:', userRes.status);
                return res.redirect('/?error=oauth_failed');
            }

            const discordUser = await userRes.json();
            const sessionPayload = {
                id: discordUser.id,
                username: discordUser.username,
                globalName: discordUser.global_name || discordUser.username,
                avatar: discordUser.avatar || null
            };

            res.cookie(SESSION_COOKIE, sessionPayload, getCookieOptions(req, SESSION_MAX_AGE_MS));
            return res.redirect('/');
        } catch (err) {
            console.error('Chyba pri Discord OAuth2 callbacku:', err);
            return res.redirect('/?error=oauth_failed');
        }
    });

    app.post('/api/logout', (req, res) => {
        res.clearCookie(SESSION_COOKIE);
        return res.json({ ok: true });
    });

    app.get('/api/auth/me', async (req, res) => {
        const oauth = getOAuthConfig(client);
        const sessionUser = req.signedCookies?.[SESSION_COOKIE];
        const guild = getPrimaryGuild(client);

        const botInfo = client.user ? {
            id: client.user.id,
            username: client.user.username,
            avatarUrl: client.user.displayAvatarURL({ size: 128 }),
            online: client.isReady()
        } : {
            id: null,
            username: 'CS2 Discord Bot',
            avatarUrl: null,
            online: false
        };

        const guildInfo = guild ? {
            id: guild.id,
            name: guild.name,
            iconUrl: guild.iconURL({ size: 128 }) || null
        } : null;

        if (!sessionUser?.id) {
            return res.json({
                authenticated: false,
                authorized: false,
                isOwner: false,
                user: null,
                bot: botInfo,
                guild: guildInfo,
                oauthConfigured: oauth.configured
            });
        }

        const access = await verifyDashboardAccess(client, sessionUser.id);
        return res.json({
            authenticated: true,
            authorized: access.allowed,
            isOwner: access.isOwner,
            user: {
                id: sessionUser.id,
                username: sessionUser.username,
                displayName: access.member?.displayName || sessionUser.globalName || sessionUser.username,
                avatarUrl: access.member?.displayAvatarURL({ size: 128 }) || getDiscordAvatarUrl(sessionUser)
            },
            bot: botInfo,
            guild: guildInfo,
            oauthConfigured: oauth.configured
        });
    });

    async function requireAuth(req, res, next) {
        const sessionUser = req.signedCookies?.[SESSION_COOKIE];
        if (!sessionUser?.id) {
            return res.status(401).json({ error: 'Nie si prihlásený.' });
        }

        const access = await verifyDashboardAccess(client, sessionUser.id);
        if (!access.guild) {
            return res.status(503).json({ error: 'Bot zatiaľ nie je pripojený na žiadny Discord server.' });
        }
        if (!access.allowed) {
            return res.status(403).json({ error: 'Nemáš rolu potrebnú pre prístup do dashboardu.' });
        }

        req.dashboardAuth = { sessionUser, ...access };
        return next();
    }

    // Všetky ostatné /api/* endpointy vyžadujú prihlásenie + oprávnenú rolu
    app.use('/api', requireAuth);

    // --- Prehľad & Metadata ---
    app.get('/api/overview', (req, res) => {
        const { guild } = req.dashboardAuth;
        const users = loadUsers();
        const settings = loadSettings();

        const activeTempRoomsCount = Object.values(settings.tempVoice.rooms || {})
            .filter(r => r && r.guildId === guild.id)
            .length;

        return res.json({
            bot: {
                online: client.isReady(),
                ping: Number.isFinite(client.ws.ping) ? Math.round(client.ws.ping) : 0,
                uptimeMs: client.uptime || 0,
                username: client.user?.username || 'Bot',
                avatarUrl: client.user?.displayAvatarURL({ size: 128 }) || null
            },
            guild: {
                id: guild.id,
                name: guild.name,
                memberCount: guild.memberCount,
                iconUrl: guild.iconURL({ size: 128 }) || null
            },
            stats: {
                linkedPlayersCount: Object.keys(users).length,
                activeTempRoomsCount
            },
            modules: {
                tempVoiceEnabled: Boolean(settings.tempVoice.enabled && settings.tempVoice.triggerChannelId),
                patchBotEnabled: Boolean(settings.patchBot.enabled && settings.patchBot.channelId),
                joinRolesEnabled: Boolean(settings.joinRoles.enabled && (settings.joinRoles.memberRoleId || settings.joinRoles.botRoleId)),
                csStatusEnabled: Boolean(settings.csStatus.enabled && settings.csStatus.channelId)
            },
            steamApiKeyConfigured: Boolean(process.env.STEAM_API_KEY?.trim())
        });
    });

    app.get('/api/guild/meta', async (req, res) => {
        const { guild } = req.dashboardAuth;

        const [rolesCol, channelsCol, membersCol] = await Promise.all([
            guild.roles.fetch().catch(() => guild.roles.cache),
            guild.channels.fetch().catch(() => guild.channels.cache),
            guild.members.fetch().catch(() => guild.members.cache)
        ]);

        const roles = [...rolesCol.values()]
            .filter(Boolean)
            .sort((a, b) => b.position - a.position)
            .map(r => ({
                id: r.id,
                name: r.id === guild.id ? '@everyone' : r.name,
                colorHex: r.color ? formatHexColor(r.color) : '#99AAB5',
                position: r.position,
                managed: r.managed,
                editable: r.editable,
                isEveryone: r.id === guild.id
            }));

        const allChannels = [...channelsCol.values()]
            .filter(Boolean)
            .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0));

        const textChannels = allChannels
            .filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
            .map(c => ({
                id: c.id,
                name: c.name,
                type: c.type === ChannelType.GuildAnnouncement ? 'announcement' : 'text',
                parentId: c.parentId || null
            }));

        const voiceChannels = allChannels
            .filter(c => c.type === ChannelType.GuildVoice)
            .map(c => ({
                id: c.id,
                name: c.name,
                parentId: c.parentId || null,
                userLimit: c.userLimit || 0,
                bitrateKbps: Math.round((c.bitrate || 64000) / 1000)
            }));

        const categories = allChannels
            .filter(c => c.type === ChannelType.GuildCategory)
            .map(c => ({
                id: c.id,
                name: c.name
            }));

        const members = [...membersCol.values()]
            .filter(m => m && !m.user?.bot)
            .sort((a, b) => a.displayName.localeCompare(b.displayName, 'sk'))
            .map(m => ({
                id: m.id,
                username: m.user.username,
                displayName: m.displayName,
                avatarUrl: m.displayAvatarURL({ size: 64 })
            }));

        return res.json({
            roles,
            textChannels,
            voiceChannels,
            categories,
            members,
            maxBitrateKbps: Math.floor((guild.maximumBitrate || 96000) / 1000)
        });
    });

    // --- Hráči (CS2 Premier) ---
    app.get('/api/players', async (req, res) => {
        const { guild } = req.dashboardAuth;
        const users = loadUsers();
        const entries = Object.entries(users);

        await guild.members.fetch().catch(() => guild.members.cache);

        const players = entries
            .map(([userId, data]) => {
                const member = guild.members.cache.get(userId);
                const elo = typeof data.elo === 'number' ? data.elo : null;
                const rankObj = elo !== null ? getRankForElo(elo) : null;

                return {
                    userId,
                    steamId: data.steamId,
                    elo,
                    rankColor: rankObj ? formatHexColor(rankObj.color) : '#808080',
                    displayName: member?.displayName || `Používateľ ${userId}`,
                    username: member?.user?.username || 'Neznámy na serveri',
                    inGuild: Boolean(member),
                    avatarUrl: member?.displayAvatarURL({ size: 64 })
                        || `https://cdn.discordapp.com/embed/avatars/0.png`,
                    leetifyUrl: `https://leetify.com/app/profile/${data.steamId}`
                };
            })
            .sort((a, b) => (b.elo ?? -1) - (a.elo ?? -1));

        return res.json({ players });
    });

    app.post('/api/players/link', async (req, res) => {
        const { guild } = req.dashboardAuth;
        const userId = String(req.body?.userId || '').trim();
        const profile = String(req.body?.profile || '').trim();

        if (!userId || !profile) {
            return res.status(400).json({ error: 'Vyber hráča a zadaj Steam/Leetify profil.' });
        }

        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
            return res.status(404).json({ error: 'Vybraný hráč sa nenašiel na Discord serveri.' });
        }

        const steamId = await resolveSteam64Id(profile);
        if (!steamId) {
            return res.status(400).json({
                error: 'Nepodarilo sa nájsť Steam64 ID. Zadaj platné 17-miestne ID, Steam link alebo Leetify link.'
            });
        }

        const result = await updateMemberRank(member, steamId);
        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        const users = loadUsers();
        users[userId] = { steamId, elo: result.elo };
        saveUsers(users);
        updateBotStatus(client);

        return res.json({
            ok: true,
            userId,
            steamId,
            elo: result.elo
        });
    });

    app.post('/api/players/:userId/update', async (req, res) => {
        const { guild } = req.dashboardAuth;
        const userId = req.params.userId;
        const users = loadUsers();
        const entry = users[userId];

        if (!entry) {
            return res.status(404).json({ error: 'Hráč nemá prepojený Steam účet.' });
        }

        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
            return res.status(404).json({ error: 'Hráč sa už nenachádza na Discord serveri.' });
        }

        const result = await updateMemberRank(member, entry.steamId, users);
        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        return res.json({ ok: true, elo: result.elo });
    });

    app.post('/api/players/update-all', async (req, res) => {
        const summary = await updateAllMemberRanks(client);
        if (summary.alreadyRunning) {
            return res.status(409).json({ error: 'Hromadná aktualizácia rankov práve prebieha.' });
        }
        return res.json({ ok: true, ...summary });
    });

    app.delete('/api/players/:userId', async (req, res) => {
        const { guild } = req.dashboardAuth;
        const userId = req.params.userId;
        const users = loadUsers();

        if (!users[userId]) {
            return res.status(404).json({ error: 'Hráč nie je v databáze.' });
        }

        delete users[userId];
        saveUsers(users);
        updateBotStatus(client);

        const member = await guild.members.fetch(userId).catch(() => null);
        if (member) {
            await removeRankRoles(member);
        }

        return res.json({ ok: true });
    });

    // --- Nastavenia (Všeobecné + CS2 Rank roly) ---
    app.get('/api/settings', (req, res) => {
        return res.json({
            settings: loadSettings(),
            steamApiKeyConfigured: Boolean(process.env.STEAM_API_KEY?.trim()),
            ownerId: OWNER_ID
        });
    });

    app.put('/api/settings/general', async (req, res) => {
        const { guild } = req.dashboardAuth;
        const body = req.body || {};

        const dashboardRoleId = body.dashboardRoleId ? String(body.dashboardRoleId).trim() : null;
        const allowedChannelId = body.allowedChannelId ? String(body.allowedChannelId).trim() : null;
        const unrankedRoleId = body.unrankedRoleId ? String(body.unrankedRoleId).trim() : null;
        const rankRolesInput = Array.isArray(body.rankRoles) ? body.rankRoles : null;

        if (dashboardRoleId) {
            if (dashboardRoleId === guild.id) {
                return res.status(400).json({ error: 'Ako prístupovú rolu do dashboardu nie je možné nastaviť `@everyone`.' });
            }
            const role = guild.roles.cache.get(dashboardRoleId) || await guild.roles.fetch(dashboardRoleId).catch(() => null);
            if (!role) {
                return res.status(400).json({ error: 'Vybraná rola pre prístup do dashboardu neexistuje.' });
            }
        }

        if (allowedChannelId) {
            const channel = guild.channels.cache.get(allowedChannelId) || await guild.channels.fetch(allowedChannelId).catch(() => null);
            if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
                return res.status(400).json({ error: 'Vybraný povolený kanál pre príkazy neexistuje alebo nie je textový.' });
            }
        }

        if (!unrankedRoleId) {
            return res.status(400).json({ error: 'Musíš vybrať Discord rolu pre Unranked hráčov.' });
        }
        const unrankedRole = guild.roles.cache.get(unrankedRoleId) || await guild.roles.fetch(unrankedRoleId).catch(() => null);
        if (!unrankedRole || unrankedRole.id === guild.id) {
            return res.status(400).json({ error: 'Vybraná Unranked rola nie je platná.' });
        }

        if (!rankRolesInput || rankRolesInput.length === 0) {
            return res.status(400).json({ error: 'Musí byť nastavené aspoň jedno CS2 Premier Elo pásmo.' });
        }

        const validatedRanks = [];
        for (const item of rankRolesInput) {
            const min = Number(item?.min);
            const roleId = String(item?.roleId || '').trim();
            const color = parseColorValue(item?.color);

            if (!Number.isFinite(min) || min < 0) {
                return res.status(400).json({ error: 'Minimálne Elo musí byť nezáporné číslo.' });
            }
            if (!roleId || roleId === guild.id) {
                return res.status(400).json({ error: 'Každé Elo pásmo musí mať platnú Discord rolu.' });
            }
            const r = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
            if (!r) {
                return res.status(400).json({ error: `Rola s ID ${roleId} sa na serveri nenašla.` });
            }
            if (color === null) {
                return res.status(400).json({ error: 'Farba ranku musí byť platný hex kód (napr. #FFD700).' });
            }

            validatedRanks.push({ min: Math.round(min), roleId, color });
        }

        const updated = updateSettings(s => {
            s.dashboardRoleId = dashboardRoleId;
            s.allowedChannelId = allowedChannelId;
            s.unrankedRoleId = unrankedRoleId;
            s.rankRoles = validatedRanks;
        });

        return res.json({ ok: true, settings: updated });
    });

    // --- TempVoice ---
    app.put('/api/settings/tempvoice', async (req, res) => {
        const { guild } = req.dashboardAuth;
        const body = req.body || {};
        const current = getTempVoiceSettings();

        const enabled = Boolean(body.enabled);
        const createTriggerChannel = Boolean(body.createTriggerChannel);
        const deleteTriggerChannel = Boolean(body.deleteTriggerChannel);

        const triggerName = String(body.triggerName ?? current.triggerName ?? '').trim();
        const roomNameTemplate = String(body.roomNameTemplate ?? current.roomNameTemplate ?? '').trim();
        const bitrateKbps = Number(body.bitrateKbps ?? current.bitrateKbps ?? 64);
        const userLimit = Number(body.userLimit ?? current.userLimit ?? 0);
        const categoryId = body.categoryId ? String(body.categoryId).trim() : null;
        let triggerChannelId = body.triggerChannelId ? String(body.triggerChannelId).trim() : null;

        if (!triggerName || triggerName.length > 100) {
            return res.status(400).json({ error: 'Názov spúšťacieho kanála musí mať 1 až 100 znakov.' });
        }
        if (!roomNameTemplate || roomNameTemplate.length > 100) {
            return res.status(400).json({ error: 'Šablóna názvu miestnosti musí mať 1 až 100 znakov.' });
        }
        if (!Number.isFinite(bitrateKbps) || bitrateKbps < 8 || bitrateKbps > 384) {
            return res.status(400).json({ error: 'Bitrate musí byť v rozsahu 8 až 384 kbps.' });
        }
        if (!Number.isFinite(userLimit) || userLimit < 0 || userLimit > 99) {
            return res.status(400).json({ error: 'Limit hráčov musí byť v rozsahu 0 až 99.' });
        }

        if (categoryId) {
            const cat = guild.channels.cache.get(categoryId) || await guild.channels.fetch(categoryId).catch(() => null);
            if (!cat || cat.type !== ChannelType.GuildCategory) {
                return res.status(400).json({ error: 'Vybraná kategória sa na serveri nenašla.' });
            }
        }

        if (!enabled) {
            if (deleteTriggerChannel && current.triggerChannelId) {
                const oldTrigger = guild.channels.cache.get(current.triggerChannelId)
                    || await guild.channels.fetch(current.triggerChannelId).catch(() => null);
                if (oldTrigger) {
                    await oldTrigger.delete('TempVoice vypnutý cez dashboard').catch(() => null);
                }
                triggerChannelId = null;
            }

            const saved = updateTempVoiceSettings({
                enabled: false,
                triggerChannelId,
                categoryId,
                triggerName,
                roomNameTemplate,
                bitrateKbps: Math.round(bitrateKbps),
                userLimit: Math.round(userLimit)
            });

            return res.json({ ok: true, tempVoice: saved });
        }

        if (createTriggerChannel) {
            try {
                const created = await guild.channels.create({
                    name: triggerName,
                    type: ChannelType.GuildVoice,
                    parent: categoryId || undefined
                });
                triggerChannelId = created.id;
            } catch (err) {
                console.error('Chyba pri vytváraní TempVoice trigger kanála:', err);
                return res.status(400).json({ error: 'Nepodarilo sa vytvoriť spúšťací hlasový kanál (skontroluj právo Manage Channels).' });
            }
        } else {
            if (!triggerChannelId) {
                return res.status(400).json({ error: 'Vyber existujúci spúšťací VC alebo použi možnosť vytvoriť nový kanál.' });
            }
            const triggerChannel = guild.channels.cache.get(triggerChannelId)
                || await guild.channels.fetch(triggerChannelId).catch(() => null);
            if (!triggerChannel || triggerChannel.type !== ChannelType.GuildVoice) {
                return res.status(400).json({ error: 'Vybraný spúšťací hlasový kanál neexistuje.' });
            }
            if (triggerChannel.name !== triggerName) {
                await triggerChannel.setName(triggerName).catch(() => null);
            }
            if ((triggerChannel.parentId || null) !== categoryId) {
                await triggerChannel.setParent(categoryId, { lockPermissions: false }).catch(() => null);
            }
        }

        const saved = updateTempVoiceSettings({
            enabled: true,
            triggerChannelId,
            categoryId,
            triggerName,
            roomNameTemplate,
            bitrateKbps: Math.round(bitrateKbps),
            userLimit: Math.round(userLimit)
        });

        return res.json({ ok: true, tempVoice: saved });
    });

    app.get('/api/tempvoice/rooms', async (req, res) => {
        const { guild } = req.dashboardAuth;
        const roomsMap = getAllTempRooms();
        const activeRooms = [];

        for (const [channelId, room] of Object.entries(roomsMap)) {
            const channel = guild.channels.cache.get(channelId)
                || await guild.channels.fetch(channelId).catch(() => null);

            if (!channel) {
                deleteTempRoom(channelId);
                continue;
            }

            const ownerMember = await guild.members.fetch(room.ownerId).catch(() => null);
            const humanCount = channel.members.filter(m => !m.user.bot).size;

            activeRooms.push({
                channelId,
                name: channel.name,
                ownerId: room.ownerId,
                ownerName: ownerMember?.displayName || `ID ${room.ownerId}`,
                memberCount: humanCount,
                userLimit: channel.userLimit || 0,
                bitrateKbps: Math.round((channel.bitrate || 64000) / 1000),
                locked: Boolean(room.locked)
            });
        }

        return res.json({ rooms: activeRooms });
    });

    app.post('/api/tempvoice/rooms/:channelId/toggle-lock', async (req, res) => {
        const result = await toggleTempRoomLock(client, req.params.channelId);
        if (!result.ok) {
            return res.status(404).json({ error: 'Dočasná miestnosť už neexistuje.' });
        }
        return res.json({ ok: true, locked: result.locked });
    });

    app.delete('/api/tempvoice/rooms/:channelId', async (req, res) => {
        const result = await closeTempRoom(client, req.params.channelId);
        if (!result.ok) {
            return res.status(404).json({ error: 'Dočasná miestnosť už neexistuje.' });
        }
        return res.json({ ok: true });
    });

    // --- CS2 PatchBot ---
    app.put('/api/settings/patchbot', async (req, res) => {
        const { guild } = req.dashboardAuth;
        const body = req.body || {};
        const current = getPatchBotSettings();

        const enabled = Boolean(body.enabled);
        const channelId = body.channelId ? String(body.channelId).trim() : null;
        const roleId = body.roleId ? String(body.roleId).trim() : null;
        const mode = body.mode === 'patchnotes' ? 'patchnotes' : 'all';

        if (roleId) {
            const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
            if (!role) {
                return res.status(400).json({ error: 'Vybraná ping rola pre PatchBot neexistuje.' });
            }
        }

        if (enabled) {
            if (!channelId) {
                return res.status(400).json({ error: 'Pre zapnutie CS2 PatchBota vyber cieľový kanál.' });
            }
            const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
            if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
                return res.status(400).json({ error: 'Vybraný kanál pre PatchBota neexistuje alebo nie je textový.' });
            }
            if (!hasChannelPermissions(guild, channel, [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks
            ])) {
                return res.status(400).json({
                    error: `Bot nemá v kanáli #${channel.name} práva Zobraziť kanál, Posielať správy a Vkladať odkazy.`
                });
            }
        }

        let postedGids = current.postedGids || [];
        const needsBaseline = enabled && (postedGids.length === 0 || mode !== current.mode);
        if (needsBaseline) {
            const latestNews = await fetchCs2News({ mode, count: 10 });
            if (Array.isArray(latestNews)) {
                const gids = latestNews.map(item => item?.gid).filter(Boolean).map(String);
                postedGids = mergePostedGids(postedGids, gids);
            }
        }

        const saved = updatePatchBotSettings({
            enabled,
            channelId,
            roleId,
            mode,
            postedGids
        });

        return res.json({ ok: true, patchBot: saved });
    });

    app.post('/api/patchbot/latest', async (req, res) => {
        const { guild } = req.dashboardAuth;
        const config = getPatchBotSettings();

        if (!config.channelId) {
            return res.status(400).json({ error: 'Najprv nastav kanál pre CS2 PatchBota.' });
        }

        const channel = guild.channels.cache.get(config.channelId)
            || await guild.channels.fetch(config.channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) {
            return res.status(400).json({ error: 'Nastavený kanál pre PatchBota sa nenašiel.' });
        }

        if (!hasChannelPermissions(guild, channel, [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks
        ])) {
            return res.status(400).json({
                error: `Bot nemá v kanáli #${channel.name} práva Zobraziť kanál, Posielať správy a Vkladať odkazy.`
            });
        }

        const items = await fetchCs2News({ mode: config.mode || 'all', count: 1 });
        if (items === null) {
            return res.status(502).json({ error: 'Nepodarilo sa spojiť so Steam News API. Skús znova o chvíľu.' });
        }
        if (items.length === 0) {
            return res.status(404).json({ error: 'Steam momentálne nevrátil žiadne novinky pre zvolený režim.' });
        }

        const latestItem = items[0];
        const withPing = Boolean(req.body?.withPing);

        await sendPatchToChannel(channel, latestItem, withPing ? config.roleId : null);
        let updatedPatchBot = config;
        if (latestItem.gid) {
            updatedPatchBot = markPatchGidsPosted([String(latestItem.gid)], latestItem);
        }

        return res.json({
            ok: true,
            title: latestItem.title,
            patchBot: updatedPatchBot
        });
    });

    // --- Join Roles ---
    app.put('/api/settings/joinroles', async (req, res) => {
        const { guild } = req.dashboardAuth;
        const body = req.body || {};

        const enabled = Boolean(body.enabled);
        const memberRoleId = body.memberRoleId ? String(body.memberRoleId).trim() : null;
        const botRoleId = body.botRoleId ? String(body.botRoleId).trim() : null;

        if (enabled && !memberRoleId && !botRoleId) {
            return res.status(400).json({ error: 'Pre zapnutie Join Roles vyber aspoň jednu rolu (pre hráčov alebo pre botov).' });
        }

        if (memberRoleId) {
            const role = guild.roles.cache.get(memberRoleId) || await guild.roles.fetch(memberRoleId).catch(() => null);
            const check = validateAssignableRole(guild, role);
            if (!check.ok) {
                return res.status(400).json({ error: check.reason });
            }
        }

        if (botRoleId) {
            const role = guild.roles.cache.get(botRoleId) || await guild.roles.fetch(botRoleId).catch(() => null);
            const check = validateAssignableRole(guild, role);
            if (!check.ok) {
                return res.status(400).json({ error: check.reason });
            }
        }

        const saved = updateJoinRolesSettings({
            enabled,
            memberRoleId,
            botRoleId
        });

        return res.json({ ok: true, joinRoles: saved });
    });

    // --- CS2 / Steam Status ---
    app.put('/api/settings/csstatus', async (req, res) => {
        const { guild } = req.dashboardAuth;
        const body = req.body || {};
        const current = getCsStatusSettings();

        const enabled = Boolean(body.enabled);
        const channelId = body.channelId ? String(body.channelId).trim() : null;
        const deleteMessage = Boolean(body.deleteMessage);

        let intervalSeconds = current.intervalSeconds;
        if (body.interval !== undefined && body.interval !== null && String(body.interval).trim() !== '') {
            const parsed = parseIntervalSeconds(body.interval);
            if (!parsed.ok) {
                return res.status(400).json({ error: parsed.error });
            }
            intervalSeconds = parsed.seconds;
        }

        if (!enabled) {
            let messageId = current.messageId;
            if (deleteMessage && current.channelId && current.messageId) {
                const oldChannel = guild.channels.cache.get(current.channelId)
                    || await guild.channels.fetch(current.channelId).catch(() => null);
                if (oldChannel && oldChannel.isTextBased()) {
                    const oldMsg = await oldChannel.messages.fetch(current.messageId).catch(() => null);
                    if (oldMsg) {
                        await oldMsg.delete().catch(() => null);
                    }
                }
                messageId = null;
            }

            const saved = updateCsStatusSettings({
                enabled: false,
                channelId,
                messageId,
                intervalSeconds
            });
            return res.json({ ok: true, csStatus: saved });
        }

        if (!channelId) {
            return res.status(400).json({ error: 'Pre zapnutie stavu serverov vyber cieľový kanál.' });
        }

        const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
        if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
            return res.status(400).json({ error: 'Vybraný kanál pre stav serverov neexistuje alebo nie je textový.' });
        }

        if (!hasChannelPermissions(guild, channel, [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.ReadMessageHistory
        ])) {
            return res.status(400).json({
                error: `Bot nemá v kanáli #${channel.name} práva Zobraziť kanál, Posielať správy, Vkladať odkazy a Čítať históriu správ.`
            });
        }

        const channelChanged = current.channelId !== channelId;
        updateCsStatusSettings({
            enabled: true,
            channelId,
            messageId: channelChanged ? null : current.messageId,
            intervalSeconds
        });

        const refreshResult = await updateGuildStatusMessage(client, { forceNewMessage: channelChanged });
        if (!refreshResult.ok) {
            return res.status(500).json({ error: 'Nastavenia sa uložili, ale nepodarilo sa odoslať embed správu do kanála.' });
        }

        return res.json({ ok: true, csStatus: getCsStatusSettings() });
    });

    app.post('/api/csstatus/refresh', async (req, res) => {
        const config = getCsStatusSettings();
        if (!config.channelId) {
            return res.status(400).json({ error: 'Najprv nastav kanál pre stav CS2 a Steam serverov.' });
        }

        const result = await updateGuildStatusMessage(client);
        if (!result.ok) {
            return res.status(400).json({ error: 'Nepodarilo sa obnoviť správu so stavom serverov (skontroluj kanál a oprávnenia).' });
        }

        return res.json({ ok: true, csStatus: getCsStatusSettings() });
    });

    // --- Zálohy ---
    app.get('/api/backup/download/:target', (req, res) => {
        const target = req.params.target;

        if (target === 'users') {
            if (!usersFileExists()) {
                return res.status(404).json({ error: 'Súbor users.json zatiaľ neexistuje.' });
            }
            return res.download(DB_FILE, 'users.json');
        }

        if (target === 'settings') {
            if (!settingsFileExists()) {
                loadSettings();
            }
            return res.download(SETTINGS_FILE, 'settings.json');
        }

        return res.status(400).json({ error: 'Neznámy súbor na stiahnutie.' });
    });

    app.post('/api/backup/send-dm', async (req, res) => {
        if (!hasAnyBackupFile()) {
            return res.status(404).json({ error: 'Zatiaľ neexistuje žiadny databázový súbor.' });
        }

        try {
            await sendBackupToOwner(client, 'Manuálna záloha z dashboardu');
            return res.json({ ok: true });
        } catch (err) {
            console.error('Chyba pri posielaní zálohy majiteľovi do DM:', err);
            return res.status(500).json({ error: 'Nepodarilo sa poslať DM majiteľovi bota (skontroluj nastavenia súkromných správ).' });
        }
    });

    // SPA fallback (mimo /api a /auth)
    app.use((req, res, next) => {
        if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path.startsWith('/auth/')) {
            return next();
        }
        return res.sendFile(path.join(publicDir, 'index.html'));
    });

    const port = Number(process.env.PORT || process.env.SERVER_PORT || 15655);
    const server = app.listen(port, '0.0.0.0', () => {
        console.log(`Webový dashboard beží na porte ${port}`);
    });

    return server;
}

module.exports = { startWebServer };
