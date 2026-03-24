import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'public-anon-key';

// SSR-safe storage wrapper — AsyncStorage crashes when window is undefined
const safeStorage = typeof window !== 'undefined' ? AsyncStorage : {
    getItem: () => Promise.resolve(null),
    setItem: () => Promise.resolve(),
    removeItem: () => Promise.resolve(),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: safeStorage,
        autoRefreshToken: true,
        persistSession: typeof window !== 'undefined',
        detectSessionInUrl: false,
    },
});
