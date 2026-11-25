import i18n from '@/i18n';

const EXACT_SK: Record<string, string> = {
  'Network connection failed.': 'Nepodarilo sa spojiť so serverom.',
  'Not logged in.': 'Nie si prihlásený.',
  'Bot is not connected to any Discord server yet.': 'Bot zatiaľ nie je pripojený na žiadny Discord server.',
  'You do not have the required role to access the dashboard.': 'Nemáš potrebnú rolu pre prístup do dashboardu.',
  'Select a player and enter a Steam or Leetify profile.': 'Vyber hráča a zadaj Steam alebo Leetify profil.',
  'Selected player was not found on the Discord server.': 'Vybraný hráč sa nenašiel na Discord serveri.',
  'Could not resolve Steam64 ID. Enter a valid 17-digit ID, Steam link, or Leetify link.':
    'Nepodarilo sa získať Steam64 ID. Zadaj platné 17-ciferné ID, Steam alebo Leetify odkaz.',
  'Player is not in the database.': 'Hráč nie je v databáze.',
  'Invalid user ID.': 'Neplatné ID používateľa.',
  'Player not found.': 'Hráč sa nenašiel.',
  'Member is not on the server.': 'Člen nie je na serveri.',
  'Bot lacks permission to change nickname for this member.': 'Bot nemá oprávnenie zmeniť prezývku tohto člena.',
  'Member is not in a voice channel.': 'Člen nie je v hlasovom kanáli.',
  'Bot lacks Move Members permission.': 'Bot nemá právo presúvať členov vo voice.',
  'Select a target voice channel.': 'Vyber cieľový hlasový kanál.',
  'Selected voice channel does not exist.': 'Vybraný hlasový kanál neexistuje.',
  'Unknown voice action.': 'Neznáma voice akcia.',
  'Cannot set `@everyone` as the dashboard access role.': 'Nie je možné nastaviť @everyone ako rolu pre dashboard.',
  'Selected dashboard access role does not exist.': 'Vybraná rola pre prístup do dashboardu neexistuje.',
  'Cannot set `@everyone` as the command channel bypass role.': 'Nie je možné nastaviť @everyone ako rolu s výnimkou.',
  'Selected command channel bypass role does not exist.': 'Vybraná rola s výnimkou neexistuje.',
  'Selected allowed command channel does not exist or is not a text channel.': 'Vybraný kanál príkazov neexistuje alebo nie je textový.',
  'Select a Discord role for Unranked players.': 'Vyber Discord rolu pre Unranked hráčov.',
  'Selected Unranked role is invalid.': 'Vybraná Unranked rola je neplatná.',
  'At least one CS2 Premier Elo tier must be configured.': 'Musí byť nastavená aspoň jedna úroveň CS2 Premier Elo.',
  'Minimum Elo must be a non-negative number.': 'Minimálne Elo musí byť nezáporné číslo.',
  'Each Elo tier must have a valid Discord role.': 'Každá Elo úroveň musí mať platnú Discord rolu.',
  'Rank color must be a valid hex code (e.g., #FFD700).': 'Farba ranku musí byť platný hex kód (napr. #FFD700).',
  'Active game interval must be between 3 and 30 minutes.': 'Interval aktívnej hry musí byť 3 až 30 minút.',
  'Post-match interval must be between 2 and 15 minutes.': 'Interval po zápase musí byť 2 až 15 minút.',
  'Background interval must be between 15 and 720 minutes.': 'Interval na pozadí musí byť 15 až 720 minút.',
  'Inactive interval must be between 6 and 48 hours.': 'Interval neaktívnych hráčov musí byť 6 až 48 hodín.',
  'Two TempVoice setups cannot use the same trigger voice channel.': 'Dve konfigurácie TempVoice nemôžu používať rovnaký spúšťací kanál.',
  'Temporary room no longer exists.': 'Dočasná miestnosť už neexistuje.',
  'Room name must be 1 to 100 characters.': 'Názov miestnosti musí mať 1 až 100 znakov.',
  'Member is no longer in this room.': 'Člen už nie je v tejto miestnosti.',
  'Selected PatchBot ping role does not exist.': 'Vybraná ping rola pre PatchBot neexistuje.',
  'Select at least one target channel to enable CS2 PatchBot.': 'Vyber aspoň jeden kanál pre zapnutie PatchBot.',
  'Add at least one channel for CS2 PatchBot first.': 'Najprv pridaj aspoň jeden kanál pre PatchBot.',
  'None of the configured channels were found.': 'Žiadny z nastavených kanálov sa nenašiel.',
  'Failed to connect to Steam News API. Try again shortly.': 'Nepodarilo sa pripojiť k Steam News API. Skús znova neskôr.',
  'Steam returned no news for the selected mode.': 'Steam nevrátil žiadne novinky pre zvolený režim.',
  'Select at least one role (for members or bots) to enable Join Roles.': 'Vyber aspoň jednu rolu (pre členov alebo botov) na zapnutie Úvodných rolí.',
  'Selected server status channel does not exist or is not a text channel.': 'Vybraný kanál pre CS2 Status neexistuje alebo nie je textový.',
  'Select a target channel to enable server status.': 'Vyber cieľový kanál pre zapnutie CS2 Status.',
  'Settings saved, but failed to send embed message to channel.': 'Nastavenia uložené, ale nepodarilo sa odoslať embed do kanála.',
  'Configure a channel for CS2 and Steam status first.': 'Najprv nastav kanál pre CS2 Status.',
  'Failed to refresh server status message (check channel and permissions).': 'Nepodarilo sa aktualizovať CS2 Status správu (skontroluj kanál a práva).',
  'Uploaded file must be a valid JSON object.': 'Nahraný súbor musí byť platný JSON objekt.',
  'Unrecognized backup format. Upload users.json, settings.json, or a full backup.': 'Nerozpoznaný formát zálohy. Nahraj users.json, settings.json alebo kompletnú zálohu.',
  'Selected Rank-Up / Derank channel does not exist or is not a text channel.': 'Vybraný kanál pre Rank-Up / Derank neexistuje alebo nie je textový.',
  'Select a target channel to enable Rank-Up / Derank announcements.': 'Vyber cieľový kanál pre zapnutie Rank-Up / Derank.',
  'Selected Admin Log channel does not exist or is not a text channel.': 'Vybraný kanál pre Admin Log neexistuje alebo nie je textový.',
  'Select a target channel to enable Admin Log.': 'Vyber cieľový kanál pre zapnutie Admin Logu.',
  'Select an Admin Log channel first.': 'Najprv vyber cieľový kanál pre Admin Log.',
  'Select a target channel for the announcement.': 'Vyber cieľový kanál pre oznámenie.',
  'Selected channel does not exist or is not a text channel.': 'Vybraný kanál neexistuje alebo nie je textový.',
  'Enter a title, description, or message text.': 'Zadaj nadpis, popis alebo text správy.',
  'Thumbnail URL must start with http:// or https://.': 'URL náhľadu musí začínať na http:// alebo https://.',
  'Image URL must start with http:// or https://.': 'URL obrázka musí začínať na http:// alebo https://.',
  'Original message on Discord no longer exists and was removed from the list.': 'Pôvodná správa na Discorde už neexistuje a bola odstránená zo zoznamu.',
  'Select a target channel to enable channel welcome.': 'Vyber cieľový kanál pre zapnutie uvítania.',
  'Select a target channel to enable goodbye message.': 'Vyber cieľový kanál pre zapnutie rozlúčkovej správy.',
  'Selected ticket category does not exist.': 'Vybraná kategória pre tickety neexistuje.',
  'Cannot set `@everyone` as a ticket Support role.': 'Nie je možné nastaviť @everyone ako rolu podpory.',
  'One of the selected Support roles does not exist.': 'Jedna z vybraných rolí podpory neexistuje.',
  'This ticket no longer exists or has been closed.': 'Tento ticket už neexistuje alebo bol zatvorený.',
  'Cannot set `@everyone` as an admin role.': 'Nie je možné nastaviť @everyone ako admin rolu.',
  'Selected admin command role does not exist.': 'Vybraná rola pre admin príkazy neexistuje.',
  'Auto-escalation warning count must be between 1 and 50.': 'Počet varovaní pre auto-eskaláciu musí byť 1 až 50.',
  'Command permissions failed to sync — log out and log back in via Discord (approve the new permission).':
    'Nepodarilo sa synchronizovať oprávnenia príkazov — odhlás sa a znova prihlás cez Discord.',
  'Select a player and enter a warning reason.': 'Vyber hráča a zadaj dôvod varovania.',
  'Cannot warn a bot.': 'Botovi nie je možné udeliť varovanie.',
  'Bot lacks Ban Members permission to view bans.': 'Bot nemá právo Ban Members na zobrazenie zoznamu banov.',
  'User has no warnings.': 'Používateľ nemá žiadne varovania.',
};

const PATTERNS_SK: Array<[RegExp, (...args: string[]) => string]> = [
  [/^Server error \((\d+)\)$/, (_, s) => `Chyba servera (${s})`],
  [/^Request failed \((\d+)\)$/, (_, s) => `Požiadavka zlyhala (${s})`],
  [/^Duplicate rule for (\d+) warnings\.$/, (_, n) => `Duplicitné pravidlo pre ${n} varovaní.`],
  [/^Role with ID (\S+) was not found on the server\.$/, (_, id) => `Rola s ID ${id} sa na serveri nenašla.`],
  [/^Channel with ID (\S+) does not exist or is not a text channel\.$/, (_, id) => `Kanál s ID ${id} neexistuje alebo nie je textový.`],
  [/^Warning #(\d+) not found\.$/, (_, id) => `Varovanie #${id} sa nenašlo.`],
  [/^TempVoice #(\d+): Trigger channel name must be 1 to 100 characters\.$/, (_, i) => `TempVoice #${i}: Názov spúšťacieho kanála musí mať 1 až 100 znakov.`],
  [/^TempVoice #(\d+): Room name template must be 1 to 100 characters\.$/, (_, i) => `TempVoice #${i}: Šablóna názvu miestnosti musí mať 1 až 100 znakov.`],
  [/^TempVoice #(\d+): Bitrate must be between 8 and 384 kbps\.$/, (_, i) => `TempVoice #${i}: Bitrate musí byť 8 až 384 kbps.`],
  [/^TempVoice #(\d+): User limit must be between 0 and 99\.$/, (_, i) => `TempVoice #${i}: Limit hráčov musí byť 0 až 99.`],
  [/^TempVoice #(\d+): Selected category was not found on the server\.$/, (_, i) => `TempVoice #${i}: Vybraná kategória sa na serveri nenašla.`],
  [/^TempVoice #(\d+): Failed to create trigger VC \(check Manage Channels permission\)\.$/, (_, i) => `TempVoice #${i}: Nepodarilo sa vytvoriť spúšťací VC (skontroluj právo Manage Channels).`],
  [/^TempVoice #(\d+): Select a trigger channel or switch to creating a new one\.$/, (_, i) => `TempVoice #${i}: Vyber spúšťací kanál alebo prepni na vytvorenie nového.`],
  [/^TempVoice #(\d+): Selected trigger voice channel does not exist\.$/, (_, i) => `TempVoice #${i}: Vybraný spúšťací hlasový kanál neexistuje.`],
  [/^TempVoice #(\d+): Selected lock role does not exist\.$/, (_, i) => `TempVoice #${i}: Vybraná rola pre zamknutie kanála neexistuje.`],
  [/^TempVoice #(\d+): Select at least one role \(e\.g\., @everyone\) for auto-lock on disable\.$/, (_, i) => `TempVoice #${i}: Pre automatické zamknutie pri vypnutí vyber aspoň jednu rolu.`],
  [/^Bot lacks View Channel, Send Messages, and Embed Links permissions in #(.+)\.$/, (_, ch) => `Bot nemá v kanáli #${ch} práva Zobraziť kanál, Posielať správy a Vkladať odkazy.`],
  [/^Bot lacks View Channel, Send Messages, Embed Links, and Read Message History permissions in #(.+)\.$/, (_, ch) => `Bot nemá v kanáli #${ch} práva Zobraziť kanál, Posielať správy, Vkladať odkazy a Čítať históriu správ.`],
  [
    /^Selected (channel welcome|goodbye message|log\/transcript|Ticket panel) channel does not exist or is not a text channel\.$/,
    (_, label) => {
      const map: Record<string, string> = {
        'channel welcome': 'uvítanie do kanála',
        'goodbye message': 'rozlúčkovú správu',
        'log/transcript': 'prepisy ticketov',
        'Ticket panel': 'Ticket panel',
      };
      return `Vybraný kanál pre ${map[label] ?? label} neexistuje alebo nie je textový.`;
    },
  ],
];

export function translateBackendError(raw: string): string {
  if (i18n.language !== 'sk') return raw;
  if (EXACT_SK[raw]) return EXACT_SK[raw];
  for (const [regex, formatter] of PATTERNS_SK) {
    if (regex.test(raw)) {
      return raw.replace(regex, formatter);
    }
  }
  return raw;
}
