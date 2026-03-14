import React, { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator, ScrollView, Text,
    TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
    addMonths, subMonths, format, parseISO,
    startOfMonth, endOfMonth, getDay, getDaysInMonth,
    isSameDay,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, ArrowLeft, Plus, Repeat2, Landmark } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { formatAmount } from '@/constants/currencies';

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

type PaymentItem = RecurringItem | LoanItem;
type FilterTab = 'all' | 'recurring' | 'loans';

const LOAN_TYPE_LABELS: Record<string, string> = {
    mortgage: 'Ипотека', auto: 'Автокредит', consumer: 'Потребительский', other: 'Другой',
};

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function PaymentsScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [recurring, setRecurring] = useState<RecurringItem[]>([]);
    const [loans, setLoans] = useState<LoanItem[]>([]);
    const [calMonth, setCalMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [filter, setFilter] = useState<FilterTab>('all');

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
            const totalMonths = Math.max(1, Math.round((new Date(l.end_date).getTime() - new Date(l.start_date).getTime()) / (30.44 * 86400000)));
            const rate = 0; // We'd need rate periods for accuracy, but recurring amount is the source of truth
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
    const monthEnd = endOfMonth(calMonth);
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
        const items: Array<{ name: string; amount: number; currency: string; type: 'recurring' | 'loan'; color: string }> = [];

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
                const typeLabel = l.loan_type === 'other' && l.custom_type_name ? l.custom_type_name : LOAN_TYPE_LABELS[l.loan_type] ?? '';
                items.push({ name: `${l.name} · ${typeLabel}`, amount: l.monthly_payment, currency: l.currency, type: 'loan', color: l.color });
            }
        });

        return items;
    }, [selectedDate, recurring, loans]);

    // ── Payment list (grouped) ───────────────────────────────────────────────

    const { overdueItems, upcomingItems, inactiveItems } = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const allItems: Array<{
            id: string; name: string; amount: number; currency: string;
            nextDate: Date | null; isActive: boolean; source: 'recurring' | 'loan';
            color: string; overdueDays: number;
        }> = [];

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
                const typeLabel = l.loan_type === 'other' && l.custom_type_name ? l.custom_type_name : LOAN_TYPE_LABELS[l.loan_type] ?? '';
                allItems.push({
                    id: l.id, name: `${l.name} · ${typeLabel}`, amount: l.monthly_payment, currency: l.currency,
                    nextDate: nd, isActive: l.is_active, source: 'loan',
                    color: l.color, overdueDays: diffDays > 0 ? diffDays : 0,
                });
            });
        }

        const overdue = allItems.filter(i => i.isActive && i.overdueDays > 0).sort((a, b) => b.overdueDays - a.overdueDays);
        const upcoming = allItems.filter(i => i.isActive && i.overdueDays === 0 && i.nextDate).sort((a, b) => (a.nextDate!.getTime() - b.nextDate!.getTime()));
        const inactive = allItems.filter(i => !i.isActive);

        return { overdueItems: overdue, upcomingItems: upcoming, inactiveItems: inactive };
    }, [recurring, loans, filter]);

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
            <View style={{ flex: 1, backgroundColor: '#030712', alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color="#3b82f6" size="large" />
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: '#030712' }}>
            {/* Header */}
            <View style={{ paddingTop: 60, paddingBottom: 12, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <TouchableOpacity onPress={() => router.back()}>
                    <ArrowLeft color="#fff" size={22} />
                </TouchableOpacity>
                <Text style={{ color: '#f9fafb', fontSize: 22, fontWeight: '800', flex: 1 }}>Платежи</Text>
                <TouchableOpacity onPress={() => router.push('/(app)/recurring/index' as any)}>
                    <Plus color="#fff" size={22} />
                </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

                {/* ── Calendar ──────────────────────────────────────────── */}
                <View style={{ marginHorizontal: 16, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
                    {/* Month nav */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <TouchableOpacity onPress={() => setCalMonth(subMonths(calMonth, 1))} style={{ padding: 6 }}>
                            <ChevronLeft color="rgba(255,255,255,0.5)" size={20} />
                        </TouchableOpacity>
                        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>
                            {format(calMonth, 'LLLL yyyy', { locale: ru }).replace(/^./, c => c.toUpperCase())}
                        </Text>
                        <TouchableOpacity onPress={() => setCalMonth(addMonths(calMonth, 1))} style={{ padding: 6 }}>
                            <ChevronRight color="rgba(255,255,255,0.5)" size={20} />
                        </TouchableOpacity>
                    </View>

                    {/* Weekday headers */}
                    <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                        {WEEKDAYS.map(d => (
                            <View key={d} style={{ flex: 1, alignItems: 'center' }}>
                                <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: '600' }}>{d}</Text>
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
                                borderColor = '#fff';
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
                                            borderWidth: isSelected ? 1.5 : 1, borderColor: isSelected ? '#fff' : 'rgba(255,255,255,0.15)',
                                            flexDirection: 'row',
                                        }}>
                                            <View style={{ flex: 1, backgroundColor: 'rgba(124,111,255,0.25)', alignItems: 'center', justifyContent: 'center' }} />
                                            <View style={{ flex: 1, backgroundColor: 'rgba(255,107,107,0.25)', alignItems: 'center', justifyContent: 'center' }} />
                                            <Text style={{
                                                position: 'absolute', width: '100%', textAlign: 'center',
                                                lineHeight: 30, color: '#fff', fontSize: 13, fontWeight: isToday ? '800' : '500',
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
                                                color: isToday ? '#4FFFB0' : info ? '#fff' : 'rgba(255,255,255,0.5)',
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
                            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Рекуррентный</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: 'rgba(255,107,107,0.4)' }} />
                            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Кредит</Text>
                        </View>
                    </View>
                </View>

                {/* ── Selected date details ─────────────────────────────── */}
                {selectedDate && selectedDatePayments.length > 0 && (
                    <View style={{ marginHorizontal: 16, marginTop: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
                        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 12 }}>
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
                                <Text style={{ flex: 1, color: '#fff', fontSize: 13, fontWeight: '500' }} numberOfLines={1}>{p.name}</Text>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={{ color: '#ef4444', fontSize: 13, fontWeight: '700' }}>{formatAmount(p.amount, p.currency)}</Text>
                                    <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>{p.type === 'loan' ? 'кредит' : 'рекуррентный'}</Text>
                                </View>
                            </View>
                        ))}
                        <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', marginTop: 8, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Итого:</Text>
                            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>
                                {formatAmount(selectedDatePayments.reduce((s, p) => s + p.amount, 0), selectedDatePayments[0]?.currency ?? 'EUR')}
                            </Text>
                        </View>
                    </View>
                )}

                {/* ── Filter tabs ──────────────────────────────────────── */}
                <View style={{ flexDirection: 'row', marginHorizontal: 16, marginTop: 20, gap: 8, marginBottom: 12 }}>
                    {([
                        { id: 'all' as FilterTab, label: 'Все' },
                        { id: 'recurring' as FilterTab, label: 'Рекуррентные' },
                        { id: 'loans' as FilterTab, label: 'Кредиты' },
                    ]).map(t => (
                        <TouchableOpacity
                            key={t.id}
                            onPress={() => setFilter(t.id)}
                            style={{
                                paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
                                backgroundColor: filter === t.id ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)',
                                borderWidth: 1.5,
                                borderColor: filter === t.id ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)',
                            }}
                        >
                            <Text style={{ color: filter === t.id ? '#fff' : 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '600' }}>{t.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* ── Grouped list ─────────────────────────────────────── */}

                {/* Overdue */}
                {overdueItems.length > 0 && (
                    <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
                        <View style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 8 }}>
                            <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                                Требуют внимания
                            </Text>
                        </View>
                        {overdueItems.map(item => (
                            <View key={`${item.source}-${item.id}`} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' }}>
                                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: item.source === 'loan' ? 'rgba(255,107,107,0.15)' : 'rgba(124,111,255,0.15)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                    {item.source === 'loan'
                                        ? <Landmark color="#FF6B6B" size={16} />
                                        : <Repeat2 color="#7C6FFF" size={16} />
                                    }
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{item.name}</Text>
                                    <Text style={{ color: '#ef4444', fontSize: 11, marginTop: 2 }}>
                                        просрочен {item.overdueDays} {item.overdueDays === 1 ? 'день' : item.overdueDays < 5 ? 'дня' : 'дней'}
                                    </Text>
                                </View>
                                <Text style={{ color: '#ef4444', fontSize: 14, fontWeight: '700' }}>{formatAmount(item.amount, item.currency)}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* Upcoming */}
                {upcomingItems.length > 0 && (
                    <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
                        <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 8 }}>
                            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                                Предстоящие
                            </Text>
                        </View>
                        {upcomingItems.map(item => (
                            <View key={`${item.source}-${item.id}`} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' }}>
                                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: item.source === 'loan' ? 'rgba(255,107,107,0.15)' : 'rgba(124,111,255,0.15)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                    {item.source === 'loan'
                                        ? <Landmark color="#FF6B6B" size={16} />
                                        : <Repeat2 color="#7C6FFF" size={16} />
                                    }
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{item.name}</Text>
                                    <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 2 }}>
                                        {item.nextDate ? format(item.nextDate, 'd MMM', { locale: ru }) : ''}
                                    </Text>
                                </View>
                                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{formatAmount(item.amount, item.currency)}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* Inactive */}
                {inactiveItems.length > 0 && (
                    <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
                        <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 8 }}>
                            <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                                Неактивные
                            </Text>
                        </View>
                        {inactiveItems.map(item => (
                            <View key={`${item.source}-${item.id}`} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)', opacity: 0.5 }}>
                                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                    {item.source === 'loan'
                                        ? <Landmark color="#6b7280" size={16} />
                                        : <Repeat2 color="#6b7280" size={16} />
                                    }
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{item.name} (пауза)</Text>
                                </View>
                                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: '700' }}>{formatAmount(item.amount, item.currency)}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* No items */}
                {overdueItems.length === 0 && upcomingItems.length === 0 && inactiveItems.length === 0 && (
                    <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                        <Repeat2 color="#374151" size={40} />
                        <Text style={{ color: '#6b7280', fontSize: 14, marginTop: 12 }}>Нет платежей</Text>
                    </View>
                )}

                {/* ── Monthly summary ──────────────────────────────────── */}
                {monthlySummary.total > 0 && (
                    <View style={{ marginHorizontal: 16, marginTop: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
                        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 14 }}>Итог месяца</Text>
                        {[
                            { label: 'Рекуррентные', value: monthlySummary.recTotal, color: '#7C6FFF' },
                            { label: 'Кредиты', value: monthlySummary.loanTotal, color: '#FF6B6B' },
                        ].filter(r => r.value > 0).map((row, i) => (
                            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.06)' }}>
                                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{row.label}</Text>
                                <Text style={{ color: row.color, fontSize: 14, fontWeight: '700' }}>{formatAmount(row.value, monthlySummary.currency)}</Text>
                            </View>
                        ))}
                        <View style={{ borderTopWidth: 1.5, borderTopColor: 'rgba(255,255,255,0.1)', marginTop: 8, paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Итого в этом месяце</Text>
                            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>{formatAmount(monthlySummary.total, monthlySummary.currency)}</Text>
                        </View>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}
