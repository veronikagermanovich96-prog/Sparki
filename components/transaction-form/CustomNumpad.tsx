import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Delete } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';

interface NumpadProps {
    onKey: (key: string) => void;
}

const ROWS = [
    ['1', '2', '3', '+'],
    ['4', '5', '6', '−'],
    ['7', '8', '9', '×'],
    [',', '0', '⌫', '÷'],
];

export function CustomNumpad({ onKey }: NumpadProps) {
    const { colors } = useTheme();

    return (
        <View style={{ gap: 8 }}>
            {ROWS.map((row, ri) => (
                <View key={ri} style={{ flexDirection: 'row', gap: 8 }}>
                    {row.map(btn => {
                        const isOp = ['+', '−', '×', '÷'].includes(btn);
                        return (
                            <TouchableOpacity
                                key={btn}
                                onPress={() => onKey(btn)}
                                activeOpacity={0.6}
                                style={{
                                    flex: 1, height: 52, borderRadius: 14,
                                    alignItems: 'center', justifyContent: 'center',
                                    backgroundColor: isOp ? 'rgba(124,111,255,0.15)' : colors.bgTertiary,
                                }}>
                                {btn === '⌫' ? (
                                    <Delete color={colors.textPrimary} size={20} />
                                ) : (
                                    <Text style={{
                                        fontSize: 22, fontWeight: '500',
                                        color: isOp ? '#7C6FFF' : colors.textPrimary,
                                    }}>{btn}</Text>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            ))}
        </View>
    );
}
