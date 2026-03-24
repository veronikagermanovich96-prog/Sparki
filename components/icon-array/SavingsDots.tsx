import React from 'react';
import { Text, View } from 'react-native';
import { DotData, IconArray } from './IconArray';

interface SavingsDotsProps {
    currentBalance: number;
    interestEarned: number;
    targetAmount: number;
}

export const SavingsDots: React.FC<SavingsDotsProps> = ({
    currentBalance,
    interestEarned,
    targetAmount,
}) => {
    const dots: DotData[] = Array.from({ length: 100 }).map((_, i) => {
        // const totalCurrent = currentBalance + interestEarned;
        const currentPercent = (currentBalance / targetAmount) * 100;
        const interestPercent = (interestEarned / targetAmount) * 100;

        let state: DotData['state'] = 'empty';
        let color = '#333333';

        if (i < currentPercent) {
            state = 'filled';
            color = '#1E5128'; // Dark green
        } else if (i < currentPercent + interestPercent) {
            state = 'filled';
            color = '#4E9F3D'; // Light green
        }

        return { color, state };
    });

    return (
        <View className="items-center">
            <IconArray dots={dots} columns={10} dotSize={8} gap={4} />
            <View className="flex-row justify-between w-full mt-2">
                <Text className="text-gray-400 text-xs">{(currentBalance / targetAmount * 100).toFixed(0)}% накоплено</Text>
            </View>
        </View>
    );
};
