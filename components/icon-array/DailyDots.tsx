import React from 'react';
import { Text, View } from 'react-native';
import { DotData, IconArray } from './IconArray';

interface DailyDotsProps {
    period: 'week' | 'month' | 'quarter' | 'year';
    dailyLimit: number;
    transactions: any[]; // To be typed
}

export const DailyDots: React.FC<DailyDotsProps> = ({ period, dailyLimit, transactions }) => {
    // Mock data for MVP display
    const dots: DotData[] = Array.from({ length: 30 }).map((_, i) => {
        let state: DotData['state'] = 'filled';
        let color = '#2ECC71';

        if (i === 15) {
            state = 'warning';
            color = '#F39C12';
        } else if (i === 18) {
            state = 'overflow';
            color = '#E74C3C';
        } else if (i > 18) {
            state = 'future';
            color = '#333333';
        }

        if (i === 18) {
            state = 'today';
            color = '#555555';
        }

        return { color, state };
    });

    return (
        <View className="items-center">
            <IconArray dots={dots} columns={7} dotSize={16} gap={6} />
            <View className="flex-row justify-between w-full mt-4">
                <Text className="text-gray-400">Лимит: {dailyLimit}€</Text>
                <Text className="text-gray-400">Потрачено: 12€</Text>
            </View>
        </View>
    );
};
