import { formatAmount } from '@/constants/currencies';
import { Transaction } from '@/types';
import { format, getDaysInMonth, isFuture, isToday, startOfMonth } from 'date-fns';
import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { DotData, IconArray } from './IconArray';

interface DailyDotsProps {
    period: 'week' | 'month' | 'quarter' | 'year';
    dailyLimit: number;
    transactions: Transaction[];
}

export const DailyDots: React.FC<DailyDotsProps> = ({ period, dailyLimit, transactions }) => {
    const currentDate = new Date();
    const daysInMonth = getDaysInMonth(currentDate);
    const startMonth = startOfMonth(currentDate);

    const expensesByDate = useMemo(() => {
        const map = new Map<string, number>();
        for (const t of transactions) {
            if (t.type === 'expense') {
                const existing = map.get(t.date) || 0;
                map.set(t.date, existing + (t.amount_base ?? t.amount));
            }
        }
        return map;
    }, [transactions]);

    const dots: DotData[] = Array.from({ length: daysInMonth }).map((_, i) => {
        const dateObj = new Date(startMonth);
        dateObj.setDate(1 + i);
        const dateStr = format(dateObj, 'yyyy-MM-dd');

        const spent = expensesByDate.get(dateStr) || 0;

        let state: DotData['state'] = 'filled';
        let color = '#22c55e'; // Green

        if (isFuture(dateObj)) {
            state = 'future';
            color = '#374151'; // gray-700
        } else {
            if (spent > dailyLimit) {
                state = 'overflow';
                color = '#ef4444'; // Red
            } else if (spent > dailyLimit * 0.8) {
                state = 'warning';
                color = '#f97316'; // Orange
            } else if (spent === 0 && !isToday(dateObj)) {
                state = 'filled';
                color = '#1f2937'; // gray-800
            }

            if (isToday(dateObj) && spent === 0) {
                state = 'today';
                color = '#4b5563'; // gray-600
            }
        }

        return { color, state };
    });

    const totalSpent = Array.from(expensesByDate.values()).reduce((a, b) => a + b, 0);

    return (
        <View className="items-center">
            <IconArray dots={dots} columns={7} dotSize={16} gap={6} />
            <View className="flex-row justify-between w-full mt-4">
                <Text className="text-gray-400">Лимит в день: {formatAmount(dailyLimit, 'EUR')}</Text>
                <Text className="text-gray-400">Потрачено: {formatAmount(totalSpent, 'EUR')}</Text>
            </View>
        </View>
    );
};
