import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const THEME_KEY = 'app_theme';

interface SettingsState {
    theme: 'dark' | 'light';
    baseCurrency: string;
    householdId: string;
    setTheme: (theme: 'dark' | 'light') => void;
    setBaseCurrency: (currency: string) => void;
    setHouseholdId: (id: string) => void;
    loadSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
    theme: 'dark',
    baseCurrency: 'USD',
    householdId: '',

    setTheme: (theme) => {
        set({ theme });
        AsyncStorage.setItem(THEME_KEY, theme);
    },

    setBaseCurrency: (baseCurrency) => set({ baseCurrency }),

    setHouseholdId: (householdId) => set({ householdId }),

    loadSettings: async () => {
        const saved = await AsyncStorage.getItem(THEME_KEY);
        if (saved === 'dark' || saved === 'light') {
            set({ theme: saved });
        }
    },
}));
