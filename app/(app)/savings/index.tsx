import { useTheme } from '@/context/ThemeContext';
import { Text, View } from 'react-native';

export default function SavingsScreen() {
    const { fonts } = useTheme();
    return (
        <View className="flex-1 bg-gray-950 items-center justify-center">
            <Text className="text-white text-xl font-bold" style={{ fontFamily: fonts.heading }}>Цели</Text>
        </View>
    );
}
