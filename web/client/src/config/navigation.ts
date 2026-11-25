import type { SectionId } from '@/types/api';

export type NavGroupId = 'general' | 'modules' | 'system';

export interface NavItemConfig {
  id: SectionId;
  path: string;
  group: NavGroupId;
  labelKey: string;
  icon:
    | 'layout-dashboard'
    | 'users'
    | 'megaphone'
    | 'scroll-text'
    | 'mic'
    | 'newspaper'
    | 'user-plus'
    | 'activity'
    | 'trending-up'
    | 'shield-check'
    | 'hand'
    | 'ticket'
    | 'gavel'
    | 'settings';
}

export const NAV_GROUPS: Array<{ id: NavGroupId; labelKey: string }> = [
  { id: 'general', labelKey: 'nav.groups.general' },
  { id: 'modules', labelKey: 'nav.groups.modules' },
  { id: 'system', labelKey: 'nav.groups.system' },
];

export const NAV_ITEMS: NavItemConfig[] = [
  { id: 'overview', path: '/', group: 'general', labelKey: 'nav.overview', icon: 'layout-dashboard' },
  { id: 'players', path: '/members', group: 'general', labelKey: 'nav.players', icon: 'users' },
  { id: 'announcements', path: '/announcements', group: 'general', labelKey: 'nav.announcements', icon: 'megaphone' },
  { id: 'logs', path: '/logs', group: 'general', labelKey: 'nav.logs', icon: 'scroll-text' },

  { id: 'tempvoice', path: '/tempvoice', group: 'modules', labelKey: 'nav.tempvoice', icon: 'mic' },
  { id: 'patchbot', path: '/patchbot', group: 'modules', labelKey: 'nav.patchbot', icon: 'newspaper' },
  { id: 'joinroles', path: '/joinroles', group: 'modules', labelKey: 'nav.joinroles', icon: 'user-plus' },
  { id: 'csstatus', path: '/csstatus', group: 'modules', labelKey: 'nav.csstatus', icon: 'activity' },
  { id: 'rankfeed', path: '/rankfeed', group: 'modules', labelKey: 'nav.rankfeed', icon: 'trending-up' },
  { id: 'adminlog', path: '/adminlog', group: 'modules', labelKey: 'nav.adminlog', icon: 'shield-check' },
  { id: 'welcome', path: '/welcome', group: 'modules', labelKey: 'nav.welcome', icon: 'hand' },
  { id: 'tickets', path: '/tickets', group: 'modules', labelKey: 'nav.tickets', icon: 'ticket' },
  { id: 'moderation', path: '/moderation', group: 'modules', labelKey: 'nav.moderation', icon: 'gavel' },

  { id: 'settings', path: '/settings', group: 'system', labelKey: 'nav.settings', icon: 'settings' },
];

export function getNavItemByPath(pathname: string): NavItemConfig {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return NAV_ITEMS.find((item) => item.path === clean) ?? NAV_ITEMS[0];
}
