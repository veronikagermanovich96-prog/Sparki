/**
 * Analytics Screen – real Supabase data
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Circle, G, Rect, Svg, Text as SvgText } from 'react-native-svg';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { formatAmount } from '@/constants/currencies';
import { Account } from '@/types';
import {
    addDays,
    differenceInDays,
    endOfDay,
    endOfMonth,
    endOfWeek,
    format,
    startOfDay,
    startOfMonth,
    startOfWeek,
    subMonths,
} from 'date-fns';
import { ru } from 'date-fns/locale';

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = 'week' | 'month' | 'quarter' | 'year';
type AnalyticsTab = 'overview' | 'forecast' | 'savings';

interface BarPoint { label: string; income: number; expenses: number; }
interface CategoryItem { name: string; icon: string; amount: number; color: string; percent: number; }
interface BudgetItem { name: string; icon: string; limit: number; spent: number; }
interface GoalItem {
    id: string; name: string; icon: string; color: string;
    target: number; saved: number; currency: string; targetDate: string | null;
}
interface ForecastPoint { day: number; actual: number; forecast: number | null; }

interface OverviewData {
    income: number; expenses: number;
    prevIncome: number; prevExpenses: number;
    chart: BarPoint[];
    categories: CategoryItem[];
}
interface ForecastData {
    totalSpent: number; projectedExpenses: number;
    monthlyLimit: number; daysLeft: number; dailyBudget: number;
    points: ForecastPoint[]; budgets: BudgetItem[];
}
interface Bucket { label: string; start: Date; end: Date; }

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getDateRange(period: Period, now: Date) {
    switch (period) {
        case 'week': {
            const start = startOfWeek(now, { weekStartsOn: 1 });
            const end = endOfWeek(now, { weekStartsOn: 1 });
            const prevEnd = addDays(start, -1);
            const prevStart = startOfWeek(prevEnd, { weekStartsOn: 1 });
            return { start, end, prevStart, prevEnd };
        }
        case 'month': {
            const start = startOfMonth(now);
            const end = endOfMonth(now);
            const pm = subMonths(now, 1);
            return { start, end, prevStart: startOfMonth(pm), prevEnd: endOfMonth(pm) };
        }
        case 'quarter': {
            const start = startOfMonth(subMonths(now, 2));
            const end = endOfMonth(now);
            const prevEnd = addDays(start, -1);
            const prevStart = startOfMonth(subMonths(prevEnd, 2));
            return { start, end, prevStart, prevEnd };
        }
        case 'year': {
            const start = startOfMonth(subMonths(now, 11));
            const end = endOfMonth(now);
            const prevEnd = addDays(start, -1);
            const prevStart = startOfMonth(subMonths(prevEnd, 11));
            return { start, end, prevStart, prevEnd };
        }
    }
}

function getBarBuckets(period: Period, now: Date): Bucket[] {
    switch (period) {
        case 'week': {
            const ws = startOfWeek(now, { weekStartsOn: 1 });
            return Array.from({ length: 7 }, (_, i) => {
                const d = addDays(ws, i);
                const raw = format(d, 'EEEEEE', { locale: ru });
                return { label: raw.charAt(0).toUpperCase() + raw.slice(1), start: startOfDay(d), end: endOfDay(d) };
            });
        }
        case 'month': {
            const ms = startOfMonth(now);
            const me = endOfMonth(now);
            const buckets: Bucket[] = [];
            let cursor = ms;
            while (cursor <= me) {
                const rawEnd = addDays(cursor, 6);
                const bucketEnd = rawEnd > me ? me : rawEnd;
                buckets.push({ label: format(cursor, 'd'), start: startOfDay(cursor), end: endOfDay(bucketEnd) });
                cursor = addDays(bucketEnd, 1);
            }
            return buckets;
        }
        case 'quarter':
            return Array.from({ length: 3 }, (_, i) => {
                const d = subMonths(now, 2 - i);
                const raw = format(d, 'LLL', { locale: ru });
                return { label: raw.charAt(0).toUpperCase() + raw.slice(1), start: startOfMonth(d), end: endOfMonth(d) };
            });
        case 'year':
            // 6 bimonthly buckets covering the last 12 months
            return Array.from({ length: 6 }, (_, i) => {
                const d = subMonths(now, 11 - i * 2);
                const raw = format(d, 'LLL', { locale: ru });
                return {
                    label: raw.charAt(0).toUpperCase() + raw.slice(1),
                    start: startOfMonth(d),
                    end: endOfMonth(subMonths(now, 10 - i * 2)),
                };
            });
    }
}

function pct(a: number, b: number) {
    if (b === 0) return 0;
    return Math.round(((a - b) / b) * 100);
}

// ─── BarChart ─────────────────────────────────────────────────────────────────

function BarChart({ data }: { data: BarPoint[] }) {
    const { width } = Dimensions.get('window');
    const W = width - 48;
    const H = 120;
    const labelH = 18;
    const barsH = H - labelH;
    const maxVal = Math.max(...data.map(d => Math.max(d.income, d.expenses)), 1);
    const gap = 3;
    const groupW = W / data.length;

    return (
        <Svg width={W} height={H}>
            {data.map((d, i) => {
                const x = i * groupW;
                const hasI = d.income > 0;
                const hasE = d.expenses > 0;
                const both = hasI && hasE;
                const dualW = (groupW - gap * 3) / 2;
                const singleW = groupW - gap * 2;
                const iH = (d.income / maxVal) * barsH;
                const eH = (d.expenses / maxVal) * barsH;
                const iX = x + gap;
                const iW = both ? dualW : (hasI ? singleW : 0);
                const eX = both ? x + gap * 2 + dualW : x + gap;
                const eW = both ? dualW : (hasE ? singleW : 0);
                return (
                    <G key={i}>
                        {hasI && iH > 0 && <Rect x={iX} y={barsH - iH} width={iW} height={iH} fill="#4FFFB0" rx={2} />}
                        {hasE && eH > 0 && <Rect x={eX} y={barsH - eH} width={eW} height={eH} fill="#FF6B6B" rx={2} />}
                        <SvgText x={x + groupW / 2} y={H - 2} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.35)">
                            {d.label}
                        </SvgText>
                    </G>
                );
            })}
        </Svg>
    );
}

// ─── ForecastChart ────────────────────────────────────────────────────────────

function ForecastChart({ points, limit }: { points: ForecastPoint[]; limit: number }) {
    const { width } = Dimensions.get('window');
    const W = width - 48;
    const H = 110;
    const labelH = 18;
    const barsH = H - labelH;
    const maxVal = Math.max(limit * 1.05, ...points.map(p => p.actual), 1);
    const barW = (W / points.length) - 4;
    const limitY = limit > 0 ? barsH - (limit / maxVal) * barsH : -1;

    return (
        <Svg width={W} height={H}>
            {limit > 0 && (
                <>
                    <Rect x={0} y={limitY} width={W} height={0.5} fill="rgba(255,107,107,0.5)" />
                    <SvgText x={W - 4} y={limitY - 3} textAnchor="end" fontSize={8} fill="#FF6B6B">
                        Лимит
                    </SvgText>
                </>
            )}
            {points.map((p, i) => {
                const x = i * (W / points.length) + 2;
                const h = (p.actual / maxVal) * barsH;
                const isForecast = p.forecast !== null;
                const color = p.actual > limit && limit > 0 ? 'rgba(255,107,107,0.7)' : 'rgba(124,111,255,0.6)';
                return (
                    <G key={i}>
                        <Rect
                            x={x} y={barsH - h} width={barW} height={h}
                            fill={isForecast ? 'none' : color}
                            stroke={isForecast ? 'rgba(255,184,79,0.6)' : 'none'}
                            strokeWidth={isForecast ? 1.5 : 0}
                            strokeDasharray={isForecast ? [4, 2] : undefined}
                            rx={2}
                        />
                        <SvgText x={x + barW / 2} y={H - 2} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.3)">
                            {p.day}
                        </SvgText>
                    </G>
                );
            })}
        </Svg>
    );
}

// ─── DonutChart ───────────────────────────────────────────────────────────────

function DonutChart({ categories, active, onPress }: {
    categories: CategoryItem[];
    active: number | null;
    onPress: (i: number | null) => void;
}) {
    const cx = 70, cy = 70, r = 52, sw = 18;
    const C = 2 * Math.PI * r;
    const total = categories.reduce((s, c) => s + c.percent, 0) || 1;

    let cumulative = 0;
    const segs = categories.map(cat => {
        const dashLen = (cat.percent / total) * C;
        const offset = C - cumulative * (C / total);
        cumulative += cat.percent;
        return { ...cat, dashLen, offset };
    });

    const activeCat = active !== null ? categories[active] : null;

    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <View style={{ width: 140, height: 140 }}>
                <Svg width={140} height={140} viewBox="0 0 140 140">
                    <Circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={sw} />
                    {segs.map((seg, i) => (
                        <Circle key={i}
                            cx={cx} cy={cy} r={r}
                            fill="none"
                            stroke={seg.color}
                            strokeWidth={active === i ? sw + 4 : sw}
                            strokeDasharray={[seg.dashLen, C]}
                            strokeDashoffset={seg.offset}
                            strokeLinecap="round"
                            transform={`rotate(-90, ${cx}, ${cy})`}
                            onPress={() => onPress(active === i ? null : i)}
                        />
                    ))}
                </Svg>
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                    {activeCat ? (
                        <>
                            <Text style={{ fontSize: 20 }}>{activeCat.icon}</Text>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: activeCat.color }}>
                                {Math.round(activeCat.percent)}%
                            </Text>
                            <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', textAlign: 'center', maxWidth: 52 }}>
                                {activeCat.name}
                            </Text>
                        </>
                    ) : (
                        <>
                            <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>расходы</Text>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>по катег.</Text>
                        </>
                    )}
                </View>
            </View>
            <View style={{ flex: 1, gap: 8 }}>
                {categories.map((cat, i) => (
                    <TouchableOpacity key={i} onPress={() => onPress(active === i ? null : i)} activeOpacity={0.7}
                        style={{ opacity: active !== null && active !== i ? 0.35 : 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ fontSize: 12, width: 18 }}>{cat.icon}</Text>
                            <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                                    <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>{cat.name}</Text>
                                    <Text style={{ fontSize: 10, color: cat.color, fontWeight: '600' }}>{Math.round(cat.percent)}%</Text>
                                </View>
                                <View style={{ height: 2, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                    <View style={{ height: 2, width: `${Math.min(cat.percent, 100)}%`, backgroundColor: cat.color, borderRadius: 2 }} />
                                </View>
                            </View>
                        </View>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );
}

// ─── BudgetBar ────────────────────────────────────────────────────────────────

function BudgetBar({ item, currency }: { item: BudgetItem; currency: string }) {
    const ratio = item.spent / item.limit;
    const color = ratio > 1 ? '#FF6B6B' : ratio > 0.75 ? '#FFB84F' : '#4FFFB0';
    const over = item.spent > item.limit;
    return (
        <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 16 }}>{item.icon}</Text>
                    <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>{item.name}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 12, color, fontWeight: '700' }}>{formatAmount(item.spent, currency)}</Text>
                    <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>из {formatAmount(item.limit, currency)}</Text>
                </View>
            </View>
            <View style={{ height: 5, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
                <View style={{ height: 5, width: `${Math.min(ratio * 100, 100)}%`, backgroundColor: color, borderRadius: 3 }} />
            </View>
            {over && (
                <Text style={{ marginTop: 5, fontSize: 10, color: '#FF6B6B' }}>
                    ⚠ Превышен на {formatAmount(item.spent - item.limit, currency)}
                </Text>
            )}
        </View>
    );
}

// ─── GoalCard ─────────────────────────────────────────────────────────────────

function GoalCard({ goal }: { goal: GoalItem }) {
    const ratio = goal.target > 0 ? Math.min(goal.saved / goal.target, 1) : 0;
    const remaining = Math.max(goal.target - goal.saved, 0);
    const subtitle = goal.targetDate
        ? `Цель: ${formatAmount(goal.target, goal.currency)} · до ${format(new Date(goal.targetDate), 'd MMM yyyy', { locale: ru })}`
        : `Цель: ${formatAmount(goal.target, goal.currency)}`;

    return (
        <View style={{
            width: 220, flexShrink: 0,
            backgroundColor: '#161E35',
            borderWidth: 1, borderColor: 'rgba(124,111,255,0.2)',
            borderRadius: 18, padding: 18,
        }}>
            <Text style={{ fontSize: 28, marginBottom: 8 }}>{goal.icon}</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff', marginBottom: 2 }}>{goal.name}</Text>
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>{subtitle}</Text>
            <View style={{ height: 5, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 3, marginBottom: 8, overflow: 'hidden' }}>
                <View style={{ height: 5, width: `${Math.round(ratio * 100)}%`, backgroundColor: goal.color, borderRadius: 3 }} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#4FFFB0' }}>{formatAmount(goal.saved, goal.currency)}</Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{Math.round(ratio * 100)}%</Text>
            </View>
            {remaining > 0 && (
                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>
                    Осталось: {formatAmount(remaining, goal.currency)}
                </Text>
            )}
            <TouchableOpacity style={{
                paddingVertical: 8,
                backgroundColor: 'rgba(124,111,255,0.15)',
                borderWidth: 1, borderColor: 'rgba(124,111,255,0.3)',
                borderRadius: 10, alignItems: 'center',
            }}>
                <Text style={{ color: '#7C6FFF', fontSize: 12, fontWeight: '600' }}>+ Пополнить</Text>
            </TouchableOpacity>
        </View>
    );
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: object }) {
    return (
        <View style={[{
            backgroundColor: '#131929',
            borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
            borderRadius: 18, padding: 18, marginBottom: 12,
        }, style]}>
            {children}
        </View>
    );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
    return <ActivityIndicator color="rgba(255,255,255,0.4)" style={{ marginVertical: 24 }} />;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
    const [tab, setTab] = useState<AnalyticsTab>('overview');
    const [period, setPeriod] = useState<Period>('month');
    const [activeCategory, setActiveCategory] = useState<number | null>(null);

    const [householdId, setHouseholdId] = useState<string | null>(null);
    const [currency, setCurrency] = useState('EUR');

    const [loadingOverview, setLoadingOverview] = useState(false);
    const [loadingForecast, setLoadingForecast] = useState(false);
    const [loadingSavings, setLoadingSavings] = useState(false);

    const [overviewData, setOverviewData] = useState<OverviewData | null>(null);
    const [forecastData, setForecastData] = useState<ForecastData | null>(null);
    const [goalsState, setGoalsState] = useState<GoalItem[]>([]);

    // ── Add-goal modal ──────────────────────────────────────────────────────
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [showAddGoal, setShowAddGoal] = useState(false);
    const [goalName, setGoalName] = useState('');
    const [goalIcon, setGoalIcon] = useState('🎯');
    const [goalTarget, setGoalTarget] = useState('');
    const [goalDate, setGoalDate] = useState('');
    const [goalAccountId, setGoalAccountId] = useState('');
    const [goalColor, setGoalColor] = useState('#7C6FFF');
    const [savingGoal, setSavingGoal] = useState(false);

    // ── Load household ──────────────────────────────────────────────────────
    useFocusEffect(useCallback(() => {
        loadHousehold();
    }, []));

    async function loadHousehold() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: member } = await supabase
            .from('household_members')
            .select('household_id, households(base_currency)')
            .eq('user_id', user.id)
            .single();
        if (member) {
            setHouseholdId(member.household_id as string);
            const hh = member.households as unknown as { base_currency: string } | null;
            if (hh?.base_currency) setCurrency(hh.base_currency);
        }
    }

    // ── Fetch overview when period or household changes ─────────────────────
    useEffect(() => {
        if (!householdId) return;
        fetchOverview(householdId, period);
    }, [householdId, period]);

    // ── Fetch forecast, savings & accounts once when household loads ────────
    useEffect(() => {
        if (!householdId) return;
        fetchForecast(householdId);
        fetchSavings(householdId);
        fetchAccounts(householdId);
    }, [householdId]);

    // ── Overview ────────────────────────────────────────────────────────────
    async function fetchOverview(hid: string, p: Period) {
        setLoadingOverview(true);
        setActiveCategory(null);
        const now = new Date();
        const { start, end, prevStart, prevEnd } = getDateRange(p, now);

        type TxnRow = {
            amount: number; amount_base: number | null;
            type: string; date: string; category_id: string;
            category: { name: string; icon: string | null; color: string | null } | null;
        };

        const [{ data: txns }, { data: prevTxns }] = await Promise.all([
            supabase.from('transactions')
                .select('amount, amount_base, type, date, category_id, category:categories(name, icon, color)')
                .eq('household_id', hid)
                .in('type', ['income', 'expense'])
                .eq('is_deleted', false)
                .gte('date', format(start, 'yyyy-MM-dd'))
                .lte('date', format(end, 'yyyy-MM-dd')),
            supabase.from('transactions')
                .select('amount, amount_base, type')
                .eq('household_id', hid)
                .in('type', ['income', 'expense'])
                .eq('is_deleted', false)
                .gte('date', format(prevStart, 'yyyy-MM-dd'))
                .lte('date', format(prevEnd, 'yyyy-MM-dd')),
        ]);

        const rows = (txns ?? []) as unknown as TxnRow[];
        type PrevRow = Pick<TxnRow, 'amount' | 'amount_base' | 'type'>;
        const prevRows = (prevTxns ?? []) as PrevRow[];
        const getAmt = (t: Pick<TxnRow, 'amount' | 'amount_base'>) => t.amount_base ?? t.amount;

        let income = 0, expenses = 0;
        rows.forEach(t => { if (t.type === 'income') income += getAmt(t); else expenses += getAmt(t); });
        let prevIncome = 0, prevExpenses = 0;
        prevRows.forEach(t => { if (t.type === 'income') prevIncome += getAmt(t); else prevExpenses += getAmt(t); });

        // Bar chart buckets
        const buckets = getBarBuckets(p, now);
        const chart: BarPoint[] = buckets.map(bucket => {
            let bI = 0, bE = 0;
            rows.forEach(t => {
                const d = new Date(t.date);
                if (d >= bucket.start && d <= bucket.end) {
                    if (t.type === 'income') bI += getAmt(t); else bE += getAmt(t);
                }
            });
            return { label: bucket.label, income: bI, expenses: bE };
        });

        // Category breakdown
        const expRows = rows.filter(t => t.type === 'expense');
        const catMap: Record<string, { name: string; icon: string; color: string; total: number }> = {};
        expRows.forEach(t => {
            const id = t.category_id;
            if (!id) return;
            if (!catMap[id]) catMap[id] = {
                name: t.category?.name ?? 'Прочее',
                icon: t.category?.icon ?? '📦',
                color: t.category?.color ?? '#6b7280',
                total: 0,
            };
            catMap[id].total += getAmt(t);
        });

        const catArr = Object.values(catMap).sort((a, b) => b.total - a.total);
        const totalExp = catArr.reduce((s, c) => s + c.total, 0);
        const top = catArr.length > 6 ? catArr.slice(0, 5) : catArr;
        const rest = catArr.length > 6 ? catArr.slice(5) : [];
        const restTotal = rest.reduce((s, c) => s + c.total, 0);

        const categories: CategoryItem[] = [
            ...top.map(c => ({
                name: c.name, icon: c.icon, amount: c.total, color: c.color,
                percent: totalExp > 0 ? (c.total / totalExp) * 100 : 0,
            })),
            ...(rest.length > 0 ? [{
                name: 'Остальное', icon: '📦', amount: restTotal, color: '#6b7280',
                percent: totalExp > 0 ? (restTotal / totalExp) * 100 : 0,
            }] : []),
        ];

        setOverviewData({ income, expenses, prevIncome, prevExpenses, chart, categories });
        setLoadingOverview(false);
    }

    // ── Forecast ────────────────────────────────────────────────────────────
    async function fetchForecast(hid: string) {
        setLoadingForecast(true);
        const now = new Date();
        const monthStart = startOfMonth(now);
        const monthEnd = endOfMonth(now);
        const startStr = format(monthStart, 'yyyy-MM-dd');
        const endStr = format(monthEnd, 'yyyy-MM-dd');
        const todayDay = now.getDate();
        const daysInMonth = differenceInDays(monthEnd, monthStart) + 1;
        const daysLeft = daysInMonth - todayDay;

        // All expense transactions for current month (includes category_id for budget matching)
        const { data: txns } = await supabase
            .from('transactions')
            .select('amount, amount_base, date, category_id')
            .eq('household_id', hid)
            .eq('type', 'expense')
            .eq('is_deleted', false)
            .gte('date', startStr)
            .lte('date', endStr);

        const dailyTotals: Record<number, number> = {};
        const catSpend: Record<string, number> = {};
        txns?.forEach(t => {
            const d = new Date(t.date as string).getDate();
            const amt = (t.amount_base as number | null) ?? (t.amount as number);
            dailyTotals[d] = (dailyTotals[d] || 0) + amt;
            const catId = t.category_id as string;
            if (catId) catSpend[catId] = (catSpend[catId] || 0) + amt;
        });

        let cum = 0;
        const cumByDay: Record<number, number> = {};
        for (let d = 1; d <= todayDay; d++) {
            cum += dailyTotals[d] || 0;
            cumByDay[d] = cum;
        }

        const totalSpent = cum;
        const dailyAvg = todayDay > 0 ? totalSpent / todayDay : 0;
        const projectedExpenses = totalSpent + dailyAvg * daysLeft;

        // Chart checkpoints (~7 points through month)
        const step = Math.max(1, Math.floor(daysInMonth / 7));
        const checkpointSet = new Set<number>();
        for (let d = step; d <= daysInMonth; d += step) checkpointSet.add(d);
        checkpointSet.add(daysInMonth);
        const checkpoints = Array.from(checkpointSet).sort((a, b) => a - b);

        const points: ForecastPoint[] = checkpoints.map(d => {
            if (d <= todayDay) {
                return { day: d, actual: cumByDay[d] ?? cum, forecast: null };
            } else {
                const proj = totalSpent + dailyAvg * (d - todayDay);
                return { day: d, actual: proj, forecast: proj };
            }
        });

        // Budgets
        const { data: budgetsRaw } = await supabase
            .from('budgets')
            .select('category_id, amount, category:categories(name, icon, color)')
            .eq('household_id', hid)
            .eq('period', 'monthly');

        type BudgetRow = {
            category_id: string; amount: number;
            category: { name: string; icon: string | null; color: string | null } | null;
        };
        const budgets: BudgetItem[] = ((budgetsRaw ?? []) as unknown as BudgetRow[]).map(b => ({
            name: b.category?.name ?? 'Категория',
            icon: b.category?.icon ?? '📦',
            limit: b.amount,
            spent: catSpend[b.category_id] ?? 0,
        }));

        const monthlyLimit = budgets.reduce((s, b) => s + b.limit, 0);
        const remaining = monthlyLimit - totalSpent;
        const dailyBudget = daysLeft > 0 ? Math.max(0, remaining / daysLeft) : 0;

        setForecastData({ totalSpent, projectedExpenses, monthlyLimit, daysLeft, dailyBudget, points, budgets });
        setLoadingForecast(false);
    }

    // ── Savings ─────────────────────────────────────────────────────────────
    async function fetchSavings(hid: string) {
        setLoadingSavings(true);
        const { data: goalsRaw } = await supabase
            .from('savings_goals')
            .select('*')
            .eq('household_id', hid)
            .eq('is_active', true)
            .eq('is_archived', false)
            .order('created_at', { ascending: true });

        if (!goalsRaw?.length) { setGoalsState([]); setLoadingSavings(false); return; }

        const accountIds = [...new Set(goalsRaw.map(g => g.account_id as string))];
        const { data: accsRaw } = await supabase
            .from('accounts')
            .select('id, balance, currency')
            .in('id', accountIds)
            .eq('is_deleted', false);

        const accMap: Record<string, { balance: number; currency: string }> = {};
        accsRaw?.forEach(a => { accMap[a.id as string] = { balance: a.balance as number, currency: a.currency as string }; });

        setGoalsState(goalsRaw.map(g => {
            const acc = accMap[g.account_id as string];
            return {
                id: g.id as string,
                name: g.name as string,
                icon: (g.icon as string | null) ?? '🎯',
                color: (g.color as string | null) ?? '#7C6FFF',
                target: g.target_amount as number,
                saved: acc?.balance ?? 0,
                currency: (g.currency as string) || (acc?.currency ?? 'EUR'),
                targetDate: g.target_date as string | null,
            };
        }));
        setLoadingSavings(false);
    }

    // ── Accounts (for goal linking) ─────────────────────────────────────────
    async function fetchAccounts(hid: string) {
        const { data } = await supabase
            .from('accounts')
            .select('*')
            .eq('household_id', hid)
            .eq('is_deleted', false)
            .order('sort_order', { ascending: true, nullsFirst: true })
            .order('created_at', { ascending: true });
        setAccounts((data ?? []) as Account[]);
    }

    // ── Open add-goal modal (reset form + pre-select first account) ─────────
    function openAddGoalModal() {
        setGoalName('');
        setGoalIcon('🎯');
        setGoalTarget('');
        setGoalDate('');
        setGoalColor('#7C6FFF');
        setGoalAccountId(accounts[0]?.id ?? '');
        setShowAddGoal(true);
    }

    // ── Create savings goal ─────────────────────────────────────────────────
    async function createGoal() {
        if (!householdId || !goalName.trim() || !goalTarget.trim() || !goalAccountId) return;
        const targetAmt = parseFloat(goalTarget.replace(',', '.'));
        if (isNaN(targetAmt) || targetAmt <= 0) return;

        // Parse optional date as MM/YYYY → last day of that month
        let targetDate: string | null = null;
        const dateTrimmed = goalDate.trim();
        if (dateTrimmed) {
            const parts = dateTrimmed.split('/');
            if (parts.length === 2) {
                const m = parseInt(parts[0], 10);
                const y = parseInt(parts[1], 10);
                if (m >= 1 && m <= 12 && y > 2000) {
                    const lastDay = new Date(y, m, 0).getDate();
                    targetDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
                }
            }
        }

        setSavingGoal(true);
        const { error } = await supabase.from('savings_goals').insert({
            household_id: householdId,
            account_id: goalAccountId,
            name: goalName.trim(),
            icon: goalIcon,
            color: goalColor,
            target_amount: targetAmt,
            currency,
            target_date: targetDate,
            compounding: 'monthly',
            is_active: true,
            is_archived: false,
        });
        setSavingGoal(false);
        if (error) { console.error('createGoal error:', error.message); return; }
        setShowAddGoal(false);
        setGoalName(''); setGoalIcon('🎯'); setGoalTarget('');
        setGoalDate(''); setGoalAccountId(''); setGoalColor('#7C6FFF');
        fetchSavings(householdId);
    }

    // ── Derived ─────────────────────────────────────────────────────────────

    const incomeChange = overviewData ? pct(overviewData.income, overviewData.prevIncome) : 0;
    const expChange = overviewData ? pct(overviewData.expenses, overviewData.prevExpenses) : 0;
    const balance = overviewData ? overviewData.income - overviewData.expenses : 0;

    const PERIODS: { id: Period; label: string }[] = [
        { id: 'week', label: 'Неделя' },
        { id: 'month', label: 'Месяц' },
        { id: 'quarter', label: 'Квартал' },
        { id: 'year', label: 'Год' },
    ];
    const TABS: { id: AnalyticsTab; label: string }[] = [
        { id: 'overview', label: 'Обзор' },
        { id: 'forecast', label: 'Прогноз' },
        { id: 'savings', label: 'Накопления' },
    ];

    const currentMonthLabel = (() => {
        const raw = format(new Date(), 'LLLL yyyy', { locale: ru });
        return raw.charAt(0).toUpperCase() + raw.slice(1);
    })();

    // ── Render ──────────────────────────────────────────────────────────────
    return (
        <View style={{ flex: 1, backgroundColor: '#090D1A' }}>
            {/* Header */}
            <View style={{ paddingTop: 60, paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 24, fontWeight: '800', color: '#fff', flex: 1 }}>Аналитика</Text>
            </View>

            {/* Tab bar */}
            <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 16, marginBottom: 4 }}>
                {TABS.map(t => (
                    <TouchableOpacity key={t.id} onPress={() => setTab(t.id)} style={{
                        paddingHorizontal: 16, paddingVertical: 8, borderRadius: 30,
                        backgroundColor: tab === t.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                    }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: tab === t.id ? '#fff' : 'rgba(255,255,255,0.4)' }}>
                            {t.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

                {/* ══ OVERVIEW ══════════════════════════════════════════════ */}
                {tab === 'overview' && (
                    <>
                        {/* Period selector */}
                        <View style={{
                            flexDirection: 'row', gap: 4,
                            backgroundColor: 'rgba(255,255,255,0.04)',
                            borderRadius: 24, padding: 4, alignSelf: 'flex-start', marginBottom: 16,
                        }}>
                            {PERIODS.map(p => (
                                <TouchableOpacity key={p.id} onPress={() => setPeriod(p.id)} style={{
                                    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
                                    backgroundColor: period === p.id ? 'rgba(124,111,255,0.2)' : 'transparent',
                                }}>
                                    <Text style={{ fontSize: 12, fontWeight: '600', color: period === p.id ? '#7C6FFF' : 'rgba(255,255,255,0.4)' }}>
                                        {p.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {loadingOverview ? <Spinner /> : !overviewData ? null : (
                            <>
                                {/* Summary card */}
                                <Card>
                                    <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16 }}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Доходы</Text>
                                            <Text style={{ fontSize: 20, fontWeight: '800', color: '#4FFFB0' }}>
                                                +{formatAmount(overviewData.income, currency)}
                                            </Text>
                                            <Text style={{ fontSize: 10, color: incomeChange >= 0 ? '#4FFFB0' : '#FF6B6B', marginTop: 3 }}>
                                                {incomeChange >= 0 ? '↑' : '↓'} {Math.abs(incomeChange)}% vs прошлый
                                            </Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Расходы</Text>
                                            <Text style={{ fontSize: 20, fontWeight: '800', color: '#FF6B6B' }}>
                                                −{formatAmount(overviewData.expenses, currency)}
                                            </Text>
                                            <Text style={{ fontSize: 10, color: expChange <= 0 ? '#4FFFB0' : '#FF6B6B', marginTop: 3 }}>
                                                {expChange >= 0 ? '↑' : '↓'} {Math.abs(expChange)}% vs прошлый
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', paddingTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <View>
                                            <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Чистый баланс</Text>
                                            <Text style={{ fontSize: 24, fontWeight: '800', color: balance >= 0 ? '#fff' : '#FF6B6B' }}>
                                                {balance >= 0 ? '+' : '−'}{formatAmount(Math.abs(balance), currency)}
                                            </Text>
                                        </View>
                                        <View style={{
                                            width: 48, height: 48, borderRadius: 24,
                                            backgroundColor: balance >= 0 ? 'rgba(79,255,176,0.1)' : 'rgba(255,107,107,0.1)',
                                            borderWidth: 1.5,
                                            borderColor: balance >= 0 ? 'rgba(79,255,176,0.3)' : 'rgba(255,107,107,0.3)',
                                            alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <Text style={{ fontSize: 20 }}>{balance >= 0 ? '🟢' : '🔴'}</Text>
                                        </View>
                                    </View>
                                </Card>

                                {/* Bar chart */}
                                <Card>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Динамика</Text>
                                        <View style={{ flexDirection: 'row', gap: 12 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#4FFFB0' }} />
                                                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Доходы</Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#FF6B6B' }} />
                                                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Расходы</Text>
                                            </View>
                                        </View>
                                    </View>
                                    <BarChart data={overviewData.chart} />
                                </Card>

                                {/* Donut chart */}
                                {overviewData.categories.length > 0 && (
                                    <Card>
                                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 16 }}>Структура расходов</Text>
                                        <DonutChart categories={overviewData.categories} active={activeCategory} onPress={setActiveCategory} />
                                    </Card>
                                )}

                                {/* Top categories list */}
                                {overviewData.categories.length > 0 && (
                                    <Card>
                                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 4 }}>По категориям</Text>
                                        {overviewData.categories.slice(0, 5).map((cat, i, arr) => (
                                            <View key={i} style={{
                                                flexDirection: 'row', alignItems: 'center', gap: 12,
                                                paddingVertical: 11,
                                                borderBottomWidth: i < arr.length - 1 ? 1 : 0,
                                                borderBottomColor: 'rgba(255,255,255,0.04)',
                                            }}>
                                                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: cat.color + '15', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Text style={{ fontSize: 16 }}>{cat.icon}</Text>
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                                                        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>{cat.name}</Text>
                                                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{formatAmount(cat.amount, currency)}</Text>
                                                    </View>
                                                    <View style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
                                                        <View style={{ height: 3, width: `${Math.min(cat.percent, 100)}%`, backgroundColor: cat.color, borderRadius: 2 }} />
                                                    </View>
                                                </View>
                                                <Text style={{ fontSize: 11, color: cat.color, fontWeight: '700', minWidth: 30, textAlign: 'right' }}>
                                                    {Math.round(cat.percent)}%
                                                </Text>
                                            </View>
                                        ))}
                                    </Card>
                                )}

                                {/* Empty state */}
                                {overviewData.income === 0 && overviewData.expenses === 0 && (
                                    <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                                        <Text style={{ fontSize: 36, marginBottom: 12 }}>📊</Text>
                                        <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                                            Нет данных за выбранный период
                                        </Text>
                                    </View>
                                )}
                            </>
                        )}
                    </>
                )}

                {/* ══ FORECAST ══════════════════════════════════════════════ */}
                {tab === 'forecast' && (
                    <>
                        {loadingForecast ? <Spinner /> : !forecastData ? null : (
                            <>
                                {/* Forecast summary */}
                                <Card>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                                        <View>
                                            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                                Прогноз до конца месяца
                                            </Text>
                                            <Text style={{ fontSize: 28, fontWeight: '800', color: '#FFB84F' }}>
                                                {formatAmount(forecastData.projectedExpenses, currency)}
                                            </Text>
                                        </View>
                                        {forecastData.monthlyLimit > 0 && (
                                            <View style={{
                                                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
                                                backgroundColor: forecastData.projectedExpenses < forecastData.monthlyLimit ? 'rgba(79,255,176,0.1)' : 'rgba(255,107,107,0.1)',
                                                borderWidth: 1,
                                                borderColor: forecastData.projectedExpenses < forecastData.monthlyLimit ? 'rgba(79,255,176,0.3)' : 'rgba(255,107,107,0.3)',
                                            }}>
                                                <Text style={{ fontSize: 11, fontWeight: '600', color: forecastData.projectedExpenses < forecastData.monthlyLimit ? '#4FFFB0' : '#FF6B6B' }}>
                                                    {forecastData.projectedExpenses < forecastData.monthlyLimit ? '✓ В норме' : '⚠ Превышение'}
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                    <View style={{ flexDirection: 'row', gap: 10 }}>
                                        {[
                                            { label: 'Остаток дней', value: String(forecastData.daysLeft) },
                                            { label: 'Уже потрачено', value: formatAmount(forecastData.totalSpent, currency) },
                                            ...(forecastData.monthlyLimit > 0
                                                ? [{ label: 'Бюджет на день', value: formatAmount(forecastData.dailyBudget, currency) }]
                                                : []),
                                        ].map((item, i) => (
                                            <View key={i} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 10 }}>
                                                <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginBottom: 4, textTransform: 'uppercase' }}>{item.label}</Text>
                                                <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{item.value}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </Card>

                                {/* Fact vs forecast chart */}
                                <Card>
                                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 4 }}>Факт vs Прогноз</Text>
                                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 16 }}>{currentMonthLabel}</Text>
                                    <ForecastChart points={forecastData.points} limit={forecastData.monthlyLimit} />
                                    <View style={{ flexDirection: 'row', gap: 14, marginTop: 8 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <View style={{ width: 12, height: 8, borderRadius: 2, backgroundColor: 'rgba(124,111,255,0.6)' }} />
                                            <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Факт</Text>
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <View style={{ width: 12, height: 8, borderRadius: 2, borderWidth: 1.5, borderColor: 'rgba(255,184,79,0.6)', borderStyle: 'dashed' }} />
                                            <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Прогноз</Text>
                                        </View>
                                    </View>
                                </Card>

                                {/* Budget by category */}
                                {forecastData.budgets.length > 0 && (
                                    <Card>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                            <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Бюджет по категориям</Text>
                                        </View>
                                        {forecastData.budgets.map((item, i) => <BudgetBar key={i} item={item} currency={currency} />)}
                                    </Card>
                                )}

                                {/* Smart tip */}
                                <View style={{ backgroundColor: 'rgba(79,255,176,0.04)', borderWidth: 1, borderColor: 'rgba(79,255,176,0.1)', borderRadius: 14, padding: 14 }}>
                                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#4FFFB0', marginBottom: 6 }}>💡 Прогноз</Text>
                                    {forecastData.daysLeft === 0 ? (
                                        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 19 }}>
                                            Месяц завершён. Итог расходов: {formatAmount(forecastData.totalSpent, currency)}.
                                        </Text>
                                    ) : forecastData.monthlyLimit > 0 ? (
                                        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 19 }}>
                                            При текущем темпе к концу месяца расходы составят {formatAmount(forecastData.projectedExpenses, currency)}.
                                            {forecastData.dailyBudget > 0
                                                ? ` Дневной бюджет до конца месяца: ${formatAmount(forecastData.dailyBudget, currency)}.`
                                                : ''}
                                        </Text>
                                    ) : (
                                        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 19 }}>
                                            Потрачено за {new Date().getDate()} дней: {formatAmount(forecastData.totalSpent, currency)}.
                                            Прогноз до конца месяца: {formatAmount(forecastData.projectedExpenses, currency)}.
                                        </Text>
                                    )}
                                </View>
                            </>
                        )}
                    </>
                )}

                {/* ══ SAVINGS ═══════════════════════════════════════════════ */}
                {tab === 'savings' && (
                    <>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 12 }}>Мои цели</Text>

                        {loadingSavings ? <Spinner /> : (
                            <>
                                {goalsState.length > 0 ? (
                                    <ScrollView
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        contentContainerStyle={{ gap: 12, paddingRight: 8, marginBottom: 16 }}
                                    >
                                        {goalsState.map(goal => <GoalCard key={goal.id} goal={goal} />)}
                                    </ScrollView>
                                ) : (
                                    <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                                        <Text style={{ fontSize: 36, marginBottom: 12 }}>🎯</Text>
                                        <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                                            Нет активных целей накоплений
                                        </Text>
                                    </View>
                                )}

                                {/* Add new goal */}
                                <TouchableOpacity
                                    onPress={openAddGoalModal}
                                    style={{
                                        width: '100%', paddingVertical: 14,
                                        backgroundColor: 'rgba(79,255,176,0.08)',
                                        borderWidth: 1.5, borderColor: 'rgba(79,255,176,0.25)',
                                        borderStyle: 'dashed',
                                        borderRadius: 16, alignItems: 'center', marginBottom: 12,
                                    }}>
                                    <Text style={{ color: '#4FFFB0', fontSize: 14, fontWeight: '600' }}>+ Новая цель накоплений</Text>
                                </TouchableOpacity>

                                {/* Summary */}
                                {goalsState.length > 0 && (
                                    <Card>
                                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 14 }}>Сводка накоплений</Text>
                                        {[
                                            { label: 'Всего накоплено', value: formatAmount(goalsState.reduce((s, g) => s + g.saved, 0), currency), color: '#4FFFB0' },
                                            { label: 'Всего целей', value: formatAmount(goalsState.reduce((s, g) => s + g.target, 0), currency), color: 'rgba(255,255,255,0.5)' },
                                            { label: 'Осталось накопить', value: formatAmount(goalsState.reduce((s, g) => s + Math.max(g.target - g.saved, 0), 0), currency), color: '#7C6FFF' },
                                        ].map((item, i) => (
                                            <View key={i} style={{
                                                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                                                paddingVertical: 10,
                                                borderBottomWidth: i < 2 ? 1 : 0,
                                                borderBottomColor: 'rgba(255,255,255,0.05)',
                                            }}>
                                                <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>{item.label}</Text>
                                                <Text style={{ fontSize: 14, fontWeight: '700', color: item.color }}>{item.value}</Text>
                                            </View>
                                        ))}
                                    </Card>
                                )}

                                {/* Tip */}
                                <View style={{ backgroundColor: 'rgba(79,255,176,0.04)', borderWidth: 1, borderColor: 'rgba(79,255,176,0.1)', borderRadius: 14, padding: 14 }}>
                                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#4FFFB0', marginBottom: 6 }}>💡 Рекомендация</Text>
                                    <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 19 }}>
                                        {goalsState.length === 0
                                            ? 'Создайте первую цель накоплений, чтобы отслеживать прогресс и двигаться к финансовой свободе.'
                                            : `У вас ${goalsState.length} ${goalsState.length === 1 ? 'активная цель' : 'активных целей'}. Регулярные пополнения помогут достичь их быстрее.`}
                                    </Text>
                                </View>
                            </>
                        )}
                    </>
                )}
            </ScrollView>

            {/* ══ ADD GOAL MODAL ════════════════════════════════════════════ */}
            <Modal visible={showAddGoal} animationType="slide" transparent onRequestClose={() => setShowAddGoal(false)}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                    <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowAddGoal(false)} />
                    <View style={{ backgroundColor: '#111827', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36 }}>
                        {/* Handle */}
                        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 20 }} />
                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 20 }}>Новая цель накоплений</Text>

                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                            {/* Icon picker */}
                            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Иконка</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    {['🎯','🏖️','💻','🚗','🏠','🎓','✈️','📱','🎮','💪','🛡️','📈','🌍','🎁','💰','🎸','🏋️','🐶'].map(em => (
                                        <TouchableOpacity key={em} onPress={() => setGoalIcon(em)} style={{
                                            width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                                            backgroundColor: goalIcon === em ? 'rgba(124,111,255,0.25)' : 'rgba(255,255,255,0.05)',
                                            borderWidth: 1.5,
                                            borderColor: goalIcon === em ? '#7C6FFF' : 'transparent',
                                        }}>
                                            <Text style={{ fontSize: 22 }}>{em}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </ScrollView>

                            {/* Color picker */}
                            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Цвет</Text>
                            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                                {['#7C6FFF','#4FFFB0','#FFB84F','#FF6B6B','#4FC3FF','#F472B6','#34D399','#FB923C'].map(c => (
                                    <TouchableOpacity key={c} onPress={() => setGoalColor(c)} style={{
                                        width: 30, height: 30, borderRadius: 15,
                                        backgroundColor: c,
                                        borderWidth: goalColor === c ? 3 : 0,
                                        borderColor: '#fff',
                                    }} />
                                ))}
                            </View>

                            {/* Name */}
                            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Название</Text>
                            <TextInput
                                value={goalName}
                                onChangeText={setGoalName}
                                placeholder="Например, Отпуск в Испании"
                                placeholderTextColor="rgba(255,255,255,0.2)"
                                style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 14, color: '#fff', fontSize: 15, marginBottom: 16 }}
                            />

                            {/* Target amount */}
                            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Сумма цели</Text>
                            <TextInput
                                value={goalTarget}
                                onChangeText={setGoalTarget}
                                placeholder="0"
                                placeholderTextColor="rgba(255,255,255,0.2)"
                                keyboardType="decimal-pad"
                                style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 14, color: '#fff', fontSize: 15, marginBottom: 16 }}
                            />

                            {/* Target date */}
                            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                Дата цели <Text style={{ textTransform: 'none', color: 'rgba(255,255,255,0.2)' }}>(необяз., ММ/ГГГГ)</Text>
                            </Text>
                            <TextInput
                                value={goalDate}
                                onChangeText={setGoalDate}
                                placeholder="06/2026"
                                placeholderTextColor="rgba(255,255,255,0.2)"
                                keyboardType="numbers-and-punctuation"
                                style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 14, color: '#fff', fontSize: 15, marginBottom: 16 }}
                            />

                            {/* Account picker */}
                            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Счёт накоплений</Text>
                            {accounts.length === 0 ? (
                                <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
                                    <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Нет счетов. Создайте счёт в разделе «Счета».</Text>
                                </View>
                            ) : (
                                <View style={{ marginBottom: 20, gap: 8 }}>
                                    {accounts.map(acc => (
                                        <TouchableOpacity key={acc.id} onPress={() => setGoalAccountId(acc.id)} style={{
                                            flexDirection: 'row', alignItems: 'center', gap: 12,
                                            padding: 14, borderRadius: 14,
                                            backgroundColor: goalAccountId === acc.id ? 'rgba(124,111,255,0.15)' : 'rgba(255,255,255,0.04)',
                                            borderWidth: 1.5,
                                            borderColor: goalAccountId === acc.id ? '#7C6FFF' : 'transparent',
                                        }}>
                                            <View style={{
                                                width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                                                backgroundColor: (acc.color ?? '#3b82f6') + '20',
                                            }}>
                                                <Text style={{ fontSize: 18 }}>{acc.icon ?? '🏦'}</Text>
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>{acc.name}</Text>
                                                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{formatAmount(acc.balance, acc.currency)}</Text>
                                            </View>
                                            {goalAccountId === acc.id && (
                                                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#7C6FFF', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text>
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}

                            {/* Actions */}
                            <View style={{ flexDirection: 'row', gap: 12 }}>
                                <TouchableOpacity onPress={() => setShowAddGoal(false)} style={{
                                    flex: 1, paddingVertical: 14, borderRadius: 14,
                                    backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center',
                                }}>
                                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15, fontWeight: '600' }}>Отмена</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={createGoal}
                                    disabled={savingGoal || !goalName.trim() || !goalTarget.trim() || !goalAccountId}
                                    style={{
                                        flex: 2, paddingVertical: 14, borderRadius: 14,
                                        backgroundColor: (!goalName.trim() || !goalTarget.trim() || !goalAccountId) ? 'rgba(79,255,176,0.2)' : '#4FFFB0',
                                        alignItems: 'center',
                                    }}>
                                    {savingGoal
                                        ? <ActivityIndicator color="#000" />
                                        : <Text style={{ color: '#000', fontSize: 15, fontWeight: '700' }}>Создать цель</Text>
                                    }
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}
