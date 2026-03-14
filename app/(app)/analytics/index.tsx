/**
 * Analytics Screen – real Supabase data
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {
    Activity, ArrowRightLeft, Award,
    Banknote, Bike, Bitcoin, BookOpen, Briefcase, Building2, Bus,
    Camera, Car, ChevronLeft, CircleDollarSign, Coffee, Coins, CreditCard,
    Droplets, Dumbbell, Film, Flag, Flame, Fuel, Gift, Globe, GraduationCap,
    Heart, Home, Landmark, Laptop, MapPin, Monitor, Music,
    Package, PawPrint, Pencil, Pill, Plane, Receipt, Scissors,
    ShoppingBag, ShoppingCart, Shirt, Sofa, Star,
    Tag, Train, TrendingDown, TrendingUp, Trophy, Tv, Utensils,
    Wallet, Wifi, Zap,
} from 'lucide-react-native';
import { Circle, G, Rect, Svg, Text as SvgText } from 'react-native-svg';
import { useFocusEffect, useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '@/lib/supabase';
import { formatAmount, CURRENCIES } from '@/constants/currencies';
import { Account } from '@/types';
import {
    addDays,
    addMonths,
    addWeeks,
    differenceInCalendarDays,
    differenceInDays,
    differenceInMonths,
    endOfDay,
    endOfMonth,
    endOfWeek,
    format,
    startOfDay,
    startOfMonth,
    startOfWeek,
    subDays,
    subMonths,
} from 'date-fns';
import { ru } from 'date-fns/locale';

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = 'day' | 'week' | 'month' | 'quarter' | 'year';
type ForecastPeriod = 'month' | 'quarter' | 'half' | 'year' | 'custom';
type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
type AnalyticsTab = 'overview' | 'forecast' | 'savings' | 'loans';
type LoanType = 'mortgage' | 'auto' | 'consumer' | 'other';
type PaymentType = 'annuity' | 'differentiated';

// ─── Icon map ────────────────────────────────────────────────────────────────

type IconComp = React.ComponentType<{ color: string; size: number }>;

const CAT_ICONS: Record<string, IconComp> = {
    ShoppingCart, Coffee, Utensils, ShoppingBag,
    Car, Bus, Bike, Train, Plane, Fuel,
    Home, Sofa, Zap, Wifi, Flame, Droplets,
    Heart, Dumbbell, Activity, Pill,
    Film, Music, Tv, Monitor, Trophy, Star,
    Shirt, Tag, Gift, Scissors,
    MapPin, Globe,
    BookOpen, GraduationCap,
    CreditCard, Wallet, Coins, Banknote, Landmark, Bitcoin, CircleDollarSign, TrendingUp, TrendingDown,
    Briefcase, Building2, Receipt, Package,
    PawPrint, Award, Flag, ArrowRightLeft,
    Camera, Pencil, Laptop,
};

function CategoryIcon({ iconName, color, size = 20 }: { iconName: string; color: string; size?: number }) {
    const Ic = CAT_ICONS[iconName];
    if (!Ic) return <Text style={{ fontSize: size }}>{iconName}</Text>;
    return <Ic color={color} size={size} />;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface BarPoint { label: string; income: number; expenses: number; }
interface CategoryItem { id: string; name: string; icon: string; amount: number; color: string; percent: number; }
interface BudgetItem { name: string; icon: string; limit: number; spent: number; }
interface GoalItem {
    id: string; name: string; icon: string; color: string;
    target: number; saved: number; currency: string; targetDate: string | null;
    accountId: string;
}

interface DepositDetail {
    name: string; icon: string; rate: number; interest: number; currency: string;
}
interface OverviewData {
    income: number; expenses: number;
    prevIncome: number; prevExpenses: number;
    depositInterest: number; prevDepositInterest: number;
    deposits: DepositDetail[];
    chart: BarPoint[];
    categories: CategoryItem[];
}
interface ForecastChartPoint {
    label: string;
    subLabel?: string;
    amount: number;
    recurring: number;
    isFact: boolean;
}
interface RecurringItem { name: string; amount: number; }
interface ForecastData {
    factSpend: number;
    projectedTotal: number;
    recurringTotal: number;
    daysLeft: number;
    daysPassed: number;
    periodStart: Date;
    periodEnd: Date;
    budgets: BudgetItem[];
    chart: ForecastChartPoint[];
    chartSubtitle: string;
    upcomingRecurring: RecurringItem[];
}
interface Bucket { label: string; start: Date; end: Date; }

interface RatePeriod { rate: number; from: Date; to: Date | null; }
interface DepositData {
    id: string;
    name: string;
    icon: string;
    color: string;
    amount: number;
    currency: string;
    capitalization: 'monthly' | 'yearly';
    startDate: Date;
    endDate: Date | null;
    ratePeriods: RatePeriod[];
    currentRate: number;
    projectedValue: number;
    interestEarned: number;
}
interface RatePeriodDraft { rate: string; fromDate: Date; toDate: Date | null; }

interface LoanData {
    id: string;
    name: string;
    icon: string;
    color: string;
    loanType: LoanType;
    customTypeName: string | null;
    totalAmount: number;
    paidAmount: number;
    currency: string;
    paymentType: PaymentType;
    startDate: Date;
    endDate: Date;
    paymentAccountId: string | null;
    sourceAccountId: string | null;
    recurringId: string | null;
    ratePeriods: RatePeriod[];
    currentRate: number;
    monthlyPayment: number;
}

interface ExtraTag {
    tagId: string;
    tagName: string;
    spent: number;
    comfortable: number;
    scaledComfortable: number;
    extra: number;
}

interface ExtraCategory {
    categoryId: string;
    name: string;
    icon: string;
    color: string;
    spent: number;
    comfortable: number;
    scaledComfortable: number;
    extra: number;
    tags: ExtraTag[];
}


// ─── Category colors ─────────────────────────────────────────────────────────

const CATEGORY_FALLBACK_COLORS: [string, string][] = [
    ['еда', '#FF6B6B'],
    ['продукт', '#FF6B6B'],
    ['транспорт', '#4ECDC4'],
    ['жиль', '#45B7D1'],
    ['аренд', '#45B7D1'],
    ['коммунал', '#0984E3'],
    ['развлеч', '#96CEB4'],
    ['здоров', '#FFEAA7'],
    ['одежд', '#DDA0DD'],
    ['образован', '#98D8C8'],
    ['подписк', '#74B9FF'],
    ['связ', '#A29BFE'],
    ['кафе', '#FD79A8'],
    ['ресторан', '#FD79A8'],
    ['красот', '#E17055'],
    ['спорт', '#00CEC9'],
    ['подарк', '#FF7675'],
    ['путешеств', '#55EFC4'],
    ['дет', '#FDCB6E'],
    ['животн', '#E84393'],
];

// Stable hex color from category id (react-native-svg needs hex, not hsl)
function hashColor(id: string): string {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
    const hue = Math.abs(h) % 360;
    const s = 0.65, l = 0.6;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
    const m = l - c / 2;
    let r1 = 0, g1 = 0, b1 = 0;
    if (hue < 60) { r1 = c; g1 = x; }
    else if (hue < 120) { r1 = x; g1 = c; }
    else if (hue < 180) { g1 = c; b1 = x; }
    else if (hue < 240) { g1 = x; b1 = c; }
    else if (hue < 300) { r1 = x; b1 = c; }
    else { r1 = c; b1 = x; }
    const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
}

function getCategoryColor(name: string, dbColor: string | null, id: string): string {
    if (dbColor) return dbColor;
    const lower = name.toLowerCase();
    for (const [key, color] of CATEGORY_FALLBACK_COLORS) {
        if (lower.includes(key)) return color;
    }
    return hashColor(id);
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getDateRange(period: Period, now: Date) {
    switch (period) {
        case 'day': {
            const start = startOfDay(now);
            const end = endOfDay(now);
            const prev = addDays(now, -1);
            return { start, end, prevStart: startOfDay(prev), prevEnd: endOfDay(prev) };
        }
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
        case 'day': {
            const ds = startOfDay(now);
            return Array.from({ length: 8 }, (_, i) => {
                const h = i * 3;
                const s = new Date(ds.getTime() + h * 3600000);
                const e = new Date(ds.getTime() + (h + 3) * 3600000 - 1);
                return { label: `${String(h).padStart(2, '0')}:00`, start: s, end: e };
            });
        }
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
            return Array.from({ length: 12 }, (_, i) => {
                const d = subMonths(now, 11 - i);
                const raw = format(d, 'LLL', { locale: ru });
                return {
                    label: raw.charAt(0).toUpperCase() + raw.slice(1) + '.',
                    start: startOfMonth(d),
                    end: endOfMonth(d),
                };
            });
    }
}

function pct(a: number, b: number) {
    if (b === 0) return 0;
    return Math.round(((a - b) / b) * 100);
}

function getPeriodInMonths(start: Date, end: Date): number {
    const days = differenceInCalendarDays(end, start) + 1;
    return days / 30.44; // average days per month
}

// ─── BarChart ─────────────────────────────────────────────────────────────────

function BarChart({ data, currency }: { data: BarPoint[]; currency: string }) {
    const [selected, setSelected] = useState<number | null>(null);
    const { width } = Dimensions.get('window');
    const W = width - 48;
    const tipH = 34;
    const H = 120 + tipH;
    const labelH = 18;
    const barsH = H - labelH - tipH;
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
                const isSelected = selected === i;
                return (
                    <G key={i}>
                        <Rect x={x} y={tipH} width={groupW} height={barsH} fill="transparent" onPress={() => setSelected(isSelected ? null : i)} />
                        {hasI && iH > 0 && <Rect x={iX} y={tipH + barsH - iH} width={iW} height={iH} fill="#4FFFB0" rx={2} opacity={selected !== null && !isSelected ? 0.3 : 1} />}
                        {hasE && eH > 0 && <Rect x={eX} y={tipH + barsH - eH} width={eW} height={eH} fill="#FF6B6B" rx={2} opacity={selected !== null && !isSelected ? 0.3 : 1} />}
                        <SvgText x={x + groupW / 2} y={H - 2} textAnchor="middle" fontSize={8} fill={isSelected ? '#fff' : 'rgba(255,255,255,0.35)'} fontWeight={isSelected ? '700' : '400'}>
                            {d.label}
                        </SvgText>
                    </G>
                );
            })}
            {selected !== null && (() => {
                const d = data[selected];
                const cx = selected * groupW + groupW / 2;
                const hasI = d.income > 0;
                const hasE = d.expenses > 0;
                const tipW = 100;
                const tx = Math.max(2, Math.min(cx - tipW / 2, W - tipW - 2));
                return (
                    <G>
                        <Rect x={tx} y={0} width={tipW} height={tipH - 4} rx={8} fill="#1E2640" stroke="rgba(124,111,255,0.3)" strokeWidth={1} />
                        {hasI && (
                            <SvgText x={tx + tipW / 2} y={hasE ? 13 : 19} textAnchor="middle" fontSize={10} fontWeight="700" fill="#4FFFB0">
                                +{formatAmount(d.income, currency)}
                            </SvgText>
                        )}
                        {hasE && (
                            <SvgText x={tx + tipW / 2} y={hasI ? 26 : 19} textAnchor="middle" fontSize={10} fontWeight="700" fill="#FF6B6B">
                                −{formatAmount(d.expenses, currency)}
                            </SvgText>
                        )}
                    </G>
                );
            })()}
        </Svg>
    );
}

// ─── ForecastBarChart ─────────────────────────────────────────────────────────

function ForecastBarChart({ data, currency: cur }: { data: ForecastChartPoint[]; currency: string }) {
    const { width } = Dimensions.get('window');
    const W = width - 52;
    const tipH = 36;
    const chartH = 120;
    const hasSubLabels = data.some(p => p.subLabel);
    const labelH = hasSubLabels ? 28 : 20;
    const H = tipH + chartH + labelH;
    const maxVal = Math.max(...data.map(p => p.amount), 1);

    const [selected, setSelected] = useState<number | null>(null);

    // For month view (many days), show every ~4th label
    const showEveryN = data.length > 15 ? Math.ceil(data.length / 8) : 1;
    const gap = 2;
    const barW = Math.max(2, (W - gap * data.length) / data.length);

    return (
        <Svg width={W} height={H}>
            {data.map((p, i) => {
                const x = i * (barW + gap);
                const h = Math.max(1, (p.amount / maxVal) * chartH);
                const barY = tipH + chartH - h;
                const isSelected = selected === i;
                const rx = barW > 4 ? 2 : 1;

                return (
                    <G key={i}>
                        {/* Touch target */}
                        <Rect x={x} y={tipH} width={barW} height={chartH + labelH}
                            fill="transparent" onPress={() => setSelected(isSelected ? null : i)} />
                        {/* Bar — fact: solid fill, forecast: transparent + dashed border */}
                        {p.isFact ? (
                            <Rect x={x} y={barY} width={barW} height={h}
                                fill="#7C6FFF" rx={rx}
                                opacity={selected !== null && !isSelected ? 0.3 : 1}
                            />
                        ) : (
                            <Rect x={x} y={barY} width={barW} height={h}
                                fill="rgba(124,111,255,0.15)"
                                stroke="rgba(124,111,255,0.5)"
                                strokeWidth={1.5}
                                strokeDasharray="4 3"
                                rx={rx}
                                opacity={selected !== null && !isSelected ? 0.3 : 1}
                            />
                        )}
                        {/* X label */}
                        {(i % showEveryN === 0 || i === data.length - 1) && (
                            <>
                                <SvgText x={x + barW / 2} y={tipH + chartH + 12} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.3)">
                                    {p.label}
                                </SvgText>
                                {p.subLabel && (
                                    <SvgText x={x + barW / 2} y={tipH + chartH + 22} textAnchor="middle" fontSize={7} fill="rgba(255,255,255,0.2)">
                                        {p.subLabel}
                                    </SvgText>
                                )}
                            </>
                        )}
                        {/* Tooltip */}
                        {isSelected && (() => {
                            const txt = `${p.isFact ? 'Факт' : 'Прогноз'}: ${formatAmount(p.amount, cur)}`;
                            const tw = Math.min(txt.length * 5.5 + 16, W - 8);
                            let tx = x + barW / 2 - tw / 2;
                            if (tx < 0) tx = 0;
                            if (tx + tw > W) tx = W - tw;
                            return (
                                <G>
                                    <Rect x={tx} y={0} width={tw} height={tipH - 4} rx={6} fill="#1e293b" />
                                    <SvgText x={tx + tw / 2} y={tipH / 2 + 1} textAnchor="middle"
                                        fontSize={9} fontWeight="600" fill={p.isFact ? '#7C6FFF' : '#FFB84F'}>
                                        {txt}
                                    </SvgText>
                                </G>
                            );
                        })()}
                    </G>
                );
            })}
        </Svg>
    );
}

// ─── DonutChart ───────────────────────────────────────────────────────────────

function DonutChart({ categories, totalAmount, currency: cur, active, onPress, visibleLegend, onMorePress, hiddenCount }: {
    categories: CategoryItem[];
    totalAmount: number;
    currency: string;
    active: number | null;
    onPress: (i: number | null) => void;
    visibleLegend: CategoryItem[];
    onMorePress?: () => void;
    hiddenCount: number;
}) {
    const SIZE = 120;
    const cx = SIZE / 2, cy = SIZE / 2, r = 38, sw = 14;
    const C = 2 * Math.PI * r;
    const total = categories.reduce((s, c) => s + c.percent, 0) || 1;

    let cumBefore = 0;
    const segs = categories.map(cat => {
        const frac = cat.percent / total;
        const dashLen = frac * C;
        const gapLen = C - dashLen;
        const dashOffset = -(cumBefore / total) * C;
        cumBefore += cat.percent;
        return { ...cat, dashLen, gapLen, dashOffset };
    });

    const activeCat = active !== null ? categories[active] : null;

    return (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {/* Donut — ~45% */}
            <View style={{ width: SIZE, height: SIZE }}>
                <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
                    <Circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={sw} />
                    {segs.map((seg, i) => (
                        <Circle key={i}
                            cx={cx} cy={cy} r={r}
                            fill="none"
                            stroke={seg.color}
                            strokeWidth={active === i ? sw + 4 : sw}
                            strokeDasharray={`${seg.dashLen} ${seg.gapLen}`}
                            strokeDashoffset={seg.dashOffset}
                            opacity={active !== null && active !== i ? 0.3 : 1}
                            transform={`rotate(-90, ${cx}, ${cy})`}
                            onPress={() => onPress(active === i ? null : i)}
                        />
                    ))}
                </Svg>
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                    {activeCat ? (
                        <>
                            <CategoryIcon iconName={activeCat.icon} color={activeCat.color} size={20} />
                            <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff', marginTop: 2 }}>
                                {formatAmount(activeCat.amount, cur)}
                            </Text>
                            <Text style={{ fontSize: 10, fontWeight: '600', color: activeCat.color }}>
                                {Math.round(activeCat.percent)}%
                            </Text>
                            <Text style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)', textAlign: 'center', maxWidth: 60 }} numberOfLines={1}>
                                {activeCat.name}
                            </Text>
                        </>
                    ) : (
                        <>
                            <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>
                                {formatAmount(totalAmount, cur)}
                            </Text>
                            <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>расходы</Text>
                        </>
                    )}
                </View>
            </View>

            {/* Legend — ~55% */}
            <View style={{ flex: 1, paddingLeft: 8, gap: 8 }}>
                {visibleLegend.map((cat) => {
                    const catIdx = categories.findIndex(c => c.id === cat.id);
                    const isActive = active === catIdx;
                    const dimmed = active !== null && !isActive;
                    return (
                        <TouchableOpacity key={cat.id} activeOpacity={0.7}
                            onPress={() => onPress(isActive ? null : catIdx)}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, opacity: dimmed ? 0.35 : 1 }}>
                            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: cat.color + '26', alignItems: 'center', justifyContent: 'center' }}>
                                <CategoryIcon iconName={cat.icon} color={cat.color} size={14} />
                            </View>
                            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', flex: 1 }} numberOfLines={1}>{cat.name}</Text>
                            <Text style={{ fontSize: 11, color: cat.color, fontWeight: '600' }}>{Math.round(cat.percent)}%</Text>
                            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{formatAmount(cat.amount, cur)}</Text>
                        </TouchableOpacity>
                    );
                })}
                {hiddenCount > 0 && onMorePress && (
                    <TouchableOpacity onPress={onMorePress} style={{ marginTop: 4 }}>
                        <Text style={{ fontSize: 12, color: '#7C6FFF', fontWeight: '600' }}>+ ещё {hiddenCount} →</Text>
                    </TouchableOpacity>
                )}
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

// ─── Deposit projection with variable rates ─────────────────────────────────

function calcVariableRateDeposit(
    principal: number,
    ratePeriods: RatePeriod[],
    capitalization: 'monthly' | 'yearly',
    targetDate: Date,
): { projectedValue: number; interestEarned: number } {
    const now = new Date();
    if (targetDate <= now || ratePeriods.length === 0) {
        return { projectedValue: principal, interestEarned: 0 };
    }

    let balance = principal;
    const periods = ratePeriods
        .map(r => ({ rate: r.rate, from: r.from, to: r.to ?? targetDate }))
        .sort((a, b) => a.from.getTime() - b.from.getTime());

    for (const period of periods) {
        const start = period.from < now ? now : period.from;
        const end = period.to > targetDate ? targetDate : period.to;
        if (start >= end) continue;

        const months = differenceInMonths(end, start);
        if (months <= 0) continue;

        if (capitalization === 'monthly') {
            const ratePerMonth = period.rate / 100 / 12;
            balance = balance * Math.pow(1 + ratePerMonth, months);
        } else {
            const years = months / 12;
            balance = balance * Math.pow(1 + period.rate / 100, years);
        }
    }

    return { projectedValue: Math.round(balance * 100) / 100, interestEarned: Math.round((balance - principal) * 100) / 100 };
}

// ─── Deposit accrued interest (from start to today) ─────────────────────────

function calcAccruedInterest(
    principal: number,
    ratePeriods: RatePeriod[],
    capitalization: 'monthly' | 'yearly',
    startDate: Date,
): number {
    const today = new Date();
    if (startDate >= today || ratePeriods.length === 0) return 0;

    let balance = principal;
    const periods = ratePeriods
        .map(r => ({ rate: r.rate, from: r.from, to: r.to ?? today }))
        .sort((a, b) => a.from.getTime() - b.from.getTime());

    for (const period of periods) {
        const start = period.from < startDate ? startDate : period.from;
        const end = period.to > today ? today : period.to;
        if (start >= end) continue;

        const months = differenceInMonths(end, start);
        if (months <= 0) continue;

        if (capitalization === 'monthly') {
            const ratePerMonth = period.rate / 100 / 12;
            balance = balance * Math.pow(1 + ratePerMonth, months);
        } else {
            const years = months / 12;
            balance = balance * Math.pow(1 + period.rate / 100, years);
        }
    }

    return Math.round((balance - principal) * 100) / 100;
}

// ─── GoalCard ─────────────────────────────────────────────────────────────────

function GoalCard({ goal, onPress, onEdit }: { goal: GoalItem; onPress: () => void; onEdit: () => void }) {
    const ratio     = goal.target > 0 ? Math.min(goal.saved / goal.target, 1) : 0;
    const remaining = Math.max(goal.target - goal.saved, 0);
    const pct       = Math.round(ratio * 100);
    const subtitle  = goal.targetDate
        ? `до ${format(new Date(goal.targetDate), 'd MMM yyyy', { locale: ru })}`
        : `Цель: ${formatAmount(goal.target, goal.currency)}`;

    // Mini 20-dot preview (2 rows × 10)
    const miniDots = Array.from({ length: 20 }).map((_, i) => ({
        filled: i < Math.round(ratio * 20),
    }));

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.75}
            style={{
                width: 200, flexShrink: 0,
                backgroundColor: '#161E35',
                borderWidth: 1, borderColor: 'rgba(124,111,255,0.2)',
                borderRadius: 18, padding: 16,
            }}
        >
            {/* Icon + name + edit */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Text style={{ fontSize: 22 }}>{goal.icon}</Text>
                <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }} numberOfLines={1}>{goal.name}</Text>
                    <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{subtitle}</Text>
                </View>
                <TouchableOpacity onPress={onEdit} hitSlop={8} style={{
                    width: 26, height: 26, borderRadius: 8,
                    backgroundColor: 'rgba(124,111,255,0.12)',
                    alignItems: 'center', justifyContent: 'center',
                }}>
                    <Pencil color="#7C6FFF" size={13} />
                </TouchableOpacity>
            </View>

            {/* Mini Icon Array dots */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginBottom: 10 }}>
                {miniDots.map((d, i) => (
                    <View key={i} style={{
                        width: 9, height: 9, borderRadius: 5,
                        backgroundColor: d.filled ? '#1E5128' : 'transparent',
                        borderWidth: d.filled ? 0 : 1,
                        borderColor: '#2d3748',
                    }} />
                ))}
            </View>

            {/* Amount + pct */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#4FFFB0' }}>
                    {formatAmount(goal.saved, goal.currency)}
                </Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{pct}%</Text>
            </View>

            {remaining > 0 && (
                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
                    Осталось: {formatAmount(remaining, goal.currency)}
                </Text>
            )}
        </TouchableOpacity>
    );
}

// ─── PeriodPills ──────────────────────────────────────────────────────────────

const PERIOD_OPTIONS: { id: Period; label: string }[] = [
    { id: 'day', label: 'Дн' },
    { id: 'week', label: 'Нд' },
    { id: 'month', label: 'Мс' },
    { id: 'quarter', label: 'Кв' },
    { id: 'year', label: 'Гд' },
];

function PeriodPills({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
    return (
        <View style={{ flexDirection: 'row', gap: 2, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 2 }}>
            {PERIOD_OPTIONS.map(p => (
                <TouchableOpacity key={p.id} onPress={() => onChange(p.id)} style={{
                    paddingHorizontal: 9, paddingVertical: 3, borderRadius: 12,
                    backgroundColor: value === p.id ? 'rgba(124,111,255,0.25)' : 'transparent',
                }}>
                    <Text style={{ fontSize: 10, fontWeight: '600', color: value === p.id ? '#7C6FFF' : 'rgba(255,255,255,0.3)' }}>
                        {p.label}
                    </Text>
                </TouchableOpacity>
            ))}
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

// ─── Shared form styles ───────────────────────────────────────────────────────

const labelStyle = {
    fontSize: 11 as const,
    color: 'rgba(255,255,255,0.4)' as const,
    marginBottom: 8,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
};

const inputStyle = {
    backgroundColor: 'rgba(255,255,255,0.06)' as const,
    borderRadius: 12,
    padding: 14,
    color: '#fff' as const,
    fontSize: 15 as const,
    marginBottom: 16,
};

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
    const router = useRouter();
    const [tab, setTab] = useState<AnalyticsTab>('overview');
    const [summaryPeriod, setSummaryPeriod] = useState<Period>('month');
    const [chartPeriod, setChartPeriod] = useState<Period>('month');
    const [catPeriod, setCatPeriod] = useState<Period>('month');
    const [activeCategory, setActiveCategory] = useState<number | null>(null);
    const [catExpanded, setCatExpanded] = useState(false);

    const [householdId, setHouseholdId] = useState<string | null>(null);
    const [currency, setCurrency] = useState('EUR');

    const [overviewByPeriod, setOverviewByPeriod] = useState<Partial<Record<Period, OverviewData>>>({});
    const [fetchingPeriods, setFetchingPeriods] = useState<Set<Period>>(new Set());
    const [forecastPeriod, setForecastPeriod] = useState<ForecastPeriod>('month');
    const [customFrom, setCustomFrom] = useState<Date>(new Date());
    const [customTo, setCustomTo] = useState<Date>(endOfMonth(new Date()));
    const [showCustomFrom, setShowCustomFrom] = useState(false);
    const [showCustomTo, setShowCustomTo] = useState(false);
    const [loadingForecast, setLoadingForecast] = useState(false);
    const [loadingSavings, setLoadingSavings] = useState(false);

    const [forecastData, setForecastData] = useState<ForecastData | null>(null);
    const [goalsState, setGoalsState] = useState<GoalItem[]>([]);

    // ── Extra categories ─────────────────────────────────────────────────────
    type CatWithTags = { id: string; name: string; icon: string; color: string; tags: { id: string; name: string }[] };
    type DraftEntry = { active: boolean; amount: string };
    // draft key: "cat:<id>" for whole category, "tag:<id>" for tag
    const [extraCategories, setExtraCategories] = useState<ExtraCategory[]>([]);
    const [showExtrasModal, setShowExtrasModal] = useState(false);
    const [extraDraft, setExtraDraft] = useState<Record<string, DraftEntry>>({});
    const [allCategories, setAllCategories] = useState<CatWithTags[]>([]);
    const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
    const [savingExtras, setSavingExtras] = useState(false);

    // ── Deposits ──────────────────────────────────────────────────────────────
    const [deposits, setDeposits] = useState<DepositData[]>([]);
    const [showAddDeposit, setShowAddDeposit] = useState(false);
    const [depositName, setDepositName] = useState('');
    const [depositAmount, setDepositAmount] = useState('');
    const [depositCompounding, setDepositCompounding] = useState<'monthly' | 'yearly'>('monthly');
    const [depositStartDate, setDepositStartDate] = useState<Date>(new Date());
    const [depositEndDate, setDepositEndDate] = useState<Date | null>(null);
    const [showDepositStartPicker, setShowDepositStartPicker] = useState(false);
    const [showDepositEndPicker, setShowDepositEndPicker] = useState(false);
    const [depositCurrency, setDepositCurrency] = useState('EUR');
    const [showDepositCurrencyDropdown, setShowDepositCurrencyDropdown] = useState(false);
    const [depositCurrencySearch, setDepositCurrencySearch] = useState('');
    const [depositIcon, setDepositIcon] = useState('Landmark');
    const [depositColor, setDepositColor] = useState('#7C6FFF');
    const [ratePeriodDrafts, setRatePeriodDrafts] = useState<RatePeriodDraft[]>([{ rate: '', fromDate: new Date(), toDate: null }]);
    const [periodEndPickerIdx, setPeriodEndPickerIdx] = useState<number | null>(null);
    const [savingDeposit, setSavingDeposit] = useState(false);
    const [editingDeposit, setEditingDeposit] = useState<DepositData | null>(null);
    // Transfer from/to account (create mode)
    const [topUpAccountId, setTopUpAccountId] = useState('');
    // Deposit top-up (edit mode)
    const [showDepositTopUp, setShowDepositTopUp] = useState(false);
    const [depositTopUpAmount, setDepositTopUpAmount] = useState('');
    const [depositTopUpAccountId, setDepositTopUpAccountId] = useState('');
    const [depositTopUpDate, setDepositTopUpDate] = useState<Date>(new Date());
    const [showDepositTopUpDatePicker, setShowDepositTopUpDatePicker] = useState(false);
    const [savingDepositTopUp, setSavingDepositTopUp] = useState(false);

    // ── Add-goal modal ──────────────────────────────────────────────────────
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [showAddGoal, setShowAddGoal] = useState(false);
    const [goalName, setGoalName] = useState('');
    const [goalIcon, setGoalIcon] = useState('🎯');
    const [goalTarget, setGoalTarget] = useState('');
    const [goalCurrency, setGoalCurrency] = useState('EUR');
    const [goalDateObj, setGoalDateObj] = useState<Date | null>(null);
    const [showGoalDatePicker, setShowGoalDatePicker] = useState(false);
    const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);
    const [currencySearch, setCurrencySearch] = useState('');
    const [goalAccountId, setGoalAccountId] = useState('');
    const [goalColor, setGoalColor] = useState('#7C6FFF');
    const [savingGoal, setSavingGoal] = useState(false);
    const [editingGoal, setEditingGoal] = useState<GoalItem | null>(null);

    // ── Goal detail bottom sheet ─────────────────────────────────────────────
    const [selectedGoal, setSelectedGoal] = useState<GoalItem | null>(null);
    const [goalRate, setGoalRate] = useState(5.0);
    const [goalRateInput, setGoalRateInput] = useState('5.0');
    const [goalCompounding, setGoalCompounding] = useState<'monthly' | 'yearly'>('monthly');
    const [showGoalTopUp, setShowGoalTopUp] = useState(false);
    const [goalTopUpAmount, setGoalTopUpAmount] = useState('');
    const [goalTopUpAccountId, setGoalTopUpAccountId] = useState('');
    const [goalTopUpDate, setGoalTopUpDate] = useState<Date>(new Date());
    const [showGoalTopUpDatePicker, setShowGoalTopUpDatePicker] = useState(false);
    const [savingGoalTopUp, setSavingGoalTopUp] = useState(false);
    const [archivingGoal, setArchivingGoal] = useState(false);
    const [showArchiveGoal, setShowArchiveGoal] = useState(false);

    // ── AI Recommendation ────────────────────────────────────────────────────
    const [recommendation, setRecommendation] = useState('');

    // ── Loans ─────────────────────────────────────────────────────────────────
    const [loans, setLoans] = useState<LoanData[]>([]);
    const [showAddLoan, setShowAddLoan] = useState(false);
    const [editingLoan, setEditingLoan] = useState<LoanData | null>(null);
    const [loanName, setLoanName] = useState('');
    const [loanIcon, setLoanIcon] = useState('Home');
    const [loanColor, setLoanColor] = useState('#FF6B6B');
    const [loanType, setLoanType] = useState<LoanType>('mortgage');
    const [loanCustomType, setLoanCustomType] = useState('');
    const [loanAmount, setLoanAmount] = useState('');
    const [loanPaidAmount, setLoanPaidAmount] = useState('');
    const [loanCurrency, setLoanCurrency] = useState('EUR');
    const [showLoanCurrencyDropdown, setShowLoanCurrencyDropdown] = useState(false);
    const [loanCurrencySearch, setLoanCurrencySearch] = useState('');
    const [loanPaymentType, setLoanPaymentType] = useState<PaymentType>('annuity');
    const [loanStartDate, setLoanStartDate] = useState<Date>(new Date());
    const [loanEndDate, setLoanEndDate] = useState<Date>(addMonths(new Date(), 60));
    const [showLoanStartPicker, setShowLoanStartPicker] = useState(false);
    const [showLoanEndPicker, setShowLoanEndPicker] = useState(false);
    const [loanRateDrafts, setLoanRateDrafts] = useState<RatePeriodDraft[]>([{ rate: '', fromDate: new Date(), toDate: null }]);
    const [loanRatePickerIdx, setLoanRatePickerIdx] = useState<number | null>(null);
    const [loanPaymentAccountId, setLoanPaymentAccountId] = useState('');
    const [loanSourceAccountId, setLoanSourceAccountId] = useState('');
    const [loanPaymentDay, setLoanPaymentDay] = useState('15');
    const [loanReminderDate, setLoanReminderDate] = useState<Date>(new Date());
    const [showLoanReminderPicker, setShowLoanReminderPicker] = useState(false);
    const [savingLoan, setSavingLoan] = useState(false);
    const [selectedLoan, setSelectedLoan] = useState<LoanData | null>(null);
    const [confirmingPayment, setConfirmingPayment] = useState(false);
    const [simMode, setSimMode] = useState<'+5' | '+10' | 'custom' | null>(null);
    const [simCustomAmount, setSimCustomAmount] = useState('');

    // ── Load household ──────────────────────────────────────────────────────
    useFocusEffect(useCallback(() => {
        loadHousehold();
        if (householdId) fetchForecast(householdId);
    }, [householdId]));

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

    // ── Fetch overview for each unique active period ────────────────────────
    useEffect(() => {
        if (!householdId) return;
        const needed = new Set([summaryPeriod, chartPeriod, catPeriod]);
        needed.forEach(p => {
            if (!overviewByPeriod[p] && !fetchingPeriods.has(p)) {
                fetchOverview(householdId, p);
            }
        });
    }, [householdId, summaryPeriod, chartPeriod, catPeriod]);

    // Reset active category when category period changes
    useEffect(() => { setActiveCategory(null); setCatExpanded(false); }, [catPeriod]);

    // ── Fetch forecast when household or forecast period changes ────────────
    useEffect(() => {
        if (!householdId) return;
        fetchForecast(householdId);
    }, [householdId, forecastPeriod, customFrom, customTo]);

    // ── Fetch savings & accounts once when household loads ────────────────
    useEffect(() => {
        if (!householdId) return;
        fetchSavings(householdId);
        fetchDeposits(householdId);
        fetchLoans(householdId);
        fetchAccounts(householdId);
    }, [householdId]);

    // ── Overview ────────────────────────────────────────────────────────────
    async function fetchOverview(hid: string, p: Period) {
        setFetchingPeriods(prev => new Set(prev).add(p));
        const now = new Date();
        const { start, end, prevStart, prevEnd } = getDateRange(p, now);

        type TxnRow = {
            amount: number; amount_base: number | null;
            type: string; date: string; created_at: string; category_id: string;
            category: { name: string; icon: string | null; color: string | null } | null;
        };

        const [{ data: txns }, { data: prevTxns }, { data: goalsRaw }] = await Promise.all([
            supabase.from('transactions')
                .select('amount, amount_base, type, date, created_at, category_id, category:categories(name, icon, color)')
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
            supabase.from('savings_goals')
                .select('name, icon, interest_rate, currency, account_id, accounts(balance, currency)')
                .eq('household_id', hid)
                .eq('is_active', true)
                .gt('interest_rate', 0),
        ]);

        const rows = (txns ?? []) as unknown as TxnRow[];
        type PrevRow = Pick<TxnRow, 'amount' | 'amount_base' | 'type'>;
        const prevRows = (prevTxns ?? []) as PrevRow[];
        const getAmt = (t: Pick<TxnRow, 'amount' | 'amount_base'>) => t.amount_base ?? t.amount;

        let income = 0, expenses = 0;
        rows.forEach(t => { if (t.type === 'income') income += getAmt(t); else expenses += getAmt(t); });
        let prevIncome = 0, prevExpenses = 0;
        prevRows.forEach(t => { if (t.type === 'income') prevIncome += getAmt(t); else prevExpenses += getAmt(t); });

        // Deposit interest calculation
        type GoalRow = { name: string; icon: string | null; interest_rate: number; currency: string; accounts: { balance: number; currency: string } | null };
        const goalsData = (goalsRaw ?? []) as unknown as GoalRow[];
        const months = getPeriodInMonths(start, end);
        const prevMonths = getPeriodInMonths(prevStart, prevEnd);
        let depositInterest = 0;
        let prevDepositInterest = 0;
        const depositDetails: DepositDetail[] = [];
        goalsData.forEach(d => {
            if (!d.accounts || !d.interest_rate) return;
            const bal = d.accounts.balance;
            const monthlyRate = d.interest_rate / 100 / 12;
            const interest = bal * monthlyRate * months;
            depositInterest += interest;
            prevDepositInterest += bal * monthlyRate * prevMonths;
            depositDetails.push({
                name: d.name,
                icon: d.icon ?? '🏦',
                rate: d.interest_rate,
                interest,
                currency: d.currency,
            });
        });

        // Bar chart buckets
        const buckets = getBarBuckets(p, now);
        const chart: BarPoint[] = buckets.map(bucket => {
            let bI = 0, bE = 0;
            rows.forEach(t => {
                const d = p === 'day' ? new Date(t.created_at) : new Date(t.date);
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
                color: getCategoryColor(t.category?.name ?? 'Прочее', t.category?.color ?? null, id),
                total: 0,
            };
            catMap[id].total += getAmt(t);
        });

        const catEntries = Object.entries(catMap).sort((a, b) => b[1].total - a[1].total);
        const totalExp = catEntries.reduce((s, [, c]) => s + c.total, 0);

        const categories: CategoryItem[] = catEntries.map(([catId, c]) => ({
            id: catId, name: c.name, icon: c.icon, amount: c.total, color: c.color,
            percent: totalExp > 0 ? (c.total / totalExp) * 100 : 0,
        }));

        setOverviewByPeriod(prev => ({ ...prev, [p]: { income, expenses, prevIncome, prevExpenses, depositInterest, prevDepositInterest, deposits: depositDetails, chart, categories } }));
        setFetchingPeriods(prev => { const next = new Set(prev); next.delete(p); return next; });
    }

    // ── Forecast helpers ────────────────────────────────────────────────────

    function getForecastRange(fp: ForecastPeriod, cFrom: Date, cTo: Date): { start: Date; end: Date } {
        const today = startOfDay(new Date());
        switch (fp) {
            case 'month':   return { start: today, end: endOfMonth(today) };
            case 'quarter': return { start: today, end: endOfDay(addMonths(today, 3)) };
            case 'half':    return { start: today, end: endOfDay(addMonths(today, 6)) };
            case 'year':    return { start: today, end: endOfDay(addMonths(today, 12)) };
            case 'custom':  return { start: startOfDay(cFrom), end: endOfDay(cTo) };
        }
    }

    /** Count occurrences of a recurring payment between two dates */
    function countOccurrences(nextDate: string, freq: Frequency, endDate: string | null, from: Date, to: Date): number {
        let cursor = new Date(nextDate);
        const stop = endDate ? new Date(endDate) : to;
        const limit = stop < to ? stop : to;
        let count = 0;
        while (cursor <= limit) {
            if (cursor >= from) count++;
            if (freq === 'daily') cursor = addDays(cursor, 1);
            else if (freq === 'weekly') cursor = addWeeks(cursor, 1);
            else if (freq === 'monthly') cursor = addMonths(cursor, 1);
            else cursor = addMonths(cursor, 12); // yearly
            if (count > 1000) break; // safety
        }
        return count;
    }

    // ── Forecast ────────────────────────────────────────────────────────────
    async function fetchForecast(hid: string) {
        setLoadingForecast(true);
        const now = new Date();
        const today = startOfDay(now);
        const { start: periodStart, end: periodEnd } = getForecastRange(forecastPeriod, customFrom, customTo);

        // 1) Avg daily spend from last 30 days
        const d30ago = subDays(today, 30);
        const [{ data: last30Txns }, { data: periodTxns }, { data: recurRaw }, { data: budgetsRaw }] = await Promise.all([
            supabase.from('transactions')
                .select('amount, amount_base')
                .eq('household_id', hid).eq('type', 'expense').eq('is_deleted', false)
                .gte('date', format(d30ago, 'yyyy-MM-dd'))
                .lte('date', format(today, 'yyyy-MM-dd')),
            // 2) All expense txns in full period range (for chart + fact)
            supabase.from('transactions')
                .select('amount, amount_base, date, category_id')
                .eq('household_id', hid).eq('type', 'expense').eq('is_deleted', false)
                .gte('date', format(periodStart, 'yyyy-MM-dd'))
                .lte('date', format(periodEnd, 'yyyy-MM-dd')),
            // 3) Recurring payments
            supabase.from('recurring_payments')
                .select('name, amount, amount_base, currency, frequency, next_date, end_date, is_active')
                .eq('household_id', hid).eq('is_active', true),
            // 4) Budgets
            supabase.from('budgets')
                .select('category_id, amount, category:categories(name, icon, color)')
                .eq('household_id', hid).eq('period', 'monthly'),
        ]);

        const getAmt = (t: { amount: number; amount_base: number | null }) => t.amount_base ?? t.amount;
        type TxRow = { amount: number; amount_base: number | null; date: string; category_id: string | null };
        const allRows = (periodTxns ?? []) as unknown as TxRow[];

        // Avg daily from last 30 days
        const last30Total = (last30Txns ?? []).reduce((s, t) => s + getAmt(t as any), 0);
        const avgDaily = last30Total / 30;

        // Fact spend (only past part of period)
        const factSpend = allRows
            .filter(t => new Date(t.date) <= today)
            .reduce((s, t) => s + getAmt(t), 0);

        // Category spend for budget tracking (past only)
        const catSpend: Record<string, number> = {};
        allRows.forEach(t => {
            if (new Date(t.date) <= today && t.category_id)
                catSpend[t.category_id] = (catSpend[t.category_id] || 0) + getAmt(t);
        });

        // Days left (future part)
        const daysLeft = Math.max(0, differenceInDays(periodEnd, today));

        // Projected spend for future part
        const projectedSpend = avgDaily * daysLeft;

        // Recurring payments
        type RecRow = { name: string; amount: number; amount_base: number | null; frequency: string; next_date: string; end_date: string | null; is_active: boolean };
        const recRows = (recurRaw ?? []) as unknown as RecRow[];
        const upcomingRecurring: RecurringItem[] = [];
        const recurringTotal = recRows.reduce((sum, r) => {
            const occ = countOccurrences(r.next_date, r.frequency as Frequency, r.end_date, today, periodEnd);
            const total = occ * getAmt(r);
            if (occ > 0) upcomingRecurring.push({ name: r.name, amount: total });
            return sum + total;
        }, 0);

        const daysPassed = Math.max(0, differenceInDays(today, periodStart));

        const projectedTotal = factSpend + projectedSpend + recurringTotal;

        // ── Chart buckets ────────────────────────────────────────────────
        const useMonthBuckets = forecastPeriod !== 'month';
        const chartBuckets: { label: string; subLabel?: string; start: Date; end: Date }[] = [];

        if (useMonthBuckets) {
            // One bucket per month; first bucket starts at periodStart, not month start
            let isFirst = true;
            let cursor = startOfMonth(periodStart);
            while (cursor <= periodEnd) {
                const bucketStart = isFirst ? periodStart : cursor;
                const mEnd = endOfMonth(cursor);
                const bucketEnd = mEnd > periodEnd ? periodEnd : mEnd;
                const raw = format(cursor, 'LLL', { locale: ru });
                const label = raw.charAt(0).toUpperCase() + raw.slice(1);
                chartBuckets.push({ label, start: bucketStart, end: bucketEnd });
                cursor = startOfMonth(addMonths(cursor, 1));
                isFirst = false;
            }
            // Compute subLabels for first/last partial months
            if (chartBuckets.length > 0) {
                const first = chartBuckets[0];
                const firstDay = first.start.getDate();
                if (firstDay > 1) {
                    first.subLabel = `с ${firstDay}`;
                }
                const last = chartBuckets[chartBuckets.length - 1];
                const lastFullEnd = endOfMonth(last.start);
                const actualDays = differenceInDays(last.end, last.start) + 1;
                const fullDays = differenceInDays(lastFullEnd, startOfMonth(last.start)) + 1;
                if (actualDays < fullDays) {
                    last.subLabel = `${actualDays} дн`;
                }
            }
        } else {
            // Days of current month — show ~8 ticks
            const ms = startOfMonth(today);
            const me = endOfMonth(today);
            const dim = differenceInDays(me, ms) + 1;
            for (let d = 0; d < dim; d++) {
                const day = addDays(ms, d);
                chartBuckets.push({ label: String(d + 1), start: startOfDay(day), end: endOfDay(day) });
            }
        }

        const chart: ForecastChartPoint[] = chartBuckets.map(b => {
            // For day buckets: fact if day <= today; for month buckets: fact if bucket already started
            const isFact = useMonthBuckets
                ? b.start.getTime() <= today.getTime()
                : b.end.getTime() <= today.getTime();

            // Fact amount from transactions
            let amount = 0;
            allRows.forEach(t => {
                const d = new Date(t.date);
                if (d >= b.start && d <= b.end) amount += getAmt(t);
            });

            // For future buckets: use avgDaily projection
            if (!isFact) {
                const futureDays = differenceInDays(b.end, b.start > today ? b.start : today) + 1;
                amount = avgDaily * Math.max(0, futureDays);
            }

            // Recurring in this bucket
            let recurring = 0;
            recRows.forEach(r => {
                const occ = countOccurrences(r.next_date, r.frequency as Frequency, r.end_date, b.start, b.end);
                recurring += occ * getAmt(r);
            });

            return { label: b.label, subLabel: b.subLabel, amount, recurring, isFact };
        });

        // Chart subtitle
        const fmtMonth = (d: Date) => { const r = format(d, 'LLLL', { locale: ru }); return r.charAt(0).toUpperCase() + r.slice(1); };
        const startM = fmtMonth(periodStart);
        const endM = fmtMonth(periodEnd);
        const yr = format(periodEnd, 'yyyy');
        const chartSubtitle = startM === endM ? `${startM} ${yr}` : `${startM} — ${endM} ${yr}`;

        // Budgets
        type BudgetRow = { category_id: string; amount: number; category: { name: string; icon: string | null; color: string | null } | null };
        const budgets: BudgetItem[] = ((budgetsRaw ?? []) as unknown as BudgetRow[]).map(b => ({
            name: b.category?.name ?? 'Категория',
            icon: b.category?.icon ?? '📦',
            limit: b.amount,
            spent: catSpend[b.category_id] ?? 0,
        }));

        setForecastData({ factSpend, projectedTotal, recurringTotal, daysLeft, daysPassed, periodStart, periodEnd, budgets, chart, chartSubtitle, upcomingRecurring });
        setLoadingForecast(false);

        // Also fetch extras for this period
        fetchExtras(hid, periodStart, periodEnd);
    }

    function getPeriodMultiplier(fp: ForecastPeriod, pStart: Date, pEnd: Date): { multiplier: number; label: string } {
        switch (fp) {
            case 'month':   return { multiplier: 1, label: '' };
            case 'quarter': return { multiplier: 3, label: '× 3 мес' };
            case 'half':    return { multiplier: 6, label: '× 6 мес' };
            case 'year':    return { multiplier: 12, label: '× 12 мес' };
            case 'custom': {
                const days = differenceInDays(pEnd, pStart) + 1;
                const m = Math.round((days / 30) * 10) / 10;
                return { multiplier: m, label: `× ${m} мес` };
            }
        }
    }

    async function fetchExtras(hid: string, periodStart: Date, periodEnd: Date) {
        // 1) Load active extra settings (with tag + category info)
        const { data: extrasRaw } = await supabase
            .from('category_extras')
            .select('category_id, tag_id, comfortable_amount, category:categories(name, icon, color)')
            .eq('household_id', hid)
            .eq('is_active', true);

        if (!extrasRaw?.length) { setExtraCategories([]); return; }

        // 2) Load spending per category+tag for the period
        const { data: txns } = await supabase
            .from('transactions')
            .select('category_id, tag_id, amount, amount_base')
            .eq('household_id', hid)
            .eq('type', 'expense')
            .eq('is_deleted', false)
            .gte('date', format(periodStart, 'yyyy-MM-dd'))
            .lte('date', format(periodEnd, 'yyyy-MM-dd'));

        // Spend by "catId" and "catId:tagId"
        const spendMap: Record<string, number> = {};
        txns?.forEach(t => {
            const amt = (t.amount_base as number | null) ?? (t.amount as number);
            const cid = t.category_id as string;
            spendMap[cid] = (spendMap[cid] ?? 0) + amt;
            if (t.tag_id) {
                const key = `${cid}:${t.tag_id}`;
                spendMap[key] = (spendMap[key] ?? 0) + amt;
            }
        });

        // 3) Load tag names
        const tagIds = (extrasRaw ?? []).map(e => e.tag_id).filter(Boolean) as string[];
        let tagNames: Record<string, string> = {};
        if (tagIds.length > 0) {
            const { data: tagsRaw } = await supabase.from('category_tags').select('id, name').in('id', tagIds);
            (tagsRaw ?? []).forEach(t => { tagNames[t.id as string] = t.name as string; });
        }

        const { multiplier } = getPeriodMultiplier(forecastPeriod, periodStart, periodEnd);

        type ExtraRow = {
            category_id: string;
            tag_id: string | null;
            comfortable_amount: number;
            category: { name: string; icon: string | null; color: string | null } | null;
        };

        // Group by category
        const catMap: Record<string, { cat: ExtraRow; tagExtras: { tagId: string; comfortable: number }[] }> = {};
        ((extrasRaw ?? []) as unknown as ExtraRow[]).forEach(e => {
            if (!e.category) return;
            if (!catMap[e.category_id]) {
                catMap[e.category_id] = { cat: e, tagExtras: [] };
            }
            if (e.tag_id) {
                catMap[e.category_id].tagExtras.push({ tagId: e.tag_id, comfortable: e.comfortable_amount });
            } else {
                // Whole-category extra
                catMap[e.category_id].tagExtras.push({ tagId: '', comfortable: e.comfortable_amount });
            }
        });

        const extras: ExtraCategory[] = Object.entries(catMap).map(([catId, { cat, tagExtras }]) => {
            const tags: ExtraTag[] = tagExtras.map(te => {
                const spendKey = te.tagId ? `${catId}:${te.tagId}` : catId;
                const spent = spendMap[spendKey] ?? 0;
                const scaled = te.comfortable * multiplier;
                return {
                    tagId: te.tagId,
                    tagName: te.tagId ? (tagNames[te.tagId] ?? 'Подкатегория') : cat.category!.name,
                    spent,
                    comfortable: te.comfortable,
                    scaledComfortable: scaled,
                    extra: Math.max(0, spent - scaled),
                };
            });
            const totalSpent = spendMap[catId] ?? 0;
            const totalComfortable = tags.reduce((s, t) => s + t.comfortable, 0);
            const totalScaled = tags.reduce((s, t) => s + t.scaledComfortable, 0);
            const totalExtra = tags.reduce((s, t) => s + t.extra, 0);
            return {
                categoryId: catId,
                name: cat.category!.name,
                icon: cat.category!.icon ?? '📦',
                color: getCategoryColor(cat.category!.name, cat.category!.color ?? null, catId),
                spent: totalSpent,
                comfortable: totalComfortable,
                scaledComfortable: totalScaled,
                extra: totalExtra,
                tags,
            };
        }).filter(e => e.spent > 0 || e.scaledComfortable > 0);

        setExtraCategories(extras);
    }

    async function openExtrasModal(hid: string) {
        // Load all expense categories with their tags
        const [{ data: cats }, { data: tagsRaw }] = await Promise.all([
            supabase.from('categories').select('id, name, icon, color')
                .eq('household_id', hid).eq('type', 'expense').order('name'),
            supabase.from('category_tags').select('id, name, category_id')
                .eq('household_id', hid).order('sort_order'),
        ]);

        const tagsByCat: Record<string, { id: string; name: string }[]> = {};
        (tagsRaw ?? []).forEach(t => {
            const cid = t.category_id as string;
            if (!tagsByCat[cid]) tagsByCat[cid] = [];
            tagsByCat[cid].push({ id: t.id as string, name: t.name as string });
        });

        const catList: CatWithTags[] = (cats ?? []).map(c => ({
            id: c.id as string,
            name: c.name as string,
            icon: (c.icon as string | null) ?? '📦',
            color: getCategoryColor(c.name as string, c.color as string | null, c.id as string),
            tags: tagsByCat[c.id as string] ?? [],
        }));
        setAllCategories(catList);

        // Load existing extras
        const { data: existing } = await supabase
            .from('category_extras')
            .select('category_id, tag_id, comfortable_amount, is_active')
            .eq('household_id', hid);

        const draft: Record<string, DraftEntry> = {};
        // Initialize all cats and tags
        catList.forEach(c => {
            draft[`cat:${c.id}`] = { active: false, amount: '' };
            c.tags.forEach(t => { draft[`tag:${t.id}`] = { active: false, amount: '' }; });
        });
        // Fill from DB
        (existing ?? []).forEach(e => {
            const tagId = e.tag_id as string | null;
            const key = tagId ? `tag:${tagId}` : `cat:${e.category_id}`;
            draft[key] = {
                active: e.is_active as boolean,
                amount: String(e.comfortable_amount as number),
            };
        });
        setExtraDraft(draft);
        // Auto-expand cats that have active entries
        const expanded = new Set<string>();
        catList.forEach(c => {
            const catActive = draft[`cat:${c.id}`]?.active;
            const anyTagActive = c.tags.some(t => draft[`tag:${t.id}`]?.active);
            if (catActive || anyTagActive) expanded.add(c.id);
        });
        setExpandedCats(expanded);
        setShowExtrasModal(true);
    }

    async function saveExtras(hid: string) {
        setSavingExtras(true);

        // Collect active entries from draft
        const active: { category_id: string; tag_id: string | null; amount: number }[] = [];
        for (const [key, val] of Object.entries(extraDraft)) {
            if (!val.active || !(parseFloat(val.amount) > 0)) continue;
            if (key.startsWith('cat:')) {
                active.push({ category_id: key.slice(4), tag_id: null, amount: parseFloat(val.amount) });
            } else if (key.startsWith('tag:')) {
                const tagId = key.slice(4);
                const parent = allCategories.find(c => c.tags.some(t => t.id === tagId));
                if (parent) active.push({ category_id: parent.id, tag_id: tagId, amount: parseFloat(val.amount) });
            }
        }

        // Delete all existing for this household, then insert fresh
        await supabase.from('category_extras').delete().eq('household_id', hid);

        if (active.length > 0) {
            await supabase.from('category_extras').insert(
                active.map(e => ({
                    household_id: hid,
                    category_id: e.category_id,
                    tag_id: e.tag_id,
                    comfortable_amount: e.amount,
                    currency,
                    is_active: true,
                }))
            );
        }

        setSavingExtras(false);
        setShowExtrasModal(false);

        // Refresh
        if (forecastData) {
            fetchExtras(hid, forecastData.periodStart, forecastData.periodEnd);
        }
    }

    // ── Deposits ──────────────────────────────────────────────────────────────
    async function fetchDeposits(hid: string) {
        const { data: deps } = await supabase
            .from('deposit_accounts')
            .select('*')
            .eq('household_id', hid)
            .eq('is_active', true);

        if (!deps?.length) { setDeposits([]); return; }

        const depIds = deps.map(d => d.id as string);
        const { data: periodsRaw } = await supabase
            .from('deposit_rate_periods')
            .select('deposit_id, rate, from_date, to_date')
            .in('deposit_id', depIds)
            .order('from_date', { ascending: true });

        const periodsByDep: Record<string, RatePeriod[]> = {};
        (periodsRaw ?? []).forEach(p => {
            const did = p.deposit_id as string;
            if (!periodsByDep[did]) periodsByDep[did] = [];
            periodsByDep[did].push({
                rate: p.rate as number,
                from: new Date(p.from_date as string),
                to: p.to_date ? new Date(p.to_date as string) : null,
            });
        });

        const result: DepositData[] = deps.map(d => {
            const id = d.id as string;
            const amount = d.amount as number;
            const capitalization = (d.capitalization as string || 'monthly') as 'monthly' | 'yearly';
            const startDate = new Date(d.start_date as string);
            const endDate = d.end_date ? new Date(d.end_date as string) : null;
            const ratePeriods = periodsByDep[id] ?? [];
            const currentRate = ratePeriods.length > 0 ? ratePeriods[ratePeriods.length - 1].rate : 0;

            // Projection
            const targetDate = endDate ?? addMonths(new Date(), 60);
            const { projectedValue, interestEarned } = calcVariableRateDeposit(amount, ratePeriods, capitalization, targetDate);

            return {
                id, name: d.name as string,
                icon: (d.icon as string) || 'Landmark',
                color: (d.color as string) || '#7C6FFF',
                amount, currency: d.currency as string, capitalization,
                startDate, endDate, ratePeriods, currentRate, projectedValue, interestEarned,
            };
        });

        setDeposits(result);
    }

    async function createDeposit(hid: string) {
        setSavingDeposit(true);
        const amt = parseFloat(depositAmount);
        if (!depositName || isNaN(amt) || ratePeriodDrafts.length === 0) { setSavingDeposit(false); return; }

        // Validate all rate periods have valid rates
        const validPeriods = ratePeriodDrafts.filter(p => {
            const r = parseFloat(p.rate);
            return !isNaN(r) && r > 0;
        });
        if (validPeriods.length === 0) { setSavingDeposit(false); return; }

        const { data: dep, error: depErr } = await supabase.from('deposit_accounts').insert({
            household_id: hid,
            name: depositName,
            icon: depositIcon,
            color: depositColor,
            amount: amt,
            currency: depositCurrency,
            capitalization: depositCompounding,
            start_date: format(depositStartDate, 'yyyy-MM-dd'),
            end_date: depositEndDate ? format(depositEndDate, 'yyyy-MM-dd') : null,
        }).select('id').single();

        if (depErr) {
            console.error('Deposit insert error:', depErr);
            Alert.alert('Ошибка', depErr.message);
            setSavingDeposit(false);
            return;
        }

        if (dep) {
            const periodsToInsert = validPeriods.map(p => ({
                deposit_id: dep.id,
                rate: parseFloat(p.rate),
                from_date: format(p.fromDate, 'yyyy-MM-dd'),
                to_date: p.toDate ? format(p.toDate, 'yyyy-MM-dd') : null,
            }));
            const { error: periodErr } = await supabase.from('deposit_rate_periods').insert(periodsToInsert);
            if (periodErr) console.error('Rate periods insert error:', periodErr);

            // Transfer from account if selected
            if (topUpAccountId) {
                const srcAcc = accounts.find(a => a.id === topUpAccountId);
                if (srcAcc) {
                    await supabase.from('accounts').update({
                        balance: srcAcc.balance - amt,
                    }).eq('id', topUpAccountId);
                }
                await supabase.from('transactions').insert({
                    household_id: hid,
                    account_id: topUpAccountId,
                    amount: -amt,
                    currency: depositCurrency,
                    description: `Открытие депозита "${depositName}"`,
                    date: format(depositStartDate, 'yyyy-MM-dd'),
                    type: 'expense',
                });
                fetchAccounts(hid);
            }
        }

        // Reset form
        closeDepositModal();
        fetchDeposits(hid);
    }

    async function updateDeposit(hid: string) {
        if (!editingDeposit) return;
        setSavingDeposit(true);
        const amt = parseFloat(depositAmount);
        if (!depositName || isNaN(amt) || ratePeriodDrafts.length === 0) { setSavingDeposit(false); return; }

        const validPeriods = ratePeriodDrafts.filter(p => {
            const r = parseFloat(p.rate);
            return !isNaN(r) && r > 0;
        });
        if (validPeriods.length === 0) { setSavingDeposit(false); return; }

        // Validate start date vs end date
        if (depositEndDate && depositStartDate >= depositEndDate) {
            Alert.alert('Ошибка', 'Дата начала должна быть раньше даты окончания');
            setSavingDeposit(false);
            return;
        }

        // Update deposit account
        const { error: updErr } = await supabase.from('deposit_accounts').update({
            name: depositName,
            icon: depositIcon,
            color: depositColor,
            amount: amt,
            currency: depositCurrency,
            capitalization: depositCompounding,
            start_date: format(depositStartDate, 'yyyy-MM-dd'),
            end_date: depositEndDate ? format(depositEndDate, 'yyyy-MM-dd') : null,
        }).eq('id', editingDeposit.id);

        if (updErr) {
            console.error('Deposit update error:', updErr);
            Alert.alert('Ошибка', updErr.message);
            setSavingDeposit(false);
            return;
        }

        // Replace all rate periods: delete old, insert new
        await supabase.from('deposit_rate_periods').delete().eq('deposit_id', editingDeposit.id);
        const periodsToInsert = validPeriods.map(p => ({
            deposit_id: editingDeposit.id,
            rate: parseFloat(p.rate),
            from_date: format(p.fromDate, 'yyyy-MM-dd'),
            to_date: p.toDate ? format(p.toDate, 'yyyy-MM-dd') : null,
        }));
        await supabase.from('deposit_rate_periods').insert(periodsToInsert);

        // Reset form
        closeDepositModal();
        fetchDeposits(hid);
    }

    async function confirmDepositTopUp() {
        if (!editingDeposit || !householdId) return;
        const amt = parseFloat(depositTopUpAmount.replace(',', '.'));
        if (isNaN(amt) || amt <= 0) return;
        setSavingDepositTopUp(true);

        // Update deposit amount
        const newAmount = editingDeposit.amount + amt;
        await supabase.from('deposit_accounts').update({ amount: newAmount }).eq('id', editingDeposit.id);

        // Deduct from account if selected
        if (depositTopUpAccountId) {
            const srcAcc = accounts.find(a => a.id === depositTopUpAccountId);
            if (srcAcc) {
                await supabase.from('accounts').update({
                    balance: srcAcc.balance - amt,
                }).eq('id', depositTopUpAccountId);
            }
            await supabase.from('transactions').insert({
                household_id: householdId,
                account_id: depositTopUpAccountId,
                amount: -amt,
                currency: editingDeposit.currency,
                description: `Пополнение депозита "${editingDeposit.name}"`,
                date: format(depositTopUpDate, 'yyyy-MM-dd'),
                type: 'expense',
            });
            fetchAccounts(householdId);
        }

        setSavingDepositTopUp(false);
        setShowDepositTopUp(false);
        setDepositTopUpAmount('');
        setDepositTopUpAccountId('');
        setDepositTopUpDate(new Date());
        // Update local state
        setDepositAmount(String(newAmount));
        setEditingDeposit({ ...editingDeposit, amount: newAmount });
        fetchDeposits(householdId);
    }

    function openEditDeposit(dep: DepositData) {
        setEditingDeposit(dep);
        setDepositName(dep.name);
        setDepositAmount(String(dep.amount));
        setDepositIcon(dep.icon);
        setDepositColor(dep.color);
        setDepositCurrency(dep.currency);
        setDepositCompounding(dep.capitalization);
        setDepositStartDate(dep.startDate);
        setDepositEndDate(dep.endDate);
        setRatePeriodDrafts(dep.ratePeriods.map(p => ({
            rate: String(p.rate),
            fromDate: p.from,
            toDate: p.to,
        })));
        setTopUpAccountId('');
        setShowDepositTopUp(false);
        setDepositTopUpAmount('');
        setDepositTopUpAccountId('');
        setDepositTopUpDate(new Date());
        setShowAddDeposit(true);
    }

    function closeDepositModal() {
        setShowAddDeposit(false);
        setEditingDeposit(null);
        setDepositName(''); setDepositAmount('');
        setDepositCompounding('monthly'); setDepositStartDate(new Date());
        setDepositEndDate(null);
        setDepositIcon('Landmark'); setDepositColor('#7C6FFF');
        setRatePeriodDrafts([{ rate: '', fromDate: new Date(), toDate: null }]);
        setPeriodEndPickerIdx(null);
        setTopUpAccountId('');
        setSavingDeposit(false);
        setShowDepositTopUp(false);
        setDepositTopUpAmount('');
        setDepositTopUpAccountId('');
        setDepositTopUpDate(new Date());
    }

    // ── Loans ─────────────────────────────────────────────────────────────────

    function calcAnnuityPayment(principal: number, annualRate: number, months: number): number {
        if (annualRate === 0 || months === 0) return principal / Math.max(months, 1);
        const r = annualRate / 100 / 12;
        return principal * (r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
    }

    function calcDifferentiatedPayment(principal: number, annualRate: number, months: number, monthsPaid: number): number {
        if (months === 0) return 0;
        const base = principal / months;
        const remaining = principal - base * monthsPaid;
        const interest = remaining * (annualRate / 100 / 12);
        return base + interest;
    }

    /** Current month's interest portion for a loan */
    function calcCurrentInterest(loan: LoanData): number {
        const remaining = loan.totalAmount - loan.paidAmount;
        return remaining * (loan.currentRate / 100 / 12);
    }

    /** Simulate early payoff: returns { savedInterest, monthsSaved } */
    function simulateExtraPayment(loan: LoanData, extraMonthly: number): { savedInterest: number; monthsSaved: number; newPayment: number; totalMonths: number } {
        const totalMonths = differenceInMonths(loan.endDate, loan.startDate);
        const r = loan.currentRate / 100 / 12;
        const remaining = loan.totalAmount - loan.paidAmount;
        const basePmt = loan.monthlyPayment;
        const newPmt = basePmt + extraMonthly;

        if (r === 0 || remaining <= 0) return { savedInterest: 0, monthsSaved: 0, newPayment: newPmt, totalMonths };

        // Original total interest
        const monthsLeft = Math.max(0, totalMonths - differenceInMonths(new Date(), loan.startDate));
        const origTotalPaid = basePmt * monthsLeft;
        const origInterest = origTotalPaid - remaining;

        // New payoff: simulate month by month
        let bal = remaining;
        let newMonths = 0;
        let newTotalPaid = 0;
        while (bal > 0 && newMonths < 600) {
            const intPart = bal * r;
            const payment = Math.min(newPmt, bal + intPart);
            bal = bal + intPart - payment;
            newTotalPaid += payment;
            newMonths++;
        }
        const newInterest = newTotalPaid - remaining;
        return {
            savedInterest: Math.max(0, origInterest - newInterest),
            monthsSaved: Math.max(0, monthsLeft - newMonths),
            newPayment: newPmt,
            totalMonths,
        };
    }

    async function fetchLoans(hid: string) {
        const { data: loansRaw } = await supabase
            .from('loans')
            .select('*')
            .eq('household_id', hid)
            .eq('is_active', true);

        if (!loansRaw?.length) { setLoans([]); return; }

        const loanIds = loansRaw.map(l => l.id as string);
        const { data: periodsRaw } = await supabase
            .from('loan_rate_periods')
            .select('loan_id, rate, from_date, to_date')
            .in('loan_id', loanIds)
            .order('from_date', { ascending: true });

        const periodsByLoan: Record<string, RatePeriod[]> = {};
        (periodsRaw ?? []).forEach(p => {
            const lid = p.loan_id as string;
            if (!periodsByLoan[lid]) periodsByLoan[lid] = [];
            periodsByLoan[lid].push({
                rate: p.rate as number,
                from: new Date(p.from_date as string),
                to: p.to_date ? new Date(p.to_date as string) : null,
            });
        });

        const result: LoanData[] = loansRaw.map(l => {
            const id = l.id as string;
            const totalAmount = l.total_amount as number;
            const paidAmount = l.paid_amount as number;
            const startDate = new Date(l.start_date as string);
            const endDate = new Date(l.end_date as string);
            const paymentType = (l.payment_type as string) as PaymentType;
            const ratePeriods = periodsByLoan[id] ?? [];
            const currentRate = ratePeriods.length > 0 ? ratePeriods[ratePeriods.length - 1].rate : 0;
            const totalMonths = differenceInMonths(endDate, startDate);
            const remaining = totalAmount - paidAmount;

            let monthlyPayment = 0;
            if (paymentType === 'annuity') {
                monthlyPayment = calcAnnuityPayment(totalAmount, currentRate, totalMonths);
            } else {
                const monthsPaid = differenceInMonths(new Date(), startDate);
                monthlyPayment = calcDifferentiatedPayment(totalAmount, currentRate, totalMonths, Math.max(0, monthsPaid));
            }

            return {
                id, name: l.name as string,
                icon: (l.icon as string) || 'Home',
                color: (l.color as string) || '#FF6B6B',
                loanType: (l.loan_type as string) as LoanType,
                customTypeName: (l.custom_type_name as string) ?? null,
                totalAmount, paidAmount, currency: l.currency as string,
                paymentType, startDate, endDate,
                paymentAccountId: l.payment_account_id as string | null,
                sourceAccountId: l.source_account_id as string | null,
                recurringId: l.recurring_id as string | null,
                ratePeriods, currentRate, monthlyPayment,
            };
        });

        setLoans(result);
    }

    async function createLoan(hid: string) {
        setSavingLoan(true);
        const amt = parseFloat(loanAmount);
        const paid = parseFloat(loanPaidAmount || '0');
        if (!loanName || isNaN(amt) || amt <= 0) { setSavingLoan(false); return; }

        const validPeriods = loanRateDrafts.filter(p => {
            const r = parseFloat(p.rate);
            return !isNaN(r) && r > 0;
        });
        if (validPeriods.length === 0) { setSavingLoan(false); return; }

        if (loanStartDate >= loanEndDate) {
            Alert.alert('Ошибка', 'Дата начала должна быть раньше даты окончания');
            setSavingLoan(false);
            return;
        }

        // Calculate monthly payment for recurring
        const totalMonths = differenceInMonths(loanEndDate, loanStartDate);
        const rate = parseFloat(validPeriods[validPeriods.length - 1].rate);
        const monthlyPmt = loanPaymentType === 'annuity'
            ? calcAnnuityPayment(amt, rate, totalMonths)
            : calcDifferentiatedPayment(amt, rate, totalMonths, 0);

        // Create recurring payment if payment account selected
        let recurringId: string | null = null;
        if (loanPaymentAccountId) {
            // Find or create "Кредит" category
            let { data: creditCat } = await supabase
                .from('categories')
                .select('id')
                .eq('household_id', hid)
                .eq('name', 'Кредит')
                .single();

            if (!creditCat) {
                const { data: newCat } = await supabase.from('categories').insert({
                    household_id: hid,
                    name: 'Кредит',
                    icon: 'Landmark',
                    type: 'expense',
                    expense_type: 'infrastructure',
                }).select('id').single();
                creditCat = newCat;
            }

            if (creditCat) {
                // Calculate next payment date based on payment day
                const day = parseInt(loanPaymentDay) || 15;
                const now = new Date();
                let nextPay = new Date(now.getFullYear(), now.getMonth(), day);
                if (nextPay <= now) nextPay = addMonths(nextPay, 1);

                // Calculate notify_days_before from reminder date
                const reminderDiff = Math.max(0, Math.round((nextPay.getTime() - loanReminderDate.getTime()) / 86400000));

                const typeLabel = loanType === 'other' && loanCustomType ? loanCustomType : LOAN_TYPE_LABELS[loanType];
                const { data: recData } = await supabase.from('recurring_payments').insert({
                    household_id: hid,
                    account_id: loanPaymentAccountId,
                    category_id: creditCat.id,
                    name: `${loanName} · ${typeLabel}`,
                    type: 'expense',
                    expense_type: 'infrastructure',
                    amount: Math.round(monthlyPmt * 100) / 100,
                    currency: loanCurrency,
                    frequency: 'monthly',
                    next_date: format(nextPay, 'yyyy-MM-dd'),
                    notify_days_before: reminderDiff || 3,
                    is_active: true,
                }).select('id').single();
                recurringId = recData?.id ?? null;
            }
        }

        const { data: loanRow, error } = await supabase.from('loans').insert({
            household_id: hid,
            name: loanName,
            icon: loanIcon,
            color: loanColor,
            loan_type: loanType,
            custom_type_name: loanType === 'other' ? loanCustomType || null : null,
            total_amount: amt,
            paid_amount: paid,
            currency: loanCurrency,
            payment_type: loanPaymentType,
            start_date: format(loanStartDate, 'yyyy-MM-dd'),
            end_date: format(loanEndDate, 'yyyy-MM-dd'),
            payment_account_id: loanPaymentAccountId || null,
            source_account_id: loanSourceAccountId || null,
            recurring_id: recurringId,
        }).select('id').single();

        if (error) {
            console.error('Loan create error:', error);
            Alert.alert('Ошибка', error.message);
            setSavingLoan(false);
            return;
        }

        // Insert rate periods
        if (loanRow) {
            const periodsToInsert = validPeriods.map(p => ({
                loan_id: loanRow.id,
                rate: parseFloat(p.rate),
                from_date: format(p.fromDate, 'yyyy-MM-dd'),
                to_date: p.toDate ? format(p.toDate, 'yyyy-MM-dd') : null,
            }));
            const { error: rpErr } = await supabase.from('loan_rate_periods').insert(periodsToInsert);
            if (rpErr) console.error('Rate periods insert error:', rpErr);
        }

        // If source account, deduct (loan received = income to account)
        if (loanSourceAccountId) {
            const srcAcc = accounts.find(a => a.id === loanSourceAccountId);
            if (srcAcc) {
                await supabase.from('accounts').update({
                    balance: srcAcc.balance + amt,
                }).eq('id', loanSourceAccountId);
                fetchAccounts(hid);
            }
        }

        closeLoanModal();
        fetchLoans(hid);
    }

    async function updateLoan(hid: string) {
        if (!editingLoan) return;
        setSavingLoan(true);
        const amt = parseFloat(loanAmount);
        const paid = parseFloat(loanPaidAmount || '0');
        if (!loanName || isNaN(amt)) { setSavingLoan(false); return; }

        const validPeriods = loanRateDrafts.filter(p => {
            const r = parseFloat(p.rate);
            return !isNaN(r) && r > 0;
        });
        if (validPeriods.length === 0) { setSavingLoan(false); return; }

        await supabase.from('loans').update({
            name: loanName,
            icon: loanIcon,
            color: loanColor,
            loan_type: loanType,
            custom_type_name: loanType === 'other' ? loanCustomType || null : null,
            total_amount: amt,
            paid_amount: paid,
            currency: loanCurrency,
            payment_type: loanPaymentType,
            start_date: format(loanStartDate, 'yyyy-MM-dd'),
            end_date: format(loanEndDate, 'yyyy-MM-dd'),
            payment_account_id: loanPaymentAccountId || null,
            source_account_id: loanSourceAccountId || null,
        }).eq('id', editingLoan.id);

        // Replace rate periods
        await supabase.from('loan_rate_periods').delete().eq('loan_id', editingLoan.id);
        const periodsToInsert = validPeriods.map(p => ({
            loan_id: editingLoan.id,
            rate: parseFloat(p.rate),
            from_date: format(p.fromDate, 'yyyy-MM-dd'),
            to_date: p.toDate ? format(p.toDate, 'yyyy-MM-dd') : null,
        }));
        await supabase.from('loan_rate_periods').insert(periodsToInsert);

        // Update recurring payment amount if exists
        if (editingLoan.recurringId) {
            const totalMonths = differenceInMonths(loanEndDate, loanStartDate);
            const rate = parseFloat(validPeriods[validPeriods.length - 1].rate);
            const monthlyPmt = loanPaymentType === 'annuity'
                ? calcAnnuityPayment(amt, rate, totalMonths)
                : calcDifferentiatedPayment(amt, rate, totalMonths, 0);
            await supabase.from('recurring_payments').update({
                amount: Math.round(monthlyPmt * 100) / 100,
                name: `Кредит: ${loanName}`,
            }).eq('id', editingLoan.recurringId);
        }

        closeLoanModal();
        fetchLoans(hid);
    }

    async function closeLoanAction(loan: LoanData) {
        if (!householdId) return;
        Alert.alert('Закрыть кредит?', 'Кредит будет помечен как закрытый', [
            { text: 'Отмена', style: 'cancel' },
            { text: 'Закрыть', style: 'destructive', onPress: async () => {
                await supabase.from('loans').update({ is_active: false }).eq('id', loan.id);
                if (loan.recurringId) {
                    await supabase.from('recurring_payments').update({ is_active: false }).eq('id', loan.recurringId);
                }
                setSelectedLoan(null);
                fetchLoans(householdId);
            }},
        ]);
    }

    async function confirmLoanPayment(loan: LoanData) {
        if (!householdId || confirmingPayment) return;
        setConfirmingPayment(true);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setConfirmingPayment(false); return; }

        // Find or create "Кредит" category
        let { data: creditCat } = await supabase
            .from('categories')
            .select('id')
            .eq('household_id', householdId)
            .eq('name', 'Кредит')
            .single();

        if (!creditCat) {
            const { data: newCat } = await supabase.from('categories').insert({
                household_id: householdId,
                name: 'Кредит',
                icon: 'Landmark',
                type: 'expense',
                expense_type: 'infrastructure',
            }).select('id').single();
            creditCat = newCat;
        }

        if (!creditCat) { setConfirmingPayment(false); return; }

        const paymentAmount = loan.monthlyPayment;

        // 1. Create expense transaction
        const { error: txErr } = await supabase.from('transactions').insert({
            household_id: householdId,
            account_id: loan.paymentAccountId,
            category_id: creditCat.id,
            user_id: user.id,
            type: 'expense',
            amount: Math.round(paymentAmount * 100) / 100,
            currency: loan.currency,
            note: `Платёж по кредиту: ${loan.name}`,
            date: format(new Date(), 'yyyy-MM-dd'),
        });

        if (txErr) {
            console.error('Loan payment tx error:', txErr);
            Alert.alert('Ошибка', txErr.message);
            setConfirmingPayment(false);
            return;
        }

        // 2. Deduct from account balance
        if (loan.paymentAccountId) {
            const acc = accounts.find(a => a.id === loan.paymentAccountId);
            if (acc) {
                await supabase.from('accounts').update({
                    balance: acc.balance - paymentAmount,
                }).eq('id', loan.paymentAccountId);
            }
        }

        // 3. Update paid_amount on loan
        const newPaid = loan.paidAmount + paymentAmount;
        await supabase.from('loans').update({
            paid_amount: Math.round(newPaid * 100) / 100,
        }).eq('id', loan.id);

        // 4. Shift recurring payment next_date
        if (loan.recurringId) {
            const { data: rec } = await supabase
                .from('recurring_payments')
                .select('next_date')
                .eq('id', loan.recurringId)
                .single();
            if (rec) {
                const nextDate = addMonths(new Date(rec.next_date as string), 1);
                await supabase.from('recurring_payments').update({
                    next_date: format(nextDate, 'yyyy-MM-dd'),
                }).eq('id', loan.recurringId);
            }
        }

        // 5. Refresh data
        setConfirmingPayment(false);
        setSelectedLoan({ ...loan, paidAmount: newPaid });
        fetchLoans(householdId);
        if (householdId) fetchAccounts(householdId);
        Alert.alert('Готово', `Платёж ${formatAmount(paymentAmount, loan.currency)} подтверждён`);
    }

    function openEditLoan(loan: LoanData) {
        setEditingLoan(loan);
        setLoanName(loan.name);
        setLoanIcon(loan.icon);
        setLoanColor(loan.color);
        setLoanType(loan.loanType);
        setLoanCustomType(loan.customTypeName ?? '');
        setLoanAmount(String(loan.totalAmount));
        setLoanPaidAmount(String(loan.paidAmount));
        setLoanCurrency(loan.currency);
        setLoanPaymentType(loan.paymentType);
        setLoanStartDate(loan.startDate);
        setLoanEndDate(loan.endDate);
        setLoanRateDrafts(loan.ratePeriods.map(p => ({
            rate: String(p.rate),
            fromDate: p.from,
            toDate: p.to,
        })));
        setLoanPaymentAccountId(loan.paymentAccountId ?? '');
        setLoanSourceAccountId(loan.sourceAccountId ?? '');
        setLoanRatePickerIdx(null);
        setShowAddLoan(true);
    }

    function closeLoanModal() {
        setShowAddLoan(false);
        setEditingLoan(null);
        setLoanName(''); setLoanAmount(''); setLoanPaidAmount('');
        setLoanIcon('Home'); setLoanColor('#FF6B6B');
        setLoanType('mortgage'); setLoanCustomType(''); setLoanPaymentType('annuity');
        setLoanCurrency(currency);
        setLoanStartDate(new Date());
        setLoanEndDate(addMonths(new Date(), 60));
        setLoanRateDrafts([{ rate: '', fromDate: new Date(), toDate: null }]);
        setLoanRatePickerIdx(null);
        setLoanPaymentAccountId(''); setLoanSourceAccountId('');
        setLoanPaymentDay('15'); setLoanReminderDate(new Date()); setShowLoanReminderPicker(false);
        setSavingLoan(false);
    }

    const LOAN_TYPE_LABELS: Record<LoanType, string> = {
        mortgage: 'Ипотека', auto: 'Автокредит', consumer: 'Потребительский', other: 'Другой',
    };

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
                accountId: g.account_id as string,
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

    // ── Smart Recommendation (local rules) ─────────────────────────────────
    function generateRecommendation(): string {
        const today = new Date();

        // Priority 1: Deposit ending within 2 months
        for (const d of deposits) {
            if (d.endDate) {
                const monthsLeft = differenceInMonths(d.endDate, today);
                if (monthsLeft >= 0 && monthsLeft <= 2) {
                    return `Депозит «${d.name}» закрывается ${format(d.endDate, 'd MMMM', { locale: ru })} — не забудь продлить, чтобы деньги продолжали работать.`;
                }
            }
        }

        // Priority 2: Extra category over limit — link to a goal
        const overExtras = extraCategories.filter(e => e.extra > 0);
        if (overExtras.length > 0) {
            const worst = overExtras.reduce((a, b) => b.extra > a.extra ? b : a);
            const goalRef = goalsState.length > 0 ? goalsState[0] : null;
            if (goalRef) {
                return `В этом месяце «${worst.name}» — перерасход ${formatAmount(worst.extra, currency)}. Это ${goalRef.target > 0 ? Math.round(worst.extra / goalRef.target * 100) + '% от цели' : 'часть взноса в'} «${goalRef.name}».`;
            }
            return `В этом месяце «${worst.name}» — перерасход ${formatAmount(worst.extra, currency)}. Эту сумму можно было отложить на накопления.`;
        }

        // Priority 3: Goal with deadline — calculate timeline
        for (const g of goalsState) {
            if (g.targetDate) {
                const deadline = new Date(g.targetDate);
                const monthsLeft = differenceInMonths(deadline, today);
                if (monthsLeft > 0 && monthsLeft <= 6) {
                    const remaining = Math.max(g.target - g.saved, 0);
                    const perMonth = Math.ceil(remaining / monthsLeft);
                    return `До «${g.name}» ${monthsLeft} мес. Осталось ${formatAmount(remaining, g.currency)} — нужно откладывать ~${formatAmount(perMonth, g.currency)}/мес.`;
                }
                if (monthsLeft > 6) {
                    const pct = g.target > 0 ? Math.round(g.saved / g.target * 100) : 0;
                    return `«${g.name}» — ${pct}% готово. До дедлайна ещё ${monthsLeft} мес., хороший темп.`;
                }
            }
        }

        // Priority 4: Deposit with good rate
        const bestDep = deposits.reduce<DepositData | null>((best, d) => !best || d.currentRate > best.currentRate ? d : best, null);
        if (bestDep && bestDep.currentRate > 0) {
            const accrued = calcAccruedInterest(bestDep.amount, bestDep.ratePeriods, bestDep.capitalization, bestDep.startDate);
            if (accrued > 0) {
                return `Депозит «${bestDep.name}» уже принёс ${formatAmount(accrued, bestDep.currency)} процентного дохода при ставке ${bestDep.currentRate}%.`;
            }
            return `Депозит «${bestDep.name}» работает под ${bestDep.currentRate}% годовых — деньги не простаивают.`;
        }

        // Priority 5: General goals progress
        if (goalsState.length > 0) {
            const totalSaved = goalsState.reduce((s, g) => s + g.saved, 0);
            const totalTarget = goalsState.reduce((s, g) => s + g.target, 0);
            const pct = totalTarget > 0 ? Math.round(totalSaved / totalTarget * 100) : 0;
            return `Общий прогресс по целям — ${pct}%. ${pct < 30 ? 'Регулярные пополнения помогут набрать темп.' : pct < 70 ? 'Хороший прогресс, продолжайте!' : 'Отличный результат, цели почти достигнуты!'}`;
        }

        return 'Создайте первую цель или депозит, чтобы получить персональную рекомендацию.';
    }

    useEffect(() => {
        if (tab !== 'savings') return;
        if (goalsState.length > 0 || deposits.length > 0 || extraCategories.length > 0) {
            setRecommendation(generateRecommendation());
        }
    }, [tab, goalsState, deposits, extraCategories]);

    // ── Open add-goal modal (reset form + pre-select first account) ─────────
    function openAddGoalModal() {
        setGoalName('');
        setGoalIcon('🎯');
        setGoalTarget('');
        setGoalCurrency(currency);
        setGoalDateObj(null);
        setShowGoalDatePicker(false);
        setShowCurrencyDropdown(false);
        setCurrencySearch('');
        setGoalColor('#7C6FFF');
        setGoalAccountId(accounts[0]?.id ?? '');
        setShowAddGoal(true);
    }

    // ── Create savings goal ─────────────────────────────────────────────────
    async function createGoal() {
        if (!householdId || !goalName.trim() || !goalTarget.trim() || !goalAccountId) return;
        const targetAmt = parseFloat(goalTarget.replace(',', '.'));
        if (isNaN(targetAmt) || targetAmt <= 0) return;

        const targetDate = goalDateObj
            ? format(goalDateObj, 'yyyy-MM-dd')
            : null;

        setSavingGoal(true);
        const { error } = await supabase.from('savings_goals').insert({
            household_id: householdId,
            account_id:   goalAccountId,
            name:         goalName.trim(),
            icon:         goalIcon,
            color:        goalColor,
            target_amount: targetAmt,
            currency:     goalCurrency,
            target_date:  targetDate,
            compounding:  'monthly',
            is_active:    true,
            is_archived:  false,
        });
        setSavingGoal(false);
        if (error) { console.error('createGoal error:', error.message); return; }
        closeGoalModal();
        fetchSavings(householdId);
    }

    function openEditGoal(goal: GoalItem) {
        setEditingGoal(goal);
        setGoalName(goal.name);
        setGoalIcon(goal.icon);
        setGoalColor(goal.color);
        setGoalTarget(String(goal.target));
        setGoalCurrency(goal.currency);
        setGoalDateObj(goal.targetDate ? new Date(goal.targetDate) : null);
        setGoalAccountId(goal.accountId);
        setShowAddGoal(true);
    }

    async function updateGoal() {
        if (!editingGoal || !goalName.trim() || !goalTarget.trim() || !goalAccountId) return;
        const targetAmt = parseFloat(goalTarget.replace(',', '.'));
        if (isNaN(targetAmt) || targetAmt <= 0) return;

        setSavingGoal(true);
        const { error } = await supabase.from('savings_goals').update({
            account_id:   goalAccountId,
            name:         goalName.trim(),
            icon:         goalIcon,
            color:        goalColor,
            target_amount: targetAmt,
            currency:     goalCurrency,
            target_date:  goalDateObj ? format(goalDateObj, 'yyyy-MM-dd') : null,
        }).eq('id', editingGoal.id);
        setSavingGoal(false);
        if (error) { console.error('updateGoal error:', error.message); return; }
        closeGoalModal();
        if (householdId) fetchSavings(householdId);
    }

    function closeGoalModal() {
        setShowAddGoal(false);
        setEditingGoal(null);
        setGoalName('');
        setGoalIcon('🎯');
        setGoalColor('#7C6FFF');
        setGoalTarget('');
        setGoalCurrency('EUR');
        setGoalDateObj(null);
        setGoalAccountId('');
        setShowGoalDatePicker(false);
        setShowCurrencyDropdown(false);
        setCurrencySearch('');
    }

    // ── Goal detail helpers ─────────────────────────────────────────────────

    function openGoalDetail(goal: GoalItem) {
        setSelectedGoal(goal);
        setGoalRate(5.0);
        setGoalRateInput('5.0');
        setGoalCompounding('monthly');
        setShowGoalTopUp(false);
        setGoalTopUpAmount('');
        setGoalTopUpAccountId('');
        setGoalTopUpDate(new Date());
    }

    function closeGoalDetail() {
        setSelectedGoal(null);
        setShowGoalTopUp(false);
        setShowArchiveGoal(false);
    }

    const goalCalc = (() => {
        if (!selectedGoal) return { interest: 0, forecast: 0, needToAdd: 0, endDate: new Date(), daysLeft: 0 };
        const now = new Date();
        const endDate = selectedGoal.targetDate
            ? new Date(selectedGoal.targetDate)
            : new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
        const daysLeft = Math.max(0, differenceInDays(endDate, now));
        const yearsLeft = daysLeft / 365;
        const r = goalRate / 100;
        const n = goalCompounding === 'monthly' ? 12 : 1;
        const interest = yearsLeft > 0 && r > 0
            ? selectedGoal.saved * (Math.pow(1 + r / n, n * yearsLeft) - 1)
            : 0;
        const forecast = selectedGoal.saved + interest;
        const needToAdd = Math.max(0, selectedGoal.target - forecast);
        return { interest, forecast, needToAdd, endDate, daysLeft };
    })();

    async function confirmArchiveGoal() {
        if (!selectedGoal) return;
        setArchivingGoal(true);
        await supabase.from('savings_goals')
            .update({ is_archived: true, is_active: false })
            .eq('id', selectedGoal.id);
        setArchivingGoal(false);
        setShowArchiveGoal(false);
        closeGoalDetail();
        if (householdId) fetchSavings(householdId);
    }

    async function confirmGoalTopUp() {
        if (!selectedGoal) return;
        const amt = parseFloat(goalTopUpAmount.replace(',', '.'));
        if (isNaN(amt) || amt <= 0) return;

        setSavingGoalTopUp(true);
        try {
            const newSaved = selectedGoal.saved + amt;
            await supabase.from('savings_goals').update({ current_amount: newSaved }).eq('id', selectedGoal.id);

            if (goalTopUpAccountId) {
                const srcAcc = accounts.find(a => a.id === goalTopUpAccountId);
                if (srcAcc) {
                    await supabase.from('accounts').update({ balance: srcAcc.balance - amt }).eq('id', goalTopUpAccountId);
                    const uid = (await supabase.auth.getUser()).data.user?.id;
                    if (uid) {
                        const { data: hm } = await supabase.from('household_members').select('household_id').eq('user_id', uid).single();
                        if (hm) {
                            await supabase.from('transactions').insert({
                                household_id: hm.household_id,
                                account_id: goalTopUpAccountId,
                                category_id: null,
                                type: 'expense',
                                amount: amt,
                                currency: selectedGoal.currency,
                                date: format(goalTopUpDate, 'yyyy-MM-dd'),
                                description: `Пополнение цели «${selectedGoal.name}»`,
                                created_by: uid,
                            });
                        }
                    }
                }
            }

            setShowGoalTopUp(false);
            setGoalTopUpAmount('');
            setGoalTopUpAccountId('');
            setGoalTopUpDate(new Date());
            closeGoalDetail();
            if (householdId) fetchSavings(householdId);
        } catch (e: any) {
            Alert.alert('Ошибка', e.message);
        } finally {
            setSavingGoalTopUp(false);
        }
    }

    // ── Derived ─────────────────────────────────────────────────────────────

    const summaryData = overviewByPeriod[summaryPeriod] ?? null;
    const chartData = overviewByPeriod[chartPeriod] ?? null;
    const catData = overviewByPeriod[catPeriod] ?? null;

    const totalIncome = summaryData ? summaryData.income + summaryData.depositInterest : 0;
    const incomeChange = summaryData ? pct(summaryData.income, summaryData.prevIncome) : 0;
    const expChange = summaryData ? pct(summaryData.expenses, summaryData.prevExpenses) : 0;
    const balance = summaryData ? totalIncome - summaryData.expenses : 0;

    const DEPOSIT_PERIOD_LABEL: Record<Period, string> = {
        day: 'сегодня', week: 'эту неделю', month: 'этот месяц', quarter: 'этот квартал', year: 'в этом году',
    };
    const TABS: { id: AnalyticsTab; label: string }[] = [
        { id: 'overview', label: 'Обзор' },
        { id: 'forecast', label: 'Прогноз' },
        { id: 'savings', label: 'Накопления' },
        { id: 'loans', label: 'Кредиты' },
    ];

    // ── Render ──────────────────────────────────────────────────────────────
    return (
        <View style={{ flex: 1, backgroundColor: '#090D1A' }}>
            {/* Header */}
            <View style={{ paddingTop: 60, paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={{ marginRight: 12 }}>
                    <ChevronLeft color="#fff" size={24} />
                </TouchableOpacity>
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
                        {/* Summary card */}
                        <Card>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                                <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Сводка</Text>
                                <PeriodPills value={summaryPeriod} onChange={setSummaryPeriod} />
                            </View>
                            {fetchingPeriods.has(summaryPeriod) && !summaryData ? <Spinner /> : summaryData ? (
                                <>
                                    <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16 }}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Доходы</Text>
                                            <Text style={{ fontSize: 20, fontWeight: '800', color: '#4FFFB0' }}>
                                                +{formatAmount(summaryData.income, currency)}
                                            </Text>
                                            {summaryData.prevIncome > 0 && (
                                                <Text style={{ fontSize: 10, color: incomeChange >= 0 ? '#4FFFB0' : '#FF6B6B', marginTop: 3 }}>
                                                    {incomeChange >= 0 ? '↑' : '↓'} {Math.abs(incomeChange)}% vs прошлый
                                                </Text>
                                            )}
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Расходы</Text>
                                            <Text style={{ fontSize: 20, fontWeight: '800', color: '#FF6B6B' }}>
                                                −{formatAmount(summaryData.expenses, currency)}
                                            </Text>
                                            {summaryData.prevExpenses > 0 && (
                                                <Text style={{ fontSize: 10, color: expChange <= 0 ? '#4FFFB0' : '#FF6B6B', marginTop: 3 }}>
                                                    {expChange >= 0 ? '↑' : '↓'} {Math.abs(expChange)}% vs прошлый
                                                </Text>
                                            )}
                                        </View>
                                    </View>
                                    <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', paddingTop: 14 }}>
                                        <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Чистый баланс</Text>
                                        <Text style={{ fontSize: 24, fontWeight: '800', color: balance >= 0 ? '#4FFFB0' : '#FF6B6B' }}>
                                            {balance >= 0 ? '+' : '−'}{formatAmount(Math.abs(balance), currency)}
                                        </Text>
                                    </View>
                                </>
                            ) : null}
                        </Card>

                        {/* Deposit interest block */}
                        {summaryData && summaryData.deposits.length > 0 && summaryData.depositInterest > 0 && (
                            <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/(app)/analytics?tab=savings')}>
                                <Card>
                                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 2 }}>
                                        💰 Деньги работали {DEPOSIT_PERIOD_LABEL[summaryPeriod]}
                                    </Text>
                                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 14 }}>
                                        Проценты по вашим депозитам
                                    </Text>
                                    <Text style={{ fontSize: 22, fontWeight: '800', color: '#4FFFB0', marginBottom: 14 }}>
                                        +{formatAmount(summaryData.depositInterest, currency)}
                                    </Text>
                                    {summaryData.deposits.map((dep, i) => (
                                        <View key={i} style={{
                                            flexDirection: 'row', alignItems: 'center', gap: 10,
                                            paddingVertical: 8,
                                            borderTopWidth: i === 0 ? 1 : 0,
                                            borderBottomWidth: i < summaryData.deposits.length - 1 ? 1 : 0,
                                            borderColor: 'rgba(255,255,255,0.06)',
                                        }}>
                                            <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(79,255,176,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                                                <Text style={{ fontSize: 15 }}>{dep.icon}</Text>
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>{dep.name}</Text>
                                                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{dep.rate}% годовых</Text>
                                            </View>
                                            <Text style={{ fontSize: 14, fontWeight: '700', color: '#4FFFB0' }}>
                                                +{formatAmount(dep.interest, dep.currency)}
                                            </Text>
                                        </View>
                                    ))}
                                </Card>
                            </TouchableOpacity>
                        )}

                        {/* Bar chart */}
                        <Card>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Динамика</Text>
                                <PeriodPills value={chartPeriod} onChange={setChartPeriod} />
                            </View>
                            {fetchingPeriods.has(chartPeriod) && !chartData ? <Spinner /> : chartData ? (
                                <>
                                    <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#4FFFB0' }} />
                                            <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Доходы</Text>
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#FF6B6B' }} />
                                            <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Расходы</Text>
                                        </View>
                                    </View>
                                    <BarChart data={chartData.chart} currency={currency} />
                                </>
                            ) : null}
                        </Card>

                        {/* Donut + Categories */}
                        <Card>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                                <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Расходы</Text>
                                <PeriodPills value={catPeriod} onChange={setCatPeriod} />
                            </View>
                            {fetchingPeriods.has(catPeriod) && !catData ? <Spinner /> : catData && catData.categories.length > 0 ? (() => {
                                const totalExp = catData.categories.reduce((s, c) => s + c.amount, 0);
                                const COLLAPSED_COUNT = 4;
                                const hiddenCount = Math.max(0, catData.categories.length - COLLAPSED_COUNT);

                                return catExpanded ? (
                                    <>
                                        {/* Expanded: header with collapse */}
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                            <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Структура расходов</Text>
                                            <TouchableOpacity onPress={() => setCatExpanded(false)}>
                                                <Text style={{ fontSize: 12, color: '#7C6FFF', fontWeight: '600' }}>Свернуть</Text>
                                            </TouchableOpacity>
                                        </View>
                                        {/* Full category list with progress bars */}
                                        {catData.categories.map((cat, i, arr) => (
                                            <TouchableOpacity key={cat.id} activeOpacity={0.7}
                                                onPress={() => router.push({ pathname: '/transactions', params: { category_id: cat.id, period: catPeriod } } as any)}
                                                style={{
                                                    flexDirection: 'row', alignItems: 'center', gap: 12,
                                                    paddingVertical: 11,
                                                    borderBottomWidth: i < arr.length - 1 ? 1 : 0,
                                                    borderBottomColor: 'rgba(255,255,255,0.04)',
                                                }}>
                                                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: cat.color + '26', alignItems: 'center', justifyContent: 'center' }}>
                                                    <CategoryIcon iconName={cat.icon} color={cat.color} size={18} />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                                                        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>{cat.name}</Text>
                                                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{formatAmount(cat.amount, currency)}</Text>
                                                    </View>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                        <View style={{ flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
                                                            <View style={{ height: 3, width: `${Math.min(cat.percent, 100)}%`, backgroundColor: cat.color, borderRadius: 2 }} />
                                                        </View>
                                                        <Text style={{ fontSize: 10, color: cat.color, fontWeight: '700', minWidth: 28, textAlign: 'right' }}>
                                                            {Math.round(cat.percent)}%
                                                        </Text>
                                                    </View>
                                                </View>
                                            </TouchableOpacity>
                                        ))}
                                    </>
                                ) : (
                                    /* Collapsed: horizontal donut + legend */
                                    <DonutChart
                                        categories={catData.categories}
                                        totalAmount={totalExp}
                                        currency={currency}
                                        active={activeCategory}
                                        onPress={setActiveCategory}
                                        visibleLegend={catData.categories.slice(0, COLLAPSED_COUNT)}
                                        hiddenCount={hiddenCount}
                                        onMorePress={hiddenCount > 0 ? () => setCatExpanded(true) : undefined}
                                    />
                                );
                            })() : catData ? (
                                <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                                    <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Нет расходов за период</Text>
                                </View>
                            ) : null}
                        </Card>
                    </>
                )}

                {/* ══ FORECAST ══════════════════════════════════════════════ */}
                {tab === 'forecast' && (() => {
                    const FORECAST_PILLS: { id: ForecastPeriod; label: string }[] = [
                        { id: 'month', label: 'Месяц' },
                        { id: 'quarter', label: 'Квартал' },
                        { id: 'half', label: 'Полгода' },
                        { id: 'year', label: 'Год' },
                        { id: 'custom', label: 'Свой' },
                    ];
                    const FORECAST_TITLES: Record<ForecastPeriod, string> = {
                        month: 'ПРОГНОЗ ДО КОНЦА МЕСЯЦА',
                        quarter: 'ПРОГНОЗ НА 3 МЕСЯЦА',
                        half: 'ПРОГНОЗ НА 6 МЕСЯЦЕВ',
                        year: 'ПРОГНОЗ НА 12 МЕСЯЦЕВ',
                        custom: 'ПРОГНОЗ НА ПЕРИОД',
                    };

                    function formatRemaining(days: number): string {
                        if (days <= 0) return '0 дн';
                        const m = Math.floor(days / 30);
                        const d = days % 30;
                        if (m >= 1) return `${m} мес${d > 0 ? ` ${d} дн` : ''}`;
                        return `${days} дн`;
                    }

                    return (
                        <>
                            {/* Period selector */}
                            <View style={{ flexDirection: 'row', gap: 2, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 2, marginBottom: 12 }}>
                                {FORECAST_PILLS.map(p => (
                                    <TouchableOpacity key={p.id} onPress={() => { setForecastPeriod(p.id); setShowCustomFrom(false); setShowCustomTo(false); }} style={{
                                        flex: 1, alignItems: 'center',
                                        paddingVertical: 6, borderRadius: 12,
                                        backgroundColor: forecastPeriod === p.id ? 'rgba(124,111,255,0.25)' : 'transparent',
                                    }}>
                                        <Text style={{ fontSize: 11, fontWeight: '600', color: forecastPeriod === p.id ? '#7C6FFF' : 'rgba(255,255,255,0.3)' }}>
                                            {p.label}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Custom date pickers */}
                            {forecastPeriod === 'custom' && (
                                <>
                                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                                        <TouchableOpacity onPress={() => { setShowCustomFrom(f => !f); setShowCustomTo(false); }}
                                            style={{ flex: 1, backgroundColor: showCustomFrom ? 'rgba(124,111,255,0.15)' : 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 12, borderWidth: showCustomFrom ? 1 : 0, borderColor: 'rgba(124,111,255,0.3)' }}>
                                            <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginBottom: 4, textTransform: 'uppercase' }}>От</Text>
                                            <Text style={{ fontSize: 13, color: '#fff', fontWeight: '600' }}>{format(customFrom, 'dd.MM.yyyy')}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => { setShowCustomTo(f => !f); setShowCustomFrom(false); }}
                                            style={{ flex: 1, backgroundColor: showCustomTo ? 'rgba(124,111,255,0.15)' : 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 12, borderWidth: showCustomTo ? 1 : 0, borderColor: 'rgba(124,111,255,0.3)' }}>
                                            <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginBottom: 4, textTransform: 'uppercase' }}>До</Text>
                                            <Text style={{ fontSize: 13, color: '#fff', fontWeight: '600' }}>{format(customTo, 'dd.MM.yyyy')}</Text>
                                        </TouchableOpacity>
                                    </View>
                                    {showCustomFrom && (
                                        <DateTimePicker value={customFrom} mode="date" display="inline" themeVariant="dark"
                                            onChange={(_, d) => { if (d) { setCustomFrom(d); if (d > customTo) setCustomTo(d); } setShowCustomFrom(false); }} />
                                    )}
                                    {showCustomTo && (
                                        <DateTimePicker value={customTo} mode="date" display="inline" themeVariant="dark" minimumDate={customFrom}
                                            onChange={(_, d) => { if (d) setCustomTo(d); setShowCustomTo(false); }} />
                                    )}
                                </>
                            )}

                            {loadingForecast ? <Spinner /> : !forecastData ? null : (
                                <>
                                    {/* Forecast summary */}
                                    <Card>
                                        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                            {FORECAST_TITLES[forecastPeriod]}
                                        </Text>
                                        <Text style={{ fontSize: 28, fontWeight: '800', color: '#FFB84F', marginBottom: 16 }}>
                                            {formatAmount(forecastData.projectedTotal, currency)}
                                        </Text>
                                        <View style={{ flexDirection: 'row', gap: 10 }}>
                                            <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 10 }}>
                                                <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginBottom: 4, textTransform: 'uppercase' }}>Осталось</Text>
                                                <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{formatRemaining(forecastData.daysLeft)}</Text>
                                            </View>
                                            <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 10 }}>
                                                <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginBottom: 4, textTransform: 'uppercase' }}>Уже потрачено</Text>
                                                <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{formatAmount(forecastData.factSpend, currency)}</Text>
                                            </View>
                                        </View>
                                    </Card>

                                    {/* Fact vs Forecast chart */}
                                    {forecastData.chart.length > 0 && (
                                        <Card>
                                            <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 4 }}>Факт vs Прогноз</Text>
                                            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 14 }}>{forecastData.chartSubtitle}</Text>
                                            <ForecastBarChart data={forecastData.chart} currency={currency} />
                                            <View style={{ flexDirection: 'row', gap: 14, marginTop: 8 }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                    <View style={{ width: 12, height: 8, borderRadius: 2, backgroundColor: '#7C6FFF' }} />
                                                    <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Факт</Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                    <View style={{ width: 12, height: 8, borderRadius: 2, backgroundColor: 'rgba(124,111,255,0.15)', borderWidth: 1, borderColor: 'rgba(124,111,255,0.5)', borderStyle: 'dashed' }} />
                                                    <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Прогноз</Text>
                                                </View>
                                            </View>
                                        </Card>
                                    )}

                                    {/* Budget by category */}
                                    {forecastData.budgets.length > 0 && (
                                        <Card>
                                            <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 4 }}>Бюджет по категориям</Text>
                                            {forecastData.budgets.map((item, i) => <BudgetBar key={i} item={item} currency={currency} />)}
                                        </Card>
                                    )}

                                    {/* ── Block 3: Extra Categories ────────────────── */}
                                    <Card>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                            <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Экстра-категории</Text>
                                            <TouchableOpacity onPress={() => router.push({ pathname: '/settings', params: { openExtras: '1' } } as any)}>
                                                <Text style={{ fontSize: 12, color: '#7C6FFF' }}>Настроить</Text>
                                            </TouchableOpacity>
                                        </View>

                                        {extraCategories.length > 0 ? (
                                            <>
                                                {extraCategories.map(ec => {
                                                    const ratio = ec.scaledComfortable > 0 ? Math.min(ec.spent / ec.scaledComfortable, 1.5) : 0;
                                                    const barPct = Math.min(ratio * 100, 100);
                                                    const isOver = ec.spent > ec.scaledComfortable;
                                                    const { label: periodLabel } = getPeriodMultiplier(forecastPeriod, forecastData.periodStart, forecastData.periodEnd);
                                                    const hasMultipleTags = ec.tags.length > 1;
                                                    const isExpanded = expandedCats.has(`disp:${ec.categoryId}`);
                                                    return (
                                                        <View key={ec.categoryId} style={{ marginBottom: 14 }}>
                                                            <TouchableOpacity
                                                                activeOpacity={hasMultipleTags ? 0.7 : 1}
                                                                onPress={() => {
                                                                    if (hasMultipleTags) {
                                                                        setExpandedCats(prev => {
                                                                            const next = new Set(prev);
                                                                            const k = `disp:${ec.categoryId}`;
                                                                            next.has(k) ? next.delete(k) : next.add(k);
                                                                            return next;
                                                                        });
                                                                    }
                                                                }}
                                                                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}
                                                            >
                                                                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: ec.color + '22', alignItems: 'center', justifyContent: 'center' }}>
                                                                    <CategoryIcon iconName={ec.icon} color={ec.color} size={16} />
                                                                </View>
                                                                <View style={{ flex: 1 }}>
                                                                    <Text style={{ fontSize: 13, color: '#fff', fontWeight: '600' }}>{ec.name}</Text>
                                                                </View>
                                                                {hasMultipleTags && (
                                                                    <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>{isExpanded ? '▼' : '▶'}</Text>
                                                                )}
                                                            </TouchableOpacity>
                                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                                                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                                                                    {formatAmount(ec.spent, currency)}
                                                                    <Text style={{ color: 'rgba(255,255,255,0.3)' }}>
                                                                        {' / '}{formatAmount(ec.scaledComfortable, currency)} комфортно
                                                                    </Text>
                                                                </Text>
                                                                {periodLabel ? (
                                                                    <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>({periodLabel})</Text>
                                                                ) : null}
                                                            </View>
                                                            <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
                                                                <View style={{
                                                                    height: 6,
                                                                    width: `${barPct}%`,
                                                                    backgroundColor: isOver ? '#FF6B6B' : ec.color,
                                                                    borderRadius: 3,
                                                                }} />
                                                            </View>
                                                            {ec.extra > 0 && (
                                                                <Text style={{ fontSize: 11, color: '#FF6B6B', marginTop: 3 }}>
                                                                    экстра: {formatAmount(ec.extra, currency)}
                                                                </Text>
                                                            )}
                                                            {/* Expanded tag breakdown */}
                                                            {hasMultipleTags && isExpanded && (
                                                                <View style={{ marginTop: 8, paddingLeft: 16 }}>
                                                                    {ec.tags.map(tag => {
                                                                        const tRatio = tag.scaledComfortable > 0 ? Math.min(tag.spent / tag.scaledComfortable, 1.5) : 0;
                                                                        const tBarPct = Math.min(tRatio * 100, 100);
                                                                        const tOver = tag.spent > tag.scaledComfortable;
                                                                        return (
                                                                            <View key={tag.tagId || 'whole'} style={{ marginBottom: 8 }}>
                                                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                                                                                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                                                                                        └ {tag.tagName}
                                                                                    </Text>
                                                                                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                                                                                        {formatAmount(tag.spent, currency)} / {formatAmount(tag.scaledComfortable, currency)}
                                                                                    </Text>
                                                                                </View>
                                                                                <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                                                                                    <View style={{ height: 4, width: `${tBarPct}%`, backgroundColor: tOver ? '#FF6B6B' : ec.color, borderRadius: 2, opacity: 0.7 }} />
                                                                                </View>
                                                                                {tag.extra > 0 && (
                                                                                    <Text style={{ fontSize: 10, color: '#FF6B6B', marginTop: 1 }}>экстра: {formatAmount(tag.extra, currency)}</Text>
                                                                                )}
                                                                            </View>
                                                                        );
                                                                    })}
                                                                </View>
                                                            )}
                                                        </View>
                                                    );
                                                })}
                                                {/* Total extra */}
                                                {(() => {
                                                    const totalExtra = extraCategories.reduce((s, e) => s + e.extra, 0);
                                                    if (totalExtra <= 0) return null;
                                                    return (
                                                        <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', paddingTop: 10, marginTop: 4 }}>
                                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                                <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Итого экстра:</Text>
                                                                <Text style={{ fontSize: 14, fontWeight: '700', color: '#FF6B6B' }}>{formatAmount(totalExtra, currency)}</Text>
                                                            </View>
                                                        </View>
                                                    );
                                                })()}
                                            </>
                                        ) : (
                                            <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                                                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
                                                    Нажмите «Настроить», чтобы выбрать{'\n'}категории для отслеживания
                                                </Text>
                                            </View>
                                        )}
                                    </Card>

                                    {/* ── Block 4: Forecast Insight ─────────────────── */}
                                    {forecastData && (
                                        <Card style={{ backgroundColor: 'rgba(124,111,255,0.08)', borderWidth: 1, borderColor: 'rgba(124,111,255,0.2)' }}>
                                            <Text style={{ fontSize: 13, color: '#fff', fontWeight: '600', marginBottom: 6 }}>
                                                💡 Прогноз
                                            </Text>
                                            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 20 }}>
                                                {`Потрачено за ${forecastData.daysPassed} ${forecastData.daysPassed === 1 ? 'день' : forecastData.daysPassed < 5 ? 'дня' : 'дней'}: ${formatAmount(forecastData.factSpend, currency)}.`}
                                                {forecastData.upcomingRecurring.length > 0 ? (
                                                    `\nС учётом предстоящих платежей (${forecastData.upcomingRecurring
                                                        .sort((a, b) => b.amount - a.amount)
                                                        .slice(0, 3)
                                                        .map(r => `${r.name} ${formatAmount(r.amount, currency)}`)
                                                        .join(', ')}${forecastData.upcomingRecurring.length > 3 ? ` и ещё ${forecastData.upcomingRecurring.length - 3}` : ''})`
                                                ) : ''}
                                                {`\nпрогноз до конца периода: ${formatAmount(forecastData.projectedTotal, currency)}`}
                                            </Text>
                                        </Card>
                                    )}

                                    {/* ── Insight: extra savings acceleration ──────── */}
                                    {(() => {
                                        const totalExtra = extraCategories.reduce((s, e) => s + e.extra, 0);
                                        if (totalExtra <= 0) return null;
                                        const periodName = forecastPeriod === 'month' ? 'месяц' : forecastPeriod === 'quarter' ? 'квартал' : forecastPeriod === 'half' ? 'полгода' : forecastPeriod === 'year' ? 'год' : 'период';
                                        // Find nearest unclosed savings goal
                                        const openGoal = goalsState.find(g => g.saved < g.target);
                                        let accelText = '';
                                        if (openGoal) {
                                            // Estimate monthly contribution: saved / months since creation (rough)
                                            const monthlyContrib = openGoal.saved > 0 ? openGoal.saved / Math.max(1, 3) : totalExtra; // fallback
                                            const weeksAccel = monthlyContrib > 0 ? Math.round((totalExtra / monthlyContrib) * 4.3) : 0;
                                            if (weeksAccel > 0) {
                                                accelText = `это ускорит «${openGoal.name}» на ${weeksAccel} нед`;
                                            }
                                        }
                                        return (
                                            <Card style={{ backgroundColor: 'rgba(124,111,255,0.08)', borderWidth: 1, borderColor: 'rgba(124,111,255,0.2)' }}>
                                                <Text style={{ fontSize: 13, color: '#fff', fontWeight: '600', marginBottom: 6 }}>
                                                    💡 Экстра за {periodName}: {formatAmount(totalExtra, currency)}
                                                </Text>
                                                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 18 }}>
                                                    Если сократить до комфортного уровня, сэкономишь {formatAmount(totalExtra, currency)}
                                                    {accelText ? ` — ${accelText}` : ''}
                                                </Text>
                                            </Card>
                                        );
                                    })()}
                                </>
                            )}
                        </>
                    );
                })()}

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
                                        {goalsState.map(goal => (
                                            <GoalCard
                                                key={goal.id}
                                                goal={goal}
                                                onPress={() => openGoalDetail(goal)}
                                                onEdit={() => openEditGoal(goal)}
                                            />
                                        ))}
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

                                {/* ── Block 2: Deposits ─────────────────────── */}
                                <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff', marginTop: 8, marginBottom: 12 }}>Депозиты</Text>

                                {deposits.length > 0 ? (
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, paddingLeft: 20, marginBottom: 12 }} contentContainerStyle={{ paddingRight: 20, gap: 10 }}>
                                        {deposits.map(dep => (
                                            <TouchableOpacity key={dep.id} activeOpacity={0.7} onPress={() => openEditDeposit(dep)}
                                                style={{
                                                    width: 260,
                                                    backgroundColor: 'rgba(255,255,255,0.04)',
                                                    borderRadius: 16, padding: 16,
                                                    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.06)',
                                                }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: dep.color + '20', borderWidth: 1.5, borderColor: dep.color + '40', alignItems: 'center', justifyContent: 'center' }}>
                                                        <CategoryIcon iconName={dep.icon} color={dep.color} size={18} />
                                                    </View>
                                                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff', flex: 1 }}>{dep.name}</Text>
                                                </View>

                                                {[
                                                    { label: 'Ставка', value: `${dep.currentRate}%` },
                                                    { label: 'Сумма', value: formatAmount(dep.amount, dep.currency) },
                                                ].map((row, i) => (
                                                    <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                                                        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{row.label}:</Text>
                                                        <Text style={{ fontSize: 12, color: '#fff', fontWeight: '600' }}>{row.value}</Text>
                                                    </View>
                                                ))}

                                                <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
                                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                                                        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                                                            Прогноз {dep.endDate ? format(dep.endDate, 'dd.MM.yy') : '5 лет'}
                                                        </Text>
                                                        <Text style={{ fontSize: 12, color: '#4FFFB0', fontWeight: '700' }}>{formatAmount(dep.projectedValue, dep.currency)}</Text>
                                                    </View>
                                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                                                        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>% доход</Text>
                                                        <Text style={{ fontSize: 11, color: '#7C6FFF', fontWeight: '600' }}>{formatAmount(dep.interestEarned, dep.currency)}</Text>
                                                    </View>
                                                </View>
                                            </TouchableOpacity>
                                        ))}

                                        {/* Add button as last card */}
                                        <TouchableOpacity
                                            onPress={() => { setEditingDeposit(null); setDepositCurrency(currency); setShowAddDeposit(true); }}
                                            style={{
                                                width: 120, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                                                backgroundColor: 'rgba(124,111,255,0.06)',
                                                borderWidth: 1.5, borderColor: 'rgba(124,111,255,0.2)',
                                                borderStyle: 'dashed',
                                            }}>
                                            <Text style={{ color: '#7C6FFF', fontSize: 28, fontWeight: '300', marginBottom: 4 }}>+</Text>
                                            <Text style={{ color: '#7C6FFF', fontSize: 11, fontWeight: '600' }}>Добавить</Text>
                                        </TouchableOpacity>
                                    </ScrollView>
                                ) : (
                                    <TouchableOpacity
                                        onPress={() => { setEditingDeposit(null); setDepositCurrency(currency); setShowAddDeposit(true); }}
                                        style={{
                                            width: '100%', paddingVertical: 14,
                                            backgroundColor: 'rgba(124,111,255,0.08)',
                                            borderWidth: 1.5, borderColor: 'rgba(124,111,255,0.25)',
                                            borderStyle: 'dashed',
                                            borderRadius: 16, alignItems: 'center', marginBottom: 12,
                                        }}>
                                        <Text style={{ color: '#7C6FFF', fontSize: 14, fontWeight: '600' }}>+ Добавить депозит</Text>
                                    </TouchableOpacity>
                                )}

                                {/* ── Block 3: Summary ─────────────────────── */}
                                {(goalsState.length > 0 || deposits.length > 0) && (
                                    <Card>
                                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 14 }}>Сводка накоплений</Text>

                                        {/* Goals section */}
                                        {goalsState.length > 0 && (
                                            <>
                                                <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Цели</Text>
                                                {[
                                                    { label: 'Накоплено', value: formatAmount(goalsState.reduce((s, g) => s + g.saved, 0), currency), color: '#4FFFB0' },
                                                    { label: 'Осталось', value: formatAmount(goalsState.reduce((s, g) => s + Math.max(g.target - g.saved, 0), 0), currency), color: '#7C6FFF' },
                                                ].map((item, i) => (
                                                    <View key={`g${i}`} style={{
                                                        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                                                        paddingVertical: 8,
                                                        borderBottomWidth: i === 0 ? 1 : 0,
                                                        borderBottomColor: 'rgba(255,255,255,0.05)',
                                                    }}>
                                                        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>{item.label}</Text>
                                                        <Text style={{ fontSize: 14, fontWeight: '700', color: item.color }}>{item.value}</Text>
                                                    </View>
                                                ))}
                                            </>
                                        )}

                                        {/* Deposits section */}
                                        {deposits.length > 0 && (
                                            <>
                                                <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.3)', marginTop: goalsState.length > 0 ? 16 : 0, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Депозиты</Text>
                                                {(() => {
                                                    const totalDeposited = deposits.reduce((s, d) => s + d.amount, 0);
                                                    const totalAccrued = deposits.reduce((s, d) => s + calcAccruedInterest(d.amount, d.ratePeriods, d.capitalization, d.startDate), 0);
                                                    return [
                                                        { label: 'Вложено', value: formatAmount(totalDeposited, currency), color: 'rgba(255,255,255,0.5)' },
                                                        { label: 'Доход с %', value: `+ ${formatAmount(totalAccrued, currency)}`, color: '#4FFFB0' },
                                                    ].map((item, i) => (
                                                        <View key={`d${i}`} style={{
                                                            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                                                            paddingVertical: 8,
                                                            borderBottomWidth: i === 0 ? 1 : 0,
                                                            borderBottomColor: 'rgba(255,255,255,0.05)',
                                                        }}>
                                                            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>{item.label}</Text>
                                                            <Text style={{ fontSize: 14, fontWeight: '700', color: item.color }}>{item.value}</Text>
                                                        </View>
                                                    ));
                                                })()}
                                            </>
                                        )}
                                    </Card>
                                )}

                                {/* Recommendation */}
                                <View style={{ backgroundColor: 'rgba(79,255,176,0.04)', borderWidth: 1, borderColor: 'rgba(79,255,176,0.1)', borderRadius: 14, padding: 14 }}>
                                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#4FFFB0', marginBottom: 6 }}>Рекомендация</Text>
                                    <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 19 }}>
                                        {recommendation || 'Создайте первую цель или депозит, чтобы получить персональную рекомендацию.'}
                                    </Text>
                                </View>
                            </>
                        )}
                    </>
                )}

                {/* ══ LOANS TAB ═══════════════════════════════════════════════ */}
                {tab === 'loans' && (
                    <>
                        {/* ── Block 1: Loan cards (horizontal scroll) ── */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 4, gap: 12, paddingBottom: 4 }} style={{ marginHorizontal: -16, paddingHorizontal: 12, marginBottom: 16 }}>
                            {loans.length > 0 ? loans.map(loan => {
                                const pct = loan.totalAmount > 0 ? Math.round((loan.paidAmount / loan.totalAmount) * 100) : 0;
                                const remaining = loan.totalAmount - loan.paidAmount;
                                const typeLabel = loan.loanType === 'other' && loan.customTypeName ? loan.customTypeName : LOAN_TYPE_LABELS[loan.loanType];
                                const DOTS = 100;
                                const filledDots = Math.round(pct);
                                return (
                                    <View key={loan.id} style={{ width: 260, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 16 }}>
                                        <TouchableOpacity activeOpacity={0.7} onPress={() => setSelectedLoan(loan)}>
                                            {/* Header */}
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                                                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: loan.color + '20', borderWidth: 1.5, borderColor: loan.color + '40', alignItems: 'center', justifyContent: 'center' }}>
                                                    <CategoryIcon iconName={loan.icon} color={loan.color} size={20} />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }} numberOfLines={1}>{loan.name}</Text>
                                                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{typeLabel}</Text>
                                                </View>
                                            </View>

                                            {/* Info rows */}
                                            {[
                                                { label: 'Остаток', value: formatAmount(remaining, loan.currency), color: '#fff' },
                                                { label: 'Выплачено', value: formatAmount(loan.paidAmount, loan.currency), color: '#4FFFB0' },
                                                { label: 'Платёж/мес', value: formatAmount(loan.monthlyPayment, loan.currency), color: '#FF6B6B' },
                                            ].map((row, i) => (
                                                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                                                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{row.label}:</Text>
                                                    <Text style={{ fontSize: 12, color: row.color, fontWeight: '600' }}>{row.value}</Text>
                                                </View>
                                            ))}

                                            {/* Icon Array: 100 dots */}
                                            <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 2.5, justifyContent: 'center' }}>
                                                {Array.from({ length: DOTS }).map((_, i) => (
                                                    <View key={i} style={{
                                                        width: 5, height: 5, borderRadius: 2.5,
                                                        backgroundColor: i < filledDots ? loan.color : 'rgba(255,255,255,0.08)',
                                                    }} />
                                                ))}
                                            </View>
                                            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'center', marginTop: 4 }}>{pct}% выплачено</Text>
                                        </TouchableOpacity>
                                    </View>
                                );
                            }) : (
                                <View style={{ alignItems: 'center', paddingVertical: 32, width: 260 }}>
                                    <Text style={{ fontSize: 32, marginBottom: 8 }}>🏦</Text>
                                    <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>Нет кредитов</Text>
                                </View>
                            )}

                        </ScrollView>

                        {/* Add loan button (below cards) */}
                        <TouchableOpacity
                            onPress={() => { setEditingLoan(null); setLoanCurrency(currency); setShowAddLoan(true); }}
                            style={{
                                width: '100%', paddingVertical: 14,
                                backgroundColor: 'rgba(255,107,107,0.08)',
                                borderWidth: 1.5, borderColor: 'rgba(255,107,107,0.25)',
                                borderStyle: 'dashed',
                                borderRadius: 16, alignItems: 'center', marginBottom: 16,
                            }}>
                            <Text style={{ color: '#FF6B6B', fontSize: 14, fontWeight: '600' }}>+ Добавить кредит</Text>
                        </TouchableOpacity>

                        {/* ── Block 2: Summary ── */}
                        {loans.length > 0 && (
                            <Card>
                                <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 14 }}>Кредиты</Text>
                                {[
                                    { label: 'Общий долг', value: formatAmount(loans.reduce((s, l) => s + l.totalAmount, 0), currency), color: '#fff' },
                                    { label: 'Уже выплачено', value: formatAmount(loans.reduce((s, l) => s + l.paidAmount, 0), currency), color: '#4FFFB0' },
                                    { label: 'Ежемесячно уходит', value: formatAmount(loans.reduce((s, l) => s + l.monthlyPayment, 0), currency), color: '#FF6B6B' },
                                    { label: 'Из них % банку', value: formatAmount(loans.reduce((s, l) => s + calcCurrentInterest(l), 0), currency), color: '#FFB84F' },
                                ].map((row, i) => (
                                    <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.06)' }}>
                                        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{row.label}</Text>
                                        <Text style={{ fontSize: 14, color: row.color, fontWeight: '700' }}>{row.value}</Text>
                                    </View>
                                ))}
                            </Card>
                        )}

                        {/* ── Block 3: Simulator "Что если?" ── */}
                        {loans.length > 0 && (() => {
                            const totalMonthly = loans.reduce((s, l) => s + l.monthlyPayment, 0);
                            const extraAmt = simMode === '+5' ? totalMonthly * 0.05
                                : simMode === '+10' ? totalMonthly * 0.10
                                : simMode === 'custom' ? parseFloat(simCustomAmount.replace(',', '.')) || 0
                                : 0;

                            // Simulate for the largest loan (most impact)
                            const mainLoan = [...loans].sort((a, b) => (b.totalAmount - b.paidAmount) - (a.totalAmount - a.paidAmount))[0];
                            const sim = extraAmt > 0 && mainLoan ? simulateExtraPayment(mainLoan, extraAmt) : null;

                            return (
                                <Card>
                                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 4 }}>Что если платить больше?</Text>
                                    <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 14 }}>
                                        Текущий платёж: {formatAmount(totalMonthly, currency)}
                                    </Text>

                                    {/* Simulation buttons */}
                                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                                        {(['+5', '+10', 'custom'] as const).map(mode => (
                                            <TouchableOpacity key={mode} onPress={() => setSimMode(simMode === mode ? null : mode)} style={{
                                                flex: mode === 'custom' ? 1.5 : 1,
                                                paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                                                backgroundColor: simMode === mode ? 'rgba(79,255,176,0.12)' : 'rgba(255,255,255,0.05)',
                                                borderWidth: 1.5, borderColor: simMode === mode ? 'rgba(79,255,176,0.3)' : 'rgba(255,255,255,0.08)',
                                            }}>
                                                <Text style={{ fontSize: 13, color: simMode === mode ? '#4FFFB0' : 'rgba(255,255,255,0.5)', fontWeight: '600' }}>
                                                    {mode === '+5' ? '+5%' : mode === '+10' ? '+10%' : 'Своя сумма'}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    {/* Custom amount input */}
                                    {simMode === 'custom' && (
                                        <TextInput
                                            style={[inputStyle, { marginBottom: 12 }]}
                                            keyboardType="decimal-pad"
                                            placeholder="Сумма доплаты в месяц"
                                            placeholderTextColor="rgba(255,255,255,0.2)"
                                            value={simCustomAmount}
                                            onChangeText={v => setSimCustomAmount(v.replace(/[^0-9.,]/g, ''))}
                                        />
                                    )}

                                    {/* Results */}
                                    {sim && extraAmt > 0 && (
                                        <View style={{ backgroundColor: 'rgba(79,255,176,0.05)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(79,255,176,0.12)' }}>
                                            {[
                                                { label: 'Доплата', value: `+ ${formatAmount(extraAmt, currency)}`, color: '#4FFFB0' },
                                                { label: 'Новый платёж', value: formatAmount(sim.newPayment, currency), color: '#fff' },
                                                { label: 'Экономия на %', value: formatAmount(sim.savedInterest, currency), color: '#4FFFB0' },
                                                { label: 'Закроется быстрее', value: `на ${sim.monthsSaved} мес`, color: '#4FFFB0' },
                                            ].map((row, i) => (
                                                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 }}>
                                                    <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{row.label}</Text>
                                                    <Text style={{ fontSize: 14, color: row.color, fontWeight: '700' }}>{row.value}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                </Card>
                            );
                        })()}

                        {/* ── Block 4: Recommendation ── */}
                        {loans.length > 0 && (() => {
                            const mainLoan = [...loans].sort((a, b) => (b.totalAmount - b.paidAmount) - (a.totalAmount - a.paidAmount))[0];
                            if (!mainLoan) return null;
                            const interest = calcCurrentInterest(mainLoan);
                            const typeLabel = mainLoan.loanType === 'other' && mainLoan.customTypeName ? mainLoan.customTypeName.toLowerCase() : LOAN_TYPE_LABELS[mainLoan.loanType].toLowerCase();
                            const extra10 = mainLoan.monthlyPayment * 0.1;
                            const sim10 = simulateExtraPayment(mainLoan, extra10);
                            return (
                                <View style={{
                                    backgroundColor: 'rgba(79,255,176,0.04)',
                                    borderRadius: 16, padding: 16, marginBottom: 16,
                                    borderWidth: 1, borderColor: 'rgba(79,255,176,0.1)',
                                }}>
                                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#4FFFB0', marginBottom: 6 }}>Рекомендация</Text>
                                    <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 19 }}>
                                        У тебя {typeLabel} на {formatAmount(mainLoan.totalAmount, mainLoan.currency)} под {mainLoan.currentRate}%.{'\n'}
                                        Сейчас из платежа {formatAmount(mainLoan.monthlyPayment, mainLoan.currency)} банку уходит {formatAmount(interest, mainLoan.currency)} на проценты.{'\n'}
                                        Доплачивая {formatAmount(extra10, mainLoan.currency)}/мес (+10%), сэкономишь {formatAmount(sim10.savedInterest, mainLoan.currency)} и закроешь кредит на {sim10.monthsSaved} мес раньше.
                                    </Text>
                                </View>
                            );
                        })()}
                    </>
                )}
            </ScrollView>

            {/* ══ LOAN DETAIL BOTTOM SHEET ═══════════════════════════════════ */}
            <Modal visible={!!selectedLoan} animationType="slide" transparent onRequestClose={() => setSelectedLoan(null)}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                    <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setSelectedLoan(null)} />
                    <View style={{ backgroundColor: '#111827', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36, maxHeight: '85%' }}>
                        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 16 }} />
                        {selectedLoan && (() => {
                            const loan = selectedLoan;
                            const remaining = loan.totalAmount - loan.paidAmount;
                            const pct = loan.totalAmount > 0 ? Math.round((loan.paidAmount / loan.totalAmount) * 100) : 0;
                            const totalMonths = differenceInMonths(loan.endDate, loan.startDate);
                            const monthsPaid = Math.max(0, differenceInMonths(new Date(), loan.startDate));
                            const nextPayDate = addMonths(loan.startDate, monthsPaid + 1);
                            return (
                                <ScrollView showsVerticalScrollIndicator={false}>
                                    {/* Header */}
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                                        <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: loan.color + '20', borderWidth: 1.5, borderColor: loan.color + '40', alignItems: 'center', justifyContent: 'center' }}>
                                            <CategoryIcon iconName={loan.icon} color={loan.color} size={24} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff' }}>{loan.name}</Text>
                                            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{loan.loanType === 'other' && loan.customTypeName ? loan.customTypeName : LOAN_TYPE_LABELS[loan.loanType]}</Text>
                                        </View>
                                    </View>

                                    {/* Info rows */}
                                    {[
                                        { label: 'Остаток долга', value: formatAmount(remaining, loan.currency), color: '#fff' },
                                        { label: 'Уже выплачено', value: formatAmount(loan.paidAmount, loan.currency), color: '#4FFFB0' },
                                    ].map((row, i) => (
                                        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
                                            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{row.label}:</Text>
                                            <Text style={{ fontSize: 14, color: row.color, fontWeight: '600' }}>{row.value}</Text>
                                        </View>
                                    ))}

                                    {/* Progress bar */}
                                    <View style={{ marginTop: 10, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                        <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.06)' }}>
                                            <View style={{ width: `${Math.min(pct, 100)}%`, height: 10, borderRadius: 5, backgroundColor: loan.color }} />
                                        </View>
                                        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: '700' }}>{pct}%</Text>
                                    </View>

                                    {/* Next payment */}
                                    <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
                                        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>Следующий платёж</Text>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Text style={{ fontSize: 18, fontWeight: '800', color: '#FF6B6B' }}>{formatAmount(loan.monthlyPayment, loan.currency)}</Text>
                                            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{format(nextPayDate, 'd MMMM', { locale: ru })}</Text>
                                        </View>
                                    </View>

                                    {/* Current rate */}
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, marginBottom: 8 }}>
                                        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Текущая ставка:</Text>
                                        <Text style={{ fontSize: 14, color: '#7C6FFF', fontWeight: '700' }}>{loan.currentRate}% годовых</Text>
                                    </View>

                                    {/* Rate periods */}
                                    {loan.ratePeriods.length > 0 && (
                                        <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
                                            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Периоды ставок</Text>
                                            {loan.ratePeriods.map((rp, i) => (
                                                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                                                    <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                                                        {format(rp.from, 'dd.MM.yyyy')} — {rp.to ? format(rp.to, 'dd.MM.yyyy') : 'бессрочно'}
                                                    </Text>
                                                    <Text style={{ fontSize: 13, color: i === loan.ratePeriods.length - 1 ? '#7C6FFF' : 'rgba(255,255,255,0.5)', fontWeight: '600' }}>{rp.rate}%</Text>
                                                </View>
                                            ))}
                                        </View>
                                    )}

                                    {/* Payment info */}
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, marginBottom: 4 }}>
                                        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Тип платежа:</Text>
                                        <Text style={{ fontSize: 12, color: '#fff' }}>{loan.paymentType === 'annuity' ? 'Аннуитетный' : 'Дифференцированный'}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, marginBottom: 4 }}>
                                        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Срок:</Text>
                                        <Text style={{ fontSize: 12, color: '#fff' }}>{format(loan.startDate, 'dd.MM.yyyy')} — {format(loan.endDate, 'dd.MM.yyyy')}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, marginBottom: 16 }}>
                                        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Осталось месяцев:</Text>
                                        <Text style={{ fontSize: 12, color: '#fff' }}>{Math.max(0, totalMonths - monthsPaid)}</Text>
                                    </View>

                                    {/* Confirm payment */}
                                    {loan.paymentAccountId && (
                                        <TouchableOpacity
                                            onPress={() => confirmLoanPayment(loan)}
                                            disabled={confirmingPayment}
                                            style={{
                                                paddingVertical: 14, borderRadius: 14, alignItems: 'center',
                                                backgroundColor: confirmingPayment ? 'rgba(79,255,176,0.05)' : 'rgba(79,255,176,0.1)',
                                                borderWidth: 1.5, borderColor: 'rgba(79,255,176,0.3)',
                                                marginBottom: 10, opacity: confirmingPayment ? 0.5 : 1,
                                            }}>
                                            <Text style={{ color: '#4FFFB0', fontSize: 14, fontWeight: '700' }}>
                                                {confirmingPayment ? 'Обработка…' : `Подтвердить платёж · ${formatAmount(loan.monthlyPayment, loan.currency)}`}
                                            </Text>
                                        </TouchableOpacity>
                                    )}

                                    {/* Actions */}
                                    <TouchableOpacity onPress={() => { setSelectedLoan(null); openEditLoan(loan); }} style={{
                                        paddingVertical: 14, borderRadius: 14, alignItems: 'center',
                                        backgroundColor: 'rgba(124,111,255,0.08)',
                                        borderWidth: 1.5, borderColor: 'rgba(124,111,255,0.25)',
                                        marginBottom: 10,
                                    }}>
                                        <Text style={{ color: '#7C6FFF', fontSize: 14, fontWeight: '600' }}>Редактировать</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity onPress={() => closeLoanAction(loan)} style={{
                                        paddingVertical: 14, borderRadius: 14, alignItems: 'center',
                                        backgroundColor: 'rgba(239,68,68,0.07)',
                                        borderWidth: 1, borderColor: 'rgba(239,68,68,0.18)',
                                    }}>
                                        <Text style={{ color: '#ef4444', fontSize: 14, fontWeight: '600' }}>Закрыть кредит</Text>
                                    </TouchableOpacity>
                                </ScrollView>
                            );
                        })()}
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ══ ADD/EDIT LOAN MODAL ═══════════════════════════════════════ */}
            <Modal visible={showAddLoan} animationType="slide" transparent onRequestClose={closeLoanModal}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                    <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeLoanModal} />
                    <View style={{ backgroundColor: '#111827', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36, maxHeight: '92%' }}>
                        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 16 }} />

                        {/* Header */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                            <View style={{
                                width: 48, height: 48, borderRadius: 14,
                                backgroundColor: loanColor + '20', borderWidth: 1.5, borderColor: loanColor + '40',
                                alignItems: 'center', justifyContent: 'center',
                            }}>
                                <CategoryIcon iconName={loanIcon} color={loanColor} size={24} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff' }}>{editingLoan ? 'Редактировать кредит' : 'Новый кредит'}</Text>
                                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
                                    {loanName.trim() || 'Введите название ниже'}
                                </Text>
                            </View>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                            {/* Icon */}
                            <Text style={labelStyle}>Иконка</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                                <View style={{ flexDirection: 'row', gap: 6 }}>
                                    {['Home', 'Car', 'CreditCard', 'Landmark', 'Briefcase', 'ShoppingCart', 'Laptop', 'Heart', 'GraduationCap', 'Plane'].map(ic => (
                                        <TouchableOpacity key={ic} onPress={() => setLoanIcon(ic)} style={{
                                            width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                                            backgroundColor: loanIcon === ic ? 'rgba(255,107,107,0.25)' : 'rgba(255,255,255,0.05)',
                                            borderWidth: 1.5, borderColor: loanIcon === ic ? '#FF6B6B' : 'transparent',
                                        }}>
                                            <CategoryIcon iconName={ic} color={loanIcon === ic ? '#FF6B6B' : 'rgba(255,255,255,0.5)'} size={20} />
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </ScrollView>

                            {/* Color */}
                            <Text style={labelStyle}>Цвет</Text>
                            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                                {['#FF6B6B', '#FF8C42', '#FFB84F', '#F472B6', '#7C6FFF', '#4FC3FF', '#4FFFB0', '#34D399'].map(c => (
                                    <TouchableOpacity key={c} onPress={() => setLoanColor(c)} style={{
                                        width: 32, height: 32, borderRadius: 16, backgroundColor: c,
                                        borderWidth: loanColor === c ? 3 : 1.5,
                                        borderColor: loanColor === c ? '#fff' : 'transparent',
                                        alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        {loanColor === c && <Text style={{ fontSize: 14 }}>✓</Text>}
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Name */}
                            <Text style={labelStyle}>Название</Text>
                            <TextInput style={inputStyle} placeholder="Ипотека" placeholderTextColor="rgba(255,255,255,0.2)" value={loanName} onChangeText={setLoanName} />

                            {/* Loan type */}
                            <Text style={labelStyle}>Тип кредита</Text>
                            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                                {(['mortgage', 'auto', 'consumer', 'other'] as LoanType[]).map(lt => (
                                    <TouchableOpacity key={lt} onPress={() => setLoanType(lt)} style={{
                                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                                        backgroundColor: loanType === lt ? 'rgba(255,107,107,0.15)' : 'rgba(255,255,255,0.05)',
                                        borderWidth: 1.5, borderColor: loanType === lt ? '#FF6B6B' : 'rgba(255,255,255,0.08)',
                                    }}>
                                        <Text style={{ fontSize: 13, color: loanType === lt ? '#FF6B6B' : 'rgba(255,255,255,0.5)', fontWeight: '600' }}>{LOAN_TYPE_LABELS[lt]}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            {loanType === 'other' && (
                                <TextInput style={inputStyle} placeholder="Название типа кредита" placeholderTextColor="rgba(255,255,255,0.2)" value={loanCustomType} onChangeText={setLoanCustomType} />
                            )}

                            {/* Amount + currency */}
                            <Text style={labelStyle}>Сумма кредита</Text>
                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                                <TextInput style={[inputStyle, { flex: 1, marginBottom: 0 }]} keyboardType="decimal-pad" placeholder="100000" placeholderTextColor="rgba(255,255,255,0.2)" value={loanAmount} onChangeText={v => setLoanAmount(v.replace(/[^0-9.,]/g, ''))} />
                                <TouchableOpacity onPress={() => setShowLoanCurrencyDropdown(true)} style={{
                                    flexDirection: 'row', alignItems: 'center', gap: 6,
                                    paddingHorizontal: 14, borderRadius: 12,
                                    backgroundColor: 'rgba(255,255,255,0.06)',
                                    borderWidth: 1.5, borderColor: 'rgba(255,107,107,0.3)', minWidth: 88,
                                }}>
                                    <Text style={{ fontSize: 18 }}>{CURRENCIES.find(c => c.code === loanCurrency)?.flag}</Text>
                                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{loanCurrency}</Text>
                                    <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginLeft: 2 }}>▾</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Paid amount (edit mode) */}
                            {editingLoan && (
                                <>
                                    <Text style={labelStyle}>Уже выплачено</Text>
                                    <TextInput style={inputStyle} keyboardType="numeric" placeholder="0" placeholderTextColor="rgba(255,255,255,0.2)" value={loanPaidAmount} onChangeText={setLoanPaidAmount} />
                                </>
                            )}

                            {/* Source account */}
                            {!editingLoan && (
                                <View style={{ marginBottom: 12 }}>
                                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>Со счёта (куда пришли деньги, опц.)</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                        <View style={{ flexDirection: 'row', gap: 6 }}>
                                            {accounts.map(acc => {
                                                const sel = loanSourceAccountId === acc.id;
                                                return (
                                                    <TouchableOpacity key={acc.id} onPress={() => setLoanSourceAccountId(sel ? '' : acc.id)} style={{
                                                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                                                        backgroundColor: sel ? 'rgba(124,111,255,0.2)' : 'rgba(255,255,255,0.06)',
                                                        borderWidth: 1.5, borderColor: sel ? 'rgba(124,111,255,0.4)' : 'rgba(255,255,255,0.08)',
                                                        flexDirection: 'row', alignItems: 'center', gap: 6,
                                                    }}>
                                                        <Text style={{ fontSize: 16 }}>{acc.icon || '💳'}</Text>
                                                        <Text style={{ fontSize: 13, color: sel ? '#7C6FFF' : 'rgba(255,255,255,0.5)', fontWeight: '600' }}>{acc.name}</Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </ScrollView>
                                </View>
                            )}

                            {/* Payment type */}
                            <Text style={labelStyle}>Тип платежа</Text>
                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                                {([['annuity', 'Аннуитетный'], ['differentiated', 'Дифференц.']] as [PaymentType, string][]).map(([pt, label]) => (
                                    <TouchableOpacity key={pt} onPress={() => setLoanPaymentType(pt)} style={{
                                        flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                                        backgroundColor: loanPaymentType === pt ? 'rgba(255,107,107,0.15)' : 'rgba(255,255,255,0.05)',
                                        borderWidth: 1.5, borderColor: loanPaymentType === pt ? '#FF6B6B' : 'rgba(255,255,255,0.08)',
                                    }}>
                                        <Text style={{ fontSize: 13, color: loanPaymentType === pt ? '#FF6B6B' : 'rgba(255,255,255,0.5)', fontWeight: '600' }}>{label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Dates */}
                            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={labelStyle}>Дата начала</Text>
                                    <TouchableOpacity onPress={() => setShowLoanStartPicker(!showLoanStartPicker)} style={{
                                        backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12,
                                        paddingHorizontal: 14, paddingVertical: 12,
                                        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)',
                                    }}>
                                        <Text style={{ color: '#fff', fontSize: 14 }}>{format(loanStartDate, 'dd.MM.yyyy')}</Text>
                                    </TouchableOpacity>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={labelStyle}>Дата окончания</Text>
                                    <TouchableOpacity onPress={() => setShowLoanEndPicker(!showLoanEndPicker)} style={{
                                        backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12,
                                        paddingHorizontal: 14, paddingVertical: 12,
                                        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)',
                                    }}>
                                        <Text style={{ color: '#fff', fontSize: 14 }}>{format(loanEndDate, 'dd.MM.yyyy')}</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                            {showLoanStartPicker && (
                                <DateTimePicker value={loanStartDate} mode="date" display="inline" themeVariant="dark"
                                    onChange={(_, d) => { setShowLoanStartPicker(false); if (d) setLoanStartDate(d); }} />
                            )}
                            {showLoanEndPicker && (
                                <DateTimePicker value={loanEndDate} mode="date" display="inline" themeVariant="dark"
                                    minimumDate={loanStartDate}
                                    onChange={(_, d) => { setShowLoanEndPicker(false); if (d) setLoanEndDate(d); }} />
                            )}

                            {/* Payment day + reminder */}
                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, marginBottom: 8 }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={labelStyle}>День платежа</Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 14, paddingVertical: 10 }}>
                                        <TextInput
                                            style={{ color: '#fff', fontSize: 14, flex: 1 }}
                                            keyboardType="number-pad"
                                            placeholder="15"
                                            placeholderTextColor="rgba(255,255,255,0.2)"
                                            value={loanPaymentDay}
                                            onChangeText={v => {
                                                const num = v.replace(/[^0-9]/g, '');
                                                const day = parseInt(num);
                                                if (num === '' || (day >= 1 && day <= 31)) setLoanPaymentDay(num);
                                            }}
                                            maxLength={2}
                                        />
                                        <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>число</Text>
                                    </View>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={labelStyle}>Напомнить</Text>
                                    <TouchableOpacity onPress={() => setShowLoanReminderPicker(!showLoanReminderPicker)} style={{
                                        backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12,
                                        paddingHorizontal: 14, paddingVertical: 12,
                                        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)',
                                    }}>
                                        <Text style={{ color: '#fff', fontSize: 14 }}>{format(loanReminderDate, 'dd.MM.yyyy')}</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                            {showLoanReminderPicker && (
                                <DateTimePicker value={loanReminderDate} mode="date" display="inline" themeVariant="dark"
                                    onChange={(_, d) => { setShowLoanReminderPicker(false); if (d) setLoanReminderDate(d); }} />
                            )}

                            {/* Rate Periods (compact list) */}
                            <View style={{ marginTop: 16 }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <Text style={labelStyle}>Периоды ставок</Text>
                                    {(() => {
                                        const lastP = loanRateDrafts[loanRateDrafts.length - 1];
                                        const canAdd = lastP && lastP.rate.trim() !== '' && !isNaN(parseFloat(lastP.rate)) && parseFloat(lastP.rate) > 0;
                                        return (
                                            <TouchableOpacity disabled={!canAdd} onPress={() => {
                                                const prev = loanRateDrafts[loanRateDrafts.length - 1];
                                                const newFrom = prev.toDate ?? new Date();
                                                setLoanRateDrafts([...loanRateDrafts, { rate: '', fromDate: newFrom, toDate: null }]);
                                            }}>
                                                <Text style={{ color: '#FF6B6B', fontSize: 13, fontWeight: '600', opacity: canAdd ? 1 : 0.3 }}>+ Добавить период</Text>
                                            </TouchableOpacity>
                                        );
                                    })()}
                                </View>

                                <View style={{
                                    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14,
                                    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.06)', overflow: 'hidden',
                                }}>
                                    {loanRateDrafts.map((period, idx) => {
                                        const fromDate = idx === 0 ? loanStartDate : (loanRateDrafts[idx - 1].toDate ?? period.fromDate);
                                        const endLabel = period.toDate ? format(period.toDate, 'dd.MM.yyyy') : 'бессрочно';
                                        const showPicker = loanRatePickerIdx === idx;
                                        return (
                                            <View key={idx}>
                                                {idx > 0 && <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />}
                                                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}>
                                                    <TouchableOpacity onPress={() => setLoanRatePickerIdx(showPicker ? null : idx)} style={{ flex: 1 }}>
                                                        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                                                            {format(fromDate, 'dd.MM.yyyy')} — <Text style={{ color: period.toDate ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)' }}>{endLabel}</Text>
                                                        </Text>
                                                    </TouchableOpacity>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                        <TextInput
                                                            style={{
                                                                backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8,
                                                                color: '#fff', fontSize: 14, fontWeight: '600',
                                                                paddingHorizontal: 10, paddingVertical: 6,
                                                                minWidth: 48, textAlign: 'center',
                                                                borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
                                                            }}
                                                            keyboardType="numeric" placeholder="0" placeholderTextColor="rgba(255,255,255,0.2)"
                                                            value={period.rate}
                                                            onChangeText={v => {
                                                                const updated = [...loanRateDrafts];
                                                                updated[idx] = { ...updated[idx], rate: v };
                                                                setLoanRateDrafts(updated);
                                                            }}
                                                        />
                                                        <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>%</Text>
                                                    </View>
                                                    {loanRateDrafts.length > 1 ? (
                                                        <TouchableOpacity onPress={() => {
                                                            const updated = loanRateDrafts.filter((_, i) => i !== idx);
                                                            if (idx < updated.length && idx > 0) {
                                                                updated[idx] = { ...updated[idx], fromDate: updated[idx - 1].toDate ?? updated[idx].fromDate };
                                                            }
                                                            setLoanRatePickerIdx(null);
                                                            setLoanRateDrafts(updated);
                                                        }} style={{ padding: 4 }}>
                                                            <Text style={{ color: '#FF6B6B', fontSize: 16, fontWeight: '700' }}>×</Text>
                                                        </TouchableOpacity>
                                                    ) : <View style={{ width: 24 }} />}
                                                </View>
                                                {showPicker && (
                                                    <View style={{ paddingHorizontal: 14, paddingBottom: 10 }}>
                                                        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                                                            <TouchableOpacity onPress={() => {
                                                                const updated = [...loanRateDrafts];
                                                                if (!period.toDate) {
                                                                    updated[idx] = { ...updated[idx], toDate: addMonths(fromDate, 6) };
                                                                } else {
                                                                    updated[idx] = { ...updated[idx], toDate: null };
                                                                    if (idx < updated.length - 1) updated.splice(idx + 1);
                                                                }
                                                                setLoanRateDrafts(updated);
                                                            }} style={{
                                                                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                                                                backgroundColor: !period.toDate ? 'rgba(255,107,107,0.2)' : 'rgba(255,255,255,0.06)',
                                                                borderWidth: 1, borderColor: !period.toDate ? '#FF6B6B' : 'rgba(255,255,255,0.08)',
                                                            }}>
                                                                <Text style={{ color: !period.toDate ? '#FF6B6B' : 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '600' }}>Бессрочно</Text>
                                                            </TouchableOpacity>
                                                        </View>
                                                        {period.toDate && (
                                                            <DateTimePicker value={period.toDate} mode="date" display="inline" themeVariant="dark"
                                                                minimumDate={fromDate}
                                                                onChange={(_, d) => {
                                                                    if (d) {
                                                                        const updated = [...loanRateDrafts];
                                                                        updated[idx] = { ...updated[idx], toDate: d };
                                                                        if (idx + 1 < updated.length) updated[idx + 1] = { ...updated[idx + 1], fromDate: d };
                                                                        setLoanRateDrafts(updated);
                                                                    }
                                                                    setLoanRatePickerIdx(null);
                                                                }} />
                                                        )}
                                                    </View>
                                                )}
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>

                            {/* Payment account */}
                            <View style={{ marginTop: 16, marginBottom: 12 }}>
                                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>Счёт для списания (опц.)</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                    <View style={{ flexDirection: 'row', gap: 6 }}>
                                        {accounts.map(acc => {
                                            const sel = loanPaymentAccountId === acc.id;
                                            return (
                                                <TouchableOpacity key={acc.id} onPress={() => setLoanPaymentAccountId(sel ? '' : acc.id)} style={{
                                                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                                                    backgroundColor: sel ? 'rgba(255,107,107,0.15)' : 'rgba(255,255,255,0.06)',
                                                    borderWidth: 1.5, borderColor: sel ? 'rgba(255,107,107,0.4)' : 'rgba(255,255,255,0.08)',
                                                    flexDirection: 'row', alignItems: 'center', gap: 6,
                                                }}>
                                                    <Text style={{ fontSize: 16 }}>{acc.icon || '💳'}</Text>
                                                    <Text style={{ fontSize: 13, color: sel ? '#FF6B6B' : 'rgba(255,255,255,0.5)', fontWeight: '600' }}>{acc.name}</Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </ScrollView>
                            </View>

                            {/* Monthly payment preview */}
                            {(() => {
                                const amt = parseFloat(loanAmount);
                                const rate = parseFloat(loanRateDrafts[loanRateDrafts.length - 1]?.rate || '0');
                                const months = differenceInMonths(loanEndDate, loanStartDate);
                                if (isNaN(amt) || amt <= 0 || isNaN(rate) || months <= 0) return null;
                                const pmt = loanPaymentType === 'annuity'
                                    ? calcAnnuityPayment(amt, rate, months)
                                    : calcDifferentiatedPayment(amt, rate, months, 0);
                                return (
                                    <View style={{ backgroundColor: 'rgba(255,107,107,0.06)', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,107,107,0.15)' }}>
                                        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>Ежемесячный платёж</Text>
                                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#FF6B6B' }}>{formatAmount(pmt, loanCurrency)}</Text>
                                        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>на {months} мес. · переплата {formatAmount(pmt * months - amt, loanCurrency)}</Text>
                                    </View>
                                );
                            })()}

                            {/* Save button */}
                            <TouchableOpacity
                                onPress={() => householdId && (editingLoan ? updateLoan(householdId) : createLoan(householdId))}
                                disabled={savingLoan}
                                style={{ marginTop: 8, marginBottom: 20, paddingVertical: 14, backgroundColor: '#FF6B6B', borderRadius: 14, alignItems: 'center', opacity: savingLoan ? 0.5 : 1 }}>
                                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{savingLoan ? 'Сохранение…' : 'Сохранить'}</Text>
                            </TouchableOpacity>
                        </ScrollView>

                        {/* Currency dropdown */}
                        <Modal visible={showLoanCurrencyDropdown} transparent animationType="fade">
                            <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} activeOpacity={1}
                                onPress={() => { setShowLoanCurrencyDropdown(false); setLoanCurrencySearch(''); }} />
                            <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#1a2235', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingBottom: 40, maxHeight: '60%' }}>
                                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 16 }} />
                                <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff', paddingHorizontal: 20, marginBottom: 12 }}>Валюта</Text>
                                <View style={{ marginHorizontal: 20, marginBottom: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
                                    <Text style={{ fontSize: 15, color: 'rgba(255,255,255,0.3)', marginRight: 8 }}>🔍</Text>
                                    <TextInput value={loanCurrencySearch} onChangeText={setLoanCurrencySearch} placeholder="Поиск валюты..." placeholderTextColor="rgba(255,255,255,0.25)" style={{ flex: 1, color: '#fff', fontSize: 14 }} autoCorrect={false} autoCapitalize="none" />
                                </View>
                                <FlatList
                                    data={CURRENCIES.filter(c => !loanCurrencySearch || c.code.toLowerCase().includes(loanCurrencySearch.toLowerCase()) || c.name.toLowerCase().includes(loanCurrencySearch.toLowerCase()))}
                                    keyExtractor={i => i.code}
                                    renderItem={({ item }) => (
                                        <TouchableOpacity onPress={() => { setLoanCurrency(item.code); setShowLoanCurrencyDropdown(false); setLoanCurrencySearch(''); }}
                                            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 20, backgroundColor: item.code === loanCurrency ? 'rgba(255,107,107,0.1)' : 'transparent' }}>
                                            <Text style={{ fontSize: 20 }}>{item.flag}</Text>
                                            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>{item.code}</Text>
                                            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, flex: 1 }}>{item.name}</Text>
                                            {item.code === loanCurrency && <Text style={{ color: '#FF6B6B', fontSize: 16 }}>✓</Text>}
                                        </TouchableOpacity>
                                    )}
                                />
                            </View>
                        </Modal>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ══ ADD GOAL MODAL ════════════════════════════════════════════ */}
            <Modal visible={showAddGoal} animationType="slide" transparent onRequestClose={closeGoalModal}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                    <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeGoalModal} />
                    <View style={{ backgroundColor: '#111827', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36, maxHeight: '92%' }}>
                        {/* Handle */}
                        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 16 }} />

                        {/* Header with preview */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                            <View style={{
                                width: 48, height: 48, borderRadius: 14,
                                backgroundColor: goalColor + '20',
                                borderWidth: 1.5, borderColor: goalColor + '50',
                                alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Text style={{ fontSize: 24 }}>{goalIcon}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff' }}>
                                    {editingGoal ? 'Редактировать цель' : 'Новая цель'}
                                </Text>
                                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
                                    {goalName.trim() || 'Введите название ниже'}
                                </Text>
                            </View>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                            {/* ── Иконка + цвет в одной строке ── */}
                            <View style={{ flexDirection: 'row', gap: 16, marginBottom: 20 }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={labelStyle}>Иконка</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                        <View style={{ flexDirection: 'row', gap: 6 }}>
                                            {['🎯','🏖️','💻','🚗','🏠','🎓','✈️','📱','🎮','💪','🛡️','📈','🌍','🎁','💰','🎸','🏋️','🐶'].map(em => (
                                                <TouchableOpacity key={em} onPress={() => setGoalIcon(em)} style={{
                                                    width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                                                    backgroundColor: goalIcon === em ? 'rgba(124,111,255,0.25)' : 'rgba(255,255,255,0.05)',
                                                    borderWidth: 1.5,
                                                    borderColor: goalIcon === em ? '#7C6FFF' : 'transparent',
                                                }}>
                                                    <Text style={{ fontSize: 20 }}>{em}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </ScrollView>
                                </View>
                            </View>

                            {/* ── Цвет ── */}
                            <Text style={labelStyle}>Цвет</Text>
                            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                                {['#7C6FFF','#4FFFB0','#FFB84F','#FF6B6B','#4FC3FF','#F472B6','#34D399','#FB923C'].map(c => (
                                    <TouchableOpacity key={c} onPress={() => setGoalColor(c)} style={{
                                        width: 32, height: 32, borderRadius: 16,
                                        backgroundColor: c,
                                        borderWidth: goalColor === c ? 3 : 1.5,
                                        borderColor: goalColor === c ? '#fff' : 'transparent',
                                        alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        {goalColor === c && <Text style={{ fontSize: 14 }}>✓</Text>}
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* ── Название ── */}
                            <Text style={labelStyle}>Название цели</Text>
                            <TextInput
                                value={goalName}
                                onChangeText={setGoalName}
                                placeholder="Например, Отпуск в Испании"
                                placeholderTextColor="rgba(255,255,255,0.2)"
                                style={inputStyle}
                            />

                            {/* ── Сумма + валюта ── */}
                            <Text style={labelStyle}>Сумма цели</Text>
                            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                                <TextInput
                                    value={goalTarget}
                                    onChangeText={setGoalTarget}
                                    placeholder="0"
                                    placeholderTextColor="rgba(255,255,255,0.2)"
                                    keyboardType="decimal-pad"
                                    style={[inputStyle, { flex: 1, marginBottom: 0 }]}
                                />
                                {/* Currency dropdown trigger */}
                                <TouchableOpacity
                                    onPress={() => setShowCurrencyDropdown(true)}
                                    style={{
                                        flexDirection: 'row', alignItems: 'center', gap: 6,
                                        paddingHorizontal: 14, borderRadius: 12,
                                        backgroundColor: 'rgba(255,255,255,0.06)',
                                        borderWidth: 1.5,
                                        borderColor: 'rgba(124,111,255,0.3)',
                                        minWidth: 88,
                                    }}
                                >
                                    <Text style={{ fontSize: 18 }}>{CURRENCIES.find(c => c.code === goalCurrency)?.flag}</Text>
                                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{goalCurrency}</Text>
                                    <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginLeft: 2 }}>▾</Text>
                                </TouchableOpacity>
                            </View>

                            {/* ── Currency dropdown modal ── */}
                            <Modal visible={showCurrencyDropdown} transparent animationType="fade">
                                <TouchableOpacity
                                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}
                                    activeOpacity={1}
                                    onPress={() => { setShowCurrencyDropdown(false); setCurrencySearch(''); }}
                                />
                                <View style={{
                                    position: 'absolute', bottom: 0, left: 0, right: 0,
                                    backgroundColor: '#1a2235', borderTopLeftRadius: 24, borderTopRightRadius: 24,
                                    paddingTop: 12, paddingBottom: 40, maxHeight: '60%',
                                }}>
                                    <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 16 }} />
                                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff', paddingHorizontal: 20, marginBottom: 12 }}>Валюта</Text>
                                    <View style={{ marginHorizontal: 20, marginBottom: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
                                        <Text style={{ fontSize: 15, color: 'rgba(255,255,255,0.3)', marginRight: 8 }}>🔍</Text>
                                        <TextInput
                                            value={currencySearch}
                                            onChangeText={setCurrencySearch}
                                            placeholder="Поиск валюты..."
                                            placeholderTextColor="rgba(255,255,255,0.25)"
                                            style={{ flex: 1, color: '#fff', fontSize: 14 }}
                                            autoCorrect={false}
                                            autoCapitalize="none"
                                        />
                                        {currencySearch.length > 0 && (
                                            <TouchableOpacity onPress={() => setCurrencySearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                                <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 16 }}>✕</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                    <FlatList
                                        data={CURRENCIES.filter(c => {
                                            const q = currencySearch.toLowerCase();
                                            return !q || c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
                                        })}
                                        keyExtractor={c => c.code}
                                        showsVerticalScrollIndicator={false}
                                        renderItem={({ item: c }) => {
                                            const selected = goalCurrency === c.code;
                                            return (
                                                <TouchableOpacity
                                                    onPress={() => { setGoalCurrency(c.code); setShowCurrencyDropdown(false); setCurrencySearch(''); }}
                                                    style={{
                                                        flexDirection: 'row', alignItems: 'center', gap: 14,
                                                        paddingHorizontal: 20, paddingVertical: 13,
                                                        backgroundColor: selected ? 'rgba(124,111,255,0.12)' : 'transparent',
                                                    }}
                                                >
                                                    <Text style={{ fontSize: 22 }}>{c.flag}</Text>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ fontSize: 14, fontWeight: selected ? '700' : '500', color: selected ? '#a78bfa' : '#fff' }}>
                                                            {c.code}
                                                        </Text>
                                                        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{c.name}</Text>
                                                    </View>
                                                    {selected && <Text style={{ color: '#7C6FFF', fontSize: 16 }}>✓</Text>}
                                                </TouchableOpacity>
                                            );
                                        }}
                                    />
                                </View>
                            </Modal>

                            {/* ── Дата цели ── */}
                            <Text style={labelStyle}>Дата цели <Text style={{ textTransform: 'none', fontWeight: '400', color: 'rgba(255,255,255,0.25)' }}>(необязательно)</Text></Text>
                            <TouchableOpacity
                                onPress={() => setShowGoalDatePicker(true)}
                                style={{
                                    borderRadius: 14,
                                    backgroundColor: 'rgba(255,255,255,0.06)',
                                    borderWidth: 1.5,
                                    borderColor: goalDateObj ? 'rgba(124,111,255,0.4)' : 'transparent',
                                    marginBottom: 16,
                                    overflow: 'hidden',
                                }}
                            >
                                {goalDateObj ? (
                                    <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
                                        {/* Day block */}
                                        <View style={{ backgroundColor: 'rgba(124,111,255,0.15)', paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', minWidth: 62 }}>
                                            <Text style={{ color: '#a78bfa', fontSize: 26, fontWeight: '700', lineHeight: 30 }}>
                                                {format(goalDateObj, 'd')}
                                            </Text>
                                        </View>
                                        {/* Month + Year */}
                                        <View style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 12, justifyContent: 'center' }}>
                                            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', textTransform: 'capitalize' }}>
                                                {format(goalDateObj, 'LLLL', { locale: ru })}
                                            </Text>
                                            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600', marginTop: 2 }}>
                                                {format(goalDateObj, 'yyyy')} г.
                                            </Text>
                                        </View>
                                        {/* Clear button */}
                                        <TouchableOpacity
                                            onPress={() => setGoalDateObj(null)}
                                            style={{ paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' }}
                                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                        >
                                            <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 18 }}>✕</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 }}>
                                        <Text style={{ fontSize: 20 }}>📅</Text>
                                        <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 15 }}>Нажмите чтобы выбрать</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                            {showGoalDatePicker && (
                                <View style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 12, backgroundColor: '#1c2438' }}>
                                    <DateTimePicker
                                        mode="date"
                                        display="inline"
                                        value={goalDateObj ?? new Date()}
                                        minimumDate={new Date()}
                                        onChange={(_, date) => {
                                            if (date) setGoalDateObj(date);
                                            if (Platform.OS === 'android') setShowGoalDatePicker(false);
                                        }}
                                        accentColor="#7C6FFF"
                                        themeVariant="dark"
                                    />
                                </View>
                            )}

                            {/* ── Счёт накоплений ── */}
                            <Text style={labelStyle}>Счёт накоплений</Text>
                            {accounts.length === 0 ? (
                                <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
                                    <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Нет счетов. Создайте счёт в разделе «Счета».</Text>
                                </View>
                            ) : (
                                <View style={{ marginBottom: 20, gap: 8 }}>
                                    {accounts.map(acc => {
                                        const selected = goalAccountId === acc.id;
                                        return (
                                            <TouchableOpacity key={acc.id} onPress={() => setGoalAccountId(acc.id)} style={{
                                                flexDirection: 'row', alignItems: 'center', gap: 12,
                                                padding: 12, borderRadius: 14,
                                                backgroundColor: selected ? 'rgba(124,111,255,0.12)' : 'rgba(255,255,255,0.04)',
                                                borderWidth: 1.5,
                                                borderColor: selected ? '#7C6FFF' : 'rgba(255,255,255,0.06)',
                                            }}>
                                                <View style={{
                                                    width: 38, height: 38, borderRadius: 11,
                                                    alignItems: 'center', justifyContent: 'center',
                                                    backgroundColor: (acc.color ?? '#3b82f6') + '20',
                                                }}>
                                                    <Text style={{ fontSize: 20 }}>{acc.icon ?? '🏦'}</Text>
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>{acc.name}</Text>
                                                    <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
                                                        {formatAmount(acc.balance, acc.currency)}
                                                    </Text>
                                                </View>
                                                <View style={{
                                                    width: 22, height: 22, borderRadius: 11,
                                                    backgroundColor: selected ? '#7C6FFF' : 'rgba(255,255,255,0.08)',
                                                    alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                    {selected && <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>✓</Text>}
                                                </View>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            )}

                            {/* ── Кнопки ── */}
                            <View style={{ flexDirection: 'row', gap: 12 }}>
                                <TouchableOpacity onPress={closeGoalModal} style={{
                                    flex: 1, paddingVertical: 14, borderRadius: 14,
                                    backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center',
                                }}>
                                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15, fontWeight: '600' }}>Отмена</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={editingGoal ? updateGoal : createGoal}
                                    disabled={savingGoal || !goalName.trim() || !goalTarget.trim() || !goalAccountId}
                                    style={{
                                        flex: 2, paddingVertical: 14, borderRadius: 14,
                                        backgroundColor: (!goalName.trim() || !goalTarget.trim() || !goalAccountId) ? 'rgba(79,255,176,0.2)' : '#4FFFB0',
                                        alignItems: 'center',
                                    }}>
                                    {savingGoal
                                        ? <ActivityIndicator color="#000" />
                                        : <Text style={{ color: '#000', fontSize: 15, fontWeight: '700' }}>
                                            {editingGoal ? 'Сохранить' : 'Создать цель'}
                                        </Text>
                                    }
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ══ GOAL DETAIL BOTTOM SHEET ═════════════════════════════════ */}
            <Modal visible={!!selectedGoal} animationType="slide" transparent onRequestClose={closeGoalDetail}>
                <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} activeOpacity={1} onPress={closeGoalDetail} />
                <View style={{ backgroundColor: '#111827', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36, maxHeight: '92%' }}>
                    <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 16 }} />

                    {selectedGoal && (() => {
                        const g = selectedGoal;
                        const ratio = g.target > 0 ? Math.min(g.saved / g.target, 1) : 0;
                        const pctG = Math.round(ratio * 100);

                        return (
                            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                                {/* Header */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                                    <Text style={{ fontSize: 28 }}>{g.icon}</Text>
                                    <Text style={{ fontSize: 20, fontWeight: '800', color: '#fff', flex: 1 }} numberOfLines={1}>{g.name}</Text>
                                    <TouchableOpacity onPress={() => { closeGoalDetail(); openEditGoal(g); }} hitSlop={10} style={{
                                        width: 36, height: 36, borderRadius: 12,
                                        backgroundColor: 'rgba(124,111,255,0.12)',
                                        alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <Pencil color="#7C6FFF" size={18} />
                                    </TouchableOpacity>
                                </View>

                                {/* Progress */}
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <View>
                                        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 3 }}>Накоплено</Text>
                                        <Text style={{ fontSize: 20, fontWeight: '800', color: '#4FFFB0' }}>{formatAmount(g.saved, g.currency)}</Text>
                                    </View>
                                    <View style={{ alignItems: 'flex-end' }}>
                                        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 3 }}>Цель</Text>
                                        <Text style={{ fontSize: 20, fontWeight: '800', color: '#fff' }}>{formatAmount(g.target, g.currency)}</Text>
                                    </View>
                                </View>
                                <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 2, marginBottom: 20, overflow: 'hidden' }}>
                                    <View style={{ height: 4, width: `${pctG}%`, backgroundColor: '#4FFFB0', borderRadius: 2 }} />
                                </View>

                                {/* Calculator */}
                                <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
                                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 14 }}>Калькулятор роста</Text>

                                    {/* Rate */}
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>Ставка</Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <TextInput
                                                value={goalRateInput}
                                                onChangeText={t => {
                                                    setGoalRateInput(t);
                                                    const v = parseFloat(t.replace(',', '.'));
                                                    if (!isNaN(v) && v >= 0 && v <= 50) setGoalRate(v);
                                                }}
                                                onBlur={() => setGoalRateInput(String(goalRate))}
                                                keyboardType="decimal-pad"
                                                style={{
                                                    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10,
                                                    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)',
                                                    color: '#fff', fontSize: 15, fontWeight: '700',
                                                    paddingHorizontal: 12, paddingVertical: 8,
                                                    minWidth: 60, textAlign: 'center',
                                                }}
                                            />
                                            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>% год.</Text>
                                        </View>
                                    </View>

                                    {/* Compounding */}
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                                        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>Капитализация</Text>
                                        <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: 3, gap: 2 }}>
                                            {(['monthly', 'yearly'] as const).map(c => (
                                                <TouchableOpacity key={c} onPress={() => setGoalCompounding(c)} style={{
                                                    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                                                    backgroundColor: goalCompounding === c ? 'rgba(255,255,255,0.14)' : 'transparent',
                                                }}>
                                                    <Text style={{
                                                        fontSize: 12,
                                                        color: goalCompounding === c ? '#fff' : 'rgba(255,255,255,0.38)',
                                                        fontWeight: goalCompounding === c ? '600' : '400',
                                                    }}>{c === 'monthly' ? 'Ежемесячно' : 'Ежегодно'}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>

                                    <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: 12 }} />

                                    {/* Results */}
                                    {[
                                        { label: 'Текущий баланс', value: formatAmount(g.saved, g.currency), color: '#fff' },
                                        { label: `Прогноз к ${format(goalCalc.endDate, 'd MMM yyyy', { locale: ru })}`, value: formatAmount(goalCalc.forecast, g.currency), color: '#4FFFB0' },
                                        { label: '   из них % доход', value: `+${formatAmount(goalCalc.interest, g.currency)}`, color: '#4E9F3D', indent: true },
                                        { label: 'Нужно довнести', value: goalCalc.needToAdd > 0 ? formatAmount(goalCalc.needToAdd, g.currency) : '✓ Цель достигнута', color: goalCalc.needToAdd > 0 ? '#f9a825' : '#4FFFB0' },
                                    ].map((row, i) => (
                                        <View key={i} style={{
                                            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                                            paddingVertical: 7,
                                            borderTopWidth: i > 0 ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.04)',
                                        }}>
                                            <Text style={{ fontSize: (row as any).indent ? 12 : 13, color: (row as any).indent ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.55)', flex: 1 }}>{row.label}</Text>
                                            <Text style={{ fontSize: 14, fontWeight: '700', color: row.color }}>{row.value}</Text>
                                        </View>
                                    ))}
                                </View>

                                {/* Top-up section */}
                                {!showGoalTopUp ? (
                                    <TouchableOpacity onPress={() => setShowGoalTopUp(true)} style={{
                                        paddingVertical: 14, borderRadius: 14, alignItems: 'center',
                                        backgroundColor: 'rgba(79,255,176,0.08)',
                                        borderWidth: 1.5, borderColor: 'rgba(79,255,176,0.25)',
                                        marginBottom: 10,
                                    }}>
                                        <Text style={{ color: '#4FFFB0', fontSize: 14, fontWeight: '600' }}>Пополнить</Text>
                                    </TouchableOpacity>
                                ) : (
                                    <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(79,255,176,0.15)' }}>
                                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 12 }}>Пополнить цель</Text>

                                        <Text style={labelStyle}>Сумма</Text>
                                        <TextInput
                                            value={goalTopUpAmount}
                                            onChangeText={setGoalTopUpAmount}
                                            placeholder="0"
                                            placeholderTextColor="rgba(255,255,255,0.2)"
                                            keyboardType="decimal-pad"
                                            style={inputStyle}
                                        />

                                        <Text style={labelStyle}>Со счёта (опц.)</Text>
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                                {accounts.map(acc => {
                                                    const sel = goalTopUpAccountId === acc.id;
                                                    return (
                                                        <TouchableOpacity key={acc.id} onPress={() => setGoalTopUpAccountId(sel ? '' : acc.id)} style={{
                                                            flexDirection: 'row', alignItems: 'center', gap: 6,
                                                            paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
                                                            backgroundColor: sel ? 'rgba(124,111,255,0.15)' : 'rgba(255,255,255,0.05)',
                                                            borderWidth: 1.5, borderColor: sel ? '#7C6FFF' : 'rgba(255,255,255,0.08)',
                                                        }}>
                                                            <Text style={{ fontSize: 14 }}>{acc.icon || '💳'}</Text>
                                                            <Text style={{ color: sel ? '#a78bfa' : '#fff', fontSize: 13, fontWeight: '500' }}>{acc.name}</Text>
                                                            <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>{formatAmount(acc.balance, acc.currency)}</Text>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>
                                        </ScrollView>

                                        {goalTopUpAccountId && (() => {
                                            const srcAcc = accounts.find(a => a.id === goalTopUpAccountId);
                                            const amt = parseFloat(goalTopUpAmount.replace(',', '.')) || 0;
                                            if (srcAcc && amt > srcAcc.balance) {
                                                return <Text style={{ fontSize: 11, color: '#FFB84F', marginBottom: 4 }}>Недостаточно средств ({formatAmount(srcAcc.balance, srcAcc.currency)})</Text>;
                                            }
                                            return null;
                                        })()}

                                        <Text style={labelStyle}>Дата</Text>
                                        <TouchableOpacity onPress={() => setShowGoalTopUpDatePicker(!showGoalTopUpDatePicker)} style={{
                                            backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12,
                                            paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
                                            borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)',
                                        }}>
                                            <Text style={{ color: '#fff', fontSize: 14 }}>{format(goalTopUpDate, 'dd.MM.yyyy')}</Text>
                                        </TouchableOpacity>
                                        {showGoalTopUpDatePicker && (
                                            <DateTimePicker value={goalTopUpDate} mode="date" display="inline" themeVariant="dark"
                                                onChange={(_, d) => { setShowGoalTopUpDatePicker(false); if (d) setGoalTopUpDate(d); }} />
                                        )}

                                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                                            <TouchableOpacity onPress={() => setShowGoalTopUp(false)} style={{
                                                flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
                                                backgroundColor: 'rgba(255,255,255,0.06)',
                                            }}>
                                                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '600' }}>Отмена</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={confirmGoalTopUp} disabled={savingGoalTopUp || !goalTopUpAmount.trim()} style={{
                                                flex: 2, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
                                                backgroundColor: '#4FFFB0', opacity: savingGoalTopUp || !goalTopUpAmount.trim() ? 0.5 : 1,
                                            }}>
                                                {savingGoalTopUp
                                                    ? <ActivityIndicator color="#000" />
                                                    : <Text style={{ color: '#000', fontSize: 14, fontWeight: '700' }}>Пополнить</Text>
                                                }
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )}

                                {/* Finish goal */}
                                {!showArchiveGoal ? (
                                    <TouchableOpacity onPress={() => setShowArchiveGoal(true)} style={{
                                        paddingVertical: 14, borderRadius: 14, alignItems: 'center',
                                        backgroundColor: 'rgba(239,68,68,0.07)',
                                        borderWidth: 1, borderColor: 'rgba(239,68,68,0.18)',
                                    }}>
                                        <Text style={{ color: '#ef4444', fontSize: 14, fontWeight: '600' }}>Завершить цель</Text>
                                    </TouchableOpacity>
                                ) : (
                                    <View style={{ backgroundColor: 'rgba(239,68,68,0.05)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(239,68,68,0.15)' }}>
                                        <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: 6 }}>
                                            Завершить цель «{g.name}»?
                                        </Text>
                                        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: 14 }}>
                                            Накопленные средства останутся на счету.
                                        </Text>
                                        <View style={{ flexDirection: 'row', gap: 10 }}>
                                            <TouchableOpacity onPress={() => setShowArchiveGoal(false)} style={{
                                                flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
                                                backgroundColor: 'rgba(255,255,255,0.06)',
                                            }}>
                                                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '600' }}>Отмена</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={confirmArchiveGoal} disabled={archivingGoal} style={{
                                                flex: 2, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
                                                backgroundColor: '#ef4444', opacity: archivingGoal ? 0.5 : 1,
                                            }}>
                                                {archivingGoal
                                                    ? <ActivityIndicator color="#fff" />
                                                    : <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Завершить</Text>
                                                }
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )}

                                <View style={{ height: 20 }} />
                            </ScrollView>
                        );
                    })()}
                </View>
            </Modal>

            {/* ══ ADD/EDIT DEPOSIT MODAL ═══════════════════════════════════ */}
            <Modal visible={showAddDeposit} animationType="slide" transparent onRequestClose={closeDepositModal}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                    <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeDepositModal} />
                    <View style={{ backgroundColor: '#111827', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36, maxHeight: '92%' }}>
                        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 16 }} />

                        {/* Header with preview */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                            <View style={{
                                width: 48, height: 48, borderRadius: 14,
                                backgroundColor: depositColor + '20',
                                borderWidth: 1.5, borderColor: depositColor + '50',
                                alignItems: 'center', justifyContent: 'center',
                            }}>
                                <CategoryIcon iconName={depositIcon} color={depositColor} size={24} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff' }}>{editingDeposit ? 'Редактировать депозит' : 'Новый депозит'}</Text>
                                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
                                    {depositName.trim() || 'Введите название ниже'}
                                </Text>
                            </View>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                            {/* ── Иконка ── */}
                            <Text style={labelStyle}>Иконка</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                                <View style={{ flexDirection: 'row', gap: 6 }}>
                                    {['Landmark', 'Banknote', 'Wallet', 'CreditCard', 'Coins', 'CircleDollarSign', 'TrendingUp', 'Building2', 'Briefcase', 'Bitcoin'].map(ic => (
                                        <TouchableOpacity key={ic} onPress={() => setDepositIcon(ic)} style={{
                                            width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                                            backgroundColor: depositIcon === ic ? 'rgba(124,111,255,0.25)' : 'rgba(255,255,255,0.05)',
                                            borderWidth: 1.5,
                                            borderColor: depositIcon === ic ? '#7C6FFF' : 'transparent',
                                        }}>
                                            <CategoryIcon iconName={ic} color={depositIcon === ic ? '#7C6FFF' : 'rgba(255,255,255,0.5)'} size={20} />
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </ScrollView>

                            {/* ── Цвет ── */}
                            <Text style={labelStyle}>Цвет</Text>
                            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                                {['#7C6FFF', '#4FFFB0', '#FFB84F', '#FF6B6B', '#4FC3FF', '#F472B6', '#34D399', '#FB923C'].map(c => (
                                    <TouchableOpacity key={c} onPress={() => setDepositColor(c)} style={{
                                        width: 32, height: 32, borderRadius: 16,
                                        backgroundColor: c,
                                        borderWidth: depositColor === c ? 3 : 1.5,
                                        borderColor: depositColor === c ? '#fff' : 'transparent',
                                        alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        {depositColor === c && <Text style={{ fontSize: 14 }}>✓</Text>}
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Name */}
                            <Text style={labelStyle}>Название</Text>
                            <TextInput
                                style={inputStyle}
                                placeholder="Пенсионный счёт"
                                placeholderTextColor="rgba(255,255,255,0.2)"
                                value={depositName}
                                onChangeText={setDepositName}
                            />

                            {/* Amount + Currency */}
                            <Text style={labelStyle}>Сумма вклада</Text>
                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                                <TextInput
                                    style={[inputStyle, { flex: 1, marginBottom: 0 }]}
                                    keyboardType="numeric"
                                    placeholder="25000"
                                    placeholderTextColor="rgba(255,255,255,0.2)"
                                    value={depositAmount}
                                    onChangeText={setDepositAmount}
                                />
                                <TouchableOpacity
                                    onPress={() => setShowDepositCurrencyDropdown(true)}
                                    style={{
                                        flexDirection: 'row', alignItems: 'center', gap: 6,
                                        paddingHorizontal: 14, borderRadius: 12,
                                        backgroundColor: 'rgba(255,255,255,0.06)',
                                        borderWidth: 1.5, borderColor: 'rgba(124,111,255,0.3)',
                                        minWidth: 88,
                                    }}
                                >
                                    <Text style={{ fontSize: 18 }}>{CURRENCIES.find(c => c.code === depositCurrency)?.flag}</Text>
                                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{depositCurrency}</Text>
                                    <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginLeft: 2 }}>▾</Text>
                                </TouchableOpacity>
                            </View>

                            {/* From account (create mode only) */}
                            {!editingDeposit && (
                                <View style={{ marginBottom: 12 }}>
                                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>Со счёта (опц.)</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                        <View style={{ flexDirection: 'row', gap: 6 }}>
                                            {accounts.map(acc => {
                                                const sel = topUpAccountId === acc.id;
                                                const insufficient = sel && parseFloat(depositAmount || '0') > acc.balance;
                                                return (
                                                    <TouchableOpacity key={acc.id} onPress={() => setTopUpAccountId(sel ? '' : acc.id)}
                                                        style={{
                                                            paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                                                            backgroundColor: sel ? 'rgba(124,111,255,0.2)' : 'rgba(255,255,255,0.06)',
                                                            borderWidth: 1.5, borderColor: sel ? (insufficient ? 'rgba(255,107,107,0.4)' : 'rgba(124,111,255,0.4)') : 'rgba(255,255,255,0.08)',
                                                            flexDirection: 'row', alignItems: 'center', gap: 6,
                                                        }}>
                                                        <Text style={{ fontSize: 16 }}>{acc.icon || '💳'}</Text>
                                                        <Text style={{ fontSize: 13, color: sel ? '#7C6FFF' : 'rgba(255,255,255,0.5)', fontWeight: '600' }}>{acc.name}</Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </ScrollView>
                                    {topUpAccountId && (() => {
                                        const srcAcc = accounts.find(a => a.id === topUpAccountId);
                                        const transferAmt = parseFloat(depositAmount || '0');
                                        if (srcAcc && transferAmt > srcAcc.balance) {
                                            return <Text style={{ fontSize: 11, color: '#FFB84F', marginTop: 4 }}>На счёте недостаточно средств ({formatAmount(srcAcc.balance, srcAcc.currency)})</Text>;
                                        }
                                        return null;
                                    })()}
                                </View>
                            )}

                            {/* Top-up section (edit mode only) */}
                            {editingDeposit && (
                                !showDepositTopUp ? (
                                    <TouchableOpacity onPress={() => setShowDepositTopUp(true)} style={{
                                        paddingVertical: 14, borderRadius: 14, alignItems: 'center',
                                        backgroundColor: 'rgba(79,255,176,0.08)',
                                        borderWidth: 1.5, borderColor: 'rgba(79,255,176,0.25)',
                                        marginBottom: 12,
                                    }}>
                                        <Text style={{ color: '#4FFFB0', fontSize: 14, fontWeight: '600' }}>Пополнить</Text>
                                    </TouchableOpacity>
                                ) : (
                                    <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(79,255,176,0.15)' }}>
                                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 12 }}>Пополнить депозит</Text>

                                        <Text style={labelStyle}>Сумма</Text>
                                        <TextInput
                                            value={depositTopUpAmount}
                                            onChangeText={setDepositTopUpAmount}
                                            placeholder="0"
                                            placeholderTextColor="rgba(255,255,255,0.2)"
                                            keyboardType="decimal-pad"
                                            style={inputStyle}
                                        />

                                        <Text style={labelStyle}>Со счёта (опц.)</Text>
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                                {accounts.map(acc => {
                                                    const sel = depositTopUpAccountId === acc.id;
                                                    return (
                                                        <TouchableOpacity key={acc.id} onPress={() => setDepositTopUpAccountId(sel ? '' : acc.id)} style={{
                                                            flexDirection: 'row', alignItems: 'center', gap: 6,
                                                            paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
                                                            backgroundColor: sel ? 'rgba(124,111,255,0.15)' : 'rgba(255,255,255,0.05)',
                                                            borderWidth: 1.5, borderColor: sel ? '#7C6FFF' : 'rgba(255,255,255,0.08)',
                                                        }}>
                                                            <Text style={{ fontSize: 14 }}>{acc.icon || '💳'}</Text>
                                                            <Text style={{ color: sel ? '#a78bfa' : '#fff', fontSize: 13, fontWeight: '500' }}>{acc.name}</Text>
                                                            <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>{formatAmount(acc.balance, acc.currency)}</Text>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>
                                        </ScrollView>

                                        {depositTopUpAccountId && (() => {
                                            const srcAcc = accounts.find(a => a.id === depositTopUpAccountId);
                                            const amt = parseFloat(depositTopUpAmount.replace(',', '.')) || 0;
                                            if (srcAcc && amt > srcAcc.balance) {
                                                return <Text style={{ fontSize: 11, color: '#FFB84F', marginBottom: 4 }}>Недостаточно средств ({formatAmount(srcAcc.balance, srcAcc.currency)})</Text>;
                                            }
                                            return null;
                                        })()}

                                        <Text style={labelStyle}>Дата</Text>
                                        <TouchableOpacity onPress={() => setShowDepositTopUpDatePicker(!showDepositTopUpDatePicker)} style={{
                                            backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12,
                                            paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
                                            borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)',
                                        }}>
                                            <Text style={{ color: '#fff', fontSize: 14 }}>{format(depositTopUpDate, 'dd.MM.yyyy')}</Text>
                                        </TouchableOpacity>
                                        {showDepositTopUpDatePicker && (
                                            <DateTimePicker value={depositTopUpDate} mode="date" display="inline" themeVariant="dark"
                                                onChange={(_, d) => { setShowDepositTopUpDatePicker(false); if (d) setDepositTopUpDate(d); }} />
                                        )}

                                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                                            <TouchableOpacity onPress={() => setShowDepositTopUp(false)} style={{
                                                flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
                                                backgroundColor: 'rgba(255,255,255,0.06)',
                                            }}>
                                                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '600' }}>Отмена</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={confirmDepositTopUp} disabled={savingDepositTopUp || !depositTopUpAmount.trim()} style={{
                                                flex: 2, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
                                                backgroundColor: '#4FFFB0', opacity: savingDepositTopUp || !depositTopUpAmount.trim() ? 0.5 : 1,
                                            }}>
                                                {savingDepositTopUp
                                                    ? <ActivityIndicator color="#000" />
                                                    : <Text style={{ color: '#000', fontSize: 14, fontWeight: '700' }}>Пополнить</Text>
                                                }
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )
                            )}

                            {/* Currency dropdown */}
                            <Modal visible={showDepositCurrencyDropdown} transparent animationType="fade">
                                <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} activeOpacity={1}
                                    onPress={() => { setShowDepositCurrencyDropdown(false); setDepositCurrencySearch(''); }} />
                                <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#1a2235', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingBottom: 40, maxHeight: '60%' }}>
                                    <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 16 }} />
                                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff', paddingHorizontal: 20, marginBottom: 12 }}>Валюта</Text>
                                    <View style={{ marginHorizontal: 20, marginBottom: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
                                        <Text style={{ fontSize: 15, color: 'rgba(255,255,255,0.3)', marginRight: 8 }}>🔍</Text>
                                        <TextInput
                                            value={depositCurrencySearch}
                                            onChangeText={setDepositCurrencySearch}
                                            placeholder="Поиск валюты..."
                                            placeholderTextColor="rgba(255,255,255,0.25)"
                                            style={{ flex: 1, color: '#fff', fontSize: 14 }}
                                            autoCorrect={false} autoCapitalize="none"
                                        />
                                        {depositCurrencySearch.length > 0 && (
                                            <TouchableOpacity onPress={() => setDepositCurrencySearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                                <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 16 }}>✕</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                    <FlatList
                                        data={CURRENCIES.filter(c => {
                                            const q = depositCurrencySearch.toLowerCase();
                                            return !q || c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
                                        })}
                                        keyExtractor={c => c.code}
                                        showsVerticalScrollIndicator={false}
                                        renderItem={({ item: c }) => {
                                            const selected = depositCurrency === c.code;
                                            return (
                                                <TouchableOpacity
                                                    onPress={() => { setDepositCurrency(c.code); setShowDepositCurrencyDropdown(false); setDepositCurrencySearch(''); }}
                                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 13, backgroundColor: selected ? 'rgba(124,111,255,0.12)' : 'transparent' }}>
                                                    <Text style={{ fontSize: 22 }}>{c.flag}</Text>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ fontSize: 14, fontWeight: selected ? '700' : '500', color: selected ? '#a78bfa' : '#fff' }}>{c.code}</Text>
                                                        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{c.name}</Text>
                                                    </View>
                                                    {selected && <Text style={{ color: '#7C6FFF', fontSize: 16 }}>✓</Text>}
                                                </TouchableOpacity>
                                            );
                                        }}
                                    />
                                </View>
                            </Modal>

                            {/* Compounding */}
                            <Text style={labelStyle}>Капитализация</Text>
                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
                                {(['monthly', 'yearly'] as const).map(c => (
                                    <TouchableOpacity key={c} onPress={() => setDepositCompounding(c)}
                                        style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: depositCompounding === c ? 'rgba(124,111,255,0.2)' : 'rgba(255,255,255,0.06)', borderWidth: 1.5, borderColor: depositCompounding === c ? 'rgba(124,111,255,0.4)' : 'rgba(255,255,255,0.08)' }}>
                                        <Text style={{ fontSize: 13, color: depositCompounding === c ? '#7C6FFF' : 'rgba(255,255,255,0.5)', fontWeight: '600' }}>
                                            {c === 'monthly' ? 'Ежемесячно' : 'Ежегодно'}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Start date */}
                            <Text style={labelStyle}>Дата начала</Text>
                            <TouchableOpacity onPress={() => setShowDepositStartPicker(true)}
                                style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 4, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)' }}>
                                <Text style={{ color: '#fff', fontSize: 14 }}>{format(depositStartDate, 'dd.MM.yyyy')}</Text>
                            </TouchableOpacity>
                            {showDepositStartPicker && (
                                <DateTimePicker value={depositStartDate} mode="date" display="inline" themeVariant="dark"
                                    onChange={(_, d) => { setShowDepositStartPicker(false); if (d) setDepositStartDate(d); }} />
                            )}

                            {/* End date (optional) */}
                            <Text style={[labelStyle, { marginTop: 12 }]}>Дата окончания (опц.)</Text>
                            <TouchableOpacity onPress={() => { if (depositEndDate) { setDepositEndDate(null); } else { setDepositEndDate(addMonths(new Date(), 12)); setShowDepositEndPicker(true); } }}
                                style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 4, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)' }}>
                                <Text style={{ color: depositEndDate ? '#fff' : 'rgba(255,255,255,0.2)', fontSize: 14 }}>
                                    {depositEndDate ? format(depositEndDate, 'dd.MM.yyyy') : 'Без срока'}
                                </Text>
                            </TouchableOpacity>
                            {showDepositEndPicker && depositEndDate && (
                                <DateTimePicker value={depositEndDate} mode="date" display="inline" themeVariant="dark"
                                    onChange={(_, d) => { setShowDepositEndPicker(false); if (d) setDepositEndDate(d); }} />
                            )}

                            {/* ── Rate Periods (compact list) ── */}
                            <View style={{ marginTop: 16 }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <Text style={labelStyle}>Периоды ставок</Text>
                                    {(() => {
                                        const lastPeriod = ratePeriodDrafts[ratePeriodDrafts.length - 1];
                                        const canAdd = lastPeriod && lastPeriod.rate.trim() !== '' && !isNaN(parseFloat(lastPeriod.rate)) && parseFloat(lastPeriod.rate) > 0;
                                        return (
                                            <TouchableOpacity
                                                disabled={!canAdd}
                                                onPress={() => {
                                                    const prev = ratePeriodDrafts[ratePeriodDrafts.length - 1];
                                                    const newFrom = prev.toDate ?? new Date();
                                                    setRatePeriodDrafts([...ratePeriodDrafts, { rate: '', fromDate: newFrom, toDate: null }]);
                                                }}
                                            >
                                                <Text style={{ color: '#7C6FFF', fontSize: 13, fontWeight: '600', opacity: canAdd ? 1 : 0.3 }}>+ Добавить период</Text>
                                            </TouchableOpacity>
                                        );
                                    })()}
                                </View>

                                <View style={{
                                    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14,
                                    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.06)',
                                    overflow: 'hidden',
                                }}>
                                    {ratePeriodDrafts.map((period, idx) => {
                                        const fromDate = idx === 0 ? depositStartDate : (ratePeriodDrafts[idx - 1].toDate ?? period.fromDate);
                                        const isLast = idx === ratePeriodDrafts.length - 1;
                                        const endLabel = period.toDate ? format(period.toDate, 'dd.MM.yyyy') : 'бессрочно';
                                        const showPicker = periodEndPickerIdx === idx;

                                        return (
                                            <View key={idx}>
                                                {idx > 0 && <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />}
                                                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}>
                                                    {/* Date range */}
                                                    <TouchableOpacity
                                                        onPress={() => setPeriodEndPickerIdx(showPicker ? null : idx)}
                                                        style={{ flex: 1 }}
                                                    >
                                                        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                                                            {format(fromDate, 'dd.MM.yyyy')} — <Text style={{ color: period.toDate ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)' }}>{endLabel}</Text>
                                                        </Text>
                                                    </TouchableOpacity>

                                                    {/* Rate input */}
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                        <TextInput
                                                            style={{
                                                                backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8,
                                                                color: '#fff', fontSize: 14, fontWeight: '600',
                                                                paddingHorizontal: 10, paddingVertical: 6,
                                                                minWidth: 48, textAlign: 'center',
                                                                borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
                                                            }}
                                                            keyboardType="numeric"
                                                            placeholder="0"
                                                            placeholderTextColor="rgba(255,255,255,0.2)"
                                                            value={period.rate}
                                                            onChangeText={v => {
                                                                const updated = [...ratePeriodDrafts];
                                                                updated[idx] = { ...updated[idx], rate: v };
                                                                setRatePeriodDrafts(updated);
                                                            }}
                                                        />
                                                        <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>%</Text>
                                                    </View>

                                                    {/* Delete button */}
                                                    {ratePeriodDrafts.length > 1 ? (
                                                        <TouchableOpacity onPress={() => {
                                                            const updated = ratePeriodDrafts.filter((_, i) => i !== idx);
                                                            // Fix chain: next period's fromDate inherits
                                                            if (idx < updated.length && idx > 0) {
                                                                updated[idx] = { ...updated[idx], fromDate: updated[idx - 1].toDate ?? updated[idx].fromDate };
                                                            }
                                                            setPeriodEndPickerIdx(null);
                                                            setRatePeriodDrafts(updated);
                                                        }} style={{ padding: 4 }}>
                                                            <Text style={{ color: '#FF6B6B', fontSize: 16, fontWeight: '700' }}>×</Text>
                                                        </TouchableOpacity>
                                                    ) : (
                                                        <View style={{ width: 24 }} />
                                                    )}
                                                </View>

                                                {/* End date picker */}
                                                {showPicker && (
                                                    <View style={{ paddingHorizontal: 14, paddingBottom: 10 }}>
                                                        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                                                            <TouchableOpacity onPress={() => {
                                                                const updated = [...ratePeriodDrafts];
                                                                if (!period.toDate) {
                                                                    updated[idx] = { ...updated[idx], toDate: addMonths(fromDate, 6) };
                                                                } else {
                                                                    updated[idx] = { ...updated[idx], toDate: null };
                                                                    // If not last, remove all following periods
                                                                    if (!isLast) {
                                                                        updated.splice(idx + 1);
                                                                    }
                                                                }
                                                                setRatePeriodDrafts(updated);
                                                            }} style={{
                                                                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                                                                backgroundColor: !period.toDate ? 'rgba(124,111,255,0.2)' : 'rgba(255,255,255,0.06)',
                                                                borderWidth: 1, borderColor: !period.toDate ? '#7C6FFF' : 'rgba(255,255,255,0.08)',
                                                            }}>
                                                                <Text style={{ color: !period.toDate ? '#7C6FFF' : 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '600' }}>Бессрочно</Text>
                                                            </TouchableOpacity>
                                                        </View>
                                                        {period.toDate && (
                                                            <DateTimePicker value={period.toDate} mode="date" display="inline" themeVariant="dark"
                                                                minimumDate={fromDate}
                                                                onChange={(_, d) => {
                                                                    if (d) {
                                                                        const updated = [...ratePeriodDrafts];
                                                                        updated[idx] = { ...updated[idx], toDate: d };
                                                                        // Update next period's fromDate to match
                                                                        if (idx + 1 < updated.length) {
                                                                            updated[idx + 1] = { ...updated[idx + 1], fromDate: d };
                                                                        }
                                                                        setRatePeriodDrafts(updated);
                                                                    }
                                                                    setPeriodEndPickerIdx(null);
                                                                }} />
                                                        )}
                                                    </View>
                                                )}
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>

                            <TouchableOpacity
                                onPress={() => householdId && (editingDeposit ? updateDeposit(householdId) : createDeposit(householdId))}
                                disabled={savingDeposit}
                                style={{ marginTop: 16, marginBottom: 20, paddingVertical: 14, backgroundColor: '#7C6FFF', borderRadius: 14, alignItems: 'center', opacity: savingDeposit ? 0.5 : 1 }}>
                                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{savingDeposit ? 'Сохранение…' : 'Сохранить'}</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>


            {/* ══ EXTRAS CONFIG MODAL ═════════════════════════════════════ */}
            <Modal visible={showExtrasModal} animationType="slide" transparent onRequestClose={() => setShowExtrasModal(false)}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                    <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowExtrasModal(false)} />
                    <View style={{ backgroundColor: '#111827', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36, maxHeight: '80%' }}>
                        {/* Handle */}
                        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 16 }} />
                        <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 6 }}>Экстра-категории</Text>
                        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>
                            Отметь категории где есть{'\n'}пространство для экономии
                        </Text>

                        <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                            {allCategories.map(cat => {
                                const catDraft = extraDraft[`cat:${cat.id}`];
                                const isExpanded = expandedCats.has(cat.id);
                                const hasTags = cat.tags.length > 0;
                                const anyActive = catDraft?.active || cat.tags.some(t => extraDraft[`tag:${t.id}`]?.active);

                                return (
                                    <View key={cat.id} style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}>
                                        {/* Category row */}
                                        <TouchableOpacity
                                            activeOpacity={0.7}
                                            onPress={() => {
                                                if (hasTags) {
                                                    setExpandedCats(prev => {
                                                        const next = new Set(prev);
                                                        next.has(cat.id) ? next.delete(cat.id) : next.add(cat.id);
                                                        return next;
                                                    });
                                                }
                                            }}
                                            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}
                                        >
                                            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: cat.color + '22', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                                                <CategoryIcon iconName={cat.icon} color={cat.color} size={16} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ fontSize: 14, color: '#fff' }}>{cat.name}</Text>
                                                {hasTags && (
                                                    <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>
                                                        {isExpanded ? '▼' : '▶'} {cat.tags.length} подкатегори{cat.tags.length === 1 ? 'я' : cat.tags.length < 5 ? 'и' : 'й'}
                                                    </Text>
                                                )}
                                            </View>
                                            {/* Category-level toggle (only if no tags, or as whole-category extra) */}
                                            {!hasTags && catDraft && (
                                                <>
                                                    {catDraft.active && (
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 10 }}>
                                                            <TextInput
                                                                style={{ width: 70, height: 32, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, color: '#fff', fontSize: 13, textAlign: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}
                                                                keyboardType="numeric"
                                                                placeholder="0"
                                                                placeholderTextColor="rgba(255,255,255,0.2)"
                                                                value={catDraft.amount}
                                                                onChangeText={v => setExtraDraft(prev => ({ ...prev, [`cat:${cat.id}`]: { ...prev[`cat:${cat.id}`], amount: v } }))}
                                                            />
                                                            <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 4 }}>/мес</Text>
                                                        </View>
                                                    )}
                                                    <Switch
                                                        value={catDraft.active}
                                                        onValueChange={v => setExtraDraft(prev => ({ ...prev, [`cat:${cat.id}`]: { ...prev[`cat:${cat.id}`], active: v } }))}
                                                        trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(124,111,255,0.4)' }}
                                                        thumbColor={catDraft.active ? '#7C6FFF' : '#555'}
                                                    />
                                                </>
                                            )}
                                            {hasTags && anyActive && (
                                                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#7C6FFF', marginLeft: 8 }} />
                                            )}
                                        </TouchableOpacity>

                                        {/* Expanded tags */}
                                        {hasTags && isExpanded && (
                                            <View style={{ paddingLeft: 24, paddingBottom: 8 }}>
                                                {/* Whole-category toggle */}
                                                {catDraft && (
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
                                                        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginRight: 4 }}>└</Text>
                                                        <Text style={{ flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Вся категория</Text>
                                                        {catDraft.active && (
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 10 }}>
                                                                <TextInput
                                                                    style={{ width: 60, height: 28, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6, color: '#fff', fontSize: 12, textAlign: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}
                                                                    keyboardType="numeric"
                                                                    placeholder="0"
                                                                    placeholderTextColor="rgba(255,255,255,0.2)"
                                                                    value={catDraft.amount}
                                                                    onChangeText={v => setExtraDraft(prev => ({ ...prev, [`cat:${cat.id}`]: { ...prev[`cat:${cat.id}`], amount: v } }))}
                                                                />
                                                                <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginLeft: 3 }}>/мес</Text>
                                                            </View>
                                                        )}
                                                        <Switch
                                                            value={catDraft.active}
                                                            onValueChange={v => setExtraDraft(prev => ({ ...prev, [`cat:${cat.id}`]: { ...prev[`cat:${cat.id}`], active: v } }))}
                                                            trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(124,111,255,0.4)' }}
                                                            thumbColor={catDraft.active ? '#7C6FFF' : '#555'}
                                                            style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                                                        />
                                                    </View>
                                                )}
                                                {/* Individual tags */}
                                                {cat.tags.map(tag => {
                                                    const tagDraft = extraDraft[`tag:${tag.id}`];
                                                    if (!tagDraft) return null;
                                                    return (
                                                        <View key={tag.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
                                                            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginRight: 4 }}>└</Text>
                                                            <Text style={{ flex: 1, fontSize: 13, color: '#fff' }}>{tag.name}</Text>
                                                            {tagDraft.active && (
                                                                <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 10 }}>
                                                                    <TextInput
                                                                        style={{ width: 60, height: 28, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6, color: '#fff', fontSize: 12, textAlign: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}
                                                                        keyboardType="numeric"
                                                                        placeholder="0"
                                                                        placeholderTextColor="rgba(255,255,255,0.2)"
                                                                        value={tagDraft.amount}
                                                                        onChangeText={v => setExtraDraft(prev => ({ ...prev, [`tag:${tag.id}`]: { ...prev[`tag:${tag.id}`], amount: v } }))}
                                                                    />
                                                                    <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginLeft: 3 }}>/мес</Text>
                                                                </View>
                                                            )}
                                                            <Switch
                                                                value={tagDraft.active}
                                                                onValueChange={v => setExtraDraft(prev => ({ ...prev, [`tag:${tag.id}`]: { ...prev[`tag:${tag.id}`], active: v } }))}
                                                                trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(124,111,255,0.4)' }}
                                                                thumbColor={tagDraft.active ? '#7C6FFF' : '#555'}
                                                                style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                                                            />
                                                        </View>
                                                    );
                                                })}
                                            </View>
                                        )}
                                    </View>
                                );
                            })}
                        </ScrollView>

                        <TouchableOpacity
                            onPress={() => householdId && saveExtras(householdId)}
                            disabled={savingExtras}
                            style={{
                                marginTop: 16, paddingVertical: 14,
                                backgroundColor: '#7C6FFF', borderRadius: 14,
                                alignItems: 'center', opacity: savingExtras ? 0.5 : 1,
                            }}>
                            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>
                                {savingExtras ? 'Сохранение…' : 'Сохранить'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}
