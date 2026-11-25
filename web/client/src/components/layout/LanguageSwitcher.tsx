import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '@/config/constants';
import { setAppLanguage } from '@/i18n';
import type { AppLanguage } from '@/types/api';

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { i18n, t } = useTranslation();
  const current: AppLanguage = i18n.language === 'en' ? 'en' : 'sk';

  return (
    <div
      role="group"
      aria-label={t('common.language')}
      className="inline-flex items-center p-0.5 rounded-xl bg-bg-elevated border border-slate-800 text-xs font-semibold"
    >
      {SUPPORTED_LANGUAGES.map((lang) => {
        const active = current === lang;
        return (
          <button
            key={lang}
            type="button"
            aria-pressed={active}
            onClick={() => setAppLanguage(lang)}
            className={`px-2.5 ${compact ? 'py-1' : 'py-1.5'} rounded-lg uppercase transition ${
              active
                ? 'bg-brand text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {lang}
          </button>
        );
      })}
    </div>
  );
}
