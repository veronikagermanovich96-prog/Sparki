import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';

const WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

interface CustomCalendarProps {
    value: Date;
    maximumDate?: Date;
    onChange: (date: Date) => void;
}

export function CustomCalendar({ value, maximumDate, onChange }: CustomCalendarProps) {
    const { colors, fonts } = useTheme();
    const [viewYear, setViewYear] = useState(value.getFullYear());
    const [viewMonth, setViewMonth] = useState(value.getMonth());

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const selectedDay = value.getDate();
    const selectedMonth = value.getMonth();
    const selectedYear = value.getFullYear();

    // First day of month (0=Sun, 1=Mon...)
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    // Shift to Monday-based (Mon=0, Sun=6)
    const startOffset = (firstDay + 6) % 7;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    // Month name
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
    ];

    function prevMonth() {
        if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
        else setViewMonth(m => m - 1);
    }

    function nextMonth() {
        const now = new Date();
        const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
        const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
        // Don't go beyond current month if maximumDate is set
        if (maximumDate && new Date(nextY, nextM, 1) > maximumDate) return;
        if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
        else setViewMonth(m => m + 1);
    }

    // Build 6 weeks grid
    const cells: { day: number; inMonth: boolean; date: Date }[] = [];

    // Previous month days
    for (let i = startOffset - 1; i >= 0; i--) {
        const d = daysInPrevMonth - i;
        cells.push({ day: d, inMonth: false, date: new Date(viewYear, viewMonth - 1, d) });
    }
    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
        cells.push({ day: d, inMonth: true, date: new Date(viewYear, viewMonth, d) });
    }
    // Next month days (fill to complete rows)
    const remaining = 7 - (cells.length % 7);
    if (remaining < 7) {
        for (let d = 1; d <= remaining; d++) {
            cells.push({ day: d, inMonth: false, date: new Date(viewYear, viewMonth + 1, d) });
        }
    }

    const weeks: typeof cells[] = [];
    for (let i = 0; i < cells.length; i += 7) {
        weeks.push(cells.slice(i, i + 7));
    }

    const canGoNext = !maximumDate || new Date(viewMonth === 11 ? viewYear + 1 : viewYear, viewMonth === 11 ? 0 : viewMonth + 1, 1) <= maximumDate;

    return (
        <View style={{ paddingHorizontal: 8 }}>
            {/* Header: < Month Year > */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <TouchableOpacity onPress={prevMonth} style={{ padding: 8 }}>
                    <ChevronLeft color={colors.textSecondary} size={20} />
                </TouchableOpacity>
                <Text style={{ color: colors.textPrimary, fontSize: 17, fontFamily: fonts.heading }}>
                    {monthNames[viewMonth]} {viewYear}
                </Text>
                <TouchableOpacity onPress={nextMonth} style={{ padding: 8, opacity: canGoNext ? 1 : 0.3 }} disabled={!canGoNext}>
                    <ChevronRight color={colors.textSecondary} size={20} />
                </TouchableOpacity>
            </View>

            {/* Week day headers */}
            <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                {WEEK_DAYS.map(d => (
                    <View key={d} style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: fonts.body }}>{d}</Text>
                    </View>
                ))}
            </View>

            {/* Days grid */}
            {weeks.map((week, wi) => (
                <View key={wi} style={{ flexDirection: 'row', marginBottom: 4 }}>
                    {week.map((cell, ci) => {
                        const isSelected = cell.inMonth && cell.day === selectedDay && viewMonth === selectedMonth && viewYear === selectedYear;
                        const isToday = cell.inMonth && cell.day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
                        const isFuture = maximumDate && cell.date > maximumDate;
                        const disabled = !cell.inMonth || !!isFuture;

                        return (
                            <TouchableOpacity
                                key={ci}
                                onPress={() => { if (!disabled) onChange(cell.date); }}
                                disabled={disabled}
                                style={{
                                    flex: 1, alignItems: 'center', justifyContent: 'center',
                                    height: 40, borderRadius: 20,
                                    backgroundColor: isSelected ? '#fff' : 'transparent',
                                }}>
                                <Text style={{
                                    fontSize: 16,
                                    fontFamily: isSelected || isToday ? fonts.bodyBold : fonts.body,
                                    color: isSelected ? '#000'
                                        : disabled ? 'rgba(255,255,255,0.15)'
                                        : isToday ? '#7C6FFF'
                                        : colors.textPrimary,
                                }}>{cell.day}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            ))}
        </View>
    );
}
