(function (global) {
    'use strict';

    const STORAGE_KEY = 'rt1k_dashboard_lang';
    const DEFAULT_LANG = 'en';

    const SK_EXACT = {
        // Navigation, Views & Auth
        'BOT Gaben — Dashboard': 'BOT Gaben — Dashboard',
        'Loading dashboard...': 'Načítavam dashboard...',
        'BOT Gaben Dashboard': 'Dashboard BOT Gaben',
        'Sign in with Discord': 'Prihlásiť sa cez Discord',
        'Access denied': 'Prístup zamietnutý',
        "You don't have permission to access this dashboard.": 'Nemáš oprávnenie na prístup do dashboardu.',
        'Log out': 'Odhlásiť sa',
        'Loading server...': 'Načítavam server...',
        'General': 'Hlavné',
        'Overview': 'Prehľad',
        'Players': 'Hráči',
        'Announcements': 'Oznámenia',
        'Activity Log': 'Záznamy',
        'Modules': 'Moduly',
        'TempVoice': 'TempVoice',
        'PatchBot': 'PatchBot',
        'Join Roles': 'Úvodné roly',
        'CS2 Status': 'CS2 Status',
        'Rank-Up / Derank': 'Rank-Up / Derank',
        'Admin Log': 'Admin Log',
        'Welcome': 'Uvítanie',
        'Tickets': 'Tickety',
        'Moderation': 'Moderácia',
        'System': 'Systém',
        'Settings': 'Nastavenia',
        'Dashboard': 'Dashboard',
        'Language': 'Jazyk',

        // Categories
        'Audit': 'Audit',
        'CS2 Elo': 'CS2 Elo',
        'Voice': 'Voice',

        // OAuth Errors
        'Bot is starting up, please try again in a few seconds.': 'Bot sa práve spúšťa, skús sa prihlásiť o pár sekúnd.',
        'Missing CLIENT_SECRET or REDIRECT_URI in .env for Discord OAuth2.': 'V .env chýba CLIENT_SECRET alebo REDIRECT_URI pre Discord OAuth2.',
        'Discord sign-in was cancelled.': 'Prihlásenie cez Discord bolo zrušené.',
        'Login session expired. Please sign in again.': 'Platnosť prihlasovacej relácie vypršala. Skús sa prihlásiť znova.',
        'Failed to verify login with Discord API.': 'Nepodarilo sa overiť prihlásenie cez Discord API.',

        // Common UI, Buttons & Modals
        'Unsaved changes': 'Neuložené zmeny',
        'Switching language will discard unsaved changes on this page.': 'Prepnutím jazyka sa zahodia neuložené zmeny na tejto stránke.',
        'Switch language': 'Prepnúť jazyk',
        'Changes discarded.': 'Zmeny boli zahodené.',
        'Failed to load dashboard.': 'Nepodarilo sa načítať dashboard.',
        'Discard': 'Zahodiť',
        'Save': 'Uložiť',
        'Save changes': 'Uložiť zmeny',
        'Confirm action': 'Potvrdiť akciu',
        'Cancel': 'Zrušiť',
        'Confirm': 'Potvrdiť',
        'Rename room': 'Premenovať miestnosť',
        'New name': 'Nový názov',
        'Rename': 'Premenovať',
        'Download backup': 'Stiahnuť zálohu',
        'Full backup': 'Kompletná záloha',
        'Settings and players': 'Nastavenia aj hráči',
        'Modules and roles': 'Konfigurácia modulov a rolí',
        'Steam accounts and Elo history': 'Steam účty a história Elo',
        'Detail': 'Detail',
        'Player details': 'Detail hráča',
        'Refresh': 'Obnoviť',
        'Clear': 'Vyčistiť',
        'Clear all': 'Vymazať všetky',
        'Delete': 'Zmazať',
        'Remove': 'Odstrániť',
        'Remove role': 'Odobrať rolu',
        'Remove channel': 'Odobrať kanál',
        'Remove tier': 'Odstrániť pásmo',
        'Add': 'Pridať',
        'Add role': 'Pridať rolu',
        'Add channel': 'Pridať kanál',
        'Close': 'Zavrieť',
        'Send': 'Odoslať',
        'Send now': 'Odoslať teraz',
        'Test': 'Test',
        'Active': 'Aktívny',
        'Disabled': 'Vypnutý',
        'Existing': 'Existujúci',
        'New': 'Nový',
        'Never': 'Zatiaľ žiadny',
        'None': 'Žiadna',
        'All': 'Všetci',
        'Search...': 'Hľadať...',
        'Reason...': 'Dôvod...',
        'Working...': 'Pracujem...',
        'Loading...': 'Načítavam...',
        'Saving...': 'Ukladám...',
        'Sending...': 'Posielam...',
        'Updating...': 'Upravujem...',
        'Refreshing...': 'Obnovujem...',
        'Clearing...': 'Čistím...',
        'Deleting...': 'Mažem...',
        'Closing...': 'Zatváram...',
        'Restoring...': 'Obnovujem...',
        'Linking...': 'Prepájam...',
        '— None —': '— Žiadny —',
        '— Automatic —': '— Automaticky —',
        '— Select role —': '— Vyber rolu —',
        '— Select channel —': '— Vyber kanál —',
        '— All channels —': '— Všetky kanály —',
        '— No ping —': '— Bez označenia —',
        '— New announcement —': '— Nové oznámenie —',

        // Overview
        'Uptime:': 'Beh bota:',
        'Channels': 'Kanály',
        'Roles': 'Roly',
        'Members': 'Členovia',
        'In voice': 'Vo voice',
        'Linked players': 'Prepojení hráči',
        'No Elo': 'Bez Elo',
        'Open tickets': 'Otvorené tickety',
        '7-day activity': 'Aktivita za 7 dní',
        'Messages:': 'Správy:',
        'Voice:': 'Voice:',
        'Top CS2 players': 'Top CS2 hráči',
        'View all': 'Zobraziť všetko',
        'No data yet.': 'Zatiaľ bez dát.',
        'No rated players yet.': 'Zatiaľ žiadni hodnotení hráči.',
        'Recent activity': 'Posledná aktivita',
        'No entries.': 'Žiadne záznamy.',

        // Weekday short labels
        'Sun': 'Ne',
        'Mon': 'Po',
        'Tue': 'Ut',
        'Wed': 'St',
        'Thu': 'Št',
        'Fri': 'Pi',
        'Sat': 'So',

        // Players & Player Modals
        'Weekly climber': 'Skokan týždňa',
        'Linked': 'Prepojení',
        'Timed out': 'Timeout',
        'Warned': 'Varovania',
        'Player': 'Hráč',
        'Activity': 'Aktivita',
        'Warnings': 'Varovania',
        'Actions': 'Akcie',
        'No players match this filter.': 'Žiadni hráči nezodpovedajú filtru.',
        'Players list refreshed.': 'Zoznam hráčov obnovený.',
        'Timeline': 'Časová os',
        'Created': 'Vytvorený',
        'Joined': 'Na serveri od',
        'Messages': 'Správy',
        'Nickname': 'Prezývka',
        'Voice & activity': 'Voice a aktivita',
        'Not in voice': 'Mimo voice',
        'Move': 'Presunúť',
        'Disconnect': 'Odpojiť',
        'Last message': 'Posledná správa',
        'Last voice': 'Posledný voice',
        'Voice history': 'História voice',
        'Nickname saved.': 'Prezývka uložená.',
        'Player moved.': 'Hráč presunutý.',
        'Player disconnected from voice.': 'Hráč odpojený z voice.',
        'Close ticket?': 'Zavrieť ticket?',
        'The ticket will be closed and its channel deleted.': 'Ticket sa zatvorí a kanál zmaže.',
        'Ticket closed.': 'Ticket zatvorený.',
        'Player is not on the server.': 'Hráč nie je na serveri.',
        '· left server': '· mimo servera',
        ' · left server': ' · mimo servera',
        'Active timeout': 'Aktívny timeout',
        'No roles.': 'Žiadne roly.',
        'No role.': 'Žiadna rola.',
        'Role removed.': 'Rola odobratá.',
        'Role added.': 'Rola pridaná.',
        'Link Steam account': 'Prepojiť Steam účet',
        'Steam64 ID or URL': 'Steam64 ID alebo URL',
        'Link': 'Prepojiť',
        'Account is not linked.': 'Účet nie je prepojený.',
        'Unlink': 'Odpojiť',
        'Current': 'Aktuálne',
        '7-day change': 'Za 7 dní',
        'No Elo history yet.': 'Zatiaľ bez histórie Elo.',
        'Unlink player?': 'Odpojiť hráča?',
        'Unranked': 'Unranked',
        'Remove timeout': 'Zrušiť timeout',
        'No warnings.': 'Žiadne varovania.',
        'Warning reason...': 'Dôvod varovania...',
        'Warn': 'Varovať',
        'Server owner cannot be moderated.': 'Majiteľa servera nie je možné moderovať.',
        '1 day': '1 deň',
        '7 days': '7 dní',
        'Apply timeout': 'Udeliť timeout',
        'Kick': 'Vyhodiť',
        "Don't delete messages": 'Nemazať správy',
        'Delete 1 h': 'Zmazať 1 h',
        'Delete 24 h': 'Zmazať 24 h',
        'Delete 7 days': 'Zmazať 7 dní',
        'Ban': 'Zabanovať',
        'Timeout removed.': 'Timeout zrušený.',
        'Clear all warnings?': 'Vymazať všetky varovania?',
        'Warnings cleared.': 'Varovania vymazané.',
        'Kick player?': 'Vyhodiť hráča?',
        'Ban player?': 'Zabanovať hráča?',

        // Announcements
        'Today': 'Dnes',
        'Message preview...': 'Náhľad správy...',
        'Edit sent message': 'Upraviť odoslané',
        'The announcement being edited was deleted on Discord.': 'Upravované oznámenie bolo zmazané na Discorde.',
        'Edit announcement': 'Upraviť oznámenie',
        'New announcement': 'Nové oznámenie',
        'Untitled': 'Bez nadpisu',
        'Request failed ({status})': 'Požiadavka zlyhala ({status})',
        'Cancel edit': 'Zrušiť úpravu',
        'Channel': 'Kanál',
        'Ping role': 'Označiť rolu',
        'Message text': 'Text nad embedom',
        'Title': 'Nadpis',
        'Color': 'Farba',
        'Description': 'Popis',
        'Thumbnail': 'Miniatúra',
        'Image': 'Obrázok',
        'Footer': 'Päta',
        'Timestamp': 'Časová pečiatka',
        'Publish': 'Publikovať',
        'Preview': 'Náhľad',
        'Announcement updated.': 'Oznámenie bolo upravené.',
        'Announcement sent to channel.': 'Oznámenie bolo odoslané do kanála.',

        // Activity Log
        'Activity log refreshed.': 'Záznamy obnovené.',
        'Clear activity log?': 'Vyčistiť záznamy?',
        'All entries in the dashboard log will be removed.': 'Vymažú sa všetky záznamy v dashboarde.',
        'Activity log cleared.': 'Záznamy boli vyčistené.',

        // TempVoice
        'No open rooms.': 'Žiadne otvorené miestnosti.',
        'Locked': 'Zamknutá',
        'Unlocked': 'Odomknutá',
        'Owner:': 'Majiteľ:',
        'Members:': 'Hráči:',
        'Lock': 'Zamknúť',
        'Unlock': 'Odomknúť',
        'Disconnect from room': 'Odpojiť z miestnosti',
        'Room locked.': 'Miestnosť bola zamknutá.',
        'Room unlocked.': 'Miestnosť bola odomknutá.',
        'Close temp room?': 'Zavrieť dočasnú miestnosť?',
        'Close room': 'Zavrieť miestnosť',
        'Disconnect player from room?': 'Odpojiť hráča z miestnosti?',
        'No setups.': 'Žiadna konfigurácia.',
        'Trigger channel': 'Spúšťací kanál',
        '➕ Create room': '➕ Vytvoriť miestnosť',
        'Category': 'Kategória',
        'User limit · 0 = ∞': 'Limit hráčov · 0 = ∞',
        'Lock channel when disabled': 'Zamknúť kanál pri vypnutí',
        'Remove TempVoice setup?': 'Odstrániť TempVoice konfiguráciu?',
        'Enable TempVoice': 'Zapnúť TempVoice',
        'Add TempVoice': 'Pridať TempVoice',
        'TempVoice settings saved.': 'Nastavenia TempVoice boli uložené.',
        'Rooms refreshed.': 'Zoznam miestností obnovený.',

        // PatchBot
        'No channels.': 'Žiadny kanál.',
        'Enable PatchBot': 'Zapnúť PatchBot',
        'Message type': 'Typ správ',
        'All CS2 announcements': 'Všetky CS2 oznámenia',
        'Patch notes only': 'Len aktualizácie hry',
        'Last update:': 'Posledná aktualizácia:',
        'Send latest update': 'Odoslať najnovšiu aktualizáciu',
        'PatchBot settings saved.': 'Nastavenia PatchBot boli uložené.',

        // Join Roles
        'Enable Join Roles': 'Zapnúť Úvodné roly',
        'Bots': 'Boti',
        'Bot role must be above selected roles.': 'Rola bota musí byť nad vybranými rolami.',
        'Join Roles settings saved.': 'Nastavenia Úvodných rolí boli uložené.',

        // CS2 Status
        'Enable CS2 Status': 'Zapnúť CS2 Status',
        'Refresh interval · 30s – 60m': 'Interval obnovy · 30 s – 60 min',
        'Seconds': 'Sekúnd',
        'Minutes': 'Minút',
        'Mode:': 'Režim:',
        'Full · Steam API': 'Plný · Steam API',
        'Basic': 'Základný',
        'Open message': 'Otvoriť správu',
        'Refresh now': 'Obnoviť teraz',
        'Enter a valid whole number for the interval.': 'Zadaj platné celé číslo pre interval.',
        'CS2 Status settings saved.': 'Nastavenia CS2 Status boli uložené.',
        'Server status embed refreshed.': 'Embed so stavom serverov bol obnovený.',

        // Rank-Up / Derank
        'Enable Rank-Up / Derank': 'Zapnúť Rank-Up / Derank',
        'Rank-Up / Derank settings saved.': 'Nastavenia Rank-Up / Derank boli uložené.',
        'Test Rank-Up message sent.': 'Testovacie Rank-Up oznámenie bolo odoslané.',

        // Admin Log
        'Member join': 'Príchod člena',
        'Leave & kick': 'Odchod a kick',
        'Bans & unbans': 'Bany a unbany',
        'Timeouts': 'Timeouty',
        'Channel actions': 'Akcie kanálov',
        'Role changes': 'Zmeny rolí',
        'Voice activity': 'Voice aktivita',
        'Enable Admin Log': 'Zapnúť Admin Log',
        'Events': 'Udalosti',
        'Admin Log settings saved.': 'Nastavenia Admin Logu boli uložené.',
        'Test Admin Log message sent.': 'Testovacia Admin Log správa bola odoslaná.',

        // Welcome
        'Mention': 'Označenie',
        'Display name': 'Meno',
        'Username': 'Používateľ',
        'Enable Welcome': 'Zapnúť Uvítanie',
        'Ignore bots': 'Ignorovať botov',
        'Variables:': 'Premenné:',
        'In channel': 'Do kanála',
        'Member avatar': 'Avatar člena',
        'Direct message': 'Súkromná správa',
        'Goodbye message': 'Rozlúčková správa',
        'Test DM sent.': 'Testovacia DM správa odoslaná.',
        'Test message sent to channel.': 'Testovacia správa bola odoslaná do kanála.',
        'Welcome settings saved.': 'Nastavenia Uvítania boli uložené.',

        // Tickets
        'No open tickets.': 'Žiadne otvorené tickety.',
        'Unclaimed': 'Neprevzatý',
        'A transcript will be saved to the log channel and the ticket channel will be deleted.': 'Uloží sa prepis do log kanála a kanál ticketu sa zmaže.',
        'Close ticket': 'Zavrieť ticket',
        'Enable Tickets': 'Zapnúť Tickety',
        'Transcript channel': 'Kanál prepisov',
        'Panel channel': 'Kanál panelu',
        'Support roles': 'Roly podpory',
        'Ticket panel': 'Ticket panel',
        'Button': 'Tlačidlo',
        'Update panel': 'Aktualizovať panel',
        'Send panel': 'Odoslať panel',
        'Ticket settings saved.': 'Nastavenia Ticketov boli uložené.',
        'Ticket panel sent / updated in channel.': 'Ticket panel bol odoslaný / aktualizovaný v kanáli.',
        'Open tickets refreshed.': 'Zoznam otvorených ticketov obnovený.',

        // Moderation
        'No rules.': 'Žiadne pravidlo.',
        'Action': 'Akcia',
        'Duration': 'Trvanie',
        'Unban': 'Zrušiť ban',
        'Unban user?': 'Zrušiť ban?',
        'Ban & unban': 'Ban a unban',
        'Clear messages': 'Mazanie správ',
        'Channel lock': 'Zamykanie kanálov',
        'Slowmode': 'Pomalý režim',
        'Enable Moderation': 'Zapnúť Moderáciu',
        'Admin command roles': 'Roly pre admin príkazy',
        'Commands': 'Príkazy',
        'Behavior': 'Správanie',
        'Send reason via DM': 'Poslať dôvod v správe',
        'Auto-escalation': 'Auto-eskalácia',
        'Add rule': 'Pridať pravidlo',
        'Moderation settings saved.': 'Nastavenia Moderácie boli uložené.',
        'Ban list refreshed.': 'Zoznam banov obnovený.',

        // Settings
        'Access & commands': 'Prístup a príkazy',
        'Dashboard access': 'Prístup do dashboardu',
        'Bot owner always has access.': 'Majiteľ bota má prístup vždy.',
        'Commands channel': 'Kanál pre príkazy',
        'Bypass roles': 'Výnimky pre roly',
        'Bot status': 'Status bota',
        'Top Elo': 'Najvyššie Elo',
        'Uptime': 'Beh bota',
        'Preview:': 'Náhľad:',
        'No status': 'Žiadny status',
        'Rank updates': 'Aktualizácia rankov',
        'Steam API: Connected': 'Steam API: Pripojené',
        'Steam API: Missing key': 'Steam API: Chýba kľúč',
        'Connected': 'Pripojené',
        'Missing key': 'Chýba kľúč',
        'Rate limited': 'Pauza po limite',
        'In game': 'Počas hry',
        'Post-match': 'Po zápase',
        'Background': 'Na pozadí',
        'Inactive': 'Neaktívni',
        'Discord activity': 'Discord aktivita',
        'CS2 rank roles': 'CS2 rank roly',
        'Add tier': 'Pridať pásmo',
        'Min Elo': 'Min. Elo',
        'Discord role': 'Discord rola',
        'Backup & restore': 'Záloha a obnova',
        'Backup': 'Zálohovať',
        'Restore backup': 'Obnoviť zálohu',
        'Settings saved.': 'Nastavenia boli uložené.',
        'Selected file is not valid JSON.': 'Vybraný súbor nie je platný JSON.',
        'Restore backup?': 'Obnoviť dáta zo zálohy?',
        'At least one Elo tier must remain.': 'Musí zostať aspoň jedno Elo pásmo.',

        // API & Service Errors / Warnings
        'Request failed.': 'Požiadavka zlyhala.',
        ' (managed)': ' (spravovaná integráciou)',
        ' (above bot role)': ' (nad rolou bota)',
        'Bot is not connected to any Discord server yet.': 'Bot zatiaľ nie je pripojený na žiadny Discord server.',
        'You do not have the required role to access the dashboard.': 'Nemáš rolu potrebnú pre prístup do dashboardu.',
        'Select a player and enter a Steam or Leetify profile.': 'Vyber hráča a zadaj Steam/Leetify profil.',
        'Selected player was not found on the Discord server.': 'Vybraný hráč sa nenašiel na Discord serveri.',
        'Could not resolve Steam64 ID. Enter a valid 17-digit ID, Steam link, or Leetify link.': 'Nepodarilo sa nájsť Steam64 ID. Zadaj platné 17-miestne ID, Steam link alebo Leetify link.',
        'Player is not in the database.': 'Hráč nie je v databáze.',
        'Invalid user ID.': 'Neplatné ID používateľa.',
        'Player not found.': 'Hráč sa nenašiel.',
        'Member is not on the server.': 'Hráč sa nenachádza na serveri.',
        'Bot lacks permission to change nickname for this member.': 'Bot nemá oprávnenie meniť prezývku tomuto hráčovi.',
        'Member is not in a voice channel.': 'Hráč nie je vo voice kanáli.',
        'Bot lacks Move Members permission.': 'Bot nemá právo Move Members.',
        'Select a target voice channel.': 'Vyber cieľový voice kanál.',
        'Selected voice channel does not exist.': 'Vybraný voice kanál neexistuje.',
        'Unknown voice action.': 'Neznáma voice akcia.',
        'Cannot set `@everyone` as the dashboard access role.': 'Ako prístupovú rolu do dashboardu nie je možné nastaviť `@everyone`.',
        'Selected dashboard access role does not exist.': 'Vybraná rola pre prístup do dashboardu neexistuje.',
        'Cannot set `@everyone` as the command channel bypass role.': 'Ako výnimku pre kanál príkazov nie je možné nastaviť `@everyone`.',
        'Selected command channel bypass role does not exist.': 'Vybraná rola s výnimkou pre kanál príkazov neexistuje.',
        'Selected allowed command channel does not exist or is not a text channel.': 'Vybraný povolený kanál pre príkazy neexistuje alebo nie je textový.',
        'Select a Discord role for Unranked players.': 'Musíš vybrať Discord rolu pre Unranked hráčov.',
        'Selected Unranked role is invalid.': 'Vybraná Unranked rola nie je platná.',
        'At least one CS2 Premier Elo tier must be configured.': 'Musí byť nastavené aspoň jedno CS2 Premier Elo pásmo.',
        'Minimum Elo must be a non-negative number.': 'Minimálne Elo musí byť nezáporné číslo.',
        'Each Elo tier must have a valid Discord role.': 'Každé Elo pásmo musí mať platnú Discord rolu.',
        'Rank color must be a valid hex code (e.g., #FFD700).': 'Farba ranku musí byť platný hex kód (napr. #FFD700).',
        'Active game interval must be between 3 and 30 minutes.': 'Interval počas hry musí byť medzi 3 a 30 minútami.',
        'Post-match interval must be between 2 and 15 minutes.': 'Interval po zápase musí byť medzi 2 a 15 minútami.',
        'Background interval must be between 15 and 720 minutes.': 'Interval na pozadí musí byť medzi 15 a 720 minútami.',
        'Inactive interval must be between 6 and 48 hours.': 'Interval pre neaktívnych musí byť medzi 6 a 48 hodinami.',
        'Two TempVoice setups cannot use the same trigger voice channel.': 'Dve TempVoice konfigurácie nemôžu používať rovnaký spúšťací hlasový kanál.',
        'Temporary room no longer exists.': 'Dočasná miestnosť už neexistuje.',
        'Room name must be 1 to 100 characters.': 'Názov miestnosti musí mať 1 až 100 znakov.',
        'Member is no longer in this room.': 'Hráč sa už nenachádza v tejto miestnosti.',
        'Selected PatchBot ping role does not exist.': 'Vybraná ping rola pre PatchBot neexistuje.',
        'Select at least one target channel to enable CS2 PatchBot.': 'Pre zapnutie CS2 PatchBota vyber aspoň jeden cieľový kanál.',
        'Add at least one channel for CS2 PatchBot first.': 'Najprv pridaj aspoň jeden kanál pre CS2 PatchBota.',
        'None of the configured channels were found.': 'Žiadny z nastavených kanálov sa nenašiel.',
        'Failed to connect to Steam News API. Try again shortly.': 'Nepodarilo sa spojiť so Steam News API. Skús znova o chvíľu.',
        'Steam returned no news for the selected mode.': 'Steam momentálne nevrátil žiadne novinky pre zvolený režim.',
        'Select at least one role (for members or bots) to enable Join Roles.': 'Pre zapnutie Join Roles vyber aspoň jednu rolu (pre hráčov alebo pre botov).',
        'Selected server status channel does not exist or is not a text channel.': 'Vybraný kanál pre stav serverov neexistuje alebo nie je textový.',
        'Select a target channel to enable server status.': 'Pre zapnutie stavu serverov vyber cieľový kanál.',
        'Settings saved, but failed to send embed message to channel.': 'Nastavenia sa uložili, ale nepodarilo sa odoslať embed správu do kanála.',
        'Configure a channel for CS2 and Steam status first.': 'Najprv nastav kanál pre stav CS2 a Steam serverov.',
        'Failed to refresh server status message (check channel and permissions).': 'Nepodarilo sa obnoviť správu so stavom serverov (skontroluj kanál a oprávnenia).',
        'users.json does not exist yet.': 'Súbor users.json zatiaľ neexistuje.',
        'Unknown backup target.': 'Neznámy súbor na stiahnutie.',
        'Uploaded file must be a valid JSON object.': 'Nahratý súbor musí byť platný JSON objekt.',
        'Unrecognized backup format. Upload users.json, settings.json, or a full backup.': 'Nerozpoznaný formát zálohy. Nahraj users.json, settings.json alebo kompletnú zálohu.',
        'Selected Rank-Up / Derank channel does not exist or is not a text channel.': 'Vybraný kanál pre Rank-Up / Derank oznámenia neexistuje alebo nie je textový.',
        'Select a target channel to enable Rank-Up / Derank announcements.': 'Pre zapnutie Rank-Up / Derank oznámení vyber cieľový kanál.',
        'Selected Admin Log channel does not exist or is not a text channel.': 'Vybraný kanál pre Admin Log neexistuje alebo nie je textový.',
        'Select a target channel to enable Admin Log.': 'Pre zapnutie Admin Logu vyber cieľový kanál.',
        'Select a target channel for the announcement.': 'Vyber cieľový kanál pre oznámenie.',
        'Selected channel does not exist or is not a text channel.': 'Vybraný kanál neexistuje alebo nie je textový.',
        'Enter a title, description, or message text.': 'Zadaj aspoň nadpis, popis embedu alebo text správy.',
        'Thumbnail URL must start with http:// or https://.': 'Thumbnail URL musí začínať na http:// alebo https://.',
        'Image URL must start with http:// or https://.': 'Obrázok URL musí začínať na http:// alebo https://.',
        'Original message on Discord no longer exists and was removed from the list.': 'Pôvodná správa na Discorde už neexistuje a bola odstránená zo zoznamu.',
        'Select a target channel to enable channel welcome.': 'Pre zapnutie uvítania do roomky vyber cieľový kanál.',
        'Select a target channel to enable goodbye message.': 'Pre zapnutie rozlúčkovej správy vyber cieľový kanál.',
        'Selected ticket category does not exist.': 'Vybraná kategória pre tickety neexistuje.',
        'Cannot set `@everyone` as a ticket Support role.': 'Ako Support rolu pre tickety nie je možné nastaviť `@everyone`.',
        'One of the selected Support roles does not exist.': 'Jedna z vybraných Support rolí neexistuje.',
        'This ticket no longer exists or has been closed.': 'Tento ticket už neexistuje alebo bol zatvorený.',
        'Cannot set `@everyone` as an admin role.': 'Ako admin rolu nie je možné nastaviť `@everyone`.',
        'Selected admin command role does not exist.': 'Vybraná rola pre admin príkazy neexistuje.',
        'Auto-escalation warning count must be between 1 and 50.': 'Počet varovaní pre auto-eskaláciu musí byť 1 až 50.',
        'Command permissions failed to sync — log out and log back in via Discord (approve the new permission).': 'Oprávnenia príkazov sa nezosynchronizovali — odhlás sa a znova prihlás cez Discord (potvrď nové oprávnenie).',
        'Select a player and enter a warning reason.': 'Vyber hráča a zadaj dôvod varovania.',
        'Cannot warn a bot.': 'Bota nie je možné varovať.',
        'Bot lacks Ban Members permission to view bans.': 'Bot nemá právo zobraziť zoznam banov (Ban Members).',
        'Leetify API is temporarily rate-limited, try again shortly.': 'Leetify API je dočasne preťažené, skús to o chvíľu.',
        'Profile not found on Leetify.': 'Profil sa nenašiel na Leetify.',
        'Failed to load profile from Leetify.': 'Nepodarilo sa načítať profil z Leetify.',
        'Error communicating with Leetify or Discord.': 'Chyba pri komunikácii s Leetify alebo Discordom.',
        'Selected role was not found.': 'Vybraná rola sa nenašla.',
        'Cannot use `@everyone` as a join role.': 'Rolu `@everyone` nie je možné použiť ako join rolu.',
        'Bot lacks **Manage Roles** permission.': 'Bot nemá oprávnenie **Manage Roles** (*Spravovať role*) potrebné na prideľovanie rolí.',
        'Enter an interval with `s` or `m`, e.g. `30s`, `1m`, `5m`, `60m` (range `30s` – `60m`).': 'Zadaj interval s jednotkou `s` alebo `m`, napr. `30s`, `1m`, `5m`, `60m` (rozsah `30s` – `60m`).',
        'Interval must be between `30s` and `60m`.': 'Interval musí byť v rozsahu od `30s` do `60m`.',
        'Select a Rank-Up / Derank channel first.': 'Najprv vyber cieľový kanál pre Rank-Up / Derank oznámenia.',
        'Configured channel was not found or is not a text channel.': 'Nastavený kanál sa nenašiel alebo nie je textový.',
        'Select an Admin Log channel first.': 'Najprv vyber cieľový kanál pre Admin Log.',
        'Failed to load server or your Discord profile.': 'Nepodarilo sa načítať server alebo tvoj Discord profil.',
        'Enter at least a title or text for the welcome DM.': 'Vyplň aspoň nadpis alebo text DM uvítacej správy.',
        'Failed to send DM (direct messages from this server are likely disabled).': 'Nepodarilo sa poslať DM (máš pravdepodobne zablokované súkromné správy zo servera).',
        'Select a goodbye channel and save settings first.': 'Najprv vyber cieľový kanál pre rozlúčkovú správu a ulož nastavenia.',
        'Goodbye channel does not exist or bot lacks permission to send messages.': 'Kanál pre rozlúčkovú správu neexistuje alebo v ňom bot nemá právo písať.',
        'Enter a title or text for the goodbye message.': 'Vyplň nadpis alebo text rozlúčkovej správy.',
        'Select a welcome channel and save settings first.': 'Najprv vyber kanál pre uvítaciu správu do roomky a ulož nastavenia.',
        'Welcome channel does not exist or bot lacks permission to send messages.': 'Kanál pre uvítaciu správu neexistuje alebo v ňom bot nemá právo písať.',
        'Enter a title or text for the welcome message.': 'Vyplň nadpis alebo text uvítacej správy do roomky.',
        'Discord server not found.': 'Discord server sa nenašiel.',
        'Select a Ticket panel channel and save settings first.': 'Najprv vyber kanál pre Ticket panel a ulož nastavenia.',
        'Selected Ticket panel channel does not exist or is not a text channel.': 'Vybraný kanál pre Ticket panel neexistuje alebo nie je textový.',
        'You cannot perform this action on yourself.': 'Nemôžeš vykonať túto akciu sám na sebe.',
        'Cannot moderate the server owner.': 'Nie je možné moderovať majiteľa servera.',
        'Bot role is too low to moderate this user.': 'Rola bota je príliš nízko na moderovanie tohto používateľa.',
        'Cannot moderate a user with an equal or higher role.': 'Nemôžeš moderovať používateľa s rovnakou alebo vyššou rolou.',
        'User has no warnings.': 'Používateľ nemá žiadne varovania.',
        'User not found on the server.': 'Používateľ sa nenašiel na serveri.',
        'Timeout duration must be between 1 and 40320 minutes.': 'Trvanie timeoutu musí byť 1 až 40320 minút.',
        'Bot lacks permission to time out this user.': 'Bot nemá oprávnenie udeliť timeout tomuto používateľovi.',
        'Bot lacks permission to modify timeout for this user.': 'Bot nemá oprávnenie upraviť timeout tohto používateľa.',
        'Bot lacks permission to kick this user.': 'Bot nemá oprávnenie vyhodiť tohto používateľa.',
        'User not specified.': 'Používateľ nebol zadaný.',
        'Cannot ban the server owner.': 'Nie je možné zabanovať majiteľa servera.',
        'You cannot ban yourself.': 'Nemôžeš zabanovať sám seba.',
        'Bot lacks permission to ban this user.': 'Bot nemá oprávnenie zabanovať tohto používateľa.',
        'Enter a valid Discord User ID.': 'Zadaj platné Discord User ID.',
        'This user is not banned.': 'Tento používateľ nie je zabanovaný.'
    };

    function pickSkPlural(count, one, few, many) {
        const n = Math.abs(Math.round(Number(count) || 0));
        if (n === 1) return one;
        if (n >= 2 && n <= 4) return few;
        return many;
    }

    const SK_PATTERNS = [
        [/^Players \((\d+)\)$/, (_, n) => `Hráči (${n})`],
        [/^Active rooms \((\d+)\)$/, (_, n) => `Aktívne miestnosti (${n})`],
        [/^Open tickets \((\d+)\)$/, (_, n) => `Otvorené tickety (${n})`],
        [/^Roles \((\d+)\)$/, (_, n) => `Roly (${n})`],
        [/^Warnings \((\d+)\)$/, (_, n) => `Varovania (${n})`],
        [/^Banned users \((\d+)\)$/, (_, n) => `Zabanovaní používatelia (${n})`],
        [/^Setup #(\d+)$/, (_, n) => `Konfigurácia #${n}`],
        [/^Close ticket #(\d+)\?$/, (_, n) => `Zavrieť ticket #${n}?`],
        [/^Ticket #(\d+) closed\.$/, (_, n) => `Ticket #${n} bol zavretý.`],
        [/^(\d+) bots$/, (_, n) => `${n} ${pickSkPlural(n, 'bot', 'boti', 'botov')}`],
        [/^Total (\d+)$/, (_, n) => `Celkom ${n}`],
        [/^Tier (\d+) · (\d+) Boosts?$/, (_, t, c) => `Úroveň ${t} · ${c} ${pickSkPlural(c, 'boost', 'boosty', 'boostov')}`],
        [/^Avg ([\d\s,.]+) Elo$/, (_, val) => `Priemer ${val} Elo`],
        [/^Warnings: (\d+) · Timeout: (\d+)$/, (_, w, to) => `Varovania: ${w} · Timeout: ${to}`],
        [/^In CS2: (\d+)$/, (_, n) => `V CS2: ${n}`],
        [/^Messages:$/, () => 'Správy:'],
        [/^· \+([\d\s,.]+) Elo in 7 days$/, (_, val) => `· +${val} Elo za 7 dní`],
        [/^(.+?) \((.+?)\): (\d+) messages, (\d+) voice$/, (_, d, dt, m, v) => `${SK_EXACT[d] || d} (${dt}): ${m} správ, ${v} voice`],
        [/^Members: (\d+)\/(.+)$/, (_, m, lim) => `Hráči: ${m}/${lim}`],
        [/^· Claimed by: (.+)$/, (_, name) => `· Prevzal: ${name}`],
        [/^until (.+)$/, (_, dt) => `do ${dt}`],
        [/^Active timeout until (.+)$/, (_, dt) => `Aktívny timeout do ${dt}`],
        [/^Account linked \((.+)\)\.$/, (_, elo) => `Účet prepojený (${elo}).`],
        [/^This will unlink (.+)'s Steam account and remove their CS2 rank role\.$/, (_, name) => `Odpojí sa Steam účet hráča ${name} a odoberie CS2 rank rola.`],
        [/^(.+) unlinked\.$/, (_, name) => `Hráč ${name} bol odpojený.`],
        [/^All warnings for (.+) will be deleted\.$/, (_, name) => `Vymažú sa všetky varovania hráča ${name}.`],
        [/^Warning #(\d+) deleted\.$/, (_, id) => `Varovanie #${id} zmazané.`],
        [/^Warning #(\d+) issued \+ auto-escalation \((.+)\)\.$/, (_, id, act) => `Varovanie #${id} udelené + auto-eskalácia (${act}).`],
        [/^Warning #(\d+) issued\.$/, (_, id) => `Varovanie #${id} udelené.`],
        [/^Timeout applied \((.+)\)\.$/, (_, dur) => `Timeout udelený (${dur}).`],
        [/^(.+) will be kicked from the server\.$/, (_, name) => `${name} bude vyhodený zo servera.`],
        [/^(.+) kicked\.$/, (_, name) => `Hráč ${name} bol vyhodený.`],
        [/^(.+) will be banned from the server\.$/, (_, name) => `${name} dostane ban na serveri.`],
        [/^(.+) banned\.$/, (_, name) => `${name} bol zabanovaný.`],
        [/^(.+) will be able to rejoin the server\.$/, (_, name) => `Používateľ ${name} sa bude môcť vrátiť na server.`],
        [/^(.+) unbanned\.$/, (_, name) => `Ban pre ${name} bol zrušený.`],
        [/^Room renamed to "(.+)"\.$/, (_, name) => `Miestnosť premenovaná na „${name}“.`],
        [/^Room "(.+)" will be deleted from the Discord server immediately\.$/, (_, name) => `Miestnosť „${name}“ bude okamžite zmazaná z Discord servera.`],
        [/^Room "(.+)" closed\.$/, (_, name) => `Miestnosť ${name} bola zatvorená.`],
        [/^(.+) will be disconnected from the voice channel\.$/, (_, name) => `Hráč ${name} bude odpojený z hlasového kanála.`],
        [/^(.+) disconnected from room\.$/, (_, name) => `Hráč ${name} bol odpojený z miestnosti.`],
        [/^Setup #(\d+) will be removed from the list\. The Discord channel will remain intact\.$/, (_, n) => `Odstráni sa konfigurácia #${n} zo zoznamu. Kanál na Discorde ostane zachovaný.`],
        [/^Sent to (\d+) channels: (.+)$/, (_, cnt, title) => `Odoslané do ${cnt} kanálov: ${title}`],
        [/^File "(.+)" will overwrite the current bot data\.$/, (_, name) => `Súbor „${name}“ prepíše aktuálne dáta bota.`],
        [/^Backup restored: (.+)\.$/, (_, labels) => `Záloha obnovená: ${labels}.`],
        [/^Server error \((\d+)\)$/, (_, s) => `Chyba servera (${s})`],
        [/^Request failed \((\d+)\)$/, (_, s) => `Požiadavka zlyhala (${s})`],
        [/^Duplicate rule for (\d+) warnings\.$/, (_, n) => `Duplicitné pravidlo pre ${n} varovaní.`],
        [/^Role with ID (\S+) was not found on the server\.$/, (_, id) => `Rola s ID ${id} sa na serveri nenašla.`],
        [/^Channel with ID (\S+) does not exist or is not a text channel\.$/, (_, id) => `Kanál s ID ${id} neexistuje alebo nie je textový.`],
        [/^Warning #(\d+) not found\.$/, (_, id) => `Varovanie #${id} sa nenašlo.`],
        [/^TempVoice #(\d+): Trigger channel name must be 1 to 100 characters\.$/, (_, i) => `TempVoice #${i}: Názov spúšťacieho kanála musí mať 1 až 100 znakov.`],
        [/^TempVoice #(\d+): Room name template must be 1 to 100 characters\.$/, (_, i) => `TempVoice #${i}: Šablóna názvu miestnosti musí mať 1 až 100 znakov.`],
        [/^TempVoice #(\d+): Bitrate must be between 8 and 384 kbps\.$/, (_, i) => `TempVoice #${i}: Bitrate musí byť v rozsahu 8 až 384 kbps.`],
        [/^TempVoice #(\d+): User limit must be between 0 and 99\.$/, (_, i) => `TempVoice #${i}: Limit hráčov musí byť v rozsahu 0 až 99.`],
        [/^TempVoice #(\d+): Selected category was not found on the server\.$/, (_, i) => `TempVoice #${i}: Vybraná kategória sa na serveri nenašla.`],
        [/^TempVoice #(\d+): Failed to create trigger VC \(check Manage Channels permission\)\.$/, (_, i) => `TempVoice #${i}: Nepodarilo sa vytvoriť spúšťací VC (skontroluj právo Manage Channels).`],
        [/^TempVoice #(\d+): Select a trigger channel or switch to creating a new one\.$/, (_, i) => `TempVoice #${i}: Vyber spúšťací kanál alebo prepni na vytvorenie nového.`],
        [/^TempVoice #(\d+): Selected trigger voice channel does not exist\.$/, (_, i) => `TempVoice #${i}: Vybraný spúšťací hlasový kanál neexistuje.`],
        [/^TempVoice #(\d+): Selected lock role does not exist\.$/, (_, i) => `TempVoice #${i}: Vybraná rola pre zamknutie kanála neexistuje.`],
        [/^TempVoice #(\d+): Select at least one role \(e\.g\., @everyone\) for auto-lock on disable\.$/, (_, i) => `TempVoice #${i}: Pre automatické zamknutie pri vypnutí vyber aspoň jednu rolu (napr. @everyone).`],
        [/^Bot lacks View Channel, Send Messages, and Embed Links permissions in #(.+)\.$/, (_, ch) => `Bot nemá v kanáli #${ch} práva Zobraziť kanál, Posielať správy a Vkladať odkazy.`],
        [/^Bot lacks View Channel, Send Messages, Embed Links, and Read Message History permissions in #(.+)\.$/, (_, ch) => `Bot nemá v kanáli #${ch} práva Zobraziť kanál, Posielať správy, Vkladať odkazy a Čítať históriu správ.`],
        [/^Selected (channel welcome|goodbye message|log\/transcript|Ticket panel) channel does not exist or is not a text channel\.$/, (_, label) => {
            const labelMap = {
                'channel welcome': 'uvítanie do roomky',
                'goodbye message': 'rozlúčkovú správu',
                'log/transcript': 'log/transcript',
                'Ticket panel': 'Ticket panel'
            };
            return `Vybraný kanál pre ${labelMap[label] || label} neexistuje alebo nie je textový.`;
        }],
        [/^Role <@&(\d+)> is managed by Discord or an integration and cannot be assigned by the bot\.$/, (_, id) => `Rolu <@&${id}> spravuje Discord alebo integrácia a bot ju nemôže prideľovať.`],
        [/^Bot role must be positioned \*\*above\*\* <@&(\d+)> in server role settings\.$/, (_, id) => `Rola bota musí byť v nastaveniach rolí servera **vyššie** ako <@&${id}>, inak ju bot nemôže prideľovať.`]
    ];

    const HTML_MAP = {
        oauth_warning: {
            en: 'OAuth2 login is not configured in <code class="px-1 py-0.5 bg-bg-elevated rounded">.env</code> (<code class="px-1 py-0.5 bg-bg-elevated rounded">CLIENT_SECRET</code>, <code class="px-1 py-0.5 bg-bg-elevated rounded">REDIRECT_URI</code>).',
            sk: 'OAuth2 prihlásenie zatiaľ nie je nakonfigurované v <code class="px-1 py-0.5 bg-bg-elevated rounded">.env</code> (<code class="px-1 py-0.5 bg-bg-elevated rounded">CLIENT_SECRET</code>, <code class="px-1 py-0.5 bg-bg-elevated rounded">REDIRECT_URI</code>).'
        },
        audit_log_missing: {
            en: 'Missing <strong>View Audit Log</strong> permission — moderators won\'t be shown for bans, kicks, and timeouts.',
            sk: 'Chýba právo <strong>Zobraziť záznam auditu</strong> — pri banoch, kickoch a timeoutoch sa nezobrazí moderátor.'
        },
        welcome_pluralization: {
            en: 'Pluralization: <code class="text-sky-300">{members:one|few|many}</code>',
            sk: 'Skloňovanie: <code class="text-sky-300">{members:člen|členovia|členov}</code>'
        },
        bot_status_plurals: {
            en: 'Plurals: <code class="text-sky-300">{players:player|players}</code> or <code class="text-sky-300">{rooms:room|rooms}</code>',
            sk: 'Skloňovanie: <code class="text-sky-300">{players:hráča|hráčov}</code> alebo <code class="text-sky-300">{rooms:miestnosť|miestnosti|miestností}</code>'
        }
    };

    const SK_KEYS = {
        logs_all: {
            en: 'All',
            sk: 'Všetko'
        }
    };

    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE']);
    const origTextMap = new WeakMap();
    const lastAppliedMap = new WeakMap();
    const attrStateMap = new WeakMap();

    function loadInitialLang() {
        try {
            const saved = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
            return saved === 'sk' ? 'sk' : DEFAULT_LANG;
        } catch {
            return DEFAULT_LANG;
        }
    }

    let currentLang = loadInitialLang();

    function interpolate(str, vars) {
        if (!vars || typeof vars !== 'object') return str;
        return String(str).replace(/\{(\w+)\}/g, (m, key) => (
            Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : m
        ));
    }

    function translateText(text, vars) {
        if (text === null || text === undefined) return '';
        const raw = String(text);
        if (currentLang === 'en') {
            return interpolate(raw, vars);
        }

        if (Object.prototype.hasOwnProperty.call(SK_EXACT, raw)) {
            return interpolate(SK_EXACT[raw], vars);
        }

        for (let i = 0; i < SK_PATTERNS.length; i++) {
            const pattern = SK_PATTERNS[i][0];
            const replacement = SK_PATTERNS[i][1];
            if (pattern.test(raw)) {
                const out = raw.replace(pattern, replacement);
                return interpolate(out, vars);
            }
        }

        return interpolate(raw, vars);
    }

    function shouldSkipNode(node) {
        let el = node.parentElement;
        while (el) {
            if (SKIP_TAGS.has(el.tagName)) return true;
            if (el.hasAttribute('data-no-i18n')) return true;
            if (el.hasAttribute('data-i18n-html')) return true;
            if (el.hasAttribute('data-i18n-key')) return true;
            el = el.parentElement;
        }
        return false;
    }

    function shouldSkipElementAttr(el) {
        let cur = el;
        while (cur) {
            if (cur.hasAttribute('data-no-i18n')) return true;
            cur = cur.parentElement;
        }
        return false;
    }

    function translateAttributes(root) {
        if (!root || typeof root.querySelectorAll !== 'function') return;
        const attrs = ['placeholder', 'title', 'aria-label'];
        const els = root.querySelectorAll('[placeholder],[title],[aria-label]');

        for (let i = 0; i < els.length; i++) {
            const el = els[i];
            if (shouldSkipElementAttr(el)) continue;

            let map = attrStateMap.get(el);
            if (!map) {
                map = {};
                attrStateMap.set(el, map);
            }

            for (let j = 0; j < attrs.length; j++) {
                const attr = attrs[j];
                if (!el.hasAttribute(attr)) continue;
                const val = el.getAttribute(attr);
                if (!val) continue;

                const entry = map[attr];
                if (currentLang === 'en') {
                    if (entry && val === entry.lastApplied) {
                        el.setAttribute(attr, entry.orig);
                        delete map[attr];
                    }
                } else {
                    const orig = (!entry || val !== entry.lastApplied) ? val : entry.orig;
                    const translated = translateText(orig);
                    el.setAttribute(attr, translated);
                    map[attr] = { orig, lastApplied: translated };
                }
            }
        }
    }

    function translateHtmlBlocks(root) {
        if (!root || typeof root.querySelectorAll !== 'function') return;
        const els = [];
        if (root.nodeType === 1 && root.hasAttribute && root.hasAttribute('data-i18n-html')) {
            els.push(root);
        }
        const inner = root.querySelectorAll('[data-i18n-html]');
        for (let i = 0; i < inner.length; i++) {
            els.push(inner[i]);
        }

        for (let i = 0; i < els.length; i++) {
            const el = els[i];
            const key = el.getAttribute('data-i18n-html');
            const entry = key && HTML_MAP[key];
            if (!entry) continue;
            const targetHtml = entry[currentLang] || entry.en;
            if (el.innerHTML !== targetHtml) {
                el.innerHTML = targetHtml;
            }
        }
    }

    function translateKeyedBlocks(root) {
        if (!root || typeof root.querySelectorAll !== 'function') return;
        const els = [];
        if (root.nodeType === 1 && root.hasAttribute && root.hasAttribute('data-i18n-key')) {
            els.push(root);
        }
        const inner = root.querySelectorAll('[data-i18n-key]');
        for (let i = 0; i < inner.length; i++) {
            els.push(inner[i]);
        }

        for (let i = 0; i < els.length; i++) {
            const el = els[i];
            const key = el.getAttribute('data-i18n-key');
            const entry = key && SK_KEYS[key];
            if (!entry) continue;
            const targetText = entry[currentLang] || entry.en;
            if (el.textContent !== targetText) {
                el.textContent = targetText;
            }
        }
    }

    function translateTree(root) {
        const target = root || (global.document && global.document.body);
        if (!target) return;

        translateHtmlBlocks(target);
        translateKeyedBlocks(target);

        if (global.document && typeof global.document.createTreeWalker === 'function' && global.NodeFilter) {
            const walker = global.document.createTreeWalker(target, global.NodeFilter.SHOW_TEXT);
            let node = walker.nextNode();
            while (node) {
                if (!shouldSkipNode(node)) {
                    const curVal = node.nodeValue || '';
                    if (curVal.trim()) {
                        if (currentLang === 'en') {
                            if (lastAppliedMap.has(node) && curVal === lastAppliedMap.get(node) && origTextMap.has(node)) {
                                node.nodeValue = origTextMap.get(node);
                                lastAppliedMap.delete(node);
                            }
                        } else {
                            let orig = origTextMap.get(node);
                            if (orig === undefined || (lastAppliedMap.has(node) && curVal !== lastAppliedMap.get(node))) {
                                orig = curVal;
                                origTextMap.set(node, orig);
                            }
                            const match = orig.match(/^(\s*)([\s\S]*?)(\s*)$/);
                            if (match) {
                                const translatedCore = translateText(match[2]);
                                const nextVal = `${match[1]}${translatedCore}${match[3]}`;
                                if (curVal !== nextVal) {
                                    node.nodeValue = nextVal;
                                }
                                lastAppliedMap.set(node, nextVal);
                            }
                        }
                    }
                }
                node = walker.nextNode();
            }
        }

        translateAttributes(target);
    }

    function syncLangSwitchers() {
        const doc = global.document;
        if (!doc) return;
        if (doc.documentElement) {
            doc.documentElement.lang = currentLang;
        }
        const buttons = doc.querySelectorAll('[data-lang-btn]');
        for (let i = 0; i < buttons.length; i++) {
            const btn = buttons[i];
            const isActive = btn.getAttribute('data-lang-btn') === currentLang;
            btn.classList.toggle('bg-brand', isActive);
            btn.classList.toggle('text-white', isActive);
            btn.classList.toggle('shadow-sm', isActive);
            btn.classList.toggle('text-slate-400', !isActive);
            btn.classList.toggle('hover:text-white', !isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        }
    }

    function setLang(lang) {
        const next = lang === 'sk' ? 'sk' : 'en';
        currentLang = next;
        try {
            if (global.localStorage) {
                global.localStorage.setItem(STORAGE_KEY, next);
            }
        } catch {
            // Ignore storage restrictions
        }
        syncLangSwitchers();
    }

    global.DashboardI18n = {
        getLang() {
            return currentLang;
        },
        setLang,
        getLocale() {
            return currentLang === 'sk' ? 'sk-SK' : 'en-GB';
        },
        t: translateText,
        translateTree,
        syncLangSwitchers
    };
})(typeof window !== 'undefined' ? window : globalThis);
