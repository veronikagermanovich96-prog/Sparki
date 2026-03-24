/* eslint-disable import/no-named-as-default-member */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ru from '@/locales/ru.json';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import fr from '@/locales/fr.json';
import es from '@/locales/es.json';

const LANGUAGE_KEY = 'app_language';

export const SUPPORTED_LANGUAGES = ['ru', 'en', 'de', 'fr', 'es'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const deviceLang = Localization.getLocales()[0]?.languageCode ?? 'en';
const defaultLang = SUPPORTED_LANGUAGES.includes(deviceLang as SupportedLanguage)
    ? deviceLang
    : 'en';

i18n.use(initReactI18next).init({
    resources: {
        ru: { translation: ru },
        en: { translation: en },
        de: { translation: de },
        fr: { translation: fr },
        es: { translation: es },
    },
    lng: defaultLang,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
});

// Restore saved language preference (guard against SSR where window is undefined)
if (typeof window !== 'undefined') {
    AsyncStorage.getItem(LANGUAGE_KEY).then(saved => {
        if (saved && SUPPORTED_LANGUAGES.includes(saved as SupportedLanguage)) {
            i18n.changeLanguage(saved);
        }
    });
}

export async function setLanguage(lang: SupportedLanguage) {
    await AsyncStorage.setItem(LANGUAGE_KEY, lang);
    await i18n.changeLanguage(lang);
}

export default i18n;
