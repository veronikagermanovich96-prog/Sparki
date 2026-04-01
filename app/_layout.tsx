import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useCallback } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-reanimated';
import '@/lib/i18n';
import '../global.css';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,   // 5 minutes
      gcTime: 10 * 60 * 1000,     // 10 minutes
      retry: 2,
    },
  },
});

export default function RootLayout() {
  const _colorScheme = useColorScheme(); // eslint-disable-line @typescript-eslint/no-unused-vars
  const { session, setSession, isLoading, setIsLoading } = useAuthStore();

  const [fontsLoaded] = useFonts({
    'Charter': require('../assets/fonts/Charter-Roman.ttf'),
    'Charter-Bold': require('../assets/fonts/Charter-Bold.ttf'),
    'Charter-Black': require('../assets/fonts/Charter-Black.ttf'),
    'Charter-Italic': require('../assets/fonts/Charter-Italic.ttf'),
    'Geist': require('../assets/fonts/Geist-Regular.ttf'),
    'Geist-Medium': require('../assets/fonts/Geist-Medium.ttf'),
    'Geist-SemiBold': require('../assets/fonts/Geist-SemiBold.ttf'),
    'Geist-Bold': require('../assets/fonts/Geist-Bold.ttf'),
  });

  const onLayoutReady = useCallback(async () => {
    if (fontsLoaded && !isLoading) await SplashScreen.hideAsync();
  }, [fontsLoaded, isLoading]);
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
    const inCategoriesQuiz = segments.some(s => s === 'categories-quiz');

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/onboarding');
    } else if (session && inAuthGroup && !inCategoriesQuiz) {
      router.replace('/(app)');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, isLoading, segments]);

  if (!fontsLoaded) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RootContent isLoading={isLoading} onLayout={onLayoutReady} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function RootContent({ isLoading, onLayout }: { isLoading: boolean; onLayout: () => void }) {
  const { isDark, colors } = useTheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayout}>
      <Slot />
      {isLoading && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#7C6FFF" size="large" />
        </View>
      )}
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </GestureHandlerRootView>
  );
}
