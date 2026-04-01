/**
 * DatePickerWeb – HTML date input wrapper for web platform.
 * Drop-in replacement for @react-native-community/datetimepicker on web.
 */
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

interface DatePickerWebProps {
    value: Date;
    onChange: (date: Date) => void;
    mode?: 'date' | 'time' | 'datetime';
    minimumDate?: Date;
    maximumDate?: Date;
    label?: string;
    style?: any;
}

function pad(n: number): string {
    return n.toString().padStart(2, '0');
}

function toDateString(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimeString(d: Date): string {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function DatePickerWeb({
    value,
    onChange,
    mode = 'date',
    minimumDate,
    maximumDate,
    label,
    style,
}: DatePickerWebProps) {
    if (Platform.OS !== 'web') {
        return null;
    }

    const inputType = mode === 'time' ? 'time' : mode === 'datetime' ? 'datetime-local' : 'date';
    const inputValue = mode === 'time' ? toTimeString(value) : toDateString(value);

    const handleChange = (e: any) => {
        const val = e.target.value;
        if (!val) return;

        let newDate: Date;
        if (mode === 'time') {
            const [h, m] = val.split(':').map(Number);
            newDate = new Date(value);
            newDate.setHours(h, m);
        } else {
            newDate = new Date(val);
            if (isNaN(newDate.getTime())) return;
        }
        onChange(newDate);
    };

    return (
        <View style={[styles.container, style]}>
            {label && <Text style={styles.label}>{label}</Text>}
            {/* @ts-ignore - web-only input element */}
            <input
                type={inputType}
                value={inputValue}
                onChange={handleChange}
                min={minimumDate ? toDateString(minimumDate) : undefined}
                max={maximumDate ? toDateString(maximumDate) : undefined}
                style={{
                    fontSize: 16,
                    padding: 8,
                    borderRadius: 8,
                    border: '1px solid #ccc',
                    backgroundColor: 'transparent',
                    color: 'inherit',
                    fontFamily: 'inherit',
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    label: {
        fontSize: 14,
        marginRight: 8,
    },
});
