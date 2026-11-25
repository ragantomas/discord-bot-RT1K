import { LogOut, Menu } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { getNavItemByPath } from '@/config/navigation';
import { DEFAULT_AVATAR_URL } from '@/config/theme';
import { useAuth } from '@/context/AuthContext';

export function TopBar({ onOpenMobile }: { onOpenMobile: () => void }) {
  const { t } = useTranslation();
  const location = useLocation();
  const { auth, logout } = useAuth();
  const activeNav = getNavItemByPath(location.pathname);

  return (
    <header className="h-16 px-4 sm:px-6 border-b border-slate-800/90 bg-bg-surface/75 backdrop-blur flex items-center justify-between gap-4 sticky top-0 z-20">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobile}
          className="lg:hidden p-2 rounded-xl bg-bg-elevated border border-slate-700/70 text-slate-200 hover:bg-bg-hover"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold text-white truncate">{t(activeNav.labelKey)}</h2>
      </div>

      <div className="flex items-center gap-3">
        <LanguageSwitcher />
        <div className="flex items-center gap-2.5 bg-bg-elevated border border-slate-800 rounded-xl px-3 py-1.5">
          <img
            src={auth?.user?.avatarUrl || DEFAULT_AVATAR_URL}
            alt={auth?.user?.displayName || ''}
            className="w-6 h-6 rounded-full object-cover"
          />
          <span className="text-sm font-medium text-slate-200 hidden sm:inline max-w-[160px] truncate">
            {auth?.user?.displayName || auth?.user?.username}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          title={t('common.logout')}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-700/80 text-slate-300 hover:text-white text-sm font-medium transition"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden md:inline">{t('common.logout')}</span>
        </button>
      </div>
    </header>
  );
}
