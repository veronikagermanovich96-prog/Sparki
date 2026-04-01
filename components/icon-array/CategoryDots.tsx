import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { DotData, IconArray } from './IconArray';

interface CategoryData {
    name: string;
    color: string;
    amount: number;
}

interface CategoryDotsProps {
    categories: CategoryData[];
    totalAmount: number;
    onDotPress?: (categoryName: string, index: number) => void;
}

export const CategoryDots: React.FC<CategoryDotsProps> = ({
    categories,
    totalAmount,
    onDotPress,
}) => {
    const dots: DotData[] = useMemo(() => {
        if (totalAmount <= 0) {
            return Array.from({ length: 100 }).map(() => ({
                color: '#333333',
                state: 'empty' as const,
            }));
        }

        // Calculate dot counts per category, proportional to spending
        const categoryDots: { name: string; color: string; dotCount: number }[] = [];
        let assignedDots = 0;

        const sorted = [...categories].sort((a, b) => b.amount - a.amount);

        for (const cat of sorted) {
            const percent = (cat.amount / totalAmount) * 100;
            const count = Math.round(percent);
            categoryDots.push({ name: cat.name, color: cat.color, dotCount: count });
            assignedDots += count;
        }

        // Adjust to exactly 100 dots — add/remove from largest category
        if (assignedDots !== 100 && categoryDots.length > 0) {
            categoryDots[0].dotCount += 100 - assignedDots;
        }

        // Build flat dot array
        const result: DotData[] = [];
        for (const cat of categoryDots) {
            for (let i = 0; i < cat.dotCount; i++) {
                result.push({
                    color: cat.color,
                    state: 'filled',
                    meta: { categoryName: cat.name },
                });
            }
        }

        // Pad remaining with empty dots if categories don't cover 100
        while (result.length < 100) {
            result.push({ color: '#333333', state: 'empty' });
        }

        return result.slice(0, 100);
    }, [categories, totalAmount]);

    return (
        <View className="items-center">
            <IconArray
                dots={dots}
                columns={10}
                dotSize={8}
                gap={4}
                onDotPress={onDotPress ? (dot, index) => onDotPress(dot.meta?.categoryName ?? '', index) : undefined}
            />
            <View className="flex-row flex-wrap gap-x-4 gap-y-1 w-full mt-3">
                {categories.map((cat) => {
                    const percent = totalAmount > 0 ? ((cat.amount / totalAmount) * 100).toFixed(0) : '0';
                    return (
                        <View key={cat.name} className="flex-row items-center">
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cat.color, marginRight: 4 }} />
                            <Text className="text-gray-400 text-xs" style={{ fontFamily: 'Geist' }}>
                                {cat.name} {percent}%
                            </Text>
                        </View>
                    );
                })}
            </View>
        </View>
    );
};
