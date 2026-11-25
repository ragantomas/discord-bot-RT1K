import {
  Activity,
  Bot,
  Gavel,
  Hand,
  LayoutDashboard,
  Megaphone,
  Mic,
  Newspaper,
  ScrollText,
  Settings,
  ShieldCheck,
  Ticket,
  TrendingUp,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { NAV_GROUPS, NAV_ITEMS, type NavItemConfig } from '@/config/navigation';
import { useAuth } from '@/context/AuthContext';
import { useDashboard } from '@/context/DashboardContext';

function NavIcon({ name }: { name: NavItemConfig['icon'] }) {
  const cls = 'w-4 h-4 shrink-0';
  const map: Record<NavItemConfig['icon'], ReactNode> = {
    'layout-dashboard': <LayoutDashboard className={cls} />,
    users: <Users className={cls} />,
    megaphone: <Megaphone className={cls} />,
    'scroll-text': <ScrollText className={cls} />,
    mic: <Mic className={cls} />,
    newspaper: <Newspaper className={cls} />,
    'user-plus': <UserPlus className={cls} />,
    activity: <Activity className={cls} />,
    'trending-up': <TrendingUp className={cls} />,
    'shield-check': <ShieldCheck className={cls} />,
    hand: <Hand className={cls} />,
    ticket: <Ticket className={cls} />,
    gavel: <Gavel className={cls} />,
    settings: <Settings className={cls} />,
  };
  return <>{map[name]}</>;
}

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const { t } = useTranslation();
  const { auth } = useAuth();
  const { overview } = useDashboard();

  const botName = overview?.bot.username || auth?.bot.username || 'BOT Gaben';
  const botAvatar = overview?.bot.avatarUrl || auth?.bot.avatarUrl;
  const guildName = overview?.guild.name || auth?.guild?.name || t('nav.loadingServer');

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-68 bg-bg-surface border-r border-slate-800/90 flex flex-col transform transition-transform duration-200 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="h-16 px-5 border-b border-slate-800/90 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {botAvatar ? (
              <img
                src={botAvatar}
                alt={botName}
                className="w-9 h-9 rounded-xl object-cover bg-bg-elevated border border-slate-700 shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-bg-elevated border border-slate-700 flex items-center justify-center shrink-0">
                <Bot className="w-5 h-5 text-brand" />
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-bold text-white truncate">{botName}</div>
              <div className="text-xs text-slate-400 truncate">{guildName}</div>
            </div>
          </div>

          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-bg-elevated"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_GROUPS.map((group, groupIdx) => {
            const items = NAV_ITEMS.filter((item) => item.group === group.id);
            return (
              <div key={group.id}>
                <div
                  className={`px-3 ${
                    groupIdx === 0 ? 'pt-1' : 'pt-4'
                  } pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500`}
                >
                  {t(group.labelKey)}
                </div>
                <div className="space-y-1">
                  {items.map((item) => (
                    <NavLink
                      key={item.id}
                      to={item.path}
                      end={item.path === '/'}
                      onClick={onCloseMobile}
                      className={({ isActive }) =>
                        `w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                          isActive ? 'nav-item-active' : 'nav-item'
                        }`
                      }
                    >
                      <NavIcon name={item.icon} />
                      <span>{t(item.labelKey)}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800/90 text-xs text-slate-500 flex items-center justify-between">
          <span>{botName}</span>
          <span className="px-2 py-0.5 rounded-md bg-bg-elevated text-slate-400">Dashboard</span>
        </div>
      </aside>
    </>
  );
}
