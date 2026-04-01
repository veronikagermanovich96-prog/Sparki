import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { DotData, IconArray } from './IconArray';

interface BudgetDotsProps {
    budgeted: number;
    spent: number;
    color: string;
    categoryName: string;
}

export const BudgetDots: React.FC<BudgetDotsProps> = ({
    budgeted,
    spent,
    color,
    categoryName,
}) => {
    const percentage = budgeted > 0 ? (spent / budgeted) * 100 : 0;

    const dots: DotData[] = useMemo(() => {
        const spentDots = Math.min(Math.round(percentage), 100);
        const warningThreshold = 80;
        const overflowThreshold = 100;

        return Array.from({ length: 100 }).map((_, i) => {
            const dotPercent = i + 1; // 1-based: dot i represents the i+1th percent

            if (i < spentDots) {
                // Spent portion
                if (percentage >= overflowThreshold && dotPercent > warningThreshold) {
                    // Over budget — red for dots above 80%
                    return { color: '#ef4444', state: 'overflow' as const, meta: { categoryName } };
                }
                if (dotPercent > warningThreshold) {
                    // Approaching budget — orange for dots above 80%
                    return { color: '#f97316', state: 'warning' as const, meta: { categoryName } };
                }
                // Normal spent — category color
                return { color, state: 'filled' as const, meta: { categoryName } };
            }

            // Remaining budget — gray
            return { color: '#333333', state: 'empty' as const, meta: { categoryName } };
        });
    }, [budgeted, spent, color, categoryName, percentage]);

    return (
        <View className="items-center">
            <View className="flex-row justify-between w-full mb-2">
                <Text className="text-gray-300 text-sm" style={{ fontFamily: 'Geist' }}>
                    {categoryName}
                </Text>
                <Text
                    className="text-sm"
                    style={{
                        fontFamily: 'Geist',
                        color: percentage >= 100 ? '#ef4444' : percentage >= 80 ? '#f97316' : '#9ca3af',
                    }}
                >
                    {percentage.toFixed(0)}%
                </Text>
            </View>
            <IconArray dots={dots} columns={10} dotSize={8} gap={4} />
        </View>
    );
};
