import React, { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator, Alert, Platform, ScrollView, Text,
    TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
    addMonths, subMonths, addDays, format, parseISO,
    startOfMonth, endOfMonth, getDay, getDaysInMonth,
    isSameDay,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { ArrowUpDown, Bell, ChevronLeft, ChevronRight, ArrowLeft, Plus, Repeat2, Landmark } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BaseBottomSheet } from '@/components/ui/BaseBottomSheet';
import { supabase } from '@/lib/supabase';
import { formatAmount } from '@/constants/currencies';
import { useTheme } from '@/context/ThemeContext';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';
import * as Notifications from 'expo-notifications';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RecurringItem {
    id: string;
    name: string;
    amount: number;
    currency: string;
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    next_date: string;
    is_active: boolean;
    type: 'income' | 'expense';
    category_icon: string | null;
    category_color: string | null;
    source: 'recurring';
}

interface LoanItem {
    id: string;
    name: string;
    loan_type: string;
    custom_type_name: string | null;
    monthly_payment: number;
    currency: string;
    payment_day: number;
    is_active: boolean;
    color: string;
    icon: string;
    recurring_id: string | null;
    next_date: string | null;
    source: 'loan';
}

type FilterTab = 'all' | 'recurring' | 'loans';
type SortBy = 'date' | 'amount_desc' | 'amount_asc' | 'name' | 'type';

const SORT_LABEL_KEYS: Record<SortBy, string> = {
    date: 'payments.sortDateShort',
    amount_desc: 'payments.sortAmountDescShort',
    amount_asc: 'payments.sortAmountAscShort',
    name: 'payments.sortNameShort',
    type: 'payments.sortTypeShort',
};

const LOAN_TYPE_LABEL_KEYS: Record<string, string> = {
    mortgage: 'payments.mortgage', auto: 'payments.carLoan', consumer: 'payments.consumerLoan', other: 'payments.otherLoan',
};

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function PaymentsScreen() {
    const { colors } = useTheme();
    const { t } = useTranslation();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [recurring, setRecurring] = useState<RecurringItem[]>([]);
    const [loans, setLoans] = useState<LoanItem[]>([]);
    const [calMonth, setCalMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [filter, setFilter] = useState<FilterTab>('all');
    const [sortBy, setSortBy] = useState<SortBy>('date');
    const [showSortSheet, setShowSortSheet] = useState(false);
    const [pendingSort, setPendingSort] = useState<SortBy>('date');

    // ── Edit bottom sheet state ───────────────────────────────────────────────
    const [editingPayment, setEditingPayment] = useState<{
        id: string; name: string; amount: number; currency: string;
        source: 'recurring' | 'loan'; nextDate: Date | null; recurringId?: string | null;
    } | null>(null);
    const [paymentDate, setPaymentDate] = useState(new Date());
    const [reminderType, setReminderType] = useState<'days' | 'datetime'>('days');
    const [reminderDays, setReminderDays] = useState<1 | 3 | 7>(1);
    const [reminderDatetime, setReminderDatetime] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);

    function openEditSheet(item: {
        id: string; name: string; amount: number; currency: string;
        source: 'recurring' | 'loan'; nextDate: Date | null; recurringId?: string | null;
    }) {
        const nd = item.nextDate ?? new Date();
        setPaymentDate(nd);
        setReminderType('days');
        setReminderDays(1);
        setReminderDatetime(addDays(nd, -1));
        setEditingPayment(item);

        // Load saved reminder
        AsyncStorage.getItem(`reminder_${item.id}`).then(json => {
            if (!json) return;
            try {
                const saved = JSON.parse(json);
                if (saved.type === 'days') { setReminderType('days'); setReminderDays(saved.days); }
                else if (saved.type === 'datetime') { setReminderType('datetime'); setReminderDatetime(new Date(saved.datetime)); }
            } catch {}
        });
    }

    async function saveEditedPayment() {
        if (!editingPayment) return;
        setSavingEdit(true);
        try {
            const dateStr = format(paymentDate, 'yyyy-MM-dd');

            // Update next_date in recurring_payments
            if (editingPayment.source === 'recurring') {
                await supabase.from('recurring_payments').update({ next_date: dateStr }).eq('id', editingPayment.id);
            } else if (editingPayment.recurringId) {
                await supabase.from('recurring_payments').update({ next_date: dateStr }).eq('id', editingPayment.recurringId);
            }

            // Save reminder to AsyncStorage
            const reminderData = reminderType === 'days'
                ? { type: 'days', days: reminderDays }
                : { type: 'datetime', datetime: reminderDatetime.toISOString() };
            await AsyncStorage.setItem(`reminder_${editingPayment.id}`, JSON.stringify(reminderData));

            // Schedule push notification
            await Notifications.cancelScheduledNotificationAsync(`payment_${editingPayment.id}`).catch(() => {});

            let triggerDate: Date;
            if (reminderType === 'days') {
                triggerDate = addDays(paymentDate, -reminderDays);
                triggerDate.setHours(10, 0, 0, 0);
            } else {
                triggerDate = reminderDatetime;
            }

            if (triggerDate > new Date()) {
                await Notifications.scheduleNotificationAsync({
                    identifier: `payment_${editingPayment.id}`,
                    content: {
                        title: t('payments.notifTitle'),
                        body: t('payments.notifBody', { name: editingPayment.name, amount: formatAmount(editingPayment.amount, editingPayment.currency) }),
                    },
                    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
                });
            }

            setEditingPayment(null);
            loadData();
        } catch {
            Alert.alert(t('common.error'), t('payments.saveError'));
        } finally {
            setSavingEdit(false);
        }
    }

    // ── Load data ────────────────────────────────────────────────────────────

    useFocusEffect(useCallback(() => {
        loadData();
    }, []));

    async function loadData() {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }
        const { data: member } = await supabase
            .from('household_members')
            .select('household_id')
            .eq('user_id', user.id)
            .single();
        if (!member) { setLoading(false); return; }
        const hid = member.household_id as string;

        // Fetch recurring payments
        const { data: recData } = await supabase
            .from('recurring_payments')
            .select('id, name, amount, currency, frequency, next_date, is_active, type, categories(icon, color)')
            .eq('household_id', hid)
            .order('next_date', { ascending: true });

        const recItems: RecurringItem[] = (recData ?? []).map((r: any) => ({
            id: r.id,
            name: r.name,
            amount: r.amount,
            currency: r.currency,
            frequency: r.frequency,
            next_date: r.next_date,
            is_active: r.is_active,
            type: r.type,
            category_icon: r.categories?.icon ?? null,
            category_color: r.categories?.color ?? null,
            source: 'recurring' as const,
        }));

        // Fetch loans with their recurring payment next_date
        const { data: loansData } = await supabase
            .from('loans')
            .select('id, name, loan_type, custom_type_name, total_amount, paid_amount, currency, payment_type, start_date, end_date, color, icon, recurring_id, is_active')
            .eq('household_id', hid)
            .eq('is_active', true);

        // Get recurring payment dates for loans
        const loanRecIds = (loansData ?? []).filter((l: any) => l.recurring_id).map((l: any) => l.recurring_id);
        let recDatesMap: Record<string, string> = {};
        if (loanRecIds.length > 0) {
            const { data: recDates } = await supabase
                .from('recurring_payments')
                .select('id, next_date')
                .in('id', loanRecIds);
            (recDates ?? []).forEach((r: any) => { recDatesMap[r.id] = r.next_date; });
        }

        const loanItems: LoanItem[] = (loansData ?? []).map((l: any) => {
            const nextDate = l.recurring_id ? recDatesMap[l.recurring_id] ?? null : null;
            // Extract payment day from next_date or start_date
            const payDay = nextDate ? parseISO(nextDate).getDate() : new Date(l.start_date).getDate();
            // Calculate monthly payment (simplified — use from recurring if available)
            // const totalMonths = Math.max(1, Math.round((new Date(l.end_date).getTime() - new Date(l.start_date).getTime()) / (30.44 * 86400000)));
            // const rate = 0; // We'd need rate periods for accuracy, but recurring amount is the source of truth
            return {
                id: l.id,
                name: l.name,
                loan_type: l.loan_type,
                custom_type_name: l.custom_type_name,
                monthly_payment: 0, // will be filled from recurring
                currency: l.currency,
                payment_day: payDay,
                is_active: l.is_active,
                color: l.color || '#FF6B6B',
                icon: l.icon || 'Home',
                recurring_id: l.recurring_id,
                next_date: nextDate,
                source: 'loan' as const,
            };
        });

        // Fill loan monthly payments from their recurring entries
        loanItems.forEach(loan => {
            if (loan.recurring_id) {
                const rec = recItems.find(r => r.id === loan.recurring_id);
                if (rec) loan.monthly_payment = rec.amount;
            }
        });

        // Remove loan recurring entries from the recurring list to avoid duplicates
        const loanRecIdSet = new Set(loanRecIds);
        const filteredRec = recItems.filter(r => !loanRecIdSet.has(r.id));

        setRecurring(filteredRec);
        setLoans(loanItems);
        setLoading(false);
    }

    // ── Calendar helpers ─────────────────────────────────────────────────────

    const monthStart = startOfMonth(calMonth);
    const _monthEnd = endOfMonth(calMonth); // eslint-disable-line @typescript-eslint/no-unused-vars
    const daysInMonth = getDaysInMonth(calMonth);
    // Monday=0 start
    const firstDayOfWeek = (getDay(monthStart) + 6) % 7;

    // Build set of dates with payments
    const paymentDates = useMemo(() => {
        const dates: Map<string, { hasRecurring: boolean; hasLoan: boolean }> = new Map();
        const year = calMonth.getFullYear();
        const month = calMonth.getMonth();

        // Recurring: monthly payments that fall in this month
        recurring.forEach(r => {
            if (!r.is_active) return;
            const nextD = parseISO(r.next_date);
            // For monthly recurring, show the day in every month
            if (r.frequency === 'monthly') {
                const day = nextD.getDate();
                const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(day, daysInMonth)).padStart(2, '0')}`;
                const existing = dates.get(key) ?? { hasRecurring: false, hasLoan: false };
                existing.hasRecurring = true;
                dates.set(key, existing);
            } else {
                // For other frequencies, check if next_date falls in this month
                if (nextD.getMonth() === month && nextD.getFullYear() === year) {
                    const key = format(nextD, 'yyyy-MM-dd');
                    const existing = dates.get(key) ?? { hasRecurring: false, hasLoan: false };
                    existing.hasRecurring = true;
                    dates.set(key, existing);
                }
            }
        });

        // Loans: payment day each month
        loans.forEach(l => {
            if (!l.is_active) return;
            const day = Math.min(l.payment_day, daysInMonth);
            const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const existing = dates.get(key) ?? { hasRecurring: false, hasLoan: false };
            existing.hasLoan = true;
            dates.set(key, existing);
        });

        return dates;
    }, [recurring, loans, calMonth, daysInMonth]);

    // ── Selected date payments ───────────────────────────────────────────────

    const selectedDatePayments = useMemo(() => {
        if (!selectedDate) return [];
        const day = selectedDate.getDate();
        const items: { name: string; amount: number; currency: string; type: 'recurring' | 'loan'; color: string }[] = [];

        recurring.forEach(r => {
            if (!r.is_active) return;
            const nextD = parseISO(r.next_date);
            if (r.frequency === 'monthly' && nextD.getDate() === day) {
                items.push({ name: r.name, amount: r.amount, currency: r.currency, type: 'recurring', color: r.category_color || '#60a5fa' });
            } else if (isSameDay(nextD, selectedDate)) {
                items.push({ name: r.name, amount: r.amount, currency: r.currency, type: 'recurring', color: r.category_color || '#60a5fa' });
            }
        });

        loans.forEach(l => {
            if (!l.is_active) return;
            if (l.payment_day === day) {
                const typeLabel = l.loan_type === 'other' && l.custom_type_name ? l.custom_type_name : i18n.t(LOAN_TYPE_LABEL_KEYS[l.loan_type] ?? '') || '';
                items.push({ name: `${l.name} · ${typeLabel}`, amount: l.monthly_payment, currency: l.currency, type: 'loan', color: l.color });
            }
        });

        return items;
    }, [selectedDate, recurring, loans]);

    // ── Payment list (grouped) ───────────────────────────────────────────────

    const { overdueItems, upcomingItems, inactiveItems } = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const allItems: {
            id: string; name: string; amount: number; currency: string;
            nextDate: Date | null; isActive: boolean; source: 'recurring' | 'loan';
            color: string; overdueDays: number; recurringId?: string | null;
        }[] = [];

        if (filter === 'all' || filter === 'recurring') {
            recurring.forEach(r => {
                const nd = parseISO(r.next_date);
                const diffDays = Math.round((today.getTime() - nd.getTime()) / 86400000);
                allItems.push({
                    id: r.id, name: r.name, amount: r.amount, currency: r.currency,
                    nextDate: nd, isActive: r.is_active, source: 'recurring',
                    color: r.category_color || '#60a5fa', overdueDays: diffDays > 0 ? diffDays : 0,
                });
            });
        }

        if (filter === 'all' || filter === 'loans') {
            loans.forEach(l => {
                const nd = l.next_date ? parseISO(l.next_date) : null;
                const diffDays = nd ? Math.round((today.getTime() - nd.getTime()) / 86400000) : 0;
                const typeLabel = l.loan_type === 'other' && l.custom_type_name ? l.custom_type_name : i18n.t(LOAN_TYPE_LABEL_KEYS[l.loan_type] ?? '') || '';
                allItems.push({
                    id: l.id, name: `${l.name} · ${typeLabel}`, amount: l.monthly_payment, currency: l.currency,
                    nextDate: nd, isActive: l.is_active, source: 'loan',
                    color: l.color, overdueDays: diffDays > 0 ? diffDays : 0, recurringId: l.recurring_id,
                });
            });
        }

        const sortFn = (a: typeof allItems[0], b: typeof allItems[0]) => {
            switch (sortBy) {
                case 'date': return (a.nextDate?.getTime() ?? 0) - (b.nextDate?.getTime() ?? 0);
                case 'amount_desc': return b.amount - a.amount;
                case 'amount_asc': return a.amount - b.amount;
                case 'name': return a.name.localeCompare(b.name);
                case 'type': return a.source.localeCompare(b.source);
                default: return 0;
            }
        };

        const overdue = allItems.filter(i => i.isActive && i.overdueDays > 0).sort(sortBy === 'date' ? (a, b) => b.overdueDays - a.overdueDays : sortFn);
        const upcoming = allItems.filter(i => i.isActive && i.overdueDays === 0 && i.nextDate).sort(sortFn);
        const inactive = allItems.filter(i => !i.isActive).sort(sortFn);

        return { overdueItems: overdue, upcomingItems: upcoming, inactiveItems: inactive };
    }, [recurring, loans, filter, sortBy]);

    // ── Monthly summary ──────────────────────────────────────────────────────

    const monthlySummary = useMemo(() => {
        let recTotal = 0;
        let loanTotal = 0;

        recurring.forEach(r => {
            if (!r.is_active || r.type === 'income') return;
            if (r.frequency === 'monthly') recTotal += r.amount;
            else if (r.frequency === 'weekly') recTotal += r.amount * 4.33;
            else if (r.frequency === 'daily') recTotal += r.amount * getDaysInMonth(calMonth);
            else if (r.frequency === 'yearly') recTotal += r.amount / 12;
        });

        loans.forEach(l => {
            if (!l.is_active) return;
            loanTotal += l.monthly_payment;
        });

        const cur = recurring[0]?.currency ?? loans[0]?.currency ?? 'EUR';
        return { recTotal, loanTotal, total: recTotal + loanTotal, currency: cur };
    }, [recurring, loans, calMonth]);

    // ── Render ───────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <View style={{ flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color="#3b82f6" size="large" />
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
            {/* Header */}
            <View style={{ paddingTop: 60, paddingBottom: 12, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <TouchableOpacity onPress={() => router.back()}>
                    <ArrowLeft color={colors.textPrimary} size={22} />
                </TouchableOpacity>
                <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: '800', flex: 1 }}>{t('payments.title')}</Text>
                <TouchableOpacity onPress={() => router.push('/(app)/recurring/index' as any)}>
                    <Plus color={colors.textPrimary} size={22} />
                </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

                {/* ── Calendar ──────────────────────────────────────────── */}
                <View style={{ marginHorizontal: 16, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
                    {/* Month nav */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <TouchableOpacity onPress={() => setCalMonth(subMonths(calMonth, 1))} style={{ padding: 6 }}>
                            <ChevronLeft color={colors.textSecondary} size={20} />
                        </TouchableOpacity>
                        <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700' }}>
                            {format(calMonth, 'LLLL yyyy', { locale: ru }).replace(/^./, c => c.toUpperCase())}
                        </Text>
                        <TouchableOpacity onPress={() => setCalMonth(addMonths(calMonth, 1))} style={{ padding: 6 }}>
                            <ChevronRight color={colors.textSecondary} size={20} />
                        </TouchableOpacity>
                    </View>

                    {/* Weekday headers */}
                    <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                        {(t('payments.weekdays', { returnObjects: true }) as string[]).map((d, idx) => (
                            <View key={idx} style={{ flex: 1, alignItems: 'center' }}>
                                <Text style={{ color: colors.textDisabled, fontSize: 11, fontWeight: '600' }}>{d}</Text>
                            </View>
                        ))}
                    </View>

                    {/* Days grid */}
                    {(() => {
                        const rows: React.JSX.Element[] = [];
                        let cells: React.JSX.Element[] = [];
                        const year = calMonth.getFullYear();
                        const month = calMonth.getMonth();

                        // Empty cells for days before month start
                        for (let i = 0; i < firstDayOfWeek; i++) {
                            cells.push(<View key={`e${i}`} style={{ flex: 1, aspectRatio: 1 }} />);
                        }

                        for (let day = 1; day <= daysInMonth; day++) {
                            const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            const info = paymentDates.get(dateKey);
                            const isToday = isSameDay(new Date(year, month, day), new Date());
                            const isSelected = selectedDate ? isSameDay(new Date(year, month, day), selectedDate) : false;

                            let bgColor = 'transparent';
                            let borderColor = 'transparent';

                            if (info) {
                                if (info.hasRecurring && info.hasLoan) {
                                    // Both — we'll render split
                                    bgColor = 'transparent';
                                } else if (info.hasLoan) {
                                    bgColor = 'rgba(255,107,107,0.2)';
                                    borderColor = 'rgba(255,107,107,0.4)';
                                } else {
                                    bgColor = 'rgba(124,111,255,0.2)';
                                    borderColor = 'rgba(124,111,255,0.4)';
                                }
                            }

                            if (isSelected) {
                                borderColor = colors.textPrimary;
                            }

                            cells.push(
                                <TouchableOpacity
                                    key={day}
                                    onPress={() => {
                                        const d = new Date(year, month, day);
                                        setSelectedDate(isSelected ? null : d);
                                    }}
                                    style={{ flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}
                                >
                                    {info?.hasRecurring && info?.hasLoan ? (
                                        // Split indicator
                                        <View style={{
                                            width: 32, height: 32, borderRadius: 10, overflow: 'hidden',
                                            borderWidth: isSelected ? 1.5 : 1, borderColor: isSelected ? colors.textPrimary : 'rgba(255,255,255,0.15)',
                                            flexDirection: 'row',
                                        }}>
                                            <View style={{ flex: 1, backgroundColor: 'rgba(124,111,255,0.25)', alignItems: 'center', justifyContent: 'center' }} />
                                            <View style={{ flex: 1, backgroundColor: 'rgba(255,107,107,0.25)', alignItems: 'center', justifyContent: 'center' }} />
                                            <Text style={{
                                                position: 'absolute', width: '100%', textAlign: 'center',
                                                lineHeight: 30, color: colors.textPrimary, fontSize: 13, fontWeight: isToday ? '800' : '500',
                                            }}>{day}</Text>
                                        </View>
                                    ) : (
                                        <View style={{
                                            width: 32, height: 32, borderRadius: 10,
                                            backgroundColor: bgColor,
                                            borderWidth: (isSelected || info) ? 1.5 : 0,
                                            borderColor: borderColor,
                                            alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <Text style={{
                                                color: isToday ? '#4FFFB0' : info ? colors.textPrimary : colors.textSecondary,
                                                fontSize: 13, fontWeight: isToday ? '800' : info ? '600' : '400',
                                            }}>{day}</Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            );

                            if ((firstDayOfWeek + day) % 7 === 0 || day === daysInMonth) {
                                // Fill remaining cells in last row
                                if (day === daysInMonth) {
                                    const remaining = 7 - cells.length % 7;
                                    if (remaining < 7) {
                                        for (let i = 0; i < remaining; i++) {
                                            cells.push(<View key={`t${i}`} style={{ flex: 1, aspectRatio: 1 }} />);
                                        }
                                    }
                                }
                                rows.push(
                                    <View key={`r${rows.length}`} style={{ flexDirection: 'row' }}>
                                        {cells}
                                    </View>
                                );
                                cells = [];
                            }
                        }
                        return rows;
                    })()}

                    {/* Legend */}
                    <View style={{ flexDirection: 'row', gap: 16, marginTop: 12, justifyContent: 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: 'rgba(124,111,255,0.4)' }} />
                            <Text style={{ color: colors.textMuted, fontSize: 11 }}>{t('payments.recurringLegend')}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: 'rgba(255,107,107,0.4)' }} />
                            <Text style={{ color: colors.textMuted, fontSize: 11 }}>{t('payments.loanLegend')}</Text>
                        </View>
                    </View>
                </View>

                {/* ── Selected date details ─────────────────────────────── */}
                {selectedDate && selectedDatePayments.length > 0 && (
                    <View style={{ marginHorizontal: 16, marginTop: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
                        <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700', marginBottom: 12 }}>
                            {format(selectedDate, 'd MMMM', { locale: ru })}
                        </Text>
                        {selectedDatePayments.map((p, i) => (
                            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.06)' }}>
                                <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: (p.type === 'loan' ? 'rgba(255,107,107,0.15)' : 'rgba(124,111,255,0.15)'), alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                                    {p.type === 'loan'
                                        ? <Landmark color="#FF6B6B" size={14} />
                                        : <Repeat2 color="#7C6FFF" size={14} />
                                    }
                                </View>
                                <Text style={{ flex: 1, color: colors.textPrimary, fontSize: 13, fontWeight: '500' }} numberOfLines={1}>{p.name}</Text>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={{ color: '#ef4444', fontSize: 13, fontWeight: '700' }}>{formatAmount(p.amount, p.currency)}</Text>
                                    <Text style={{ color: colors.textDisabled, fontSize: 10 }}>{p.type === 'loan' ? t('payments.loanType') : t('payments.recurringType')}</Text>
                                </View>
                            </View>
                        ))}
                        <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', marginTop: 8, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t('payments.total')}</Text>
                            <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '800' }}>
                                {formatAmount(selectedDatePayments.reduce((s, p) => s + p.amount, 0), selectedDatePayments[0]?.currency ?? 'EUR')}
                            </Text>
                        </View>
                    </View>
                )}

                {/* ── Filter tabs + Sort ────────────────────────────────── */}
                <View style={{ flexDirection: 'row', marginHorizontal: 16, marginTop: 20, gap: 8, marginBottom: 12, alignItems: 'center' }}>
                    {([
                        { id: 'all' as FilterTab, label: t('payments.filterAll') },
                        { id: 'recurring' as FilterTab, label: t('payments.filterRecurring') },
                        { id: 'loans' as FilterTab, label: t('payments.filterLoans') },
                    ]).map(tab => (
                        <TouchableOpacity
                            key={tab.id}
                            onPress={() => setFilter(tab.id)}
                            style={{
                                paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
                                backgroundColor: filter === tab.id ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)',
                                borderWidth: 1.5,
                                borderColor: filter === tab.id ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)',
                            }}
                        >
                            <Text style={{ color: filter === tab.id ? colors.textPrimary : colors.textMuted, fontSize: 13, fontWeight: '600' }}>{tab.label}</Text>
                        </TouchableOpacity>
                    ))}
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity
                        onPress={() => { setPendingSort(sortBy); setShowSortSheet(true); }}
                        activeOpacity={0.7}
                        style={{
                            flexDirection: 'row', alignItems: 'center', gap: 4,
                            paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10,
                            backgroundColor: sortBy !== 'date' ? 'rgba(124,111,255,0.15)' : 'rgba(255,255,255,0.03)',
                            borderWidth: 1.5,
                            borderColor: sortBy !== 'date' ? 'rgba(124,111,255,0.4)' : 'rgba(255,255,255,0.06)',
                        }}
                    >
                        <ArrowUpDown color={sortBy !== 'date' ? '#7C6FFF' : colors.textMuted} size={14} />
                        <Text style={{ color: sortBy !== 'date' ? '#c4b5fd' : colors.textMuted, fontSize: 12, fontWeight: '600' }}>
                            {t(SORT_LABEL_KEYS[sortBy])}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* ── Grouped list ─────────────────────────────────────── */}

                {/* Overdue */}
                {overdueItems.length > 0 && (
                    <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
                        <View style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 8 }}>
                            <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                                {t('payments.attentionNeeded')}
                            </Text>
                        </View>
                        {overdueItems.map(item => (
                            <TouchableOpacity key={`${item.source}-${item.id}`} onPress={() => openEditSheet(item)} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' }}>
                                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: item.source === 'loan' ? 'rgba(255,107,107,0.15)' : 'rgba(124,111,255,0.15)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                    {item.source === 'loan'
                                        ? <Landmark color="#FF6B6B" size={16} />
                                        : <Repeat2 color="#7C6FFF" size={16} />
                                    }
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{item.name}</Text>
                                    <Text style={{ color: '#ef4444', fontSize: 11, marginTop: 2 }}>
                                        {t('payments.overdueDay', { count: item.overdueDays })}
                                    </Text>
                                </View>
                                <Text style={{ color: '#ef4444', fontSize: 14, fontWeight: '700' }}>{formatAmount(item.amount, item.currency)}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {/* Upcoming */}
                {upcomingItems.length > 0 && (
                    <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
                        <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 8 }}>
                            <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                                {t('payments.upcoming')}
                            </Text>
                        </View>
                        {upcomingItems.map(item => (
                            <TouchableOpacity key={`${item.source}-${item.id}`} onPress={() => openEditSheet(item)} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' }}>
                                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: item.source === 'loan' ? 'rgba(255,107,107,0.15)' : 'rgba(124,111,255,0.15)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                    {item.source === 'loan'
                                        ? <Landmark color="#FF6B6B" size={16} />
                                        : <Repeat2 color="#7C6FFF" size={16} />
                                    }
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{item.name}</Text>
                                    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                                        {item.nextDate ? format(item.nextDate, 'd MMM', { locale: ru }) : ''}
                                    </Text>
                                </View>
                                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }}>{formatAmount(item.amount, item.currency)}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {/* Inactive */}
                {inactiveItems.length > 0 && (
                    <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
                        <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 8 }}>
                            <Text style={{ color: colors.textDisabled, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                                {t('payments.inactive')}
                            </Text>
                        </View>
                        {inactiveItems.map(item => (
                            <TouchableOpacity key={`${item.source}-${item.id}`} onPress={() => openEditSheet(item)} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)', opacity: 0.5 }}>
                                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                    {item.source === 'loan'
                                        ? <Landmark color={colors.textMuted} size={16} />
                                        : <Repeat2 color={colors.textMuted} size={16} />
                                    }
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{t('payments.paused', { name: item.name })}</Text>
                                </View>
                                <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: '700' }}>{formatAmount(item.amount, item.currency)}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {/* No items */}
                {overdueItems.length === 0 && upcomingItems.length === 0 && inactiveItems.length === 0 && (
                    <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                        <Repeat2 color={colors.borderLight} size={40} />
                        <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 12 }}>{t('payments.noPayments')}</Text>
                    </View>
                )}

                {/* ── Monthly summary ──────────────────────────────────── */}
                {monthlySummary.total > 0 && (
                    <View style={{ marginHorizontal: 16, marginTop: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
                        <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700', marginBottom: 14 }}>{t('payments.monthSummary')}</Text>
                        {[
                            { label: t('payments.recurringTotal'), value: monthlySummary.recTotal, color: '#7C6FFF' },
                            { label: t('payments.loansTotal'), value: monthlySummary.loanTotal, color: '#FF6B6B' },
                        ].filter(r => r.value > 0).map((row, i) => (
                            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.06)' }}>
                                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{row.label}</Text>
                                <Text style={{ color: row.color, fontSize: 14, fontWeight: '700' }}>{formatAmount(row.value, monthlySummary.currency)}</Text>
                            </View>
                        ))}
                        <View style={{ borderTopWidth: 1.5, borderTopColor: 'rgba(255,255,255,0.1)', marginTop: 8, paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }}>{t('payments.monthTotal')}</Text>
                            <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '800' }}>{formatAmount(monthlySummary.total, monthlySummary.currency)}</Text>
                        </View>
                    </View>
                )}
            </ScrollView>

            {/* ── Sort Bottom Sheet ────────────────────────────────────── */}
            <BaseBottomSheet visible={showSortSheet} onClose={() => setShowSortSheet(false)} scrollable={false}>
                <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700', marginBottom: 20 }}>{t('payments.sortTitle')}</Text>
                {([
                    { id: 'date' as SortBy, label: t('payments.sortDate') },
                    { id: 'amount_desc' as SortBy, label: t('payments.sortAmountDesc') },
                    { id: 'amount_asc' as SortBy, label: t('payments.sortAmountAsc') },
                    { id: 'name' as SortBy, label: t('payments.sortName') },
                    { id: 'type' as SortBy, label: t('payments.sortType') },
                ]).map(opt => (
                    <TouchableOpacity
                        key={opt.id}
                        onPress={() => setPendingSort(opt.id)}
                        activeOpacity={0.7}
                        style={{
                            flexDirection: 'row', alignItems: 'center', paddingVertical: 14,
                            borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
                        }}
                    >
                        <View style={{
                            width: 22, height: 22, borderRadius: 11, marginRight: 14,
                            borderWidth: 2,
                            borderColor: pendingSort === opt.id ? '#7C6FFF' : 'rgba(255,255,255,0.2)',
                            backgroundColor: pendingSort === opt.id ? '#7C6FFF' : 'transparent',
                            alignItems: 'center', justifyContent: 'center',
                        }}>
                            {pendingSort === opt.id && (
                                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textPrimary }} />
                            )}
                        </View>
                        <Text style={{
                            color: pendingSort === opt.id ? colors.textPrimary : colors.textSecondary,
                            fontSize: 15, fontWeight: pendingSort === opt.id ? '600' : '400',
                        }}>{opt.label}</Text>
                    </TouchableOpacity>
                ))}
                <TouchableOpacity
                    onPress={() => { setSortBy(pendingSort); setShowSortSheet(false); }}
                    activeOpacity={0.8}
                    style={{
                        backgroundColor: '#7C6FFF', borderRadius: 14,
                        paddingVertical: 16, alignItems: 'center', marginTop: 20,
                    }}
                >
                    <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700' }}>{t('common.apply')}</Text>
                </TouchableOpacity>
            </BaseBottomSheet>

            {/* ── Edit Payment Bottom Sheet ──────────────────────────── */}
            <BaseBottomSheet visible={!!editingPayment} onClose={() => setEditingPayment(null)} maxHeight="85%">
                {editingPayment && (
                    <View>
                        {/* Header */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                            <View style={{
                                width: 40, height: 40, borderRadius: 12,
                                backgroundColor: editingPayment.source === 'loan' ? 'rgba(255,107,107,0.15)' : 'rgba(124,111,255,0.15)',
                                alignItems: 'center', justifyContent: 'center', marginRight: 12,
                            }}>
                                {editingPayment.source === 'loan'
                                    ? <Landmark color="#FF6B6B" size={20} />
                                    : <Repeat2 color="#7C6FFF" size={20} />
                                }
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700' }} numberOfLines={1}>{editingPayment.name}</Text>
                                <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>
                                    {editingPayment.source === 'loan' ? t('payments.loanSource') : t('payments.recurringSource')} · {formatAmount(editingPayment.amount, editingPayment.currency)}
                                </Text>
                            </View>
                        </View>

                        {/* Date picker */}
                        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                            {t('payments.nextPaymentDate')}
                        </Text>
                        <TouchableOpacity
                            onPress={() => setShowDatePicker(true)}
                            style={{
                                backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12,
                                paddingVertical: 14, paddingHorizontal: 16, marginBottom: 4,
                                borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
                            }}
                        >
                            <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}>
                                {format(paymentDate, 'd MMMM yyyy', { locale: ru })}
                            </Text>
                        </TouchableOpacity>
                        {showDatePicker && (
                            <DateTimePicker
                                value={paymentDate}
                                mode="date"
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                themeVariant="dark"
                                onChange={(_, date) => {
                                    if (Platform.OS === 'android') setShowDatePicker(false);
                                    if (date) setPaymentDate(date);
                                }}
                            />
                        )}
                        {showDatePicker && Platform.OS === 'ios' && (
                            <TouchableOpacity onPress={() => setShowDatePicker(false)} style={{ alignSelf: 'flex-end', marginBottom: 8 }}>
                                <Text style={{ color: '#7C6FFF', fontSize: 14, fontWeight: '600' }}>{t('common.done')}</Text>
                            </TouchableOpacity>
                        )}

                        {/* Divider */}
                        <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 16 }} />

                        {/* Reminder section */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                            <Bell color="#7C6FFF" size={16} />
                            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: 8 }}>
                                {t('payments.reminder')}
                            </Text>
                        </View>

                        {/* Reminder type toggle */}
                        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                            {([
                                { id: 'days' as const, label: t('payments.reminderDaysBefore') },
                                { id: 'datetime' as const, label: t('payments.reminderExactDate') },
                            ]).map(opt => (
                                <TouchableOpacity
                                    key={opt.id}
                                    onPress={() => setReminderType(opt.id)}
                                    style={{
                                        flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                                        backgroundColor: reminderType === opt.id ? 'rgba(124,111,255,0.2)' : 'rgba(255,255,255,0.04)',
                                        borderWidth: 1.5,
                                        borderColor: reminderType === opt.id ? 'rgba(124,111,255,0.5)' : 'rgba(255,255,255,0.06)',
                                    }}
                                >
                                    <Text style={{
                                        color: reminderType === opt.id ? '#c4b5fd' : colors.textMuted,
                                        fontSize: 13, fontWeight: '600',
                                    }}>{opt.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Days selector */}
                        {reminderType === 'days' && (
                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                                {([1, 3, 7] as const).map(d => (
                                    <TouchableOpacity
                                        key={d}
                                        onPress={() => setReminderDays(d)}
                                        style={{
                                            flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
                                            backgroundColor: reminderDays === d ? 'rgba(124,111,255,0.15)' : 'rgba(255,255,255,0.04)',
                                            borderWidth: 1.5,
                                            borderColor: reminderDays === d ? '#7C6FFF' : 'rgba(255,255,255,0.06)',
                                        }}
                                    >
                                        <Text style={{
                                            color: reminderDays === d ? colors.textPrimary : colors.textMuted,
                                            fontSize: 15, fontWeight: '700',
                                        }}>{d}</Text>
                                        <Text style={{
                                            color: reminderDays === d ? colors.textSecondary : colors.textDisabled,
                                            fontSize: 11, marginTop: 2,
                                        }}>{t('recurring.dayN', { count: d }).replace(/\d+\s*/, '')}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}

                        {/* Datetime picker */}
                        {reminderType === 'datetime' && (
                            <>
                                <TouchableOpacity
                                    onPress={() => setShowTimePicker(true)}
                                    style={{
                                        backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12,
                                        paddingVertical: 14, paddingHorizontal: 16, marginBottom: 4,
                                        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
                                    }}
                                >
                                    <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}>
                                        {format(reminderDatetime, 'd MMM yyyy, HH:mm', { locale: ru })}
                                    </Text>
                                </TouchableOpacity>
                                {showTimePicker && (
                                    <DateTimePicker
                                        value={reminderDatetime}
                                        mode="datetime"
                                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                        themeVariant="dark"
                                        onChange={(_, date) => {
                                            if (Platform.OS === 'android') setShowTimePicker(false);
                                            if (date) setReminderDatetime(date);
                                        }}
                                    />
                                )}
                                {showTimePicker && Platform.OS === 'ios' && (
                                    <TouchableOpacity onPress={() => setShowTimePicker(false)} style={{ alignSelf: 'flex-end', marginBottom: 8 }}>
                                        <Text style={{ color: '#7C6FFF', fontSize: 14, fontWeight: '600' }}>{t('common.done')}</Text>
                                    </TouchableOpacity>
                                )}
                            </>
                        )}

                        {/* Save button */}
                        <TouchableOpacity
                            onPress={saveEditedPayment}
                            disabled={savingEdit}
                            activeOpacity={0.8}
                            style={{
                                backgroundColor: '#7C6FFF', borderRadius: 14,
                                paddingVertical: 16, alignItems: 'center', marginTop: 12,
                                opacity: savingEdit ? 0.5 : 1,
                            }}
                        >
                            <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700' }}>
                                {savingEdit ? t('common.saving') : t('common.save')}
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}
            </BaseBottomSheet>
        </View>
    );
}
