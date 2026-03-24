import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import '@/lib/i18n';
import '../global.css';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { ThemeProvider } from '@/context/ThemeContext';

export default function RootLayout() {
  const _colorScheme = useColorScheme(); // eslint-disable-line @typescript-eslint/no-unused-vars
  const { session, setSession, isLoading, setIsLoading } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inCategoriesQuiz = segments[1] === 'categories-quiz';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/onboarding');
    } else if (session && inAuthGroup && !inCategoriesQuiz) {
      router.replace('/(app)');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, isLoading, segments]);

  return (
    <ThemeProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Slot />
        {isLoading && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#7C6FFF" size="large" />
          </View>
        )}
        <StatusBar style="auto" />
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}
