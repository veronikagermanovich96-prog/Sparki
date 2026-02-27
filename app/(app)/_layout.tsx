import { Tabs } from 'expo-router';
import { Home, LineChart, PieChart, Settings, Wallet } from 'lucide-react-native';

export default function AppLayout() {
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
                name="accounts/index"
                options={{
                    title: 'Счета',
                    tabBarIcon: ({ color }) => <Wallet color={color} size={24} />,
                }}
            />
            <Tabs.Screen
                name="analytics/_layout"
                options={{
                    title: 'Аналитика',
                    tabBarIcon: ({ color }) => <PieChart color={color} size={24} />,
                }}
            />
            <Tabs.Screen
                name="settings/index"
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
                    href: null, // Hide from tab bar
                }}
            />
        </Tabs>
    );
}
