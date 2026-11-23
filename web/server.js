const crypto = require('crypto');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

const { OWNER_ID, DB_FILE, SETTINGS_FILE } = require('../src/config');
const { loadUsers, saveUsers, usersFileExists } = require('../src/storage/usersStore');
const {
    uniqueStringIds,
    getDefaultTempVoiceSetup,
    loadSettings,
    saveSettings,
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
    updateCsStatusSettings,
    getRankFeedSettings,
    updateRankFeedSettings,
    getAdminLogSettings,
    updateAdminLogSettings,
    getAnnouncementsHistory,
    addAnnouncementHistory,
    removeAnnouncementHistory,
    setAnnouncementsHistory
} = require('../src/storage/settingsStore');
const { resolveSteam64Id } = require('../src/services/steam');
const { getRankForElo, removeRankRoles, updateMemberRank, updateAllMemberRanks } = require('../src/services/ranks');
const { updateBotStatus } = require('../src/services/botStatus');
const { toggleTempRoomLock, closeTempRoom, renameTempRoom, kickFromTempRoom } = require('../src/services/tempVoice');
const { fetchCs2News } = require('../src/services/steamNews');
const { sendPatchToChannel } = require('../src/services/patchBot');
const { validateAssignableRole } = require('../src/services/joinRoles');
const { parseIntervalSeconds, updateGuildStatusMessage } = require('../src/services/csStatus');
const { addActivityLog, getActivityLogs, clearActivityLogs } = require('../src/services/activityLog');
const { sendTestRankFeedMessage } = require('../src/services/rankFeed');
const { sendTestAdminLogMessage } = require('../src/services/adminLog');

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

    const member = guild.members.cache.get(userId)
        || await guild.members.fetch(userId).catch(() => null);
    const { dashboardRoleIds } = loadSettings();
    const hasRole = Boolean(
        Array.isArray(dashboardRoleIds) &&
        member &&
        dashboardRoleIds.some(roleId => member.roles.cache.has(roleId))
    );

    return {
        allowed: isOwner || hasRole,
        isOwner,
        guild,
        member
    };
}

function buildOverviewPayload(client, guild) {
    const users = loadUsers();
    const settings = loadSettings();

    const activeTempRoomsCount = Object.values(settings.tempVoice.rooms || {})
        .filter(r => r && r.guildId === guild.id && guild.channels.cache.has(r.channelId))
        .length;

    const tvActive = Boolean(
        settings.tempVoice.enabled &&
        (settings.tempVoice.setups || []).some(s => s.enabled && s.triggerChannelId)
    );

    const pbActive = Boolean(
        settings.patchBot.enabled &&
        (settings.patchBot.channelIds || []).length > 0
    );

    const jrActive = Boolean(
        settings.joinRoles.enabled &&
        ((settings.joinRoles.memberRoleIds || []).length > 0 || (settings.joinRoles.botRoleIds || []).length > 0)
    );

    const topElo = Object.values(users).reduce(
        (max, u) => (typeof u?.elo === 'number' && u.elo > max ? u.elo : max),
        0
    );

    return {
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
            activeTempRoomsCount,
            topElo
        },
        modules: {
            tempVoiceEnabled: tvActive,
            patchBotEnabled: pbActive,
            joinRolesEnabled: jrActive,
            csStatusEnabled: Boolean(settings.csStatus.enabled && settings.csStatus.channelId),
            rankFeedEnabled: Boolean(settings.rankFeed?.enabled && settings.rankFeed?.channelId),
            adminLogEnabled: Boolean(settings.adminLog?.enabled && settings.adminLog?.channelId)
        },
        viewAuditLogGranted: Boolean(guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog)),
        steamApiKeyConfigured: Boolean(process.env.STEAM_API_KEY?.trim())
    };
}

function buildPlayersPayload(guild) {
    const users = loadUsers();
    return Object.entries(users)
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
                    || 'https://cdn.discordapp.com/embed/avatars/0.png',
                leetifyUrl: `https://leetify.com/app/profile/${data.steamId}`
            };
        })
        .sort((a, b) => (b.elo ?? -1) - (a.elo ?? -1));
}

function buildTempRoomsPayload(guild) {
    const roomsMap = getAllTempRooms();
    const activeRooms = [];

    for (const [channelId, room] of Object.entries(roomsMap)) {
        const channel = guild.channels.cache.get(channelId);
        if (!channel) continue;

        const ownerMember = guild.members.cache.get(room.ownerId);
        const humanMembers = channel.members.filter(m => !m.user.bot);

        activeRooms.push({
            channelId,
            name: channel.name,
            ownerId: room.ownerId,
            ownerName: ownerMember?.displayName || `ID ${room.ownerId}`,
            memberCount: humanMembers.size,
            userLimit: channel.userLimit || 0,
            bitrateKbps: Math.round((channel.bitrate || 64000) / 1000),
            locked: Boolean(room.locked),
            members: [...humanMembers.values()].map(m => ({
                id: m.id,
                displayName: m.displayName,
                username: m.user.username,
                avatarUrl: m.displayAvatarURL({ size: 64 }),
                isOwner: m.id === room.ownerId
            }))
        });
    }

    return activeRooms;
}

function getActorName(req) {
    return req.dashboardAuth?.member?.displayName
        || req.dashboardAuth?.sessionUser?.username
        || 'Dashboard';
}

function isValidHttpUrl(str) {
    return typeof str === 'string' && /^https?:\/\/.+/i.test(str.trim());
}

function buildAnnouncementPayload(guild, body) {
    const content = typeof body.content === 'string' ? body.content.trim().slice(0, 2000) : '';
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 256) : '';
    const description = typeof body.description === 'string' ? body.description.trim().slice(0, 4096) : '';
    const footerText = typeof body.footerText === 'string' ? body.footerText.trim().slice(0, 2048) : '';
    const thumbnailUrl = typeof body.thumbnailUrl === 'string' ? body.thumbnailUrl.trim() : '';
    const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';
    const roleId = body.roleId ? String(body.roleId).trim() : null;
    const includeTimestamp = Boolean(body.timestamp);
    const colorNum = parseColorValue(body.color) ?? 0x5865F2;

    if (!title && !description && !content) {
        return { error: 'Zadaj aspoň nadpis, popis embedu alebo text správy.' };
    }

    if (thumbnailUrl && !isValidHttpUrl(thumbnailUrl)) {
        return { error: 'Thumbnail URL musí začínať na http:// alebo https://.' };
    }
    if (imageUrl && !isValidHttpUrl(imageUrl)) {
        return { error: 'Obrázok URL musí začínať na http:// alebo https://.' };
    }

    const hasEmbed = Boolean(title || description || footerText || thumbnailUrl || imageUrl);
    const payload = {};

    let finalContent = content;
    if (roleId) {
        if (roleId === guild.id) {
            finalContent = `@everyone${finalContent ? ` ${finalContent}` : ''}`;
            payload.allowedMentions = { parse: ['everyone'] };
        } else {
            finalContent = `<@&${roleId}>${finalContent ? ` ${finalContent}` : ''}`;
            payload.allowedMentions = { roles: [roleId] };
        }
    }

    if (finalContent) {
        payload.content = finalContent.slice(0, 2000);
    }

    if (hasEmbed) {
        const embed = new EmbedBuilder().setColor(colorNum);
        if (title) embed.setTitle(title);
        if (description) embed.setDescription(description);
        if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
        if (imageUrl) embed.setImage(imageUrl);
        if (footerText) embed.setFooter({ text: footerText });
        if (includeTimestamp) embed.setTimestamp();
        payload.embeds = [embed];
    }

    return {
        payload,
        meta: {
            content,
            title,
            description,
            color: formatHexColor(colorNum),
            thumbnailUrl,
            imageUrl,
            footerText,
            roleId,
            timestamp: includeTimestamp
        }
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

    app.use('/api', requireAuth);

    // --- Prehľad, Live polling & Metadata ---
    app.get('/api/overview', (req, res) => {
        const { guild } = req.dashboardAuth;
        return res.json(buildOverviewPayload(client, guild));
    });

    app.get('/api/live', (req, res) => {
        const { guild } = req.dashboardAuth;
        const section = String(req.query.section || 'overview');
        const payload = {
            overview: buildOverviewPayload(client, guild)
        };

        if (section === 'players') {
            payload.players = buildPlayersPayload(guild);
        } else if (section === 'tempvoice') {
            payload.rooms = buildTempRoomsPayload(guild);
        } else if (section === 'logs') {
            payload.logs = getActivityLogs({ limit: 150 });
        } else if (section === 'announcements') {
            payload.announcementsHistory = getAnnouncementsHistory();
        }

        return res.json(payload);
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
        await guild.members.fetch().catch(() => guild.members.cache);
        return res.json({ players: buildPlayersPayload(guild) });
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

        const rawDashboardRoleIds = Array.isArray(body.dashboardRoleIds)
            ? body.dashboardRoleIds
            : (body.dashboardRoleId ? [body.dashboardRoleId] : []);
        const dashboardRoleIds = uniqueStringIds(rawDashboardRoleIds);
        const allowedChannelId = body.allowedChannelId ? String(body.allowedChannelId).trim() : null;
        const unrankedRoleId = body.unrankedRoleId ? String(body.unrankedRoleId).trim() : null;
        const rankRolesInput = Array.isArray(body.rankRoles) ? body.rankRoles : null;

        for (const roleId of dashboardRoleIds) {
            if (roleId === guild.id) {
                return res.status(400).json({ error: 'Ako prístupovú rolu do dashboardu nie je možné nastaviť `@everyone`.' });
            }
            const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
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

        const botStatusInput = body.botStatus && typeof body.botStatus === 'object' ? body.botStatus : null;
        const nextBotStatus = botStatusInput
            ? { text: typeof botStatusInput.text === 'string' ? botStatusInput.text.trim().slice(0, 128) : '' }
            : null;

        const updated = updateSettings(s => {
            s.dashboardRoleIds = dashboardRoleIds;
            s.allowedChannelId = allowedChannelId;
            s.unrankedRoleId = unrankedRoleId;
            s.rankRoles = validatedRanks;
            if (nextBotStatus) {
                s.botStatus = nextBotStatus;
            }
        });

        updateBotStatus(client, { force: true });
        addActivityLog({
            level: 'info',
            category: 'dashboard',
            message: 'Aktualizované všeobecné nastavenia, status bota a CS2 rank roly.',
            actor: getActorName(req)
        });

        return res.json({ ok: true, settings: updated });
    });

    // --- TempVoice (viacero nezávislých konfigurácií, vypnutie nič nemaže) ---
    app.put('/api/settings/tempvoice', async (req, res) => {
        const { guild } = req.dashboardAuth;
        const body = req.body || {};

        const moduleEnabled = Boolean(body.enabled);
        const rawSetups = Array.isArray(body.setups) ? body.setups : [];

        const normalizedSetups = [];
        const usedTriggerIds = new Set();

        for (let i = 0; i < rawSetups.length; i++) {
            const raw = rawSetups[i] || {};
            const def = getDefaultTempVoiceSetup(`tv_${i + 1}`);
            const setupId = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : def.id;
            const setupEnabled = Boolean(raw.enabled);
            const createTriggerChannel = Boolean(raw.createTriggerChannel);

            const triggerName = String(raw.triggerName ?? def.triggerName).trim();
            const roomNameTemplate = String(raw.roomNameTemplate ?? def.roomNameTemplate).trim();
            const bitrateKbps = Number(raw.bitrateKbps ?? def.bitrateKbps);
            const userLimit = Number(raw.userLimit ?? def.userLimit);
            const categoryId = raw.categoryId ? String(raw.categoryId).trim() : null;
            let triggerChannelId = raw.triggerChannelId ? String(raw.triggerChannelId).trim() : null;

            if (!triggerName || triggerName.length > 100) {
                return res.status(400).json({ error: `TempVoice #${i + 1}: Názov spúšťacieho kanála musí mať 1 až 100 znakov.` });
            }
            if (!roomNameTemplate || roomNameTemplate.length > 100) {
                return res.status(400).json({ error: `TempVoice #${i + 1}: Šablóna názvu miestnosti musí mať 1 až 100 znakov.` });
            }
            if (!Number.isFinite(bitrateKbps) || bitrateKbps < 8 || bitrateKbps > 384) {
                return res.status(400).json({ error: `TempVoice #${i + 1}: Bitrate musí byť v rozsahu 8 až 384 kbps.` });
            }
            if (!Number.isFinite(userLimit) || userLimit < 0 || userLimit > 99) {
                return res.status(400).json({ error: `TempVoice #${i + 1}: Limit hráčov musí byť v rozsahu 0 až 99.` });
            }

            if (categoryId) {
                const cat = guild.channels.cache.get(categoryId) || await guild.channels.fetch(categoryId).catch(() => null);
                if (!cat || cat.type !== ChannelType.GuildCategory) {
                    return res.status(400).json({ error: `TempVoice #${i + 1}: Vybraná kategória sa na serveri nenašla.` });
                }
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
                    return res.status(400).json({ error: `TempVoice #${i + 1}: Nepodarilo sa vytvoriť spúšťací VC (skontroluj právo Manage Channels).` });
                }
            } else if (moduleEnabled && setupEnabled) {
                if (!triggerChannelId) {
                    return res.status(400).json({ error: `TempVoice #${i + 1}: Vyber spúšťací hlasový kanál alebo zaškrtni vytvorenie nového.` });
                }
                const triggerChannel = guild.channels.cache.get(triggerChannelId)
                    || await guild.channels.fetch(triggerChannelId).catch(() => null);
                if (!triggerChannel || triggerChannel.type !== ChannelType.GuildVoice) {
                    return res.status(400).json({ error: `TempVoice #${i + 1}: Vybraný spúšťací hlasový kanál neexistuje.` });
                }
                if (triggerChannel.name !== triggerName) {
                    await triggerChannel.setName(triggerName).catch(() => null);
                }
                if ((triggerChannel.parentId || null) !== categoryId) {
                    await triggerChannel.setParent(categoryId, { lockPermissions: false }).catch(() => null);
                }
            }

            if (triggerChannelId) {
                if (usedTriggerIds.has(triggerChannelId)) {
                    return res.status(400).json({ error: 'Dve TempVoice konfigurácie nemôžu používať rovnaký spúšťací hlasový kanál.' });
                }
                usedTriggerIds.add(triggerChannelId);
            }

            normalizedSetups.push({
                id: setupId,
                enabled: setupEnabled,
                triggerChannelId,
                categoryId,
                triggerName,
                roomNameTemplate,
                bitrateKbps: Math.round(bitrateKbps),
                userLimit: Math.round(userLimit)
            });
        }

        const saved = updateTempVoiceSettings({
            enabled: moduleEnabled,
            setups: normalizedSetups
        });

        return res.json({ ok: true, tempVoice: saved });
    });

    app.get('/api/tempvoice/rooms', async (req, res) => {
        const { guild } = req.dashboardAuth;
        const roomsMap = getAllTempRooms();

        for (const channelId of Object.keys(roomsMap)) {
            const channel = guild.channels.cache.get(channelId)
                || await guild.channels.fetch(channelId).catch(() => null);
            if (!channel) {
                deleteTempRoom(channelId);
            }
        }

        return res.json({ rooms: buildTempRoomsPayload(guild) });
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
        addActivityLog({
            level: 'warn',
            category: 'tempvoice',
            message: `Zatvorená dočasná miestnosť (${req.params.channelId}).`,
            actor: getActorName(req)
        });
        return res.json({ ok: true });
    });

    app.post('/api/tempvoice/rooms/:channelId/rename', async (req, res) => {
        const newName = String(req.body?.name || '').trim();
        const result = await renameTempRoom(client, req.params.channelId, newName);
        if (!result.ok) {
            if (result.reason === 'invalid_name') {
                return res.status(400).json({ error: 'Názov miestnosti musí mať 1 až 100 znakov.' });
            }
            return res.status(404).json({ error: 'Dočasná miestnosť už neexistuje.' });
        }
        addActivityLog({
            level: 'info',
            category: 'tempvoice',
            message: `Miestnosť premenovaná na „${result.name}“.`,
            actor: getActorName(req)
        });
        return res.json({ ok: true, name: result.name });
    });

    app.post('/api/tempvoice/rooms/:channelId/kick/:userId', async (req, res) => {
        const result = await kickFromTempRoom(client, req.params.channelId, req.params.userId);
        if (!result.ok) {
            if (result.reason === 'member_not_in_room') {
                return res.status(404).json({ error: 'Hráč sa už nenachádza v tejto miestnosti.' });
            }
            return res.status(404).json({ error: 'Dočasná miestnosť už neexistuje.' });
        }
        addActivityLog({
            level: 'warn',
            category: 'tempvoice',
            message: `Hráč ${result.displayName} bol odpojený z TempVoice miestnosti.`,
            actor: getActorName(req)
        });
        return res.json({ ok: true, displayName: result.displayName });
    });

    // --- CS2 PatchBot (viacero kanálov, vypnutie nič nemaže) ---
    app.put('/api/settings/patchbot', async (req, res) => {
        const { guild } = req.dashboardAuth;
        const body = req.body || {};
        const current = getPatchBotSettings();

        const enabled = Boolean(body.enabled);
        const channelIds = uniqueStringIds(body.channelIds);
        const roleId = body.roleId ? String(body.roleId).trim() : null;
        const mode = body.mode === 'patchnotes' ? 'patchnotes' : 'all';

        if (roleId) {
            const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
            if (!role) {
                return res.status(400).json({ error: 'Vybraná ping rola pre PatchBot neexistuje.' });
            }
        }

        if (enabled && channelIds.length === 0) {
            return res.status(400).json({ error: 'Pre zapnutie CS2 PatchBota vyber aspoň jeden cieľový kanál.' });
        }

        for (const channelId of channelIds) {
            const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
            if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
                return res.status(400).json({ error: `Kanál s ID ${channelId} neexistuje alebo nie je textový.` });
            }
            if (enabled && !hasChannelPermissions(guild, channel, [
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
            channelIds,
            roleId,
            mode,
            postedGids
        });

        return res.json({ ok: true, patchBot: saved });
    });

    app.post('/api/patchbot/latest', async (req, res) => {
        const { guild } = req.dashboardAuth;
        const config = getPatchBotSettings();
        const channelIds = Array.isArray(config.channelIds) ? config.channelIds : [];

        if (channelIds.length === 0) {
            return res.status(400).json({ error: 'Najprv pridaj aspoň jeden kanál pre CS2 PatchBota.' });
        }

        const validChannels = [];
        for (const channelId of channelIds) {
            const channel = guild.channels.cache.get(channelId)
                || await guild.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) continue;

            if (!hasChannelPermissions(guild, channel, [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks
            ])) {
                return res.status(400).json({
                    error: `Bot nemá v kanáli #${channel.name} práva Zobraziť kanál, Posielať správy a Vkladať odkazy.`
                });
            }
            validChannels.push(channel);
        }

        if (validChannels.length === 0) {
            return res.status(400).json({ error: 'Žiadny z nastavených kanálov sa nenašiel.' });
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

        let sentCount = 0;
        for (const channel of validChannels) {
            await sendPatchToChannel(channel, latestItem, withPing ? config.roleId : null);
            sentCount++;
        }

        let updatedPatchBot = config;
        if (latestItem.gid && sentCount > 0) {
            updatedPatchBot = markPatchGidsPosted([String(latestItem.gid)], latestItem);
        }

        return res.json({
            ok: true,
            title: latestItem.title,
            sentCount,
            patchBot: updatedPatchBot
        });
    });

    // --- Join Roles (viacero rolí pre hráčov aj botov, vypnutie nič nemaže) ---
    app.put('/api/settings/joinroles', async (req, res) => {
        const { guild } = req.dashboardAuth;
        const body = req.body || {};

        const enabled = Boolean(body.enabled);
        const memberRoleIds = uniqueStringIds(body.memberRoleIds);
        const botRoleIds = uniqueStringIds(body.botRoleIds);

        if (enabled && memberRoleIds.length === 0 && botRoleIds.length === 0) {
            return res.status(400).json({ error: 'Pre zapnutie Join Roles vyber aspoň jednu rolu (pre hráčov alebo pre botov).' });
        }

        for (const roleId of memberRoleIds) {
            const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
            const check = validateAssignableRole(guild, role);
            if (!check.ok) {
                return res.status(400).json({ error: check.reason });
            }
        }

        for (const roleId of botRoleIds) {
            const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
            const check = validateAssignableRole(guild, role);
            if (!check.ok) {
                return res.status(400).json({ error: check.reason });
            }
        }

        const saved = updateJoinRolesSettings({
            enabled,
            memberRoleIds,
            botRoleIds
        });

        return res.json({ ok: true, joinRoles: saved });
    });

    // --- CS2 / Steam Status (vypnutie nič nemaže) ---
    app.put('/api/settings/csstatus', async (req, res) => {
        const { guild } = req.dashboardAuth;
        const body = req.body || {};
        const current = getCsStatusSettings();

        const enabled = Boolean(body.enabled);
        const channelId = body.channelId ? String(body.channelId).trim() : null;

        let intervalSeconds = current.intervalSeconds;
        if (body.interval !== undefined && body.interval !== null && String(body.interval).trim() !== '') {
            const parsed = parseIntervalSeconds(body.interval);
            if (!parsed.ok) {
                return res.status(400).json({ error: parsed.error });
            }
            intervalSeconds = parsed.seconds;
        }

        if (channelId) {
            const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
            if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
                return res.status(400).json({ error: 'Vybraný kanál pre stav serverov neexistuje alebo nie je textový.' });
            }
            if (enabled && !hasChannelPermissions(guild, channel, [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.ReadMessageHistory
            ])) {
                return res.status(400).json({
                    error: `Bot nemá v kanáli #${channel.name} práva Zobraziť kanál, Posielať správy, Vkladať odkazy a Čítať históriu správ.`
                });
            }
        } else if (enabled) {
            return res.status(400).json({ error: 'Pre zapnutie stavu serverov vyber cieľový kanál.' });
        }

        const channelChanged = current.channelId !== channelId;
        const saved = updateCsStatusSettings({
            enabled,
            channelId,
            messageId: channelChanged ? null : current.messageId,
            intervalSeconds
        });

        if (enabled && channelId) {
            const refreshResult = await updateGuildStatusMessage(client, { forceNewMessage: channelChanged });
            if (!refreshResult.ok) {
                return res.status(500).json({ error: 'Nastavenia sa uložili, ale nepodarilo sa odoslať embed správu do kanála.' });
            }
            return res.json({ ok: true, csStatus: getCsStatusSettings() });
        }

        return res.json({ ok: true, csStatus: saved });
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

    // --- Zálohy (iba stiahnutie do prehliadača) ---
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

        if (target === 'all') {
            const payload = {
                exportedAt: new Date().toISOString(),
                users: loadUsers(),
                settings: loadSettings()
            };
            const dateTag = new Date().toISOString().slice(0, 10);
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="backup-bot-${dateTag}.json"`);
            return res.send(JSON.stringify(payload, null, 2));
        }

        return res.status(400).json({ error: 'Neznámy súbor na stiahnutie.' });
    });

    app.post('/api/backup/restore', (req, res) => {
        const payload = req.body?.data;
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            return res.status(400).json({ error: 'Nahratý súbor musí byť platný JSON objekt.' });
        }

        const restored = [];

        function normalizeUsersMap(rawMap) {
            const clean = {};
            for (const [uid, val] of Object.entries(rawMap)) {
                if (!/^\d{15,22}$/.test(uid)) continue;
                if (typeof val === 'string' && /^\d{17}$/.test(val)) {
                    clean[uid] = { steamId: val, elo: null };
                } else if (val && typeof val === 'object' && /^\d{17}$/.test(String(val.steamId || ''))) {
                    clean[uid] = {
                        steamId: String(val.steamId),
                        elo: typeof val.elo === 'number' ? val.elo : null
                    };
                }
            }
            return clean;
        }

        // 1. Kompletná záloha { users, settings }
        if (payload.users && typeof payload.users === 'object' && payload.settings && typeof payload.settings === 'object') {
            saveUsers(normalizeUsersMap(payload.users));
            saveSettings(payload.settings);
            restored.push('users', 'settings');
        } else if (
            payload.tempVoice || payload.patchBot || payload.joinRoles ||
            payload.csStatus || payload.rankRoles || payload.adminLog || payload.rankFeed
        ) {
            // 2. Samostatný settings.json
            saveSettings(payload);
            restored.push('settings');
        } else {
            // 3. Samostatný users.json
            const entries = Object.entries(payload);
            const looksLikeUsers = entries.length === 0 || entries.every(([k, v]) =>
                /^\d{15,22}$/.test(k) && (
                    typeof v === 'string' ||
                    (v && typeof v === 'object' && typeof v.steamId === 'string')
                )
            );
            if (!looksLikeUsers) {
                return res.status(400).json({ error: 'Nerozpoznaný formát zálohy. Nahraj users.json, settings.json alebo kompletnú zálohu.' });
            }
            saveUsers(normalizeUsersMap(payload));
            restored.push('users');
        }

        updateBotStatus(client, { force: true });
        addActivityLog({
            level: 'warn',
            category: 'dashboard',
            message: `Obnovená záloha zo súboru (${restored.join(' + ')}).`,
            actor: getActorName(req)
        });

        return res.json({
            ok: true,
            restored,
            settings: loadSettings()
        });
    });

    // --- Rank-Up / Derank Feed ---
    app.put('/api/settings/rankfeed', async (req, res) => {
        const { guild } = req.dashboardAuth;
        const body = req.body || {};

        const enabled = Boolean(body.enabled);
        const channelId = body.channelId ? String(body.channelId).trim() : null;
        const notifyRankUp = body.notifyRankUp !== false;
        const notifyDerank = body.notifyDerank !== false;

        if (channelId) {
            const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
            if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
                return res.status(400).json({ error: 'Vybraný kanál pre Rank-Up / Derank oznámenia neexistuje alebo nie je textový.' });
            }
            if (enabled && !hasChannelPermissions(guild, channel, [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks
            ])) {
                return res.status(400).json({
                    error: `Bot nemá v kanáli #${channel.name} práva Zobraziť kanál, Posielať správy a Vkladať odkazy.`
                });
            }
        } else if (enabled) {
            return res.status(400).json({ error: 'Pre zapnutie Rank-Up / Derank oznámení vyber cieľový kanál.' });
        }

        const saved = updateRankFeedSettings({
            enabled,
            channelId,
            notifyRankUp,
            notifyDerank
        });

        addActivityLog({
            level: 'info',
            category: 'dashboard',
            message: `Rank-Up / Derank oznámenia ${enabled ? 'zapnuté' : 'vypnuté'}.`,
            actor: getActorName(req)
        });

        return res.json({ ok: true, rankFeed: saved });
    });

    app.post('/api/rankfeed/test', async (req, res) => {
        const { guild, member } = req.dashboardAuth;
        const result = await sendTestRankFeedMessage(guild, member);
        if (!result.ok) {
            return res.status(400).json({ error: result.error });
        }
        return res.json({ ok: true });
    });

    // --- Discord Admin Log ---
    app.put('/api/settings/adminlog', async (req, res) => {
        const { guild } = req.dashboardAuth;
        const body = req.body || {};
        const events = body.events && typeof body.events === 'object' ? body.events : {};

        const enabled = Boolean(body.enabled);
        const channelId = body.channelId ? String(body.channelId).trim() : null;

        if (channelId) {
            const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
            if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
                return res.status(400).json({ error: 'Vybraný kanál pre Admin Log neexistuje alebo nie je textový.' });
            }
            if (enabled && !hasChannelPermissions(guild, channel, [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks
            ])) {
                return res.status(400).json({
                    error: `Bot nemá v kanáli #${channel.name} práva Zobraziť kanál, Posielať správy a Vkladať odkazy.`
                });
            }
        } else if (enabled) {
            return res.status(400).json({ error: 'Pre zapnutie Admin Logu vyber cieľový kanál.' });
        }

        const saved = updateAdminLogSettings({
            enabled,
            channelId,
            events: {
                memberJoin: Boolean(events.memberJoin),
                memberLeave: Boolean(events.memberLeave),
                bans: Boolean(events.bans),
                timeouts: Boolean(events.timeouts),
                roleChanges: Boolean(events.roleChanges),
                voiceActivity: Boolean(events.voiceActivity)
            }
        });

        addActivityLog({
            level: 'info',
            category: 'dashboard',
            message: `Admin Log ${enabled ? 'zapnutý' : 'vypnutý'}.`,
            actor: getActorName(req)
        });

        return res.json({ ok: true, adminLog: saved });
    });

    app.post('/api/adminlog/test', async (req, res) => {
        const { guild } = req.dashboardAuth;
        const result = await sendTestAdminLogMessage(guild);
        if (!result.ok) {
            return res.status(400).json({ error: result.error });
        }
        return res.json({ ok: true });
    });

    // --- Oznámenia / Embed Builder ---
    async function syncAnnouncementsHistoryWithDiscord(guild) {
        const history = getAnnouncementsHistory();
        if (!guild || history.length === 0) return history;

        const checks = await Promise.all(history.map(async entry => {
            let channel = guild.channels.cache.get(entry.channelId);
            if (!channel) {
                try {
                    channel = await guild.channels.fetch(entry.channelId);
                } catch (err) {
                    if (err?.code === 10003) {
                        return { entry, keep: false };
                    }
                    return { entry, keep: true };
                }
            }

            if (!channel || !channel.isTextBased()) {
                return { entry, keep: false };
            }

            try {
                await channel.messages.fetch(entry.messageId);
                return { entry, keep: true };
            } catch (err) {
                if (err?.code === 10008 || err?.code === 10003) {
                    return { entry, keep: false };
                }
                return { entry, keep: true };
            }
        }));

        const kept = checks.filter(c => c.keep).map(c => c.entry);
        if (kept.length !== history.length) {
            return setAnnouncementsHistory(kept);
        }
        return kept;
    }

    app.get('/api/announcements/history', async (req, res) => {
        const history = await syncAnnouncementsHistoryWithDiscord(req.dashboardAuth.guild);
        return res.json({ history });
    });

    app.post('/api/announcements/send', async (req, res) => {
        const { guild } = req.dashboardAuth;
        const body = req.body || {};
        const channelId = String(body.channelId || '').trim();

        if (!channelId) {
            return res.status(400).json({ error: 'Vyber cieľový kanál pre oznámenie.' });
        }

        const channel = guild.channels.cache.get(channelId)
            || await guild.channels.fetch(channelId).catch(() => null);
        if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
            return res.status(400).json({ error: 'Vybraný kanál neexistuje alebo nie je textový.' });
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

        const built = buildAnnouncementPayload(guild, body);
        if (built.error) {
            return res.status(400).json({ error: built.error });
        }

        const msg = await channel.send(built.payload);
        if (body.crosspost && channel.type === ChannelType.GuildAnnouncement && typeof msg.crosspost === 'function') {
            await msg.crosspost().catch(() => null);
        }

        const entry = {
            channelId: channel.id,
            channelName: channel.name,
            messageId: msg.id,
            sentAt: Date.now(),
            ...built.meta
        };
        const history = addAnnouncementHistory(entry);

        addActivityLog({
            level: 'success',
            category: 'dashboard',
            message: `Odoslané oznámenie do #${channel.name}${built.meta.title ? ` (${built.meta.title})` : ''}.`,
            actor: getActorName(req)
        });

        return res.json({ ok: true, entry, history });
    });

    app.put('/api/announcements/:channelId/:messageId', async (req, res) => {
        const { guild } = req.dashboardAuth;
        const { channelId, messageId } = req.params;
        const body = req.body || {};

        const channel = guild.channels.cache.get(channelId)
            || await guild.channels.fetch(channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) {
            const history = removeAnnouncementHistory(channelId, messageId);
            return res.status(404).json({
                error: 'Pôvodná správa na Discorde už neexistuje a bola odstránená zo zoznamu.',
                history
            });
        }

        const existingMsg = await channel.messages.fetch(messageId).catch(() => null);
        if (!existingMsg) {
            const history = removeAnnouncementHistory(channelId, messageId);
            return res.status(404).json({
                error: 'Pôvodná správa na Discorde už neexistuje a bola odstránená zo zoznamu.',
                history
            });
        }

        const built = buildAnnouncementPayload(guild, body);
        if (built.error) {
            return res.status(400).json({ error: built.error });
        }

        await existingMsg.edit({
            content: built.payload.content || null,
            embeds: built.payload.embeds || []
        });

        const entry = {
            channelId: channel.id,
            channelName: channel.name,
            messageId: existingMsg.id,
            sentAt: Date.now(),
            ...built.meta
        };
        const history = addAnnouncementHistory(entry);

        addActivityLog({
            level: 'info',
            category: 'dashboard',
            message: `Upravené oznámenie v #${channel.name}${built.meta.title ? ` (${built.meta.title})` : ''}.`,
            actor: getActorName(req)
        });

        return res.json({ ok: true, entry, history });
    });

    // --- Activity Log v dashboarde ---
    app.get('/api/logs', (req, res) => {
        const category = String(req.query.category || 'all');
        const limit = Number(req.query.limit || 150);
        return res.json({ logs: getActivityLogs({ category, limit }) });
    });

    app.delete('/api/logs', (req, res) => {
        clearActivityLogs();
        addActivityLog({
            level: 'info',
            category: 'dashboard',
            message: 'Activity Log bol vyčistený.',
            actor: getActorName(req)
        });
        return res.json({ ok: true, logs: getActivityLogs({ limit: 150 }) });
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
