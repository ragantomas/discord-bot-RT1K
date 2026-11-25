import { Bot, LogIn, LogOut, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { OAUTH_ERROR_KEYS } from '@/config/constants';
import { DEFAULT_AVATAR_URL } from '@/config/theme';
import { useAuth } from '@/context/AuthContext';

export function LoadingSplash() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3 text-slate-400">
        <div className="w-9 h-9 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        <p className="text-sm">{t('auth.loadingDashboard')}</p>
      </div>
    </div>
  );
}

export function LoginView() {
  const { t } = useTranslation();
  const { auth } = useAuth();
  const [searchParams] = useSearchParams();
  const errorCode = searchParams.get('error');
  const errorKey = errorCode ? OAUTH_ERROR_KEYS[errorCode] : null;

  const botName = auth?.bot.username || 'BOT Gaben';
  const botAvatar = auth?.bot.avatarUrl;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(88,101,242,0.16),_transparent_55%)] pointer-events-none" />
      <div className="relative w-full max-w-md bg-bg-surface/95 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center">
        <div className="absolute top-4 right-4">
          <LanguageSwitcher compact />
        </div>

        <div className="mx-auto w-20 h-20 rounded-2xl bg-bg-elevated border border-slate-700/80 overflow-hidden flex items-center justify-center shadow-lg mb-5">
          {botAvatar ? (
            <img src={botAvatar} alt={botName} className="w-full h-full object-cover" />
          ) : (
            <Bot className="w-10 h-10 text-brand" />
          )}
        </div>

        <h1 className="text-2xl font-bold text-white tracking-tight">{botName}</h1>
        <p className="text-sm text-slate-400 mt-2">{t('auth.subtitle')}</p>

        {errorKey && (
          <div className="mt-5 text-left text-sm rounded-xl border border-red-500/40 bg-red-500/10 text-red-300 px-4 py-3">
            {t(errorKey)}
          </div>
        )}

        <a
          href="/auth/discord"
          className="mt-6 w-full inline-flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-xl bg-brand hover:bg-brand-hover text-white font-semibold text-sm transition shadow-lg shadow-brand/25"
        >
          <LogIn className="w-4 h-4" />
          <span>{t('auth.signInDiscord')}</span>
        </a>

        {auth && !auth.oauthConfigured && (
          <p className="mt-4 text-xs text-amber-300/90">
            {t('auth.oauthWarningPrefix')}{' '}
            <code className="px-1 py-0.5 bg-bg-elevated rounded">.env</code> (
            <code className="px-1 py-0.5 bg-bg-elevated rounded">CLIENT_SECRET</code>,{' '}
            <code className="px-1 py-0.5 bg-bg-elevated rounded">REDIRECT_URI</code>).
          </p>
        )}
      </div>
    </div>
  );
}

export function AccessDeniedView() {
  const { t } = useTranslation();
  const { auth, logout } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="relative w-full max-w-md bg-bg-surface border border-red-500/30 rounded-3xl p-8 shadow-2xl text-center">
        <div className="absolute top-4 right-4">
          <LanguageSwitcher compact />
        </div>

        <div className="mx-auto w-16 h-16 rounded-2xl bg-red-500/15 text-red-400 flex items-center justify-center mb-5">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <h1 className="text-2xl font-bold text-white">{t('auth.accessDenied')}</h1>
        <p className="text-sm text-slate-400 mt-2">{t('auth.accessDeniedDesc')}</p>

        <div className="mt-5 flex items-center justify-center gap-3 bg-bg-elevated border border-slate-800 rounded-xl px-4 py-3">
          <img
            src={auth?.user?.avatarUrl || DEFAULT_AVATAR_URL}
            alt={auth?.user?.displayName || ''}
            className="w-8 h-8 rounded-full object-cover"
          />
          <span className="text-sm font-medium text-slate-200">
            {auth?.user?.displayName || auth?.user?.username}
          </span>
        </div>

        <button
          type="button"
          onClick={() => void logout()}
          className="mt-6 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-slate-700 text-slate-200 font-medium text-sm transition"
        >
          <LogOut className="w-4 h-4" />
          <span>{t('common.logout')}</span>
        </button>
      </div>
    </div>
  );
}
