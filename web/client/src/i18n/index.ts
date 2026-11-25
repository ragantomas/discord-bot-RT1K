import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LANGUAGE, STORAGE_KEYS, SUPPORTED_LANGUAGES } from '@/config/constants';
import type { AppLanguage } from '@/types/api';
import en from '@/i18n/locales/en.json';
import sk from '@/i18n/locales/sk.json';

function readInitialLanguage(): AppLanguage {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEYS.LANGUAGE);
    if (saved && SUPPORTED_LANGUAGES.includes(saved as AppLanguage)) {
      return saved as AppLanguage;
    }
  } catch {
    // Ignore storage errors
  }
  return DEFAULT_LANGUAGE;
}

const initialLanguage = readInitialLanguage();

void i18n.use(initReactI18next).init({
  resources: {
    sk: { translation: sk },
    en: { translation: en },
  },
  lng: initialLanguage,
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: {
    escapeValue: false,
  },
});

if (typeof document !== 'undefined') {
  document.documentElement.lang = initialLanguage;
}

export function setAppLanguage(lang: AppLanguage): void {
  void i18n.changeLanguage(lang);
  try {
    window.localStorage.setItem(STORAGE_KEYS.LANGUAGE, lang);
  } catch {
    // Ignore storage errors
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
  }
}

export function getAppLanguage(): AppLanguage {
  return i18n.language === 'en' ? 'en' : 'sk';
}

export default i18n;
