import { Tabs } from 'expo-router';
import { BarChart2, Home, LineChart, Settings, Tag, Wallet } from 'lucide-react-native';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { configureNotifications, loadNotifSettings, checkAndNotify } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

export default function AppLayout() {
    useEffect(() => {
        configureNotifications();
        let lastCheck = 0;
        const runCheck = async () => {
            const now = Date.now();
            if (now - lastCheck < 60_000) return; // throttle to once per minute
            lastCheck = now;
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data: member } = await supabase.from('household_members').select('household_id').eq('user_id', user.id).single();
            if (!member) return;
            const settings = await loadNotifSettings();
            await checkAndNotify(member.household_id, settings);
        };
        runCheck();
        const sub = AppState.addEventListener('change', state => { if (state === 'active') runCheck(); });
        return () => sub.remove();
    }, []);

    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: '#030712', // gray-950
                    borderTopColor: '#1f2937', // gray-800
                },
                tabBarActiveTintColor: '#ffffff',
                tabBarInactiveTintColor: '#6b7280', // gray-500
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Главная',
                    tabBarIcon: ({ color }) => <Home color={color} size={24} />,
                }}
            />
            <Tabs.Screen
                name="transactions/index"
                options={{
                    title: 'Транзакции',
                    tabBarIcon: ({ color }) => <LineChart color={color} size={24} />,
                }}
            />
            <Tabs.Screen
                name="accounts"
                options={{
                    title: 'Счета',
                    tabBarIcon: ({ color }) => <Wallet color={color} size={24} />,
                }}
            />
            <Tabs.Screen
                name="cards/index"
                options={{
                    title: 'Карты',
                    tabBarIcon: ({ color }) => <Tag color={color} size={24} />,
                }}
            />
            <Tabs.Screen
                name="analytics"
                options={{
                    title: 'Аналитика',
                    tabBarIcon: ({ color }) => <BarChart2 color={color} size={24} />,
                }}
            />
            <Tabs.Screen
                name="settings"
                options={{
                    title: 'Настройки',
                    tabBarIcon: ({ color }) => <Settings color={color} size={24} />,
                }}
            />
            <Tabs.Screen
                name="savings/index"
                options={{
                    href: null, // Hide from tab bar
                }}
            />
            <Tabs.Screen
                name="recurring/index"
                options={{
                    href: null,
                }}
            />
            <Tabs.Screen
                name="cards/add"
                options={{ href: null }}
            />
            <Tabs.Screen
                name="cards/[id]"
                options={{ href: null }}
            />
            <Tabs.Screen
                name="cards/edit/[id]"
                options={{ href: null }}
            />
        </Tabs>
    );
}
