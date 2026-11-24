const crypto = require('crypto');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

const { OWNER_ID, DB_FILE, SETTINGS_FILE } = require('../src/config');
const { loadUsers, saveUsers, usersFileExists, normalizeEloHistory } = require('../src/storage/usersStore');
const {
    normalizeWarningsData,
    loadWarnings,
    saveWarnings,
    getUserWarnings,
    getAllWarningsByUser
} = require('../src/storage/warningsStore');
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
    setAnnouncementsHistory,
    getWelcomeSettings,
    updateWelcomeSettings,
    getTicketsSettings,
    updateTicketsSettings,
    getAllOpenTickets,
    deleteOpenTicket,
    getModerationSettings,
    updateModerationSettings
} = require('../src/storage/settingsStore');
const { resolveSteam64Id } = require('../src/services/steam');
const { getRankForElo, removeRankRoles, updateMemberRank, updateAllMemberRanks } = require('../src/services/ranks');
const { updateBotStatus } = require('../src/services/botStatus');
const {
    toggleTempRoomLock,
    closeTempRoom,
    renameTempRoom,
    kickFromTempRoom,
    unlockTriggerChannelRoles,
    syncTriggerChannelLock
} = require('../src/services/tempVoice');
const { fetchCs2News } = require('../src/services/steamNews');
const { sendPatchToChannel } = require('../src/services/patchBot');
const { validateAssignableRole } = require('../src/services/joinRoles');
const { parseIntervalSeconds, updateGuildStatusMessage } = require('../src/services/csStatus');
const { addActivityLog, getActivityLogs, clearActivityLogs } = require('../src/services/activityLog');
const { sendTestRankFeedMessage } = require('../src/services/rankFeed');
const { sendTestAdminLogMessage } = require('../src/services/adminLog');
const { sendTestWelcome } = require('../src/services/welcome');
const { sendOrUpdateTicketPanel, closeTicketChannel } = require('../src/services/tickets');
const { registerCommands, syncAdminCommandPermissions } = require('../src/handlers/commandHandler');
const {
    issueWarning,
    removeWarning,
    clearAllWarnings,
    applyTimeout,
    removeTimeout,
    kickMember,
    banMember,
    unbanUser
} = require('../src/services/moderation');

const SESSION_COOKIE = 'rt1k_session';
const OAUTH_STATE_COOKIE = 'rt1k_oauth_state';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const userOAuthTokens = new Map();

let modSyncRunning = false;
let modSyncQueued = null;

async function runModerationCommandSyncJob({ client, guild, tokenEntry, actorName }) {
    try {
        const mod = getModerationSettings();
        const registered = await registerCommands(client).catch(err => {
            console.error('[Moderation] Registrácia príkazov zlyhala:', err);
            return null;
        });

        if (!registered) {
            addActivityLog({
                level: 'warn',
                category: 'moderation',
                message: 'Nepodarilo sa zaregistrovať slash príkazy v Discorde.',
                actor: actorName
            });
            return;
        }

        if (!mod?.enabled) {
            addActivityLog({
                level: 'info',
                category: 'moderation',
                message: 'Admin slash príkazy boli odstránené z Discordu.',
                actor: actorName
            });
            return;
        }

        const hasToken = tokenEntry && tokenEntry.expiresAt > Date.now();
        const hasScope = hasToken && Array.isArray(tokenEntry.scopes) && tokenEntry.scopes.includes('applications.commands.permissions.update');
        if (!hasToken || !hasScope) {
            return;
        }

        const syncRes = await syncAdminCommandPermissions(client, guild, registered, tokenEntry.accessToken);
        if (syncRes.synced) {
            addActivityLog({
                level: 'success',
                category: 'moderation',
                message: `Oprávnenia admin príkazov zosynchronizované (${syncRes.count}).`,
                actor: actorName
            });
        } else {
            const codePart = syncRes.code ? `, kód ${syncRes.code}` : '';
            const detailPart = syncRes.detail ? `: ${syncRes.detail}` : '';
            const msg = syncRes.status === 403
                ? 'Discord zamietol úpravu oprávnení (403) — účet potrebuje Manage Server a Manage Roles.'
                : `Synchronizácia oprávnení zlyhala (HTTP ${syncRes.status}${codePart}${detailPart}).`;
            console.error('[Moderation]', msg);
            addActivityLog({
                level: 'warn',
                category: 'moderation',
                message: msg,
                actor: actorName
            });
        }
    } catch (err) {
        console.error('[Moderation] Neočakávaná chyba pri synchronizácii:', err);
    }
}

function scheduleModerationCommandSync(client, guild, tokenEntry, actorName) {
    if (modSyncRunning) {
        modSyncQueued = { client, guild, tokenEntry, actorName };
        return;
    }

    modSyncRunning = true;
    (async () => {
        try {
            await runModerationCommandSyncJob({ client, guild, tokenEntry, actorName });
            while (modSyncQueued) {
                const next = modSyncQueued;
                modSyncQueued = null;
                await runModerationCommandSyncJob(next);
            }
        } finally {
            modSyncRunning = false;
        }
    })();
}

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

    const wlActive = Boolean(
        settings.welcome?.enabled && (
            (settings.welcome?.channelEnabled && settings.welcome?.channelId) ||
            settings.welcome?.dmEnabled ||
            (settings.welcome?.goodbyeEnabled && settings.welcome?.goodbyeChannelId)
        )
    );

    const openTicketsCount = Object.values(settings.tickets?.openTickets || {})
        .filter(t => t && t.guildId === guild.id && guild.channels.cache.has(t.channelId))
        .length;

    let topElo = 0;
    let topClimber = null;
    for (const [userId, u] of Object.entries(users)) {
        if (typeof u?.elo === 'number' && u.elo > topElo) {
            topElo = u.elo;
        }
        const stats = computeWeeklyEloStats(u);
        if (stats.weeklyDelta > 0 && (!topClimber || stats.weeklyDelta > topClimber.delta)) {
            const member = guild.members.cache.get(userId);
            topClimber = {
                userId,
                displayName: member?.displayName || `Používateľ ${userId}`,
                delta: stats.weeklyDelta,
                elo: typeof u?.elo === 'number' ? u.elo : null
            };
        }
    }

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
            openTicketsCount,
            topElo,
            topClimber
        },
        modules: {
            tempVoiceEnabled: tvActive,
            patchBotEnabled: pbActive,
            joinRolesEnabled: jrActive,
            csStatusEnabled: Boolean(settings.csStatus.enabled && settings.csStatus.channelId),
            rankFeedEnabled: Boolean(settings.rankFeed?.enabled && settings.rankFeed?.channelId),
            adminLogEnabled: Boolean(settings.adminLog?.enabled && settings.adminLog?.channelId),
            welcomeEnabled: wlActive,
            ticketsEnabled: Boolean(settings.tickets?.enabled),
            moderationEnabled: Boolean(settings.moderation?.enabled)
        },
        viewAuditLogGranted: Boolean(guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog)),
        steamApiKeyConfigured: Boolean(process.env.STEAM_API_KEY?.trim())
    };
}

function computeWeeklyEloStats(data) {
    const eloHistory = normalizeEloHistory(data?.eloHistory);
    if (eloHistory.length < 2) {
        return { eloHistory, weeklyDelta: 0, lastDelta: 0 };
    }
    const latest = eloHistory[eloHistory.length - 1];
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const baseline = [...eloHistory].reverse().find(pt => pt.timestamp <= cutoff) || eloHistory[0];
    return {
        eloHistory,
        weeklyDelta: latest.elo - baseline.elo,
        lastDelta: latest.elo - eloHistory[eloHistory.length - 2].elo
    };
}

function buildPlayersPayload(guild) {
    const users = loadUsers();
    const warningsByUser = getAllWarningsByUser();
    const now = Date.now();
    const memberMap = new Map();

    for (const m of guild.members.cache.values()) {
        if (!m || m.user?.bot) continue;
        memberMap.set(m.id, m);
    }

    const allUserIds = new Set([
        ...memberMap.keys(),
        ...Object.keys(users),
        ...Object.keys(warningsByUser)
    ]);

    return [...allUserIds]
        .map(userId => {
            const member = memberMap.get(userId) || null;
            const data = users[userId] || null;
            const isLinked = Boolean(data?.steamId);
            const elo = isLinked && typeof data.elo === 'number' ? data.elo : null;
            const rankObj = elo !== null ? getRankForElo(elo) : null;
            const { eloHistory, weeklyDelta, lastDelta } = data
                ? computeWeeklyEloStats(data)
                : { eloHistory: [], weeklyDelta: 0, lastDelta: 0 };

            const timeoutUntil = member?.communicationDisabledUntilTimestamp && member.communicationDisabledUntilTimestamp > now
                ? member.communicationDisabledUntilTimestamp
                : null;
            const userWarnings = warningsByUser[userId] || [];

            return {
                userId,
                isLinked,
                steamId: data?.steamId || null,
                leetifyUrl: isLinked ? `https://leetify.com/app/profile/${data.steamId}` : null,
                elo,
                eloHistory,
                weeklyDelta,
                lastDelta,
                rankColor: rankObj ? formatHexColor(rankObj.color) : '#808080',
                displayName: member?.displayName || `Používateľ ${userId}`,
                username: member?.user?.username || 'Neznámy na serveri',
                inGuild: Boolean(member),
                avatarUrl: member?.displayAvatarURL({ size: 64 })
                    || 'https://cdn.discordapp.com/embed/avatars/0.png',
                warningsCount: userWarnings.length,
                isTimedOut: Boolean(timeoutUntil),
                timeoutUntil,
                isOwner: userId === OWNER_ID || userId === guild.ownerId
            };
        })
        .sort((a, b) => {
            if (a.isLinked !== b.isLinked) return a.isLinked ? -1 : 1;
            if (a.isLinked && b.isLinked) {
                const diff = (b.elo ?? -1) - (a.elo ?? -1);
                if (diff !== 0) return diff;
            }
            if (a.inGuild !== b.inGuild) return a.inGuild ? -1 : 1;
            return a.displayName.localeCompare(b.displayName, 'sk');
        });
}

function buildOpenTicketsPayload(guild) {
    const openMap = getAllOpenTickets();
    const list = [];

    for (const [channelId, ticket] of Object.entries(openMap)) {
        if (!ticket || ticket.guildId !== guild.id) continue;
        const channel = guild.channels.cache.get(channelId);
        if (!channel) continue;

        const creator = guild.members.cache.get(ticket.userId);
        const claimer = ticket.claimedById ? guild.members.cache.get(ticket.claimedById) : null;

        list.push({
            channelId,
            number: Number(ticket.number || 0),
            channelName: channel.name,
            userId: ticket.userId,
            userName: creator?.displayName || `ID ${ticket.userId}`,
            userAvatar: creator?.displayAvatarURL({ size: 64 }) || 'https://cdn.discordapp.com/embed/avatars/0.png',
            subject: ticket.subject || 'Bez predmetu',
            claimedById: ticket.claimedById || null,
            claimedByName: claimer?.displayName || (ticket.claimedById ? `ID ${ticket.claimedById}` : null),
            createdAt: ticket.createdAt || Date.now()
        });
    }

    return list.sort((a, b) => b.number - a.number);
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

function logDashboardAudit(req, message, level = 'info') {
    addActivityLog({
        level,
        category: 'audit',
        message,
        actor: getActorName(req)
    });
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
            scope: 'identify applications.commands.permissions.update',
            state
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

            if (tokenData.access_token) {
                const expiresInSec = Number(tokenData.expires_in) || 604800;
                const scopes = String(tokenData.scope || '').split(/\s+/).filter(Boolean);
                userOAuthTokens.set(discordUser.id, {
                    accessToken: tokenData.access_token,
                    scopes,
                    expiresAt: Date.now() + expiresInSec * 1000
                });
            }

            res.cookie(SESSION_COOKIE, sessionPayload, getCookieOptions(req, SESSION_MAX_AGE_MS));
            return res.redirect('/');
        } catch (err) {
            console.error('Chyba pri Discord OAuth2 callbacku:', err);
            return res.redirect('/?error=oauth_failed');
        }
    });

    app.post('/api/logout', (req, res) => {
        const sessionUser = req.signedCookies?.[SESSION_COOKIE];
        if (sessionUser?.id) {
            userOAuthTokens.delete(sessionUser.id);
        }
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
            payload.logs = getActivityLogs({ limit: 500 });
        } else if (section === 'announcements') {
            payload.announcementsHistory = getAnnouncementsHistory();
        } else if (section === 'tickets') {
            payload.openTickets = buildOpenTicketsPayload(guild);
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
        logDashboardAudit(req, `Prepojený hráč ${member.displayName} (${steamId}).`, 'success');

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

        logDashboardAudit(req, `Aktualizovaný rank hráča ${member.displayName}.`);
        return res.json({ ok: true, elo: result.elo });
    });

    app.post('/api/players/update-all', async (req, res) => {
        const summary = await updateAllMemberRanks(client);
        if (summary.alreadyRunning) {
            return res.status(409).json({ error: 'Hromadná aktualizácia rankov práve prebieha.' });
        }
        logDashboardAudit(req, `Hromadná aktualizácia rankov (${summary.updated}/${summary.total}).`);
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

        logDashboardAudit(req, `Odpojený hráč ${member?.displayName || userId}.`, 'warn');
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
        const allowedChannelBypassRoleIds = uniqueStringIds(body.allowedChannelBypassRoleIds);
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

        for (const roleId of allowedChannelBypassRoleIds) {
            if (roleId === guild.id) {
                return res.status(400).json({ error: 'Ako výnimku pre kanál príkazov nie je možné nastaviť `@everyone`.' });
            }
            const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
            if (!role) {
                return res.status(400).json({ error: 'Vybraná rola s výnimkou pre kanál príkazov neexistuje.' });
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
            s.allowedChannelBypassRoleIds = allowedChannelBypassRoleIds;
            s.unrankedRoleId = unrankedRoleId;
            s.rankRoles = validatedRanks;
            if (nextBotStatus) {
                s.botStatus = nextBotStatus;
            }
        });

        updateBotStatus(client, { force: true });
        logDashboardAudit(req, 'Aktualizované všeobecné nastavenia, status bota a CS2 rank roly.');

        return res.json({ ok: true, settings: updated });
    });

    // --- TempVoice (viacero nezávislých konfigurácií, vypnutie nič nemaže) ---
    app.put('/api/settings/tempvoice', async (req, res) => {
        const { guild } = req.dashboardAuth;
        const body = req.body || {};

        const moduleEnabled = Boolean(body.enabled);
        const rawSetups = Array.isArray(body.setups) ? body.setups : [];
        const existingTv = getTempVoiceSettings();
        const prevById = new Map((existingTv.setups || []).map(s => [s.id, s]));

        const normalizedSetups = [];
        const usedTriggerIds = new Set();

        for (let i = 0; i < rawSetups.length; i++) {
            const raw = rawSetups[i] || {};
            const def = getDefaultTempVoiceSetup(`tv_${i + 1}`);
            const setupId = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : def.id;
            const setupEnabled = Boolean(raw.enabled);
            const createTriggerChannel = Boolean(raw.createTriggerChannel);

            let triggerName = String(raw.triggerName ?? def.triggerName).trim();
            const roomNameTemplate = String(raw.roomNameTemplate ?? def.roomNameTemplate).trim();
            const bitrateKbps = Number(raw.bitrateKbps ?? def.bitrateKbps);
            const userLimit = Number(raw.userLimit ?? def.userLimit);
            const categoryId = raw.categoryId ? String(raw.categoryId).trim() : null;
            let triggerChannelId = createTriggerChannel
                ? null
                : (raw.triggerChannelId ? String(raw.triggerChannelId).trim() : null);

            if (createTriggerChannel && (!triggerName || triggerName.length > 100)) {
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
            } else {
                const triggerChannel = triggerChannelId
                    ? (guild.channels.cache.get(triggerChannelId) || await guild.channels.fetch(triggerChannelId).catch(() => null))
                    : null;

                if (moduleEnabled && setupEnabled) {
                    if (!triggerChannelId) {
                        return res.status(400).json({ error: `TempVoice #${i + 1}: Vyber spúšťací kanál alebo prepni na vytvorenie nového.` });
                    }
                    if (!triggerChannel || triggerChannel.type !== ChannelType.GuildVoice) {
                        return res.status(400).json({ error: `TempVoice #${i + 1}: Vybraný spúšťací hlasový kanál neexistuje.` });
                    }
                }

                if (triggerChannel && triggerChannel.type === ChannelType.GuildVoice) {
                    triggerName = triggerChannel.name.slice(0, 100);
                } else if (!triggerName) {
                    triggerName = def.triggerName;
                } else {
                    triggerName = triggerName.slice(0, 100);
                }
            }

            const lockOnDisable = Boolean(raw.lockOnDisable);
            const lockRoleIds = uniqueStringIds(raw.lockRoleIds);

            for (const roleId of lockRoleIds) {
                const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
                if (!role) {
                    return res.status(400).json({ error: `TempVoice #${i + 1}: Vybraná rola pre zamknutie kanála neexistuje.` });
                }
            }
            if (lockOnDisable && lockRoleIds.length === 0) {
                return res.status(400).json({
                    error: `TempVoice #${i + 1}: Pre automatické zamknutie pri vypnutí vyber aspoň jednu rolu (napr. @everyone).`
                });
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
                userLimit: Math.round(userLimit),
                lockOnDisable,
                lockRoleIds,
                lockedRolePrevConnect: {}
            });
        }

        const warnings = [];
        const nextIds = new Set(normalizedSetups.map(s => s.id));
        for (const prevSetup of existingTv.setups || []) {
            if (!nextIds.has(prevSetup.id) && prevSetup.triggerChannelId && Object.keys(prevSetup.lockedRolePrevConnect || {}).length > 0) {
                const resUnlock = await unlockTriggerChannelRoles(guild, prevSetup.triggerChannelId, prevSetup.lockedRolePrevConnect);
                if (resUnlock.warning) warnings.push(resUnlock.warning);
            }
        }

        for (const setup of normalizedSetups) {
            const prevSetup = prevById.get(setup.id) || null;
            const shouldBeLocked = Boolean(setup.lockOnDisable && setup.lockRoleIds.length > 0 && !(moduleEnabled && setup.enabled));
            const syncRes = await syncTriggerChannelLock(guild, setup, prevSetup, shouldBeLocked);
            setup.lockedRolePrevConnect = syncRes.lockedRolePrevConnect;
            if (syncRes.warning) warnings.push(syncRes.warning);
        }

        const saved = updateTempVoiceSettings({
            enabled: moduleEnabled,
            setups: normalizedSetups
        });

        logDashboardAudit(req, `Upravené nastavenia TempVoice (${moduleEnabled ? 'zapnuté' : 'vypnuté'}).`);
        return res.json({ ok: true, tempVoice: saved, warnings });
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
        logDashboardAudit(req, `${result.locked ? 'Zamknutá' : 'Odomknutá'} TempVoice miestnosť (${req.params.channelId}).`);
        return res.json({ ok: true, locked: result.locked });
    });

    app.delete('/api/tempvoice/rooms/:channelId', async (req, res) => {
        const result = await closeTempRoom(client, req.params.channelId);
        if (!result.ok) {
            return res.status(404).json({ error: 'Dočasná miestnosť už neexistuje.' });
        }
        logDashboardAudit(req, `Zatvorená dočasná miestnosť (${req.params.channelId}).`, 'warn');
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
        logDashboardAudit(req, `Miestnosť premenovaná na „${result.name}“.`);
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
        logDashboardAudit(req, `Hráč ${result.displayName} bol odpojený z TempVoice miestnosti.`, 'warn');
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

        logDashboardAudit(req, `PatchBot ${enabled ? 'zapnutý' : 'vypnutý'}.`);
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

        logDashboardAudit(req, `Odoslaný najnovší CS2 update (${latestItem.title}) do ${sentCount} kanálov.`);
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

        logDashboardAudit(req, `Join Roles ${enabled ? 'zapnuté' : 'vypnuté'}.`);
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

        logDashboardAudit(req, `CS2 Status ${enabled ? 'zapnutý' : 'vypnutý'}.`);

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

        logDashboardAudit(req, 'Obnovený CS2 Status embed.');
        return res.json({ ok: true, csStatus: getCsStatusSettings() });
    });

    // --- Zálohy (iba stiahnutie do prehliadača) ---
    app.get('/api/backup/download/:target', (req, res) => {
        const target = req.params.target;

        if (target === 'users') {
            if (!usersFileExists()) {
                return res.status(404).json({ error: 'Súbor users.json zatiaľ neexistuje.' });
            }
            logDashboardAudit(req, 'Stiahnutá záloha hráčov.');
            return res.download(DB_FILE, 'users.json');
        }

        if (target === 'settings') {
            if (!settingsFileExists()) {
                loadSettings();
            }
            logDashboardAudit(req, 'Stiahnutá záloha nastavení.');
            return res.download(SETTINGS_FILE, 'settings.json');
        }

        if (target === 'all') {
            const payload = {
                exportedAt: new Date().toISOString(),
                users: loadUsers(),
                settings: loadSettings(),
                warnings: loadWarnings()
            };
            const dateTag = new Date().toISOString().slice(0, 10);
            logDashboardAudit(req, 'Stiahnutá kompletná záloha.');
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
                    clean[uid] = { steamId: val, elo: null, eloHistory: [] };
                } else if (val && typeof val === 'object' && /^\d{17}$/.test(String(val.steamId || ''))) {
                    clean[uid] = {
                        steamId: String(val.steamId),
                        elo: typeof val.elo === 'number' ? val.elo : null,
                        eloHistory: normalizeEloHistory(val.eloHistory)
                    };
                }
            }
            return clean;
        }

        // 1. Kompletná záloha { users, settings, warnings? }
        if (payload.users && typeof payload.users === 'object' && payload.settings && typeof payload.settings === 'object') {
            saveUsers(normalizeUsersMap(payload.users));
            saveSettings(payload.settings);
            restored.push('users', 'settings');
            if (payload.warnings && typeof payload.warnings === 'object') {
                saveWarnings(normalizeWarningsData(payload.warnings));
                restored.push('warnings');
            }
        } else if (
            payload.tempVoice || payload.patchBot || payload.joinRoles ||
            payload.csStatus || payload.rankRoles || payload.adminLog ||
            payload.rankFeed || payload.welcome || payload.tickets || payload.moderation
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
        logDashboardAudit(req, `Obnovená záloha zo súboru (${restored.join(' + ')}).`, 'warn');

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

        logDashboardAudit(req, `Rank-Up / Derank oznámenia ${enabled ? 'zapnuté' : 'vypnuté'}.`);

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

        logDashboardAudit(req, `Admin Log ${enabled ? 'zapnutý' : 'vypnutý'}.`);

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

        logDashboardAudit(req, `Odoslané oznámenie do #${channel.name}${built.meta.title ? ` (${built.meta.title})` : ''}.`, 'success');

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

        logDashboardAudit(req, `Upravené oznámenie v #${channel.name}${built.meta.title ? ` (${built.meta.title})` : ''}.`);

        return res.json({ ok: true, entry, history });
    });

    // --- Uvítacie správy (Welcome / Goodbye) ---
    app.put('/api/settings/welcome', async (req, res) => {
        const { guild } = req.dashboardAuth;
        const body = req.body || {};

        const enabled = Boolean(body.enabled);
        const channelEnabled = Boolean(body.channelEnabled);
        const channelId = body.channelId ? String(body.channelId).trim() : null;
        const dmEnabled = Boolean(body.dmEnabled);
        const goodbyeEnabled = Boolean(body.goodbyeEnabled);
        const goodbyeChannelId = body.goodbyeChannelId ? String(body.goodbyeChannelId).trim() : null;
        const ignoreBots = body.ignoreBots !== false;

        async function validateTextChan(cid, label) {
            const ch = guild.channels.cache.get(cid) || await guild.channels.fetch(cid).catch(() => null);
            if (!ch || (ch.type !== ChannelType.GuildText && ch.type !== ChannelType.GuildAnnouncement)) {
                return `Vybraný kanál pre ${label} neexistuje alebo nie je textový.`;
            }
            if (!hasChannelPermissions(guild, ch, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
                return `Bot nemá v kanáli #${ch.name} práva Zobraziť kanál, Posielať správy a Vkladať odkazy.`;
            }
            return null;
        }

        if (channelId) {
            const errMsg = await validateTextChan(channelId, 'uvítanie do roomky');
            if (errMsg) return res.status(400).json({ error: errMsg });
        } else if (enabled && channelEnabled) {
            return res.status(400).json({ error: 'Pre zapnutie uvítania do roomky vyber cieľový kanál.' });
        }

        if (goodbyeChannelId) {
            const errMsg = await validateTextChan(goodbyeChannelId, 'rozlúčkovú správu');
            if (errMsg) return res.status(400).json({ error: errMsg });
        } else if (enabled && goodbyeEnabled) {
            return res.status(400).json({ error: 'Pre zapnutie rozlúčkovej správy vyber cieľový kanál.' });
        }

        const current = getWelcomeSettings();
        const normColor = (val, fallback) => (
            typeof val === 'string' && /^#[0-9a-fA-F]{6}$/.test(val.trim()) ? val.trim() : fallback
        );

        const saved = updateWelcomeSettings({
            enabled,
            channelEnabled,
            channelId,
            channelTitle: typeof body.channelTitle === 'string' ? body.channelTitle.slice(0, 256) : current.channelTitle,
            channelDescription: typeof body.channelDescription === 'string' ? body.channelDescription.slice(0, 4000) : current.channelDescription,
            channelColor: normColor(body.channelColor, current.channelColor),
            channelShowAvatar: typeof body.channelShowAvatar === 'boolean' ? body.channelShowAvatar : current.channelShowAvatar,
            dmEnabled,
            dmTitle: typeof body.dmTitle === 'string' ? body.dmTitle.slice(0, 256) : current.dmTitle,
            dmDescription: typeof body.dmDescription === 'string' ? body.dmDescription.slice(0, 4000) : current.dmDescription,
            dmColor: normColor(body.dmColor, current.dmColor),
            goodbyeEnabled,
            goodbyeChannelId,
            goodbyeTitle: typeof body.goodbyeTitle === 'string' ? body.goodbyeTitle.slice(0, 256) : current.goodbyeTitle,
            goodbyeDescription: typeof body.goodbyeDescription === 'string' ? body.goodbyeDescription.slice(0, 4000) : current.goodbyeDescription,
            goodbyeColor: normColor(body.goodbyeColor, current.goodbyeColor),
            ignoreBots
        });

        logDashboardAudit(req, `Uvítanie ${enabled ? 'zapnuté' : 'vypnuté'}.`);

        return res.json({ ok: true, welcome: saved });
    });

    app.post('/api/welcome/test', async (req, res) => {
        const { guild, member } = req.dashboardAuth;
        const target = String(req.body?.target || 'channel');
        const result = await sendTestWelcome(guild, member, target);
        if (!result.ok) {
            return res.status(400).json({ error: result.error });
        }
        return res.json({ ok: true });
    });

    // --- Ticket systém ---
    app.put('/api/settings/tickets', async (req, res) => {
        const { guild } = req.dashboardAuth;
        const body = req.body || {};

        const enabled = Boolean(body.enabled);
        const categoryId = body.categoryId ? String(body.categoryId).trim() : null;
        const logChannelId = body.logChannelId ? String(body.logChannelId).trim() : null;
        const panelChannelId = body.panelChannelId ? String(body.panelChannelId).trim() : null;
        const supportRoleIds = uniqueStringIds(body.supportRoleIds);

        if (categoryId) {
            const cat = guild.channels.cache.get(categoryId) || await guild.channels.fetch(categoryId).catch(() => null);
            if (!cat || cat.type !== ChannelType.GuildCategory) {
                return res.status(400).json({ error: 'Vybraná kategória pre tickety neexistuje.' });
            }
        }

        for (const [cid, label] of [[logChannelId, 'log/transcript'], [panelChannelId, 'Ticket panel']]) {
            if (!cid) continue;
            const ch = guild.channels.cache.get(cid) || await guild.channels.fetch(cid).catch(() => null);
            if (!ch || !ch.isTextBased()) {
                return res.status(400).json({ error: `Vybraný kanál pre ${label} neexistuje alebo nie je textový.` });
            }
            if (!hasChannelPermissions(guild, ch, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
                return res.status(400).json({ error: `Bot nemá v kanáli #${ch.name} práva Zobraziť kanál, Posielať správy a Vkladať odkazy.` });
            }
        }

        for (const roleId of supportRoleIds) {
            if (roleId === guild.id) {
                return res.status(400).json({ error: 'Ako Support rolu pre tickety nie je možné nastaviť `@everyone`.' });
            }
            const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
            if (!role) {
                return res.status(400).json({ error: 'Jedna z vybraných Support rolí neexistuje.' });
            }
        }

        const current = getTicketsSettings();
        const panelChannelChanged = current.panelChannelId !== panelChannelId;
        const normColor = (val, fallback) => (
            typeof val === 'string' && /^#[0-9a-fA-F]{6}$/.test(val.trim()) ? val.trim() : fallback
        );

        const saved = updateTicketsSettings({
            enabled,
            categoryId,
            logChannelId,
            supportRoleIds,
            panelChannelId,
            panelMessageId: panelChannelChanged ? null : current.panelMessageId,
            panelTitle: typeof body.panelTitle === 'string' && body.panelTitle.trim()
                ? body.panelTitle.trim().slice(0, 256)
                : current.panelTitle,
            panelDescription: typeof body.panelDescription === 'string' && body.panelDescription.trim()
                ? body.panelDescription.trim().slice(0, 4000)
                : current.panelDescription,
            panelColor: normColor(body.panelColor, current.panelColor),
            panelButtonLabel: typeof body.panelButtonLabel === 'string' && body.panelButtonLabel.trim()
                ? body.panelButtonLabel.trim().slice(0, 80)
                : current.panelButtonLabel
        });

        logDashboardAudit(req, `Tickety ${enabled ? 'zapnuté' : 'vypnuté'}.`);

        return res.json({ ok: true, tickets: saved });
    });

    app.post('/api/tickets/panel', async (req, res) => {
        const { guild } = req.dashboardAuth;
        const result = await sendOrUpdateTicketPanel(guild);
        if (!result.ok) {
            return res.status(400).json({ error: result.error });
        }
        logDashboardAudit(req, 'Odoslaný alebo aktualizovaný Ticket panel.');
        return res.json({ ok: true, messageId: result.messageId, tickets: getTicketsSettings() });
    });

    app.get('/api/tickets/open', async (req, res) => {
        const { guild } = req.dashboardAuth;
        const openMap = getAllOpenTickets();
        for (const channelId of Object.keys(openMap)) {
            const ch = guild.channels.cache.get(channelId)
                || await guild.channels.fetch(channelId).catch(() => null);
            if (!ch) {
                deleteOpenTicket(channelId);
            }
        }
        return res.json({ openTickets: buildOpenTicketsPayload(guild) });
    });

    app.delete('/api/tickets/:channelId', async (req, res) => {
        const result = await closeTicketChannel(client, req.params.channelId, getActorName(req));
        if (!result.ok) {
            return res.status(404).json({ error: 'Tento ticket už neexistuje alebo bol zatvorený.' });
        }
        logDashboardAudit(req, `Zatvorený ticket (${req.params.channelId}).`, 'warn');
        return res.json({ ok: true });
    });

    // --- Moderácia ---
    app.put('/api/settings/moderation', async (req, res) => {
        const { guild, sessionUser } = req.dashboardAuth;
        const body = req.body || {};

        const enabled = Boolean(body.enabled);
        const adminRoleIds = uniqueStringIds(body.adminRoleIds);
        const dmUser = body.dmUser !== false;
        const logToAdminLog = body.logToAdminLog !== false;

        for (const roleId of adminRoleIds) {
            if (roleId === guild.id) {
                return res.status(400).json({ error: 'Ako admin rolu nie je možné nastaviť `@everyone`.' });
            }
            const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
            if (!role) {
                return res.status(400).json({ error: 'Vybraná rola pre admin príkazy neexistuje.' });
            }
        }

        const rawCmds = body.commands && typeof body.commands === 'object' ? body.commands : {};
        const commands = {
            warn: rawCmds.warn !== false,
            timeout: rawCmds.timeout !== false,
            kick: rawCmds.kick !== false,
            ban: rawCmds.ban !== false,
            clear: rawCmds.clear !== false,
            lock: rawCmds.lock !== false,
            slowmode: rawCmds.slowmode !== false
        };

        const rawAe = body.autoEscalation && typeof body.autoEscalation === 'object' ? body.autoEscalation : {};
        const aeEnabled = Boolean(rawAe.enabled);
        const rawRules = Array.isArray(rawAe.rules) ? rawAe.rules : [];
        const rules = [];
        const seenThresholds = new Set();

        for (const item of rawRules) {
            const threshold = Math.round(Number(item?.threshold));
            if (!Number.isFinite(threshold) || threshold < 1 || threshold > 50) {
                return res.status(400).json({ error: 'Počet varovaní pre auto-eskaláciu musí byť 1 až 50.' });
            }
            if (seenThresholds.has(threshold)) {
                return res.status(400).json({ error: `Duplicitné pravidlo pre ${threshold} varovaní.` });
            }
            seenThresholds.add(threshold);

            const action = item?.action === 'kick' || item?.action === 'ban' ? item.action : 'timeout';
            const durationMinutes = Math.min(Math.max(Math.round(Number(item?.durationMinutes) || 60), 1), 40320);
            rules.push({ threshold, action, durationMinutes });
        }
        rules.sort((a, b) => a.threshold - b.threshold);

        const saved = updateModerationSettings({
            enabled,
            adminRoleIds,
            dmUser,
            logToAdminLog,
            commands,
            autoEscalation: {
                enabled: aeEnabled,
                rules
            }
        });

        const tokenEntry = userOAuthTokens.get(sessionUser.id);
        const hasToken = tokenEntry && tokenEntry.expiresAt > Date.now();
        const hasScope = hasToken && Array.isArray(tokenEntry.scopes) && tokenEntry.scopes.includes('applications.commands.permissions.update');

        const warnings = [];
        if (enabled && (!hasToken || !hasScope)) {
            warnings.push('Oprávnenia príkazov sa nezosynchronizovali — odhlás sa a znova prihlás cez Discord (potvrď nové oprávnenie).');
        }

        scheduleModerationCommandSync(client, guild, tokenEntry, getActorName(req));
        logDashboardAudit(req, `Moderácia ${enabled ? 'zapnutá' : 'vypnutá'}.`);
        return res.json({ ok: true, moderation: saved, warnings });
    });

    app.get('/api/moderation/warnings/:userId', (req, res) => {
        const userId = String(req.params.userId || '').trim();
        return res.json({ warnings: getUserWarnings(userId) });
    });

    app.post('/api/moderation/warn', async (req, res) => {
        const { guild, member: actorMember, sessionUser } = req.dashboardAuth;
        const userId = String(req.body?.userId || '').trim();
        const reason = String(req.body?.reason || '').trim();

        if (!/^\d{15,22}$/.test(userId) || !reason) {
            return res.status(400).json({ error: 'Vyber hráča a zadaj dôvod varovania.' });
        }

        const targetMember = await guild.members.fetch(userId).catch(() => null);
        const targetUser = targetMember?.user || await client.users.fetch(userId).catch(() => null);
        if (targetUser?.bot) {
            return res.status(400).json({ error: 'Bota nie je možné varovať.' });
        }

        const resWarn = await issueWarning({
            guild,
            targetUser,
            targetMember,
            moderatorId: sessionUser.id,
            moderatorTag: getActorName(req),
            actorMember,
            reason
        });

        if (!resWarn.ok) {
            return res.status(400).json({ error: resWarn.error });
        }

        logDashboardAudit(req, `Udelený warn #${resWarn.warning.id} pre ${targetUser?.tag || userId}.`, 'warn');
        return res.json({
            ok: true,
            warning: resWarn.warning,
            total: resWarn.total,
            escalation: resWarn.escalation,
            warnings: getUserWarnings(userId)
        });
    });

    app.delete('/api/moderation/warnings/:userId/:warningId', async (req, res) => {
        const { guild, sessionUser } = req.dashboardAuth;
        const userId = String(req.params.userId || '').trim();
        const warningId = Number(req.params.warningId);
        const targetMember = guild.members.cache.get(userId);

        const result = await removeWarning({
            guild,
            targetUserId: userId,
            targetLabel: targetMember?.user?.tag || userId,
            warningId,
            moderatorId: sessionUser.id,
            moderatorTag: getActorName(req)
        });

        if (!result.ok) {
            return res.status(404).json({ error: result.error });
        }

        logDashboardAudit(req, `Zmazaný warn #${warningId} pre ${targetMember?.displayName || userId}.`);
        return res.json({ ok: true, warnings: getUserWarnings(userId) });
    });

    app.delete('/api/moderation/warnings/:userId', async (req, res) => {
        const { guild, sessionUser } = req.dashboardAuth;
        const userId = String(req.params.userId || '').trim();
        const targetMember = guild.members.cache.get(userId);

        const result = await clearAllWarnings({
            guild,
            targetUserId: userId,
            targetLabel: targetMember?.user?.tag || userId,
            moderatorId: sessionUser.id,
            moderatorTag: getActorName(req)
        });

        if (!result.ok) {
            return res.status(404).json({ error: result.error });
        }

        logDashboardAudit(req, `Vymazané všetky varovania (${result.removedCount}) pre ${targetMember?.displayName || userId}.`);
        return res.json({ ok: true, removedCount: result.removedCount, warnings: [] });
    });

    app.post('/api/moderation/timeout', async (req, res) => {
        const { guild, member: actorMember, sessionUser } = req.dashboardAuth;
        const userId = String(req.body?.userId || '').trim();
        const durationMinutes = Number(req.body?.durationMinutes);
        const reason = String(req.body?.reason || '').trim() || undefined;

        const targetMember = await guild.members.fetch(userId).catch(() => null);
        if (!targetMember) {
            return res.status(404).json({ error: 'Hráč sa nenachádza na serveri.' });
        }

        if (durationMinutes === 0) {
            const resRm = await removeTimeout({
                guild,
                targetMember,
                reason,
                moderatorId: sessionUser.id,
                moderatorTag: getActorName(req),
                actorMember
            });
            if (!resRm.ok) return res.status(400).json({ error: resRm.error });
            logDashboardAudit(req, `Zrušený timeout pre ${targetMember.displayName}.`);
            return res.json({ ok: true });
        }

        const result = await applyTimeout({
            guild,
            targetMember,
            durationMinutes,
            reason,
            moderatorId: sessionUser.id,
            moderatorTag: getActorName(req),
            actorMember
        });
        if (!result.ok) {
            return res.status(400).json({ error: result.error });
        }

        logDashboardAudit(req, `Timeout (${result.durationLabel}) pre ${targetMember.displayName}.`, 'warn');
        return res.json({ ok: true, durationLabel: result.durationLabel });
    });

    app.post('/api/moderation/kick', async (req, res) => {
        const { guild, member: actorMember, sessionUser } = req.dashboardAuth;
        const userId = String(req.body?.userId || '').trim();
        const reason = String(req.body?.reason || '').trim() || undefined;

        const targetMember = await guild.members.fetch(userId).catch(() => null);
        if (!targetMember) {
            return res.status(404).json({ error: 'Hráč sa nenachádza na serveri.' });
        }

        const result = await kickMember({
            guild,
            targetMember,
            reason,
            moderatorId: sessionUser.id,
            moderatorTag: getActorName(req),
            actorMember
        });
        if (!result.ok) {
            return res.status(400).json({ error: result.error });
        }

        logDashboardAudit(req, `Kick pre ${targetMember.displayName}.`, 'warn');
        return res.json({ ok: true });
    });

    app.post('/api/moderation/ban', async (req, res) => {
        const { guild, member: actorMember, sessionUser } = req.dashboardAuth;
        const userId = String(req.body?.userId || '').trim();
        const reason = String(req.body?.reason || '').trim() || undefined;
        const deleteMessageSeconds = Number(req.body?.deleteMessageSeconds) || 0;

        if (!/^\d{15,22}$/.test(userId)) {
            return res.status(400).json({ error: 'Neplatné ID používateľa.' });
        }

        const targetMember = await guild.members.fetch(userId).catch(() => null);
        const targetUser = targetMember?.user || await client.users.fetch(userId).catch(() => null);

        const result = await banMember({
            guild,
            targetUser,
            targetMember,
            deleteMessageSeconds,
            reason,
            moderatorId: sessionUser.id,
            moderatorTag: getActorName(req),
            actorMember
        });
        if (!result.ok) {
            return res.status(400).json({ error: result.error });
        }

        logDashboardAudit(req, `Ban pre ${result.targetTag}.`, 'warn');
        return res.json({ ok: true });
    });

    app.get('/api/moderation/bans', async (req, res) => {
        const { guild } = req.dashboardAuth;
        const bansCol = await guild.bans.fetch().catch(() => null);
        if (!bansCol) {
            return res.status(400).json({ error: 'Bot nemá právo zobraziť zoznam banov (Ban Members).' });
        }

        const bans = [...bansCol.values()].map(b => ({
            userId: b.user.id,
            username: b.user.username,
            tag: b.user.tag,
            avatarUrl: b.user.displayAvatarURL({ size: 64 }),
            reason: b.reason || null
        }));

        return res.json({ bans });
    });

    app.delete('/api/moderation/bans/:userId', async (req, res) => {
        const { guild, sessionUser } = req.dashboardAuth;
        const userId = String(req.params.userId || '').trim();
        const reason = String(req.body?.reason || '').trim() || undefined;

        const result = await unbanUser({
            guild,
            userId,
            reason,
            moderatorId: sessionUser.id,
            moderatorTag: getActorName(req)
        });
        if (!result.ok) {
            return res.status(400).json({ error: result.error });
        }

        logDashboardAudit(req, `Unban pre ${result.targetTag}.`);
        return res.json({ ok: true });
    });

    // --- Activity Log v dashboarde ---
    app.get('/api/logs', (req, res) => {
        const category = String(req.query.category || 'all');
        const limit = Number(req.query.limit || 500);
        return res.json({ logs: getActivityLogs({ category, limit }) });
    });

    app.delete('/api/logs', (req, res) => {
        clearActivityLogs();
        logDashboardAudit(req, 'Activity Log bol vyčistený.');
        return res.json({ ok: true, logs: getActivityLogs({ limit: 500 }) });
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
