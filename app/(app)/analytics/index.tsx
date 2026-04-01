/**
 * Analytics Screen – real Supabase data
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,

    Modal,
    Platform,
    ScrollView,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { BaseBottomSheet } from '@/components/ui/BaseBottomSheet';
import {
    Activity, ArrowRightLeft, Award,
    Banknote, Bike, Bitcoin, BookOpen, Briefcase, Building2, Bus,
    Camera, Car, Check, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, Coffee, Coins, CreditCard,
    Droplets, Dumbbell, Film, Flag, Flame, Fuel, Gift, Globe, GraduationCap,
    Heart, HelpCircle, Home, Landmark, Laptop, MapPin, Monitor, Music,
    Package, PawPrint, Pencil, Pill, Plane, Receipt, Scissors,
    ShoppingBag, ShoppingCart, Shirt, Smartphone, Sofa, Sparkles, Star,
    Tag, Train, TrendingDown, TrendingUp, Trophy, Tv, Utensils,
    Wallet, Wifi, X, Zap,
} from 'lucide-react-native';
import { Circle, G, Line as SvgLine, Path, Rect, Svg, Text as SvgText } from 'react-native-svg';
import { useFocusEffect, useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '@/lib/supabase';
import { formatAmount, getCurrencySymbol, CURRENCIES } from '@/constants/currencies';
import { Account } from '@/types';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';
import { useTheme } from '@/context/ThemeContext';
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
    eachDayOfInterval,
    getDay,
    isToday as isTodayFn,
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
    Heart, HelpCircle, Dumbbell, Activity, Pill,
    Film, Music, Tv, Monitor, Trophy, Star,
    Shirt, Tag, Gift, Scissors,
    MapPin, Globe,
    BookOpen, GraduationCap,
    CreditCard, Wallet, Coins, Banknote, Landmark, Bitcoin, CircleDollarSign, TrendingUp, TrendingDown,
    Briefcase, Building2, Receipt, Package,
    PawPrint, Award, Flag, ArrowRightLeft,
    Camera, Pencil, Laptop, Smartphone, Sparkles,
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
interface RecurringDetail { name: string; amount: number; }
interface ForecastChartPoint {
    label: string;
    monthLabel?: string;
    /** Everyday expenses (fact line) — only for past days */
    factAmount: number;
    /** Avg daily spend (forecast line) — only for future days */
    forecastAmount: number;
    /** Base + recurring + credit payments (red dots) */
    paymentAmount: number;
    paymentDetails: RecurringDetail[];
    isFact: boolean;
    date: string; // yyyy-MM-dd
}
interface RecurringItem { name: string; amount: number; }
interface ForecastData {
    factSpend: number;
    projectedDaily: number;       // projected daily spending (excl. base/recurring)
    projectedTotal: number;
    recurringTotal: number;
    daysLeft: number;
    daysPassed: number;
    insufficientData: boolean;    // true if < 7 days of data
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

interface CalendarPayment {
    id: string;
    name: string;
    amount: number;
    currency: string;
    type: 'recurring' | 'loan';
    date: string;
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
    const { colors } = useTheme();
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
                        <SvgText x={x + groupW / 2} y={H - 2} textAnchor="middle" fontSize={8} fill={isSelected ? '#fff' : colors.textMuted} fontWeight={isSelected ? '700' : '400'}>
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

// ─── ForecastLineChart ────────────────────────────────────────────────────────

function ForecastLineChart({ data, selectedIndex, onSelect, currency: cur }: { data: ForecastChartPoint[]; selectedIndex: number | null; onSelect: (i: number | null) => void; currency: string }) {
    const { colors } = useTheme();
    const { t } = useTranslation();
    const { width } = Dimensions.get('window');
    const sym = getCurrencySymbol(cur);

    // Check for empty state
    const allValues = data.flatMap(p => [p.factAmount, p.forecastAmount, p.paymentAmount]).filter(v => v > 0);
    if (allValues.length === 0) {
        return (
            <View style={{ height: 100, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.textDisabled, fontSize: 13 }}>{t('analytics.noDataForPeriod')}</Text>
            </View>
        );
    }

    // Y-axis: adaptive magnitude-based steps
    const maxVal = Math.max(...allValues);
    const yMax = Math.ceil(maxVal * 1.15) || 100;
    const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(yMax / 4, 1))));
    const yStep = Math.ceil((yMax / 4) / magnitude) * magnitude || 1;
    const niceMax = Math.ceil(yMax / yStep) * yStep;
    const ySteps: number[] = [];
    for (let v = 0; v <= niceMax; v += yStep) ySteps.push(v);

    // Dynamic Y-axis width based on longest label
    const longestLabel = `${sym}${niceMax.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}`;
    const yAxisW = Math.max(32, longestLabel.length * 5.5 + 8);
    const W = width - 52;
    const chartW = W - yAxisW;
    const chartH = 120;
    const labelH = 20;
    const hasMonthLabels = data.some(p => p.monthLabel);
    const H = chartH + labelH + (hasMonthLabels ? 12 : 0);

    const stepX = data.length > 1 ? chartW / (data.length - 1) : chartW / 2;
    const getX = (i: number) => yAxisW + (data.length > 1 ? i * stepX : chartW / 2);
    const getY = (val: number) => chartH - (Math.min(val, niceMax) / niceMax) * chartH;

    // Dataset 1: FACT line (past days, everyday expenses)
    const factPts = data.map((p, i) => p.isFact && p.factAmount > 0 ? { x: getX(i), y: getY(p.factAmount), i } : null).filter(Boolean) as { x: number; y: number; i: number }[];
    // Dataset 2: FORECAST line (future days, avgDaily)
    const fcPts = data.map((p, i) => !p.isFact ? { x: getX(i), y: getY(p.forecastAmount), i } : null).filter(Boolean) as { x: number; y: number; i: number }[];
    // Dataset 3: RED DOTS (days with payments — no connecting line)
    const payPts = data.map((p, i) => p.paymentAmount > 0 ? { x: getX(i), y: getY(p.paymentAmount), i } : null).filter(Boolean) as { x: number; y: number; i: number }[];

    const buildPath = (pts: { x: number; y: number }[]) => {
        if (pts.length === 0) return '';
        return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
    };

    const factPath = buildPath(factPts);
    const fcPath = buildPath(fcPts);
    const showEveryN = data.length > 15 ? Math.ceil(data.length / 8) : 1;
    const showDots = data.length <= 90;

    return (
        <Svg width={W} height={H}>
            {/* Y-axis grid + labels */}
            {ySteps.map(v => {
                const gy = getY(v);
                return (
                    <G key={`y${v}`}>
                        <SvgLine x1={yAxisW} y1={gy} x2={W} y2={gy} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
                        <SvgText x={yAxisW - 4} y={gy + 3} textAnchor="end" fontSize={7} fill={colors.textDisabled}>
                            {sym}{v.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}
                        </SvgText>
                    </G>
                );
            })}

            {/* Lines */}
            {factPath ? <Path d={factPath} fill="none" stroke="#7C6FFF" strokeWidth={2} /> : null}
            {fcPath ? <Path d={fcPath} fill="none" stroke="rgba(124,111,255,0.5)" strokeWidth={2} strokeDasharray="6 4" /> : null}

            {/* Fact dots (blue) */}
            {showDots && factPts.map(p => {
                const isSel = selectedIndex === p.i;
                return (
                    <Circle key={`f${p.i}`} cx={p.x} cy={p.y} r={isSel ? 6 : 2.5} fill="#7C6FFF"
                        stroke={isSel ? '#fff' : 'none'} strokeWidth={isSel ? 2 : 0}
                        opacity={selectedIndex !== null && !isSel ? 0.3 : 1} />
                );
            })}

            {/* Forecast dots (light purple) */}
            {showDots && fcPts.map(p => {
                const isSel = selectedIndex === p.i;
                return (
                    <Circle key={`c${p.i}`} cx={p.x} cy={p.y} r={isSel ? 6 : 2.5} fill="rgba(124,111,255,0.5)"
                        stroke={isSel ? '#fff' : 'none'} strokeWidth={isSel ? 2 : 0}
                        opacity={selectedIndex !== null && !isSel ? 0.3 : 1} />
                );
            })}

            {/* Payment dots (red, always visible, no line) */}
            {payPts.map(p => {
                const isSel = selectedIndex === p.i;
                return (
                    <Circle key={`r${p.i}`} cx={p.x} cy={p.y} r={isSel ? 7 : 4} fill="#E24B4A"
                        stroke={isSel ? '#fff' : 'none'} strokeWidth={isSel ? 2 : 0}
                        opacity={selectedIndex !== null && !isSel ? 0.4 : 1} />
                );
            })}

            {/* Selected dot fallback for 90+ days */}
            {!showDots && selectedIndex !== null && (() => {
                const p = data[selectedIndex];
                const cx = getX(selectedIndex);
                // Show the most relevant dot
                if (p.paymentAmount > 0) return <Circle cx={cx} cy={getY(p.paymentAmount)} r={7} fill="#E24B4A" stroke="#fff" strokeWidth={2} />;
                if (p.isFact && p.factAmount > 0) return <Circle cx={cx} cy={getY(p.factAmount)} r={6} fill="#7C6FFF" stroke="#fff" strokeWidth={2} />;
                if (!p.isFact) return <Circle cx={cx} cy={getY(p.forecastAmount)} r={6} fill="rgba(124,111,255,0.5)" stroke="#fff" strokeWidth={2} />;
                return null;
            })()}

            {/* Touch targets */}
            {data.map((_p, i) => {
                const x = getX(i);
                return (
                    <Rect key={`t${i}`} x={x - stepX / 2} y={0} width={stepX} height={chartH + labelH}
                        fill="transparent" onPress={() => onSelect(selectedIndex === i ? null : i)} />
                );
            })}

            {/* X labels */}
            {hasMonthLabels ? (
                data.map((p, i) => {
                    if (!p.monthLabel) return null;
                    return (
                        <G key={`ml${i}`}>
                            <SvgLine x1={getX(i)} y1={chartH} x2={getX(i)} y2={chartH + 4} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
                            <SvgText x={getX(i)} y={chartH + 14} textAnchor="middle" fontSize={8}
                                fill={selectedIndex === i ? '#fff' : colors.textMuted} fontWeight="500">
                                {p.monthLabel}
                            </SvgText>
                        </G>
                    );
                })
            ) : (
                data.map((p, i) => {
                    if (i % showEveryN !== 0 && i !== data.length - 1) return null;
                    return (
                        <SvgText key={`l${i}`} x={getX(i)} y={chartH + 12} textAnchor="middle" fontSize={8}
                            fill={selectedIndex === i ? '#fff' : colors.textDisabled} fontWeight={selectedIndex === i ? '700' : '400'}>
                            {p.label}
                        </SvgText>
                    );
                })
            )}
        </Svg>
    );
}

// ─── DonutChart ───────────────────────────────────────────────────────────────

function DonutChart({ categories, totalAmount, currency: cur, active, onPress, onCategoryPress, visibleLegend, onMorePress, hiddenCount, prevCategories }: {
    categories: CategoryItem[];
    totalAmount: number;
    currency: string;
    active: number | null;
    onPress: (i: number | null) => void;
    onCategoryPress?: (cat: CategoryItem) => void;
    visibleLegend: CategoryItem[];
    onMorePress?: () => void;
    hiddenCount: number;
    prevCategories?: CategoryItem[];
}) {
    const { colors, fonts } = useTheme();
    const { t } = useTranslation();
    const SIZE = 200;
    const cx = SIZE / 2, cy = SIZE / 2, r = 72, sw = 20;
    const C = 2 * Math.PI * r; // ~452.4
    const total = categories.reduce((s, c) => s + c.percent, 0) || 1;
    // Round linecap extends sw/2 on each end. Visible gap = gapUnits - sw.
    const visibleGap = categories.length > 1 ? 5 : 0;
    const gapUnits = sw + visibleGap;
    const totalGapUnits = gapUnits * categories.length;
    const availableUnits = C - totalGapUnits;

    let offset = 0;
    const segs = categories.map(cat => {
        const frac = cat.percent / total;
        const dashLen = frac * availableUnits;
        const dashOffset = -offset;
        offset += dashLen + gapUnits;
        return { ...cat, dashLen, dashOffset };
    });

    const activeCat = active !== null ? categories[active] : null;

    return (
        <View style={{ alignItems: 'center' }}>

            {/* Donut ring */}
            <View style={{ width: SIZE, height: SIZE, marginBottom: 20 }}>
                <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
                    <Circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={sw} />
                    {segs.map((seg, i) => (
                        <Circle key={seg.id}
                            cx={cx} cy={cy} r={r}
                            fill="none"
                            stroke={seg.color}
                            strokeWidth={active === i ? sw + 4 : sw}
                            strokeDasharray={`${seg.dashLen} ${C - seg.dashLen}`}
                            strokeDashoffset={seg.dashOffset}
                            strokeLinecap="round"
                            opacity={active !== null && active !== i ? 0.25 : 1}
                            transform={`rotate(-90, ${cx}, ${cy})`}
                            onPress={() => onPress(active === i ? null : i)}
                        />
                    ))}
                </Svg>
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 20, fontFamily: fonts.bodySemiBold, color: colors.textPrimary }}>
                        {formatAmount(activeCat ? activeCat.amount : totalAmount, cur)}
                    </Text>
                    {activeCat && (
                        <Text style={{ fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 }}>
                            {activeCat.name}
                        </Text>
                    )}
                </View>
            </View>

            {/* Category rows with icons, %, amount, change */}
            <View style={{ width: '100%', gap: 0 }}>
                {visibleLegend.map((cat, idx) => {
                    const catIdx = categories.findIndex(c => c.id === cat.id);
                    const isActive = active === catIdx;
                    const dimmed = active !== null && !isActive;
                    const prevCat = prevCategories?.find(c => c.id === cat.id);
                    const prevAmt = prevCat?.amount ?? 0;
                    const diff = prevAmt > 0 ? ((cat.amount - prevAmt) / prevAmt) * 100 : null;
                    return (
                        <TouchableOpacity key={cat.id} activeOpacity={0.7}
                            onPress={() => onCategoryPress ? onCategoryPress(cat) : onPress(isActive ? null : catIdx)}
                            style={{
                                flexDirection: 'row', alignItems: 'center', opacity: dimmed ? 0.3 : 1,
                                paddingVertical: 12,
                                borderBottomWidth: idx < visibleLegend.length - 1 ? 1 : 0,
                                borderBottomColor: 'rgba(255,255,255,0.04)',
                            }}>
                            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: cat.color + '22', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                <CategoryIcon iconName={cat.icon} color={cat.color} size={18} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 14, fontFamily: fonts.body, color: colors.textPrimary }} numberOfLines={1}>{cat.name}</Text>
                                <Text style={{ fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 }}>
                                    {cat.percent.toFixed(1)}% {t('analytics.ofExpenses')}
                                </Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={{ fontSize: 14, fontFamily: fonts.bodySemiBold, color: '#f87171' }}>
                                    −{formatAmount(cat.amount, cur)}
                                </Text>
                                {diff !== null && (
                                    <Text style={{ fontSize: 11, fontFamily: fonts.body, color: diff > 0 ? '#f87171' : '#22c55e', marginTop: 2 }}>
                                        {diff > 0 ? '↑' : '↓'}{Math.abs(diff).toFixed(0)}%
                                    </Text>
                                )}
                            </View>
                        </TouchableOpacity>
                    );
                })}
                {hiddenCount > 0 && onMorePress && (
                    <TouchableOpacity onPress={onMorePress} style={{ paddingVertical: 12, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, fontFamily: fonts.bodySemiBold, color: '#7C6FFF' }}>{t('analytics.moreN', { n: hiddenCount })}</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

// ─── BudgetBar ────────────────────────────────────────────────────────────────

function BudgetBar({ item, currency }: { item: BudgetItem; currency: string }) {
    const { colors } = useTheme();
    const { t } = useTranslation();
    const ratio = item.spent / item.limit;
    const color = ratio > 1 ? '#FF6B6B' : ratio > 0.75 ? '#FFB84F' : '#4FFFB0';
    const over = item.spent > item.limit;
    return (
        <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 16 }}>{item.icon}</Text>
                    <Text style={{ fontSize: 13, color: colors.textPrimary }}>{item.name}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 12, color, fontWeight: '700' }}>{formatAmount(item.spent, currency)}</Text>
                    <Text style={{ fontSize: 10, color: colors.textDisabled }}>{t('analytics.outOf', { amount: formatAmount(item.limit, currency) })}</Text>
                </View>
            </View>
            <View style={{ height: 5, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
                <View style={{ height: 5, width: `${Math.min(ratio * 100, 100)}%`, backgroundColor: color, borderRadius: 3 }} />
            </View>
            {over && (
                <Text style={{ marginTop: 5, fontSize: 10, color: '#FF6B6B' }}>
                    {t('analytics.exceededBy', { amount: formatAmount(item.spent - item.limit, currency) })}
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
    const { colors } = useTheme();
    const { t } = useTranslation();
    const ratio     = goal.target > 0 ? Math.min(goal.saved / goal.target, 1) : 0;
    const remaining = Math.max(goal.target - goal.saved, 0);
    const pct       = Math.round(ratio * 100);
    const subtitle  = goal.targetDate
        ? t('analytics.goalDeadline', { date: format(new Date(goal.targetDate), 'd MMM yyyy', { locale: ru }) })
        : t('analytics.goalTarget', { amount: formatAmount(goal.target, goal.currency) });

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
                backgroundColor: colors.bgSecondary,
                borderWidth: 1, borderColor: 'rgba(124,111,255,0.2)',
                borderRadius: 18, padding: 16,
            }}
        >
            {/* Icon + name + edit */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Text style={{ fontSize: 22 }}>{goal.icon}</Text>
                <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>{goal.name}</Text>
                    <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 1 }}>{subtitle}</Text>
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
                <Text style={{ fontSize: 11, color: colors.textMuted }}>{pct}%</Text>
            </View>

            {remaining > 0 && (
                <Text style={{ fontSize: 10, color: colors.textDisabled, marginTop: 4 }}>
                    {t('analytics.goalRemaining', { amount: formatAmount(remaining, goal.currency) })}
                </Text>
            )}
        </TouchableOpacity>
    );
}

// ─── PeriodPills ──────────────────────────────────────────────────────────────

const PERIOD_KEYS: { id: Period; key: string }[] = [
    { id: 'day', key: 'analytics.periodDay' },
    { id: 'week', key: 'analytics.periodWeek' },
    { id: 'month', key: 'analytics.periodMonth' },
    { id: 'quarter', key: 'analytics.periodQuarter' },
    { id: 'year', key: 'analytics.periodYear' },
];

function PeriodPills({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
    const { colors } = useTheme();
    const { t } = useTranslation();
    return (
        <View style={{ flexDirection: 'row', gap: 2, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 2 }}>
            {PERIOD_KEYS.map(p => (
                <TouchableOpacity key={p.id} onPress={() => onChange(p.id)} style={{
                    paddingHorizontal: 9, paddingVertical: 3, borderRadius: 12,
                    backgroundColor: value === p.id ? 'rgba(124,111,255,0.25)' : 'transparent',
                }}>
                    <Text style={{ fontSize: 10, fontWeight: '600', color: value === p.id ? '#7C6FFF' : colors.textDisabled }}>
                        {t(p.key)}
                    </Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: object }) {
    const { colors } = useTheme();
    return (
        <View style={[{
            backgroundColor: colors.bgSecondary,
            borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
            borderRadius: 18, padding: 18, marginBottom: 12,
        }, style]}>
            {children}
        </View>
    );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
    const { colors } = useTheme();
    return <ActivityIndicator color={colors.textMuted} style={{ marginVertical: 24 }} />;
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
    const { colors, fonts } = useTheme();
    const { t } = useTranslation();
    const router = useRouter();
    const [tab, setTab] = useState<AnalyticsTab>('overview');
    const [summaryPeriod, setSummaryPeriod] = useState<Period>('month');
    const [chartPeriod, setChartPeriod] = useState<Period>('month');
    const [catPeriod, setCatPeriod] = useState<Period>('month');
    const [activeCategory, setActiveCategory] = useState<number | null>(null);
    const [catExpanded, setCatExpanded] = useState(false);

    // Category detail sheet
    const [selectedCategory, setSelectedCategory] = useState<{
        id: string; name: string; icon: string | null; color: string | null;
        amount: number; currency: string; percent: number;
    } | null>(null);
    const [categoryTxs, setCategoryTxs] = useState<any[]>([]);
    const [categoryPrevAmount, setCategoryPrevAmount] = useState(0);
    const [loadingCategoryTxs, setLoadingCategoryTxs] = useState(false);

    // Watched categories
    const [watchedCategoryIds, setWatchedCategoryIds] = useState<string[]>([]);
    const [showAddWatchedSheet, setShowAddWatchedSheet] = useState(false);

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

    // ── What If simulator ──────────────────────────────────────────────────
    type WhatIfPeriod = 1 | 3 | 6 | 12;
    interface WhatIfScenario {
        categoryOverrides: Record<string, number>;
        incomeOverride: number | null;
        creditOverride: number | null;
        subscriptionSavings: number;
    }
    const [whatIfPeriod, setWhatIfPeriod] = useState<WhatIfPeriod>(3);
    const [whatIfScenario, setWhatIfScenario] = useState<WhatIfScenario>({
        categoryOverrides: {},
        incomeOverride: null,
        creditOverride: null,
        subscriptionSavings: 0,
    });
    const [showWhatIf, setShowWhatIf] = useState(false);

    // ── What If computation ───────────────────────────────────────────────
    function computeWhatIf() {
        const currentIncome = (overviewByPeriod['month'] ?? overviewByPeriod[summaryPeriod])?.income ?? 0;
        const currentCredit = loans.reduce((s, l) => s + (l.monthlyPayment ?? 0), 0);
        const newIncome = whatIfScenario.incomeOverride ?? currentIncome;

        const catSavings = Object.entries(whatIfScenario.categoryOverrides)
            .reduce((sum, [catId, newAmount]) => {
                const current = extraCategories.find(c => c.categoryId === catId)?.spent ?? 0;
                return sum + Math.max(0, current - newAmount);
            }, 0);

        const extraCreditPayment = whatIfScenario.creditOverride ?? 0;
        const subscriptionSavings = whatIfScenario.subscriptionSavings;

        const totalMonthlySavings = (newIncome - currentIncome) + catSavings + subscriptionSavings - extraCreditPayment;
        const totalSavings = totalMonthlySavings * whatIfPeriod;

        const totalCreditDebt = loans.reduce((s, l) => s + ((l as any).remaining_balance ?? (l.totalAmount - l.paidAmount)), 0);
        const monthsEarlier = extraCreditPayment > 0 && totalCreditDebt > 0 && currentCredit > 0
            ? Math.floor(totalCreditDebt / currentCredit - totalCreditDebt / (currentCredit + extraCreditPayment))
            : 0;

        return {
            monthlySavings: totalMonthlySavings,
            totalSavings,
            monthsEarlier: Math.abs(monthsEarlier),
            catSavings,
            subscriptionSavings,
            incomeGain: newIncome - currentIncome,
        };
    }

    // ── Watched categories ─────────────────────────────────────────────────

    async function toggleWatchedCategory(id: string) {
        const next = watchedCategoryIds.includes(id)
            ? watchedCategoryIds.filter(c => c !== id)
            : [...watchedCategoryIds, id];
        setWatchedCategoryIds(next);
        await AsyncStorage.setItem('watchedCategories', JSON.stringify(next));
    }

    // ── Category detail ───────────────────────────────────────────────────
    async function openCategoryDetail(cat: { id: string; name: string; icon: string | null; color: string | null; amount: number; percent: number }) {
        if (!householdId) return;
        setSelectedCategory({ ...cat, currency });
        setLoadingCategoryTxs(true);

        const now = new Date();
        const { start, end, prevStart, prevEnd } = getDateRange(catPeriod, now);

        const [{ data: txs }, { data: prevTxs }] = await Promise.all([
            supabase.from('transactions')
                .select('id, amount, currency, date, note, type')
                .eq('household_id', householdId)
                .eq('category_id', cat.id)
                .eq('type', 'expense')
                .eq('is_deleted', false)
                .gte('date', format(start, 'yyyy-MM-dd'))
                .lte('date', format(end, 'yyyy-MM-dd'))
                .order('date', { ascending: false }),
            supabase.from('transactions')
                .select('amount_base')
                .eq('household_id', householdId)
                .eq('category_id', cat.id)
                .eq('type', 'expense')
                .eq('is_deleted', false)
                .gte('date', format(prevStart, 'yyyy-MM-dd'))
                .lte('date', format(prevEnd, 'yyyy-MM-dd')),
        ]);

        setCategoryTxs(txs ?? []);
        setCategoryPrevAmount((prevTxs ?? []).reduce((s: number, t: any) => s + (t.amount_base ?? 0), 0));
        setLoadingCategoryTxs(false);
    }

    // ── Day detail inline section ──────────────────────────────────────────
    type DayDetailTx = { name: string; icon: string; color: string; amount: number; isScheduled?: boolean };
    const [chartSelectedIdx, setChartSelectedIdx] = useState<number | null>(null);
    const [dayDetailDate, setDayDetailDate] = useState('');
    const [dayDetailIsFact, setDayDetailIsFact] = useState(true);
    const [dayDetailItems, setDayDetailItems] = useState<DayDetailTx[]>([]);
    const [dayDetailTotal, setDayDetailTotal] = useState(0);
    const [dayDetailLoading, setDayDetailLoading] = useState(false);

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
    const [goalInitialDeposit, setGoalInitialDeposit] = useState('');
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

    const [showDeleteGoal, setShowDeleteGoal] = useState(false);
    const [deleteTransferMode, setDeleteTransferMode] = useState<'account' | 'goal' | 'none'>('account');
    const [deleteTransferAccountId, setDeleteTransferAccountId] = useState('');
    const [deleteTransferGoalId, setDeleteTransferGoalId] = useState('');
    const [deletingGoal, setDeletingGoal] = useState(false);
    const goalDetailScrollRef = useRef<ScrollView>(null);

    // ── AI Recommendation ────────────────────────────────────────────────────
    const [recommendation, setRecommendation] = useState('');
    const [hintsEnabled, setHintsEnabled] = useState(true);

    useEffect(() => {
        AsyncStorage.getItem('hints').then(val => {
            if (val !== null) setHintsEnabled(val === 'true');
        });
    }, []);

    // ── Calendar ──────────────────────────────────────────────────────────────
    const [calendarMonth, setCalendarMonth] = useState(new Date());
    const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
    const [calendarPayments, setCalendarPayments] = useState<Record<string, CalendarPayment[]>>({});

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
        AsyncStorage.getItem('watchedCategories').then(val => {
            if (val) try { setWatchedCategoryIds(JSON.parse(val)); } catch {}
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
            const hid = member.household_id as string;
            setHouseholdId(hid);
            const hh = member.households as unknown as { base_currency: string } | null;
            if (hh?.base_currency) setCurrency(hh.base_currency);

            // Load all expense categories
            const { data: cats } = await supabase
                .from('categories')
                .select('id, name, icon, color, category_tags(id, name)')
                .eq('household_id', hid)
                .eq('type', 'expense')
                .eq('is_hidden', false)
                .order('name');
            if (cats) setAllCategories(cats.map((c: any) => ({ id: c.id, name: c.name, icon: c.icon ?? 'ShoppingCart', color: c.color ?? '#888', tags: c.category_tags ?? [] })));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [householdId, summaryPeriod, chartPeriod, catPeriod]);

    // Reset active category when category period changes
    useEffect(() => { setActiveCategory(null); setCatExpanded(false); }, [catPeriod]);

    // ── Fetch forecast when household or forecast period changes ────────────
    useEffect(() => {
        if (!householdId) return;
        fetchForecast(householdId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [householdId, forecastPeriod, customFrom, customTo]);

    // ── Fetch savings & accounts once when household loads ────────────────
    useEffect(() => {
        if (!householdId) return;
        fetchSavings(householdId);
        fetchDeposits(householdId);
        fetchLoans(householdId);
        fetchAccounts(householdId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [householdId]);

    // ── Calendar payments ──────────────────────────────────────────────────
    async function fetchCalendarPayments(month: Date) {
        if (!householdId) return;
        const start = format(startOfMonth(month), 'yyyy-MM-dd');
        const end = format(endOfMonth(month), 'yyyy-MM-dd');

        const [{ data: recurring }, { data: loans }] = await Promise.all([
            supabase.from('recurring_payments').select('id, name, amount, currency, next_date')
                .eq('household_id', householdId).eq('is_active', true)
                .gte('next_date', start).lte('next_date', end),
            supabase.from('loan_accounts').select('id, name, monthly_payment, currency, next_payment_date')
                .eq('household_id', householdId).eq('is_active', true)
                .gte('next_payment_date', start).lte('next_payment_date', end),
        ]);

        const grouped: Record<string, CalendarPayment[]> = {};
        recurring?.forEach(r => {
            const d = r.next_date as string;
            if (!grouped[d]) grouped[d] = [];
            grouped[d].push({ id: r.id as string, name: r.name as string, amount: r.amount as number,
                currency: r.currency as string, type: 'recurring', date: d });
        });
        loans?.forEach(l => {
            const d = l.next_payment_date as string;
            if (!grouped[d]) grouped[d] = [];
            grouped[d].push({ id: l.id as string, name: l.name as string, amount: l.monthly_payment as number,
                currency: l.currency as string, type: 'loan', date: d });
        });
        setCalendarPayments(grouped);
    }

    useEffect(() => {
        if (tab === 'forecast' && householdId) fetchCalendarPayments(calendarMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, householdId, calendarMonth]);

    // ── Overview ────────────────────────────────────────────────────────────
    async function fetchOverview(hid: string, p: Period) {
        setFetchingPeriods(prev => new Set(prev).add(p));
        const now = new Date();
        const { start, end, prevStart, prevEnd } = getDateRange(p, now);

        type TxnRow = {
            id: string; amount: number; amount_base: number | null;
            type: string; date: string; created_at: string; category_id: string;
            is_split: boolean;
            category: { name: string; icon: string | null; color: string | null } | null;
        };

        const [{ data: txns }, { data: prevTxns }, { data: goalsRaw }] = await Promise.all([
            supabase.from('transactions')
                .select('id, amount, amount_base, type, date, created_at, category_id, is_split, category:categories(name, icon, color)')
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

        // Fetch split transaction items
        const splitIds = rows.filter(t => t.is_split && t.type === 'expense').map(t => t.id);
        type SplitItemRow = { transaction_id: string; category_id: string | null; tag_id: string | null; amount: number; amount_base: number | null; category: { name: string; icon: string | null; color: string | null } | null };
        let splitItemsByTx: Record<string, SplitItemRow[]> = {};
        if (splitIds.length > 0) {
            const { data: siData } = await supabase
                .from('transaction_items')
                .select('transaction_id, category_id, tag_id, amount, amount_base, category:categories(name, icon, color)')
                .in('transaction_id', splitIds);
            ((siData ?? []) as unknown as SplitItemRow[]).forEach(si => {
                if (!splitItemsByTx[si.transaction_id]) splitItemsByTx[si.transaction_id] = [];
                splitItemsByTx[si.transaction_id].push(si);
            });
        }

        // Category breakdown
        const expRows = rows.filter(t => t.type === 'expense');
        const catMap: Record<string, { name: string; icon: string; color: string; total: number }> = {};
        expRows.forEach(t => {
            if (t.is_split && splitItemsByTx[t.id]) {
                // Use split items for category breakdown
                splitItemsByTx[t.id].forEach(si => {
                    const id = si.category_id;
                    if (!id) return;
                    const amt = si.amount_base ?? si.amount;
                    if (!catMap[id]) catMap[id] = {
                        name: si.category?.name ?? i18n.t('analytics.otherCategory'),
                        icon: si.category?.icon ?? '📦',
                        color: getCategoryColor(si.category?.name ?? i18n.t('analytics.otherCategory'), si.category?.color ?? null, id),
                        total: 0,
                    };
                    catMap[id].total += amt;
                });
            } else {
                const id = t.category_id;
                if (!id) return;
                if (!catMap[id]) catMap[id] = {
                    name: t.category?.name ?? i18n.t('analytics.otherCategory'),
                    icon: t.category?.icon ?? '📦',
                    color: getCategoryColor(t.category?.name ?? i18n.t('analytics.otherCategory'), t.category?.color ?? null, id),
                    total: 0,
                };
                catMap[id].total += getAmt(t);
            }
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
            case 'month':   return { start: startOfMonth(today), end: endOfMonth(today) };
            case 'quarter': return { start: startOfMonth(today), end: endOfDay(addMonths(today, 3)) };
            case 'half':    return { start: startOfMonth(today), end: endOfDay(addMonths(today, 6)) };
            case 'year':    return { start: startOfMonth(today), end: endOfDay(addMonths(today, 12)) };
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

    // ── Day detail handler (inline section) ────────────────────────────────
    async function handleChartSelect(idx: number | null) {
        if (idx === null || idx === chartSelectedIdx) {
            setChartSelectedIdx(null);
            setDayDetailItems([]);
            setDayDetailTotal(0);
            return;
        }
        if (!householdId || !forecastData) return;
        const point = forecastData.chart[idx];
        if (!point) return;

        setChartSelectedIdx(idx);
        setDayDetailDate(point.date);
        setDayDetailIsFact(point.isFact);
        setDayDetailLoading(true);
        setDayDetailItems([]);
        setDayDetailTotal(0);

        if (point.isFact) {
            // Show ALL transactions for this day (including base)
            const { data: txns } = await supabase
                .from('transactions')
                .select('amount, amount_base, category:categories(name, icon, color)')
                .eq('household_id', householdId)
                .eq('type', 'expense')
                .eq('is_deleted', false)
                .eq('date', point.date);

            type TxWithCat = { amount: number; amount_base: number | null; category: { name: string; icon: string | null; color: string | null } | null };
            const rows = (txns ?? []) as unknown as TxWithCat[];
            const getAmt = (t: { amount: number; amount_base: number | null }) => t.amount_base ?? t.amount;

            const grouped: Record<string, { name: string; icon: string; color: string; total: number }> = {};
            rows.forEach(t => {
                const catName = t.category?.name ?? i18n.t('analytics.uncategorized');
                if (!grouped[catName]) {
                    grouped[catName] = { name: catName, icon: t.category?.icon ?? '📦', color: t.category?.color ?? '#888', total: 0 };
                }
                grouped[catName].total += getAmt(t);
            });

            const items: DayDetailTx[] = Object.values(grouped)
                .sort((a, b) => b.total - a.total)
                .map(g => ({ name: g.name, icon: g.icon, color: g.color, amount: g.total }));

            setDayDetailItems(items);
            setDayDetailTotal(items.reduce((s, it) => s + it.amount, 0));
        } else {
            // Forecast day: avgDaily + scheduled payments
            const avgDaily = forecastData.insufficientData ? 0 : forecastData.projectedDaily / Math.max(forecastData.daysLeft, 1);
            const items: DayDetailTx[] = [];

            if (avgDaily > 0) {
                items.push({ name: i18n.t('analytics.avgDailyExpenses'), icon: '~', color: '#888', amount: avgDaily });
            }

            point.paymentDetails.forEach(rd => {
                items.push({ name: rd.name, icon: '📅', color: '#E24B4A', amount: rd.amount, isScheduled: true });
            });

            setDayDetailItems(items);
            setDayDetailTotal(items.reduce((s, it) => s + it.amount, 0));
        }

        setDayDetailLoading(false);
    }

    // ── Forecast ────────────────────────────────────────────────────────────
    async function fetchForecast(hid: string) {
        setLoadingForecast(true);
        // Use local timezone for today
        const now = new Date();
        const localDateStr = now.toLocaleDateString('en-CA'); // yyyy-MM-dd in local TZ
        const today = startOfDay(new Date(localDateStr + 'T00:00:00'));
        const { start: periodStart, end: periodEnd } = getForecastRange(forecastPeriod, customFrom, customTo);

        // 1) Avg daily spend from last 30 days (with category info for filtering)
        const d30ago = subDays(today, 30);
        const [{ data: last30Txns }, { data: periodTxns }, { data: recurRaw }, { data: budgetsRaw }, { data: catsRaw }] = await Promise.all([
            supabase.from('transactions')
                .select('amount, amount_base, category_id')
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
            // 5) Categories (for expense_type filtering)
            supabase.from('categories')
                .select('id, expense_type')
                .eq('household_id', hid),
        ]);

        const getAmt = (t: { amount: number; amount_base: number | null }) => t.amount_base ?? t.amount;
        type TxRow = { amount: number; amount_base: number | null; date: string; category_id: string | null };
        const allRows = (periodTxns ?? []) as unknown as TxRow[];

        // Build set of "base" category IDs to exclude from daily avg
        const baseCatIds = new Set<string>();
        (catsRaw ?? []).forEach((c: any) => {
            if (c.expense_type === 'base') baseCatIds.add(c.id as string);
        });

        // Avg daily from last 30 days — EXCLUDE base categories
        type Last30Row = { amount: number; amount_base: number | null; category_id: string | null };
        const last30Rows = (last30Txns ?? []) as unknown as Last30Row[];
        const filteredLast30 = last30Rows.filter(t =>
            !(t.category_id && baseCatIds.has(t.category_id))
        );
        const last30Total = filteredLast30.reduce((s, t) => s + getAmt(t), 0);

        // Check if we have enough data (>= 7 days)
        const daysPassed = Math.max(0, differenceInDays(today, periodStart));
        const daysOfData = Math.min(30, daysPassed || 1);
        const insufficientData = daysOfData < 7;
        const avgDaily = insufficientData ? 0 : last30Total / 30;

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

        // Projected spend for future part (0 if insufficient data)
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

        const projectedTotal = factSpend + projectedSpend + recurringTotal;

        // ── Chart buckets — always daily granularity ─────────────────────
        // Split transactions: everyday vs base
        const everydayRows = allRows.filter(t =>
            !(t.category_id && baseCatIds.has(t.category_id))
        );
        const baseRows = allRows.filter(t =>
            t.category_id && baseCatIds.has(t.category_id)
        );

        const chartStart = forecastPeriod === 'month' ? startOfMonth(today) : periodStart;
        const chartEnd = forecastPeriod === 'month' ? endOfMonth(today) : periodEnd;
        const totalDays = differenceInDays(chartEnd, chartStart) + 1;
        const isMultiMonth = forecastPeriod !== 'month';

        const chartBuckets: { label: string; monthLabel?: string; start: Date; end: Date }[] = [];
        for (let d = 0; d < totalDays; d++) {
            const day = addDays(chartStart, d);
            const dayNum = day.getDate();
            let monthLabel: string | undefined;
            if (isMultiMonth && dayNum === 1) {
                const raw = format(day, 'LLL', { locale: ru });
                monthLabel = raw.charAt(0).toUpperCase() + raw.slice(1);
            }
            chartBuckets.push({ label: String(dayNum), monthLabel, start: startOfDay(day), end: endOfDay(day) });
        }

        const chart: ForecastChartPoint[] = chartBuckets.map(b => {
            const isFact = b.end.getTime() <= today.getTime();
            const dateStr = format(b.start, 'yyyy-MM-dd');

            // FACT LINE: everyday expenses only (past days)
            let factAmount = 0;
            if (isFact) {
                everydayRows.forEach(t => {
                    if (t.date === dateStr) factAmount += getAmt(t);
                });
            }

            // FORECAST LINE: flat avgDaily (future days only)
            const forecastAmount = isFact ? 0 : avgDaily;

            // RED DOTS: base txns + recurring payments
            let paymentAmount = 0;
            const paymentDetails: RecurringDetail[] = [];

            if (isFact) {
                // Past: base category transactions that were paid
                let baseTotal = 0;
                baseRows.forEach(t => {
                    if (t.date === dateStr) baseTotal += getAmt(t);
                });
                if (baseTotal > 0) {
                    paymentDetails.push({ name: i18n.t('analytics.baseExpenses'), amount: baseTotal });
                    paymentAmount += baseTotal;
                }
                // Past: confirmed recurring (their txn already in baseRows or everydayRows)
                // — already counted above via base transactions
            } else {
                // Future: upcoming recurring payments for this day
                recRows.forEach(r => {
                    const occ = countOccurrences(r.next_date, r.frequency as Frequency, r.end_date, b.start, b.end);
                    if (occ > 0) {
                        const amt = occ * getAmt(r);
                        paymentAmount += amt;
                        paymentDetails.push({ name: r.name, amount: amt });
                    }
                });
            }

            return { label: b.label, monthLabel: b.monthLabel, factAmount, forecastAmount, paymentAmount, paymentDetails, isFact, date: dateStr };
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
            name: b.category?.name ?? i18n.t('transactions.category'),
            icon: b.category?.icon ?? '📦',
            limit: b.amount,
            spent: catSpend[b.category_id] ?? 0,
        }));

        setForecastData({ factSpend, projectedDaily: projectedSpend, projectedTotal, recurringTotal, daysLeft, daysPassed, insufficientData, periodStart, periodEnd, budgets, chart, chartSubtitle, upcomingRecurring });
        setChartSelectedIdx(null);
        setLoadingForecast(false);

        // Also fetch extras for this period
        fetchExtras(hid, periodStart, periodEnd);
    }

    function getPeriodMultiplier(fp: ForecastPeriod, pStart: Date, pEnd: Date): { multiplier: number; label: string } {
        switch (fp) {
            case 'month':   return { multiplier: 1, label: '' };
            case 'quarter': return { multiplier: 3, label: `× 3 ${i18n.t('common.perMonth').replace('/', '')}` };
            case 'half':    return { multiplier: 6, label: `× 6 ${i18n.t('common.perMonth').replace('/', '')}` };
            case 'year':    return { multiplier: 12, label: `× 12 ${i18n.t('common.perMonth').replace('/', '')}` };
            case 'custom': {
                const days = differenceInDays(pEnd, pStart) + 1;
                const m = Math.round((days / 30) * 10) / 10;
                return { multiplier: m, label: `× ${m} ${i18n.t('common.perMonth').replace('/', '')}` };
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
            .select('id, category_id, tag_id, amount, amount_base, is_split')
            .eq('household_id', hid)
            .eq('type', 'expense')
            .eq('is_deleted', false)
            .gte('date', format(periodStart, 'yyyy-MM-dd'))
            .lte('date', format(periodEnd, 'yyyy-MM-dd'));

        // Fetch split transaction items
        const splitIds = (txns ?? []).filter(t => t.is_split).map(t => t.id as string);
        type SplitItemRow = { transaction_id: string; category_id: string | null; tag_id: string | null; amount: number; amount_base: number | null };
        let splitItemsByTx: Record<string, SplitItemRow[]> = {};
        if (splitIds.length > 0) {
            const { data: siData } = await supabase
                .from('transaction_items')
                .select('transaction_id, category_id, tag_id, amount, amount_base')
                .in('transaction_id', splitIds);
            ((siData ?? []) as unknown as SplitItemRow[]).forEach(si => {
                if (!splitItemsByTx[si.transaction_id]) splitItemsByTx[si.transaction_id] = [];
                splitItemsByTx[si.transaction_id].push(si);
            });
        }

        // Spend by "catId" and "catId:tagId"
        const spendMap: Record<string, number> = {};
        txns?.forEach(t => {
            if (t.is_split && splitItemsByTx[t.id as string]) {
                // Use split items for category/tag breakdown
                splitItemsByTx[t.id as string].forEach(si => {
                    const amt = si.amount_base ?? si.amount;
                    const cid = si.category_id as string;
                    if (!cid) return;
                    spendMap[cid] = (spendMap[cid] ?? 0) + amt;
                    if (si.tag_id) {
                        const key = `${cid}:${si.tag_id}`;
                        spendMap[key] = (spendMap[key] ?? 0) + amt;
                    }
                });
            } else {
                const amt = (t.amount_base as number | null) ?? (t.amount as number);
                const cid = t.category_id as string;
                if (!cid) return;
                spendMap[cid] = (spendMap[cid] ?? 0) + amt;
                if (t.tag_id) {
                    const key = `${cid}:${t.tag_id}`;
                    spendMap[key] = (spendMap[key] ?? 0) + amt;
                }
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
                    tagName: te.tagId ? (tagNames[te.tagId] ?? i18n.t('analytics.uncategorized')) : cat.category!.name,
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
            Alert.alert(t('common.error'), depErr.message);
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
                    description: `${depositName}`,
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
            Alert.alert(t('common.error'), t('analytics.dateStartBeforeEnd'));
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
            Alert.alert(t('common.error'), updErr.message);
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
                description: `${editingDeposit.name}`,
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
            Alert.alert(t('common.error'), t('analytics.dateStartBeforeEnd'));
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
                    expense_type: 'base',
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
                    expense_type: 'base',
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
            Alert.alert(t('common.error'), error.message);
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
                name: `${loanName}`,
            }).eq('id', editingLoan.recurringId);
        }

        closeLoanModal();
        fetchLoans(hid);
    }

    async function closeLoanAction(loan: LoanData) {
        if (!householdId) return;
        Alert.alert(t('analytics.closeLoan'), t('analytics.closeLoanMsg'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('common.close'), style: 'destructive', onPress: async () => {
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
                expense_type: 'base',
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
            note: `${loan.name}`,
            date: format(new Date(), 'yyyy-MM-dd'),
        });

        if (txErr) {
            console.error('Loan payment tx error:', txErr);
            Alert.alert(t('common.error'), txErr.message);
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
        Alert.alert(t('common.done'), t('analytics.paymentConfirmed', { amount: formatAmount(paymentAmount, loan.currency) }));
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
        mortgage: t('analytics.mortgage'), auto: t('analytics.carLoan'), consumer: t('analytics.consumer'), other: t('analytics.otherLoan'),
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
                saved: (g.current_amount as number) ?? 0,
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
                    return t('analytics.depositClosing', { name: d.name, date: format(d.endDate, 'd MMMM', { locale: ru }) });
                }
            }
        }

        // Priority 2: Extra category over limit — link to a goal
        const overExtras = extraCategories.filter(e => e.extra > 0);
        if (overExtras.length > 0) {
            const worst = overExtras.reduce((a, b) => b.extra > a.extra ? b : a);
            const goalRef = goalsState.length > 0 ? goalsState[0] : null;
            if (goalRef) {
                const goalPart = goalRef.target > 0 ? t('analytics.recOverspendGoalPct', { pct: Math.round(worst.extra / goalRef.target * 100) }) : t('analytics.recOverspendGoalPart');
                return t('analytics.recOverspend', { name: worst.name, amount: formatAmount(worst.extra, currency), goalPart, goalName: goalRef.name });
            }
            return t('analytics.recOverspendNoGoal', { name: worst.name, amount: formatAmount(worst.extra, currency) });
        }

        // Priority 3: Goal with deadline — calculate timeline
        for (const g of goalsState) {
            if (g.targetDate) {
                const deadline = new Date(g.targetDate);
                const monthsLeft = differenceInMonths(deadline, today);
                if (monthsLeft > 0 && monthsLeft <= 6) {
                    const remaining = Math.max(g.target - g.saved, 0);
                    const perMonth = Math.ceil(remaining / monthsLeft);
                    return t('analytics.recGoalDeadline', { name: g.name, months: monthsLeft, remaining: formatAmount(remaining, g.currency), perMonth: formatAmount(perMonth, g.currency) });
                }
                if (monthsLeft > 6) {
                    const pct = g.target > 0 ? Math.round(g.saved / g.target * 100) : 0;
                    return t('analytics.recGoalProgress', { name: g.name, pct, months: monthsLeft });
                }
            }
        }

        // Priority 4: Deposit with good rate
        const bestDep = deposits.reduce<DepositData | null>((best, d) => !best || d.currentRate > best.currentRate ? d : best, null);
        if (bestDep && bestDep.currentRate > 0) {
            const accrued = calcAccruedInterest(bestDep.amount, bestDep.ratePeriods, bestDep.capitalization, bestDep.startDate);
            if (accrued > 0) {
                return t('analytics.recDepositEarned', { name: bestDep.name, amount: formatAmount(accrued, bestDep.currency), rate: bestDep.currentRate });
            }
            return t('analytics.recDepositWorking', { name: bestDep.name, rate: bestDep.currentRate });
        }

        // Priority 5: General goals progress
        if (goalsState.length > 0) {
            const totalSaved = goalsState.reduce((s, g) => s + g.saved, 0);
            const totalTarget = goalsState.reduce((s, g) => s + g.target, 0);
            const pct = totalTarget > 0 ? Math.round(totalSaved / totalTarget * 100) : 0;
            return `${t('analytics.recGoalsOverall', { pct })} ${pct < 30 ? t('analytics.recGoalsLow') : pct < 70 ? t('analytics.recGoalsMid') : t('analytics.recGoalsHigh')}`;
        }

        return t('analytics.createFirstGoal');
    }

    useEffect(() => {
        if (tab !== 'savings') return;
        if (goalsState.length > 0 || deposits.length > 0 || extraCategories.length > 0) {
            setRecommendation(generateRecommendation());
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        setGoalInitialDeposit('');
        setGoalAccountId(accounts[0]?.id ?? '');
        setShowAddGoal(true);
    }

    // ── Create savings goal ─────────────────────────────────────────────────
    async function createGoal() {
        if (!householdId || !goalName.trim() || !goalTarget.trim() || !goalAccountId) return;
        const targetAmt = parseFloat(goalTarget.replace(',', '.'));
        if (isNaN(targetAmt) || targetAmt <= 0) return;

        const initialAmt = goalInitialDeposit.trim()
            ? parseFloat(goalInitialDeposit.replace(',', '.'))
            : 0;

        const targetDate = goalDateObj
            ? format(goalDateObj, 'yyyy-MM-dd')
            : null;

        setSavingGoal(true);
        const { data: goalData, error } = await supabase.from('savings_goals').insert({
            household_id: householdId,
            account_id:   goalAccountId,
            name:         goalName.trim(),
            icon:         goalIcon,
            color:        goalColor,
            target_amount: targetAmt,
            current_amount: initialAmt > 0 ? initialAmt : 0,
            currency:     goalCurrency,
            target_date:  targetDate,
            compounding:  'monthly',
            is_active:    true,
            is_archived:  false,
        }).select().single();
        if (error) { setSavingGoal(false); console.error('createGoal error:', error.message); return; }

        // If initial deposit > 0, deduct from the linked account and create a transfer transaction
        if (initialAmt > 0 && goalData) {
            const srcAcc = accounts.find(a => a.id === goalAccountId);
            if (srcAcc) {
                await supabase.from('accounts').update({ balance: srcAcc.balance - initialAmt }).eq('id', goalAccountId);
                setAccounts(prev => prev.map(a => a.id === goalAccountId ? { ...a, balance: a.balance - initialAmt } : a));
                const uid = (await supabase.auth.getUser()).data.user?.id;
                if (uid) {
                    await supabase.from('transactions').insert({
                        household_id: householdId,
                        account_id:   goalAccountId,
                        type:         'transfer',
                        amount:       initialAmt,
                        currency:     goalCurrency,
                        date:         format(new Date(), 'yyyy-MM-dd'),
                        description:  `${t('analytics.initialDeposit')} → ${goalName.trim()}`,
                        created_by:   uid,
                    });
                }
            }
        }

        setSavingGoal(false);
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
        setGoalInitialDeposit('');
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
        setShowDeleteGoal(false);
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

    function openDeleteGoal() {
        if (!selectedGoal) return;
        setDeleteTransferMode('account');
        setDeleteTransferAccountId(selectedGoal.accountId || accounts[0]?.id || '');
        const otherGoals = goalsState.filter(g => g.id !== selectedGoal.id);
        setDeleteTransferGoalId(otherGoals[0]?.id || '');
        setShowDeleteGoal(true);
        setTimeout(() => goalDetailScrollRef.current?.scrollToEnd({ animated: true }), 100);
    }

    async function confirmDeleteGoal() {
        if (!selectedGoal || !householdId) return;
        setDeletingGoal(true);

        const savedAmt = selectedGoal.saved || 0;
        const uid = (await supabase.auth.getUser()).data.user?.id;

        try {
            if (savedAmt > 0 && deleteTransferMode === 'account' && deleteTransferAccountId) {
                // Transfer funds back to account
                const targetAcc = accounts.find(a => a.id === deleteTransferAccountId);
                if (targetAcc) {
                    await supabase.from('accounts').update({ balance: targetAcc.balance + savedAmt }).eq('id', deleteTransferAccountId);
                    setAccounts(prev => prev.map(a => a.id === deleteTransferAccountId ? { ...a, balance: a.balance + savedAmt } : a));
                    if (uid) {
                        await supabase.from('transactions').insert({
                            household_id: householdId,
                            account_id: deleteTransferAccountId,
                            type: 'transfer',
                            amount: savedAmt,
                            currency: selectedGoal.currency,
                            date: format(new Date(), 'yyyy-MM-dd'),
                            description: `${selectedGoal.name}`,
                            created_by: uid,
                        });
                    }
                }
            } else if (savedAmt > 0 && deleteTransferMode === 'goal' && deleteTransferGoalId) {
                // Transfer funds to another goal
                const targetGoal = goalsState.find(g => g.id === deleteTransferGoalId);
                if (targetGoal) {
                    const newSaved = targetGoal.saved + savedAmt;
                    await supabase.from('savings_goals').update({ current_amount: newSaved }).eq('id', deleteTransferGoalId);
                }
            }
            // mode === 'none': just delete, no transfer

            // Soft delete the goal
            await supabase.from('savings_goals')
                .update({ is_archived: true, is_active: false })
                .eq('id', selectedGoal.id);

        } catch (e) {
            console.error('deleteGoal error:', e);
        }

        setDeletingGoal(false);
        setShowDeleteGoal(false);
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
                                description: `${t('analytics.topUpGoal')} «${selectedGoal.name}»`,
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
            Alert.alert(t('common.error'), e.message);
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
        day: t('analytics.todayPeriod'), week: t('analytics.thisWeek'), month: t('analytics.thisMonth'), quarter: t('analytics.thisQuarter'), year: t('analytics.thisYear'),
    };
    const TABS: { id: AnalyticsTab; label: string }[] = [
        { id: 'overview', label: t('analytics.overview') },
        { id: 'forecast', label: t('analytics.forecast') },
        { id: 'savings', label: t('analytics.savings') },
        { id: 'loans', label: t('analytics.loans') },
    ];

    // ── Render ──────────────────────────────────────────────────────────────
    return (
        <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
            {/* Header */}
            <View style={{ paddingTop: 60, paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={{ marginRight: 12 }}>
                    <ChevronLeft color="#fff" size={24} />
                </TouchableOpacity>
                <Text style={{ fontSize: 24, fontFamily: fonts.heading, color: colors.textPrimary, flex: 1 }}>{t('analytics.title')}</Text>
            </View>

            {/* Tab bar */}
            <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 16, marginBottom: 4 }}>
                {TABS.map(t => (
                    <TouchableOpacity key={t.id} onPress={() => setTab(t.id)} style={{
                        paddingHorizontal: 16, paddingVertical: 8, borderRadius: 30,
                        backgroundColor: tab === t.id ? '#7C6FFF' : 'transparent',
                    }}>
                        <Text style={{ fontSize: 13, fontFamily: fonts.bodySemiBold, color: tab === t.id ? '#ffffff' : colors.textMuted }}>
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
                                <Text style={{ fontSize: 14, fontFamily: fonts.bodySemiBold, color: colors.textPrimary }}>{t('analytics.summary')}</Text>
                                <PeriodPills value={summaryPeriod} onChange={setSummaryPeriod} />
                            </View>
                            {fetchingPeriods.has(summaryPeriod) && !summaryData ? <Spinner /> : summaryData ? (() => {
                                const inc = summaryData.income;
                                const exp = summaryData.expenses;
                                const tot = inc + exp || 1;
                                // Ensure min 8% visual for smaller segment so it's always visible
                                const rawIncFrac = inc / tot;
                                const rawExpFrac = exp / tot;
                                const MIN_FRAC = 0.08;
                                let incFrac = rawIncFrac, expFrac = rawExpFrac;
                                if (inc > 0 && exp > 0) {
                                    if (rawIncFrac < MIN_FRAC) { incFrac = MIN_FRAC; expFrac = 1 - MIN_FRAC; }
                                    if (rawExpFrac < MIN_FRAC) { expFrac = MIN_FRAC; incFrac = 1 - MIN_FRAC; }
                                }

                                const RING = 160;
                                const rcx = RING / 2, rcy = RING / 2, rr = 62, rsw = 16;
                                const rC = 2 * Math.PI * rr;
                                const hasTwo = inc > 0 && exp > 0;
                                const gap = hasTwo ? rsw + 4 : 0;
                                const avail = rC - (gap * (hasTwo ? 2 : 0));
                                const incLen = incFrac * avail;
                                const expLen = expFrac * avail;

                                const polXY = (deg: number) => {
                                    const rad = (deg - 90) * (Math.PI / 180);
                                    return { x: rcx + rr * Math.cos(rad), y: rcy + rr * Math.sin(rad) };
                                };

                                const incSweepDeg = (incLen / rC) * 360;
                                const gapDeg = (gap / rC) * 360;
                                const expStartDeg = incSweepDeg + gapDeg;
                                const expSweepDeg = (expLen / rC) * 360;

                                const makeArc = (startDeg: number, sweepDeg: number) => {
                                    const s = polXY(startDeg);
                                    const e = polXY(startDeg + sweepDeg);
                                    return `M ${s.x} ${s.y} A ${rr} ${rr} 0 ${sweepDeg > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
                                };

                                return (
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        {/* Donut — left */}
                                        <View style={{ width: RING, height: RING }}>
                                            <Svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`}>
                                                <Circle cx={rcx} cy={rcy} r={rr} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={rsw} />
                                                {inc > 0 && <Path d={makeArc(0, incSweepDeg)} fill="none" stroke="#4CAF50" strokeWidth={rsw} strokeLinecap="round" />}
                                                {exp > 0 && <Path d={makeArc(expStartDeg, expSweepDeg)} fill="none" stroke="#7B61FF" strokeWidth={rsw} strokeLinecap="round" />}
                                            </Svg>
                                            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                                                <Text style={{ fontSize: 14, fontFamily: fonts.bodySemiBold, color: colors.textPrimary }}>
                                                    {balance >= 0 ? '+' : '−'}{formatAmount(Math.abs(balance), currency)}
                                                </Text>
                                                <Text style={{ fontSize: 10, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 }}>
                                                    {t('analytics.balanceLabel')}
                                                </Text>
                                            </View>
                                        </View>

                                        {/* Legend — right side */}
                                        <View style={{ flex: 1, paddingLeft: 16, gap: 14 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#4CAF50' }} />
                                                <View>
                                                    <Text style={{ fontSize: 12, fontFamily: fonts.body, color: colors.textMuted }}>{t('analytics.income')}</Text>
                                                    <Text style={{ fontSize: 15, fontFamily: fonts.bodySemiBold, color: colors.textPrimary }}>{formatAmount(inc, currency)}</Text>
                                                </View>
                                            </View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#7B61FF' }} />
                                                <View>
                                                    <Text style={{ fontSize: 12, fontFamily: fonts.body, color: colors.textMuted }}>{t('analytics.expenses')}</Text>
                                                    <Text style={{ fontSize: 15, fontFamily: fonts.bodySemiBold, color: colors.textPrimary }}>{formatAmount(exp, currency)}</Text>
                                                </View>
                                            </View>
                                            <View style={{ marginLeft: 16 }}>
                                                <Text style={{ fontSize: 12, fontFamily: fonts.body, color: colors.textMuted }}>{t('analytics.netBalance')}</Text>
                                                <Text style={{ fontSize: 15, fontFamily: fonts.bodySemiBold, color: colors.textPrimary }}>
                                                    {balance >= 0 ? '+' : '−'}{formatAmount(Math.abs(balance), currency)}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>
                                );
                            })() : null}
                        </Card>

                        {/* Deposit interest block */}
                        {summaryData && summaryData.deposits.length > 0 && summaryData.depositInterest > 0 && (
                            <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/(app)/analytics?tab=savings')}>
                                <Card>
                                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 }}>
                                        {t('analytics.moneyWorked', { period: DEPOSIT_PERIOD_LABEL[summaryPeriod] })}
                                    </Text>
                                    <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 14 }}>
                                        {t('analytics.depositInterest')}
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
                                                <Text style={{ fontSize: 13, color: colors.textPrimary }}>{dep.name}</Text>
                                                <Text style={{ fontSize: 10, color: colors.textDisabled }}>{t('analytics.annualRate', { rate: dep.rate })}</Text>
                                            </View>
                                            <Text style={{ fontSize: 14, fontWeight: '700', color: '#4FFFB0' }}>
                                                +{formatAmount(dep.interest, dep.currency)}
                                            </Text>
                                        </View>
                                    ))}
                                </Card>
                            </TouchableOpacity>
                        )}

                        {/* Donut + Categories */}
                        <Card>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                                <Text style={{ fontSize: 14, fontFamily: fonts.bodySemiBold, color: colors.textPrimary }}>{t('analytics.expenses')}</Text>
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
                                            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>{t('analytics.expenseStructure')}</Text>
                                            <TouchableOpacity onPress={() => setCatExpanded(false)}>
                                                <Text style={{ fontSize: 12, color: '#7C6FFF', fontWeight: '600' }}>{t('analytics.collapse')}</Text>
                                            </TouchableOpacity>
                                        </View>
                                        {/* Full category list with progress bars */}
                                        {catData.categories.map((cat, i, arr) => (
                                            <TouchableOpacity key={cat.id} activeOpacity={0.7}
                                                onPress={() => openCategoryDetail(cat)}
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
                                                        <Text style={{ fontSize: 13, color: colors.textPrimary }}>{cat.name}</Text>
                                                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>{formatAmount(cat.amount, currency)}</Text>
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
                                    /* Collapsed: vertical donut + legend */
                                    <DonutChart
                                        categories={catData.categories}
                                        totalAmount={totalExp}
                                        currency={currency}
                                        active={activeCategory}
                                        onPress={setActiveCategory}
                                        onCategoryPress={(cat) => openCategoryDetail(cat)}
                                        visibleLegend={catData.categories.slice(0, COLLAPSED_COUNT)}
                                        hiddenCount={hiddenCount}
                                        onMorePress={hiddenCount > 0 ? () => setCatExpanded(true) : undefined}
                                        prevCategories={overviewByPeriod[catPeriod === 'day' ? 'day' : catPeriod === 'week' ? 'week' : catPeriod === 'year' ? 'year' : 'month']?.categories}
                                    />
                                );
                            })() : catData ? (
                                <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                                    <Text style={{ fontSize: 12, color: colors.textDisabled }}>{t('analytics.noExpenses')}</Text>
                                </View>
                            ) : null}
                        </Card>

                        {/* Extra categories */}
                        <Card>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <Text style={{ fontSize: 14, fontFamily: fonts.bodySemiBold, color: colors.textPrimary }}>{t('analytics.extraCategories')}</Text>
                                <TouchableOpacity onPress={async () => {
                                    // Init draft with all categories + load existing settings
                                    const draft: Record<string, { active: boolean; amount: string }> = {};
                                    allCategories.forEach(cat => {
                                        draft[`cat:${cat.id}`] = { active: false, amount: '' };
                                        cat.tags.forEach(tag => {
                                            draft[`tag:${tag.id}`] = { active: false, amount: '' };
                                        });
                                    });
                                    // Load existing active extras
                                    if (householdId) {
                                        const { data: existing } = await supabase
                                            .from('category_extras')
                                            .select('category_id, tag_id, comfortable_amount')
                                            .eq('household_id', householdId)
                                            .eq('is_active', true);
                                        (existing ?? []).forEach((e: any) => {
                                            const key = e.tag_id ? `tag:${e.tag_id}` : `cat:${e.category_id}`;
                                            if (draft[key]) {
                                                draft[key] = { active: true, amount: String(e.comfortable_amount) };
                                            }
                                        });
                                    }
                                    setExtraDraft(draft);
                                    setShowExtrasModal(true);
                                }}>
                                    <Text style={{ fontSize: 12, fontFamily: fonts.bodySemiBold, color: '#7C6FFF' }}>{t('analytics.configure')}</Text>
                                </TouchableOpacity>
                            </View>

                            {extraCategories.length > 0 ? (
                                <>
                                    {extraCategories.map(ec => {
                                        const ratio = ec.scaledComfortable > 0 ? Math.min(ec.spent / ec.scaledComfortable, 1.5) : 0;
                                        const barPct = Math.min(ratio * 100, 100);
                                        const isOver = ec.spent > ec.scaledComfortable;
                                        return (
                                            <View key={ec.categoryId} style={{ marginBottom: 14 }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: ec.color + '22', alignItems: 'center', justifyContent: 'center' }}>
                                                        <CategoryIcon iconName={ec.icon} color={ec.color} size={16} />
                                                    </View>
                                                    <Text style={{ fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.textPrimary, flex: 1 }}>{ec.name}</Text>
                                                    <Text style={{ fontSize: 12, fontFamily: fonts.body, color: colors.textSecondary }}>
                                                        {formatAmount(ec.spent, currency)}
                                                        <Text style={{ color: colors.textDisabled }}> / {formatAmount(ec.scaledComfortable, currency)}</Text>
                                                    </Text>
                                                </View>
                                                <View style={{ height: 5, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
                                                    <View style={{ height: 5, width: `${barPct}%`, backgroundColor: isOver ? '#FF6B6B' : ec.color, borderRadius: 3 }} />
                                                </View>
                                                {ec.extra > 0 && (
                                                    <Text style={{ fontSize: 11, fontFamily: fonts.body, color: '#FF6B6B', marginTop: 3 }}>
                                                        {t('analytics.extraAmount', { amount: formatAmount(ec.extra, currency) })}
                                                    </Text>
                                                )}
                                            </View>
                                        );
                                    })}
                                    {(() => {
                                        const totalExtra = extraCategories.reduce((s, e) => s + e.extra, 0);
                                        if (totalExtra <= 0) return null;
                                        return (
                                            <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', paddingTop: 10, marginTop: 4 }}>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                    <Text style={{ fontSize: 13, fontFamily: fonts.body, color: colors.textMuted }}>{t('analytics.total')}:</Text>
                                                    <Text style={{ fontSize: 14, fontFamily: fonts.bodyBold, color: '#FF6B6B' }}>{formatAmount(totalExtra, currency)}</Text>
                                                </View>
                                            </View>
                                        );
                                    })()}
                                </>
                            ) : (
                                <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                                    <Text style={{ fontSize: 12, fontFamily: fonts.body, color: colors.textDisabled, textAlign: 'center' }}>
                                        {t('analytics.configureHint')}
                                    </Text>
                                </View>
                            )}
                        </Card>
                    </>
                )}

                {/* ══ FORECAST ══════════════════════════════════════════════ */}
                {tab === 'forecast' && (() => {
                    const FORECAST_PILLS: { id: ForecastPeriod; label: string }[] = [
                        { id: 'month', label: t('analytics.forecastMonth') },
                        { id: 'quarter', label: t('analytics.forecastQuarter') },
                        { id: 'half', label: t('analytics.forecastHalf') },
                        { id: 'year', label: t('analytics.forecastYear') },
                        { id: 'custom', label: t('analytics.forecastCustom') },
                    ];
                    const FORECAST_TITLES: Record<ForecastPeriod, string> = {
                        month: t('analytics.forecastEndOfMonth'),
                        quarter: t('analytics.forecastFor3Months'),
                        half: `${t('analytics.forecast').toUpperCase()} · ${t('analytics.forecastHalf')}`,
                        year: `${t('analytics.forecast').toUpperCase()} · ${t('analytics.forecastYear')}`,
                        custom: `${t('analytics.forecast').toUpperCase()} · ${t('analytics.forecastCustom')}`,
                    };

                    function formatRemaining(days: number): string {
                        if (days <= 0) return `0 ${t('analytics.dayShort')}`;
                        const m = Math.floor(days / 30);
                        const d = days % 30;
                        if (m >= 1) return `${m} ${t('analytics.monthShort')}${d > 0 ? ` ${d} ${t('analytics.dayShort')}` : ''}`;
                        return `${days} ${t('analytics.dayShort')}`;
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
                                        <Text style={{ fontSize: 11, fontWeight: '600', color: forecastPeriod === p.id ? '#7C6FFF' : colors.textDisabled }}>
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
                                            <Text style={{ fontSize: 9, color: colors.textMuted, marginBottom: 4, textTransform: 'uppercase' }}>{t('analytics.from')}</Text>
                                            <Text style={{ fontSize: 13, color: colors.textPrimary, fontWeight: '600' }}>{format(customFrom, 'dd.MM.yyyy')}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => { setShowCustomTo(f => !f); setShowCustomFrom(false); }}
                                            style={{ flex: 1, backgroundColor: showCustomTo ? 'rgba(124,111,255,0.15)' : 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 12, borderWidth: showCustomTo ? 1 : 0, borderColor: 'rgba(124,111,255,0.3)' }}>
                                            <Text style={{ fontSize: 9, color: colors.textMuted, marginBottom: 4, textTransform: 'uppercase' }}>{t('analytics.to')}</Text>
                                            <Text style={{ fontSize: 13, color: colors.textPrimary, fontWeight: '600' }}>{format(customTo, 'dd.MM.yyyy')}</Text>
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

                            {/* ══ PAYMENT CALENDAR ═════════════════════ */}
                            {(() => {
                                function buildWeeks(month: Date): (Date | null)[][] {
                                    const mStart = startOfMonth(month);
                                    const mEnd = endOfMonth(month);
                                    const days = eachDayOfInterval({ start: mStart, end: mEnd });
                                    const startPad = (getDay(mStart) + 6) % 7;
                                    const padded: (Date | null)[] = [...Array(startPad).fill(null), ...days];
                                    const weeks: (Date | null)[][] = [];
                                    for (let i = 0; i < padded.length; i += 7) {
                                        const week = padded.slice(i, i + 7);
                                        while (week.length < 7) week.push(null);
                                        weeks.push(week);
                                    }
                                    return weeks;
                                }
                                const weeks = buildWeeks(calendarMonth);
                                const dayHeaders = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

                                return (
                                    <View style={{ backgroundColor: colors.bgSecondary, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
                                        {/* Month nav */}
                                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                            <TouchableOpacity onPress={() => setCalendarMonth(subMonths(calendarMonth, 1))} style={{ padding: 4 }}>
                                                <ChevronLeft color={colors.textMuted} size={20} />
                                            </TouchableOpacity>
                                            <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '600', textTransform: 'capitalize' }}>
                                                {format(calendarMonth, 'LLLL yyyy', { locale: ru })}
                                            </Text>
                                            <TouchableOpacity onPress={() => setCalendarMonth(addMonths(calendarMonth, 1))} style={{ padding: 4 }}>
                                                <ChevronRight color={colors.textMuted} size={20} />
                                            </TouchableOpacity>
                                        </View>

                                        {/* Day headers */}
                                        <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                                            {dayHeaders.map(d => (
                                                <Text key={d} style={{ flex: 1, textAlign: 'center', color: colors.textMuted, fontSize: 12, fontWeight: '600' }}>{d}</Text>
                                            ))}
                                        </View>

                                        {/* Calendar grid */}
                                        {weeks.map((week, wi) => (
                                            <View key={wi} style={{ flexDirection: 'row', marginBottom: 4 }}>
                                                {week.map((day, di) => {
                                                    if (!day) return <View key={di} style={{ flex: 1 }} />;
                                                    const dateStr = format(day, 'yyyy-MM-dd');
                                                    const payments = calendarPayments[dateStr] ?? [];
                                                    const hasPayments = payments.length > 0;
                                                    const today = isTodayFn(day);
                                                    const isSelected = selectedCalendarDate === dateStr;

                                                    return (
                                                        <TouchableOpacity key={di} style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}
                                                            onPress={() => setSelectedCalendarDate(isSelected ? null : dateStr)}>
                                                            <View style={{
                                                                width: 32, height: 32, borderRadius: 16,
                                                                alignItems: 'center', justifyContent: 'center',
                                                                backgroundColor: isSelected ? '#7C6FFF' : today ? colors.bgTertiary : 'transparent',
                                                                borderWidth: hasPayments ? 2 : 0,
                                                                borderColor: payments.some(p => p.type === 'loan') ? '#ef4444' : '#7C6FFF',
                                                            }}>
                                                                <Text style={{
                                                                    color: isSelected ? '#fff' : today ? '#7C6FFF' : colors.textPrimary,
                                                                    fontSize: 14, fontWeight: hasPayments ? '700' : '400',
                                                                }}>{format(day, 'd')}</Text>
                                                            </View>
                                                            {hasPayments && (
                                                                <View style={{ width: 4, height: 4, borderRadius: 2,
                                                                    backgroundColor: payments.some(p => p.type === 'loan') ? '#ef4444' : '#7C6FFF', marginTop: 2 }} />
                                                            )}
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>
                                        ))}

                                        {/* Legend */}
                                        <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#7C6FFF' }} />
                                                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{t('analytics.recurringPayment')}</Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' }} />
                                                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{t('analytics.loanPayment')}</Text>
                                            </View>
                                        </View>
                                    </View>
                                );
                            })()}

                            {/* Selected date payments */}
                            {selectedCalendarDate && (calendarPayments[selectedCalendarDate] ?? []).length > 0 && (
                                <View style={{ backgroundColor: colors.bgSecondary, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
                                    <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '700', marginBottom: 12 }}>
                                        {format(new Date(selectedCalendarDate + 'T00:00:00'), 'd MMMM yyyy', { locale: ru })}
                                    </Text>
                                    {(calendarPayments[selectedCalendarDate] ?? []).map(payment => (
                                        <View key={payment.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                                            <Text style={{ fontSize: 20, marginRight: 12 }}>{payment.type === 'loan' ? '🏦' : '🔁'}</Text>
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '500' }}>{payment.name}</Text>
                                                <Text style={{ color: colors.textMuted, fontSize: 13 }}>{formatAmount(payment.amount, payment.currency)}</Text>
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            )}

                            {loadingForecast ? <Spinner /> : !forecastData ? null : (
                                <>
                                    {/* Forecast summary — two parts */}
                                    <Card>
                                        <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                            {FORECAST_TITLES[forecastPeriod]}
                                        </Text>

                                        {forecastData.insufficientData && (
                                            <View style={{ backgroundColor: 'rgba(255,184,79,0.1)', borderRadius: 10, padding: 10, marginBottom: 12 }}>
                                                <Text style={{ fontSize: 12, color: '#FFB84F' }}>
                                                    {t('analytics.insufficientData')}
                                                </Text>
                                            </View>
                                        )}

                                        {/* PART 1 — Projected daily spending */}
                                        {!forecastData.insufficientData && (
                                            <View style={{ marginBottom: 12 }}>
                                                <Text style={{ fontSize: 10, color: colors.textMuted, marginBottom: 4, textTransform: 'uppercase' }}>
                                                    {t('analytics.forecastExpenses', { days: forecastData.daysLeft })}
                                                </Text>
                                                <Text style={{ fontSize: 24, fontWeight: '800', color: '#FFB84F' }}>
                                                    {formatAmount(forecastData.projectedDaily, currency)}
                                                </Text>
                                            </View>
                                        )}

                                        {/* PART 2 — Upcoming scheduled payments */}
                                        {forecastData.upcomingRecurring.length > 0 && (
                                            <View style={{ marginBottom: 12 }}>
                                                <Text style={{ fontSize: 10, color: colors.textMuted, marginBottom: 8, textTransform: 'uppercase' }}>
                                                    {t('analytics.scheduledPayments')}
                                                </Text>
                                                {forecastData.upcomingRecurring.map((r, i) => (
                                                    <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: i < forecastData.upcomingRecurring.length - 1 ? 1 : 0, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                                                        <Text style={{ fontSize: 14, color: colors.textPrimary }}>{r.name}</Text>
                                                        <Text style={{ fontSize: 14, color: colors.textSecondary, fontWeight: '600' }}>
                                                            {formatAmount(r.amount, currency)}
                                                        </Text>
                                                    </View>
                                                ))}
                                            </View>
                                        )}

                                        {/* Total separator */}
                                        <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 12 }} />

                                        {/* TOTAL */}
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                            <Text style={{ fontSize: 13, color: colors.textMuted, fontWeight: '600' }}>{t('analytics.total')}</Text>
                                            <Text style={{ fontSize: 22, fontWeight: '800', color: '#FFB84F' }}>
                                                {formatAmount(forecastData.projectedDaily + forecastData.recurringTotal, currency)}
                                            </Text>
                                        </View>

                                        <View style={{ flexDirection: 'row', gap: 10 }}>
                                            <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 10 }}>
                                                <Text style={{ fontSize: 9, color: colors.textMuted, marginBottom: 4, textTransform: 'uppercase' }}>{t('analytics.remaining')}</Text>
                                                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>{formatRemaining(forecastData.daysLeft)}</Text>
                                            </View>
                                            <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 10 }}>
                                                <Text style={{ fontSize: 9, color: colors.textMuted, marginBottom: 4, textTransform: 'uppercase' }}>{t('analytics.alreadySpent')}</Text>
                                                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>{formatAmount(forecastData.factSpend, currency)}</Text>
                                            </View>
                                        </View>
                                    </Card>

                                    {/* Fact vs Forecast chart */}
                                    {forecastData.chart.length > 0 && (
                                        <Card>
                                            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 }}>{t('analytics.factVsForecast')}</Text>
                                            <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 14 }}>{forecastData.chartSubtitle}</Text>
                                            <ForecastLineChart data={forecastData.chart} selectedIndex={chartSelectedIdx} onSelect={handleChartSelect} currency={currency} />
                                            <View style={{ flexDirection: 'row', gap: 14, marginTop: 8 }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#7C6FFF' }} />
                                                    <Text style={{ fontSize: 10, color: colors.textMuted }}>{t('analytics.fact')}</Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                    <View style={{ width: 16, height: 0, borderTopWidth: 2, borderColor: 'rgba(124,111,255,0.5)', borderStyle: 'dashed' }} />
                                                    <Text style={{ fontSize: 10, color: colors.textMuted }}>{t('analytics.forecastLabel')}</Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#E24B4A' }} />
                                                    <Text style={{ fontSize: 10, color: colors.textMuted }}>{t('analytics.payment')}</Text>
                                                </View>
                                            </View>

                                            {/* Inline day detail */}
                                            {chartSelectedIdx !== null && (
                                                <View style={{ marginTop: 14 }}>
                                                    {/* Date header with lines */}
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                                        <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                                                        <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '600' }}>
                                                            {dayDetailDate ? format(new Date(dayDetailDate), 'd MMMM yyyy', { locale: ru }) : ''}
                                                            {!dayDetailIsFact ? ` ${t('analytics.forecastSuffix')}` : ''}
                                                        </Text>
                                                        <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                                                    </View>

                                                    {dayDetailLoading ? (
                                                        <ActivityIndicator color="#7C6FFF" style={{ marginVertical: 12 }} />
                                                    ) : dayDetailItems.length === 0 ? (
                                                        <Text style={{ color: colors.textMuted, textAlign: 'center', marginVertical: 8, fontSize: 12 }}>{t('common.noData')}</Text>
                                                    ) : (
                                                        <>
                                                            {dayDetailItems.map((item, idx) => (
                                                                <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: idx < dayDetailItems.length - 1 ? 1 : 0, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                                                        {item.icon.length <= 2 ? (
                                                                            <Text style={{ fontSize: 16 }}>{item.icon}</Text>
                                                                        ) : (
                                                                            <CategoryIcon iconName={item.icon} color={item.color} size={16} />
                                                                        )}
                                                                        <Text style={{ fontSize: 12, color: item.isScheduled && dayDetailIsFact ? '#E24B4A' : '#fff', flex: 1 }} numberOfLines={1}>
                                                                            {item.name}{item.isScheduled ? (dayDetailIsFact ? ` ${t('analytics.unpaid')}` : ` ${t('analytics.scheduled')}`) : ''}
                                                                        </Text>
                                                                    </View>
                                                                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#FF6B6B' }}>−{formatAmount(item.amount, currency)}</Text>
                                                                </View>
                                                            ))}

                                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' }}>
                                                                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textMuted }}>
                                                                    {dayDetailIsFact ? t('analytics.totalForDay') : t('analytics.forecastForDay')}
                                                                </Text>
                                                                <Text style={{ fontSize: 13, fontWeight: '700', color: '#FF6B6B' }}>−{formatAmount(dayDetailTotal, currency)}</Text>
                                                            </View>
                                                        </>
                                                    )}
                                                </View>
                                            )}
                                        </Card>
                                    )}

                                    {/* Budget by category */}
                                    {forecastData.budgets.length > 0 && (
                                        <Card>
                                            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 }}>{t('analytics.budgetByCategory')}</Text>
                                            {forecastData.budgets.map((item, i) => <BudgetBar key={i} item={item} currency={currency} />)}
                                        </Card>
                                    )}

                                    {/* ── Block 3: Extra Categories ────────────────── */}
                                    <Card>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>{t('analytics.extraCategories')}</Text>
                                            <TouchableOpacity onPress={() => router.push({ pathname: '/settings', params: { openExtras: '1' } } as any)}>
                                                <Text style={{ fontSize: 12, color: '#7C6FFF' }}>{t('analytics.configure')}</Text>
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
                                                                            if (next.has(k)) { next.delete(k); } else { next.add(k); }
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
                                                                    <Text style={{ fontSize: 13, color: colors.textPrimary, fontWeight: '600' }}>{ec.name}</Text>
                                                                </View>
                                                                {hasMultipleTags && (
                                                                    <Text style={{ fontSize: 10, color: colors.textDisabled }}>{isExpanded ? '▼' : '▶'}</Text>
                                                                )}
                                                            </TouchableOpacity>
                                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                                                <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                                                                    {formatAmount(ec.spent, currency)}
                                                                    <Text style={{ color: colors.textDisabled }}>
                                                                        {t('analytics.comfortableAmount', { amount: formatAmount(ec.scaledComfortable, currency) })}
                                                                    </Text>
                                                                </Text>
                                                                {periodLabel ? (
                                                                    <Text style={{ fontSize: 10, color: colors.textDisabled }}>({periodLabel})</Text>
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
                                                                    {t('analytics.extraAmount', { amount: formatAmount(ec.extra, currency) })}
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
                                                                                    <Text style={{ fontSize: 11, color: colors.textMuted }}>
                                                                                        └ {tag.tagName}
                                                                                    </Text>
                                                                                    <Text style={{ fontSize: 11, color: colors.textMuted }}>
                                                                                        {formatAmount(tag.spent, currency)} / {formatAmount(tag.scaledComfortable, currency)}
                                                                                    </Text>
                                                                                </View>
                                                                                <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                                                                                    <View style={{ height: 4, width: `${tBarPct}%`, backgroundColor: tOver ? '#FF6B6B' : ec.color, borderRadius: 2, opacity: 0.7 }} />
                                                                                </View>
                                                                                {tag.extra > 0 && (
                                                                                    <Text style={{ fontSize: 10, color: '#FF6B6B', marginTop: 1 }}>{t('analytics.extraAmount', { amount: formatAmount(tag.extra, currency) })}</Text>
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
                                                                <Text style={{ fontSize: 13, color: colors.textMuted }}>{t('analytics.total')}:</Text>
                                                                <Text style={{ fontSize: 14, fontWeight: '700', color: '#FF6B6B' }}>{formatAmount(totalExtra, currency)}</Text>
                                                            </View>
                                                        </View>
                                                    );
                                                })()}
                                            </>
                                        ) : (
                                            <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                                                <Text style={{ fontSize: 12, color: colors.textDisabled, textAlign: 'center' }}>
                                                    {t('analytics.configureHint')}
                                                </Text>
                                            </View>
                                        )}
                                    </Card>

                                    {/* ── Block 4: Forecast Insight ─────────────────── */}
                                    {hintsEnabled && forecastData && (
                                        <Card style={{ backgroundColor: 'rgba(124,111,255,0.08)', borderWidth: 1, borderColor: 'rgba(124,111,255,0.2)' }}>
                                            <Text style={{ fontSize: 13, color: colors.textPrimary, fontWeight: '600', marginBottom: 6 }}>
                                                {t('analytics.hintForecast')}
                                            </Text>
                                            <Text style={{ fontSize: 12, color: colors.textMuted, lineHeight: 20 }}>
                                                {t('analytics.spentForNDays', { days: forecastData.daysPassed, daysWord: forecastData.daysPassed === 1 ? t('analytics.day_one') : forecastData.daysPassed < 5 ? t('analytics.day_few') : t('analytics.day_many'), amount: formatAmount(forecastData.factSpend, currency) })}
                                                {forecastData.upcomingRecurring.length > 0 ? (
                                                    t('analytics.withUpcoming', { payments: forecastData.upcomingRecurring
                                                        .sort((a, b) => b.amount - a.amount)
                                                        .slice(0, 3)
                                                        .map(r => `${r.name} ${formatAmount(r.amount, currency)}`)
                                                        .join(', '), more: forecastData.upcomingRecurring.length > 3 ? t('analytics.andMore', { n: forecastData.upcomingRecurring.length - 3 }) : '' })
                                                ) : ''}
                                                {t('analytics.forecastEndPeriod', { amount: formatAmount(forecastData.projectedTotal, currency) })}
                                            </Text>
                                        </Card>
                                    )}

                                    {/* ── Insight: extra savings acceleration ──────── */}
                                    {hintsEnabled && (() => {
                                        const totalExtra = extraCategories.reduce((s, e) => s + e.extra, 0);
                                        if (totalExtra <= 0) return null;
                                        const periodName = forecastPeriod === 'month' ? t('analytics.periodNameMonth') : forecastPeriod === 'quarter' ? t('analytics.periodNameQuarter') : forecastPeriod === 'half' ? t('analytics.periodNameHalf') : forecastPeriod === 'year' ? t('analytics.periodNameYear') : t('analytics.periodNameCustom');
                                        // Find nearest unclosed savings goal
                                        const openGoal = goalsState.find(g => g.saved < g.target);
                                        let accelText = '';
                                        if (openGoal) {
                                            // Estimate monthly contribution: saved / months since creation (rough)
                                            const monthlyContrib = openGoal.saved > 0 ? openGoal.saved / Math.max(1, 3) : totalExtra; // fallback
                                            const weeksAccel = monthlyContrib > 0 ? Math.round((totalExtra / monthlyContrib) * 4.3) : 0;
                                            if (weeksAccel > 0) {
                                                accelText = t('analytics.accelGoal', { name: openGoal.name, weeks: weeksAccel });
                                            }
                                        }
                                        return (
                                            <Card style={{ backgroundColor: 'rgba(124,111,255,0.08)', borderWidth: 1, borderColor: 'rgba(124,111,255,0.2)' }}>
                                                <Text style={{ fontSize: 13, color: colors.textPrimary, fontWeight: '600', marginBottom: 6 }}>
                                                    {t('analytics.hintExtra', { period: periodName, amount: formatAmount(totalExtra, currency) })}
                                                </Text>
                                                <Text style={{ fontSize: 12, color: colors.textMuted, lineHeight: 18 }}>
                                                    {t('analytics.hintExtraDesc', { amount: formatAmount(totalExtra, currency) })}
                                                    {accelText ? ` — ${accelText}` : ''}
                                                </Text>
                                            </Card>
                                        );
                                    })()}

                                    {/* ── What If Simulator ──────────────────── */}
                                    <Card>
                                        <TouchableOpacity
                                            onPress={() => setShowWhatIf(!showWhatIf)}
                                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                <Text style={{ fontSize: 18 }}>🔮</Text>
                                                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>Что если?</Text>
                                            </View>
                                            <ChevronDown
                                                color={colors.textMuted}
                                                size={18}
                                                style={{ transform: [{ rotate: showWhatIf ? '180deg' : '0deg' }] } as any}
                                            />
                                        </TouchableOpacity>

                                        {showWhatIf && (() => {
                                            const whatIfResult = computeWhatIf();
                                            const wiCategories = extraCategories.length > 0
                                                ? extraCategories.slice(0, 5)
                                                : (catData?.categories ?? []).slice(0, 5).map(c => ({
                                                    categoryId: c.id,
                                                    name: c.name,
                                                    icon: c.icon ?? '',
                                                    color: c.color ?? colors.textMuted,
                                                    spent: c.amount,
                                                }));

                                            return (
                                                <View style={{ marginTop: 16 }}>
                                                    {/* Period selector */}
                                                    <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>Период прогноза</Text>
                                                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                                                        {([1, 3, 6, 12] as WhatIfPeriod[]).map(p => (
                                                            <TouchableOpacity
                                                                key={p}
                                                                onPress={() => setWhatIfPeriod(p)}
                                                                style={{
                                                                    flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
                                                                    backgroundColor: whatIfPeriod === p ? 'rgba(124,111,255,0.25)' : 'rgba(255,255,255,0.05)',
                                                                    borderWidth: 1.5,
                                                                    borderColor: whatIfPeriod === p ? 'rgba(124,111,255,0.4)' : 'rgba(255,255,255,0.08)',
                                                                }}
                                                            >
                                                                <Text style={{ fontSize: 12, fontWeight: '600', color: whatIfPeriod === p ? '#7C6FFF' : colors.textDisabled }}>
                                                                    {p === 12 ? '1 год' : `${p} мес`}
                                                                </Text>
                                                            </TouchableOpacity>
                                                        ))}
                                                    </View>

                                                    {/* Income override */}
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                                            <Text style={{ fontSize: 16 }}>💰</Text>
                                                            <View style={{ flex: 1 }}>
                                                                <Text style={{ fontSize: 13, fontFamily: fonts.body, color: colors.textPrimary }}>Доход</Text>
                                                                <Text style={{ fontSize: 11, fontFamily: fonts.body, color: colors.textDisabled }}>
                                                                    {formatAmount((overviewByPeriod['month'] ?? overviewByPeriod[summaryPeriod])?.income ?? 0, currency)}/мес
                                                                </Text>
                                                            </View>
                                                        </View>
                                                        {whatIfScenario.incomeOverride !== null ? (
                                                            <TextInput
                                                                style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, color: colors.textPrimary, fontSize: 13, fontFamily: fonts.body, width: 90, textAlign: 'right' }}
                                                                keyboardType="decimal-pad" autoFocus
                                                                value={String(whatIfScenario.incomeOverride)}
                                                                onChangeText={v => {
                                                                    const num = parseFloat(v.replace(/[^0-9.,]/g, '').replace(',', '.'));
                                                                    setWhatIfScenario(s => ({ ...s, incomeOverride: v === '' ? null : (isNaN(num) ? s.incomeOverride : num) }));
                                                                }}
                                                            />
                                                        ) : (
                                                            <Switch value={false} onValueChange={() => setWhatIfScenario(s => ({ ...s, incomeOverride: (overviewByPeriod['month'] ?? overviewByPeriod[summaryPeriod])?.income ?? 0 }))}
                                                                trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(124,111,255,0.4)' }} thumbColor="#555" />
                                                        )}
                                                    </View>

                                                    {/* Extra credit payment */}
                                                    {loans.length > 0 && (
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                                                <Text style={{ fontSize: 16 }}>💳</Text>
                                                                <View style={{ flex: 1 }}>
                                                                    <Text style={{ fontSize: 13, fontFamily: fonts.body, color: colors.textPrimary }}>Доплата по кредиту</Text>
                                                                    <Text style={{ fontSize: 11, fontFamily: fonts.body, color: colors.textDisabled }}>
                                                                        Платёж: {formatAmount(loans.reduce((s, l) => s + ((l as any).monthly_payment ?? 0), 0), currency)}/мес
                                                                    </Text>
                                                                </View>
                                                            </View>
                                                            {whatIfScenario.creditOverride !== null ? (
                                                                <TextInput
                                                                    style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, color: colors.textPrimary, fontSize: 13, fontFamily: fonts.body, width: 90, textAlign: 'right' }}
                                                                    keyboardType="decimal-pad" autoFocus
                                                                    value={String(whatIfScenario.creditOverride)}
                                                                    onChangeText={v => {
                                                                        const num = parseFloat(v.replace(/[^0-9.,]/g, '').replace(',', '.'));
                                                                        setWhatIfScenario(s => ({ ...s, creditOverride: v === '' ? null : (isNaN(num) ? s.creditOverride : num) }));
                                                                    }}
                                                                />
                                                            ) : (
                                                                <Switch value={false} onValueChange={() => setWhatIfScenario(s => ({ ...s, creditOverride: 0 }))}
                                                                    trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(124,111,255,0.4)' }} thumbColor="#555" />
                                                            )}
                                                        </View>
                                                    )}

                                                    {/* Subscription savings */}
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                                            <Text style={{ fontSize: 16 }}>📱</Text>
                                                            <View style={{ flex: 1 }}>
                                                                <Text style={{ fontSize: 13, fontFamily: fonts.body, color: colors.textPrimary }}>Подписки</Text>
                                                                <Text style={{ fontSize: 11, fontFamily: fonts.body, color: colors.textDisabled }}>Сколько сэкономить</Text>
                                                            </View>
                                                        </View>
                                                        {whatIfScenario.subscriptionSavings > 0 ? (
                                                            <TextInput
                                                                style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, color: colors.textPrimary, fontSize: 13, fontFamily: fonts.body, width: 90, textAlign: 'right' }}
                                                                keyboardType="decimal-pad" autoFocus
                                                                value={String(whatIfScenario.subscriptionSavings)}
                                                                onChangeText={v => {
                                                                    const num = parseFloat(v.replace(/[^0-9.,]/g, '').replace(',', '.'));
                                                                    setWhatIfScenario(s => ({ ...s, subscriptionSavings: isNaN(num) ? 0 : num }));
                                                                }}
                                                            />
                                                        ) : (
                                                            <Switch value={false} onValueChange={() => setWhatIfScenario(s => ({ ...s, subscriptionSavings: 1 }))}
                                                                trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(124,111,255,0.4)' }} thumbColor="#555" />
                                                        )}
                                                    </View>

                                                    {/* Top 5 categories */}
                                                    {wiCategories.length > 0 && wiCategories.map(cat => (
                                                        <View key={cat.categoryId} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                                                <CategoryIcon iconName={cat.icon} color={cat.color ?? colors.textMuted} size={16} />
                                                                <View style={{ flex: 1 }}>
                                                                    <Text style={{ fontSize: 13, fontFamily: fonts.body, color: colors.textPrimary }} numberOfLines={1}>{cat.name}</Text>
                                                                    <Text style={{ fontSize: 11, fontFamily: fonts.body, color: colors.textDisabled }}>{formatAmount(cat.spent, currency)}/мес</Text>
                                                                </View>
                                                            </View>
                                                            {whatIfScenario.categoryOverrides[cat.categoryId] !== undefined ? (
                                                                <TextInput
                                                                    style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, color: colors.textPrimary, fontSize: 13, fontFamily: fonts.body, width: 90, textAlign: 'right' }}
                                                                    keyboardType="decimal-pad" autoFocus
                                                                    value={String(whatIfScenario.categoryOverrides[cat.categoryId])}
                                                                    onChangeText={v => {
                                                                        const num = parseFloat(v.replace(/[^0-9.,]/g, '').replace(',', '.'));
                                                                        setWhatIfScenario(s => ({
                                                                            ...s,
                                                                            categoryOverrides: {
                                                                                ...s.categoryOverrides,
                                                                                [cat.categoryId]: v === '' ? undefined as any : (isNaN(num) ? (s.categoryOverrides[cat.categoryId] ?? cat.spent) : num),
                                                                            },
                                                                        }));
                                                                    }}
                                                                />
                                                            ) : (
                                                                <Switch value={false} onValueChange={() => setWhatIfScenario(s => ({
                                                                    ...s, categoryOverrides: { ...s.categoryOverrides, [cat.categoryId]: Math.round(cat.spent) },
                                                                }))}
                                                                    trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(124,111,255,0.4)' }} thumbColor="#555" />
                                                            )}
                                                        </View>
                                                    ))}

                                                    {/* Reset button */}
                                                    <TouchableOpacity
                                                        onPress={() => {
                                                            setWhatIfScenario({ categoryOverrides: {}, incomeOverride: null, creditOverride: null, subscriptionSavings: 0 });
                                                            setWhatIfPeriod(3);
                                                        }}
                                                        style={{
                                                            alignSelf: 'flex-end', paddingHorizontal: 14, paddingVertical: 8,
                                                            borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', marginTop: 4, marginBottom: 16,
                                                        }}
                                                    >
                                                        <Text style={{ fontSize: 12, color: colors.textMuted, fontWeight: '600' }}>Сбросить</Text>
                                                    </TouchableOpacity>

                                                    {/* Results */}
                                                    <View style={{
                                                        backgroundColor: whatIfResult.totalSavings >= 0 ? 'rgba(79,255,176,0.06)' : 'rgba(255,107,107,0.06)',
                                                        borderRadius: 14, padding: 14,
                                                        borderWidth: 1,
                                                        borderColor: whatIfResult.totalSavings >= 0 ? 'rgba(79,255,176,0.15)' : 'rgba(255,107,107,0.15)',
                                                    }}>
                                                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: 10 }}>Результат</Text>
                                                        {[
                                                            {
                                                                label: 'Экономия / мес',
                                                                value: (whatIfResult.monthlySavings >= 0 ? '+' : '') + formatAmount(whatIfResult.monthlySavings, currency),
                                                                color: whatIfResult.monthlySavings >= 0 ? '#22c55e' : '#ef4444',
                                                            },
                                                            {
                                                                label: `Итого за ${whatIfPeriod === 12 ? '1 год' : whatIfPeriod + ' мес'}`,
                                                                value: (whatIfResult.totalSavings >= 0 ? '+' : '') + formatAmount(whatIfResult.totalSavings, currency),
                                                                color: whatIfResult.totalSavings >= 0 ? '#22c55e' : '#ef4444',
                                                            },
                                                            ...(whatIfResult.monthsEarlier > 0 ? [{
                                                                label: 'Кредит закроете раньше на',
                                                                value: `${whatIfResult.monthsEarlier} мес`,
                                                                color: '#4FFFB0',
                                                            }] : []),
                                                        ].map((row, i) => (
                                                            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.06)' }}>
                                                                <Text style={{ fontSize: 13, color: colors.textMuted }}>{row.label}</Text>
                                                                <Text style={{ fontSize: 14, color: row.color, fontWeight: '700' }}>{row.value}</Text>
                                                            </View>
                                                        ))}

                                                        {/* Savings goal coverage */}
                                                        {whatIfResult.totalSavings > 0 && goalsState.length > 0 && (() => {
                                                            const openGoal = goalsState.find(g => g.saved < g.target);
                                                            if (!openGoal) return null;
                                                            const remaining = openGoal.target - openGoal.saved;
                                                            const coverage = Math.min(100, Math.round((whatIfResult.totalSavings / remaining) * 100));
                                                            return (
                                                                <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
                                                                    <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 4 }}>
                                                                        Цель «{openGoal.name}»: покрытие {coverage}%
                                                                    </Text>
                                                                    <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                                                                        <View style={{ width: `${coverage}%`, height: '100%', backgroundColor: '#7C6FFF', borderRadius: 3 }} />
                                                                    </View>
                                                                </View>
                                                            );
                                                        })()}
                                                    </View>
                                                </View>
                                            );
                                        })()}
                                    </Card>

                                </>
                            )}
                        </>
                    );
                })()}

                {/* ══ SAVINGS ═══════════════════════════════════════════════ */}
                {tab === 'savings' && (
                    <>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 }}>{t('analytics.myGoals')}</Text>

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
                                        <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center' }}>
                                            {t('analytics.noActiveGoals')}
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
                                    <Text style={{ color: '#4FFFB0', fontSize: 14, fontWeight: '600' }}>{t('analytics.newSavingsGoal')}</Text>
                                </TouchableOpacity>

                                {/* ── Block 2: Deposits ─────────────────────── */}
                                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginTop: 8, marginBottom: 12 }}>{t('analytics.deposits')}</Text>

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
                                                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary, flex: 1 }}>{dep.name}</Text>
                                                </View>

                                                {[
                                                    { label: t('analytics.rate'), value: `${dep.currentRate}%` },
                                                    { label: t('analytics.sum'), value: formatAmount(dep.amount, dep.currency) },
                                                ].map((row, i) => (
                                                    <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                                                        <Text style={{ fontSize: 12, color: colors.textMuted }}>{row.label}:</Text>
                                                        <Text style={{ fontSize: 12, color: colors.textPrimary, fontWeight: '600' }}>{row.value}</Text>
                                                    </View>
                                                ))}

                                                <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
                                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                                                        <Text style={{ fontSize: 11, color: colors.textMuted }}>
                                                            {t('analytics.forecastDate', { date: dep.endDate ? format(dep.endDate, 'dd.MM.yy') : '5Y' })}
                                                        </Text>
                                                        <Text style={{ fontSize: 12, color: '#4FFFB0', fontWeight: '700' }}>{formatAmount(dep.projectedValue, dep.currency)}</Text>
                                                    </View>
                                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                                                        <Text style={{ fontSize: 11, color: colors.textDisabled }}>{t('analytics.percentIncome')}</Text>
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
                                            <Text style={{ color: '#7C6FFF', fontSize: 11, fontWeight: '600' }}>{t('dashboard.add')}</Text>
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
                                        <Text style={{ color: '#7C6FFF', fontSize: 14, fontWeight: '600' }}>{t('analytics.addDeposit')}</Text>
                                    </TouchableOpacity>
                                )}

                                {/* ── Block 3: Summary ─────────────────────── */}
                                {(goalsState.length > 0 || deposits.length > 0) && (
                                    <Card>
                                        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 14 }}>{t('analytics.savingsSummary')}</Text>

                                        {/* Goals section */}
                                        {goalsState.length > 0 && (
                                            <>
                                                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textDisabled, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>{t('analytics.goals')}</Text>
                                                {[
                                                    { label: t('analytics.saved'), value: formatAmount(goalsState.reduce((s, g) => s + g.saved, 0), currency), color: '#4FFFB0' },
                                                    { label: t('analytics.remaining2'), value: formatAmount(goalsState.reduce((s, g) => s + Math.max(g.target - g.saved, 0), 0), currency), color: '#7C6FFF' },
                                                ].map((item, i) => (
                                                    <View key={`g${i}`} style={{
                                                        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                                                        paddingVertical: 8,
                                                        borderBottomWidth: i === 0 ? 1 : 0,
                                                        borderBottomColor: 'rgba(255,255,255,0.05)',
                                                    }}>
                                                        <Text style={{ fontSize: 13, color: colors.textSecondary }}>{item.label}</Text>
                                                        <Text style={{ fontSize: 14, fontWeight: '700', color: item.color }}>{item.value}</Text>
                                                    </View>
                                                ))}
                                            </>
                                        )}

                                        {/* Deposits section */}
                                        {deposits.length > 0 && (
                                            <>
                                                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textDisabled, marginTop: goalsState.length > 0 ? 16 : 0, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>{t('analytics.deposits')}</Text>
                                                {(() => {
                                                    const totalDeposited = deposits.reduce((s, d) => s + d.amount, 0);
                                                    const totalAccrued = deposits.reduce((s, d) => s + calcAccruedInterest(d.amount, d.ratePeriods, d.capitalization, d.startDate), 0);
                                                    return [
                                                        { label: t('analytics.invested'), value: formatAmount(totalDeposited, currency), color: colors.textMuted },
                                                        { label: t('analytics.interestIncome'), value: `+ ${formatAmount(totalAccrued, currency)}`, color: '#4FFFB0' },
                                                    ].map((item, i) => (
                                                        <View key={`d${i}`} style={{
                                                            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                                                            paddingVertical: 8,
                                                            borderBottomWidth: i === 0 ? 1 : 0,
                                                            borderBottomColor: 'rgba(255,255,255,0.05)',
                                                        }}>
                                                            <Text style={{ fontSize: 13, color: colors.textSecondary }}>{item.label}</Text>
                                                            <Text style={{ fontSize: 14, fontWeight: '700', color: item.color }}>{item.value}</Text>
                                                        </View>
                                                    ));
                                                })()}
                                            </>
                                        )}
                                    </Card>
                                )}

                                {/* Recommendation */}
                                {hintsEnabled && (
                                    <View style={{ backgroundColor: 'rgba(79,255,176,0.04)', borderWidth: 1, borderColor: 'rgba(79,255,176,0.1)', borderRadius: 14, padding: 14 }}>
                                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#4FFFB0', marginBottom: 6 }}>{t('analytics.recommendation')}</Text>
                                        <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 19 }}>
                                            {recommendation || t('analytics.createFirstGoal')}
                                        </Text>
                                    </View>
                                )}
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
                                                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>{loan.name}</Text>
                                                    <Text style={{ fontSize: 11, color: colors.textMuted }}>{typeLabel}</Text>
                                                </View>
                                            </View>

                                            {/* Info rows */}
                                            {[
                                                { label: t('analytics.loanBalance'), value: formatAmount(remaining, loan.currency), color: colors.textPrimary },
                                                { label: t('analytics.loanPaid'), value: formatAmount(loan.paidAmount, loan.currency), color: '#4FFFB0' },
                                                { label: t('analytics.loanMonthlyPayment'), value: formatAmount(loan.monthlyPayment, loan.currency), color: '#FF6B6B' },
                                            ].map((row, i) => (
                                                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                                                    <Text style={{ fontSize: 11, color: colors.textMuted }}>{row.label}:</Text>
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
                                            <Text style={{ fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: 4 }}>{t('analytics.loanPaidPercent', { pct })}</Text>
                                        </TouchableOpacity>
                                    </View>
                                );
                            }) : (
                                <View style={{ alignItems: 'center', paddingVertical: 32, width: 260 }}>
                                    <Text style={{ fontSize: 32, marginBottom: 8 }}>🏦</Text>
                                    <Text style={{ fontSize: 13, color: colors.textDisabled }}>{t('analytics.noLoans')}</Text>
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
                            <Text style={{ color: '#FF6B6B', fontSize: 14, fontWeight: '600' }}>{t('analytics.addLoan')}</Text>
                        </TouchableOpacity>

                        {/* ── Block 2: Summary ── */}
                        {loans.length > 0 && (
                            <Card>
                                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 14 }}>{t('analytics.loans')}</Text>
                                {[
                                    { label: t('analytics.totalDebt'), value: formatAmount(loans.reduce((s, l) => s + l.totalAmount, 0), currency), color: colors.textPrimary },
                                    { label: t('analytics.alreadyPaid'), value: formatAmount(loans.reduce((s, l) => s + l.paidAmount, 0), currency), color: '#4FFFB0' },
                                    { label: t('analytics.monthlySpend'), value: formatAmount(loans.reduce((s, l) => s + l.monthlyPayment, 0), currency), color: '#FF6B6B' },
                                    { label: t('analytics.bankInterest'), value: formatAmount(loans.reduce((s, l) => s + calcCurrentInterest(l), 0), currency), color: '#FFB84F' },
                                ].map((row, i) => (
                                    <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.06)' }}>
                                        <Text style={{ fontSize: 13, color: colors.textMuted }}>{row.label}</Text>
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
                                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 }}>{t('analytics.whatIfPayMore')}</Text>
                                    <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 14 }}>
                                        {t('analytics.currentPayment', { amount: formatAmount(totalMonthly, currency) })}
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
                                                <Text style={{ fontSize: 13, color: simMode === mode ? '#4FFFB0' : colors.textMuted, fontWeight: '600' }}>
                                                    {mode === '+5' ? '+5%' : mode === '+10' ? '+10%' : t('analytics.customAmount')}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    {/* Custom amount input */}
                                    {simMode === 'custom' && (
                                        <TextInput
                                            style={[inputStyle, { marginBottom: 12 }]}
                                            keyboardType="decimal-pad"
                                            placeholder={t('analytics.extraPaymentPlaceholder')}
                                            placeholderTextColor={colors.textDisabled}
                                            value={simCustomAmount}
                                            onChangeText={v => setSimCustomAmount(v.replace(/[^0-9.,]/g, ''))}
                                        />
                                    )}

                                    {/* Results */}
                                    {sim && extraAmt > 0 && (
                                        <View style={{ backgroundColor: 'rgba(79,255,176,0.05)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(79,255,176,0.12)' }}>
                                            {[
                                                { label: t('analytics.extraPayment'), value: `+ ${formatAmount(extraAmt, currency)}`, color: '#4FFFB0' },
                                                { label: t('analytics.newPayment'), value: formatAmount(sim.newPayment, currency), color: colors.textPrimary },
                                                { label: t('analytics.interestSaved'), value: formatAmount(sim.savedInterest, currency), color: '#4FFFB0' },
                                                { label: t('analytics.closeFaster'), value: t('analytics.closeFasterValue', { months: sim.monthsSaved }), color: '#4FFFB0' },
                                            ].map((row, i) => (
                                                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 }}>
                                                    <Text style={{ fontSize: 13, color: colors.textMuted }}>{row.label}</Text>
                                                    <Text style={{ fontSize: 14, color: row.color, fontWeight: '700' }}>{row.value}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                </Card>
                            );
                        })()}

                        {/* ── Block 4: Recommendation ── */}
                        {hintsEnabled && loans.length > 0 && (() => {
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
                                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#4FFFB0', marginBottom: 6 }}>{t('analytics.loanRec')}</Text>
                                    <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 19 }}>
                                        {t('analytics.loanRecText', {
                                            type: typeLabel,
                                            total: formatAmount(mainLoan.totalAmount, mainLoan.currency),
                                            rate: mainLoan.currentRate,
                                            payment: formatAmount(mainLoan.monthlyPayment, mainLoan.currency),
                                            interest: formatAmount(interest, mainLoan.currency),
                                            extra: formatAmount(extra10, mainLoan.currency),
                                            saved: formatAmount(sim10.savedInterest, mainLoan.currency),
                                            months: sim10.monthsSaved,
                                        })}
                                    </Text>
                                </View>
                            );
                        })()}
                    </>
                )}
            </ScrollView>

            {/* ══ LOAN DETAIL BOTTOM SHEET ═══════════════════════════════════ */}
            <BaseBottomSheet visible={!!selectedLoan} onClose={() => setSelectedLoan(null)} maxHeight="85%">
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
                                            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.textPrimary }}>{loan.name}</Text>
                                            <Text style={{ fontSize: 12, color: colors.textMuted }}>{loan.loanType === 'other' && loan.customTypeName ? loan.customTypeName : LOAN_TYPE_LABELS[loan.loanType]}</Text>
                                        </View>
                                    </View>

                                    {/* Info rows */}
                                    {[
                                        { label: t('analytics.loanDebtRemaining'), value: formatAmount(remaining, loan.currency), color: colors.textPrimary },
                                        { label: t('analytics.alreadyPaid'), value: formatAmount(loan.paidAmount, loan.currency), color: '#4FFFB0' },
                                    ].map((row, i) => (
                                        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
                                            <Text style={{ fontSize: 13, color: colors.textMuted }}>{row.label}:</Text>
                                            <Text style={{ fontSize: 14, color: row.color, fontWeight: '600' }}>{row.value}</Text>
                                        </View>
                                    ))}

                                    {/* Progress bar */}
                                    <View style={{ marginTop: 10, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                        <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.06)' }}>
                                            <View style={{ width: `${Math.min(pct, 100)}%`, height: 10, borderRadius: 5, backgroundColor: loan.color }} />
                                        </View>
                                        <Text style={{ fontSize: 13, color: colors.textSecondary, fontWeight: '700' }}>{pct}%</Text>
                                    </View>

                                    {/* Next payment */}
                                    <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
                                        <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>{t('analytics.nextPayment')}</Text>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Text style={{ fontSize: 18, fontWeight: '800', color: '#FF6B6B' }}>{formatAmount(loan.monthlyPayment, loan.currency)}</Text>
                                            <Text style={{ fontSize: 13, color: colors.textMuted }}>{format(nextPayDate, 'd MMMM', { locale: ru })}</Text>
                                        </View>
                                    </View>

                                    {/* Current rate */}
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, marginBottom: 8 }}>
                                        <Text style={{ fontSize: 13, color: colors.textMuted }}>{t('analytics.currentRate')}</Text>
                                        <Text style={{ fontSize: 14, color: '#7C6FFF', fontWeight: '700' }}>{t('analytics.annualRate2', { rate: loan.currentRate })}</Text>
                                    </View>

                                    {/* Rate periods */}
                                    {loan.ratePeriods.length > 0 && (
                                        <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
                                            <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('analytics.ratePeriods')}</Text>
                                            {loan.ratePeriods.map((rp, i) => (
                                                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                                                    <Text style={{ fontSize: 13, color: colors.textMuted }}>
                                                        {format(rp.from, 'dd.MM.yyyy')} — {rp.to ? format(rp.to, 'dd.MM.yyyy') : t('analytics.indefinite')}
                                                    </Text>
                                                    <Text style={{ fontSize: 13, color: i === loan.ratePeriods.length - 1 ? '#7C6FFF' : colors.textMuted, fontWeight: '600' }}>{rp.rate}%</Text>
                                                </View>
                                            ))}
                                        </View>
                                    )}

                                    {/* Payment info */}
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, marginBottom: 4 }}>
                                        <Text style={{ fontSize: 12, color: colors.textMuted }}>{t('analytics.paymentType')}</Text>
                                        <Text style={{ fontSize: 12, color: colors.textPrimary }}>{loan.paymentType === 'annuity' ? t('analytics.annuity') : t('analytics.differentiated')}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, marginBottom: 4 }}>
                                        <Text style={{ fontSize: 12, color: colors.textMuted }}>{t('analytics.term')}</Text>
                                        <Text style={{ fontSize: 12, color: colors.textPrimary }}>{format(loan.startDate, 'dd.MM.yyyy')} — {format(loan.endDate, 'dd.MM.yyyy')}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, marginBottom: 16 }}>
                                        <Text style={{ fontSize: 12, color: colors.textMuted }}>{t('analytics.monthsRemaining')}</Text>
                                        <Text style={{ fontSize: 12, color: colors.textPrimary }}>{Math.max(0, totalMonths - monthsPaid)}</Text>
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
                                                {confirmingPayment ? t('analytics.processing') : t('analytics.confirmPayment', { amount: formatAmount(loan.monthlyPayment, loan.currency) })}
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
                                        <Text style={{ color: '#7C6FFF', fontSize: 14, fontWeight: '600' }}>{t('common.edit')}</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity onPress={() => closeLoanAction(loan)} style={{
                                        paddingVertical: 14, borderRadius: 14, alignItems: 'center',
                                        backgroundColor: 'rgba(239,68,68,0.07)',
                                        borderWidth: 1, borderColor: 'rgba(239,68,68,0.18)',
                                    }}>
                                        <Text style={{ color: '#ef4444', fontSize: 14, fontWeight: '600' }}>{t('analytics.closeLoan')}</Text>
                                    </TouchableOpacity>
                                </ScrollView>
                            );
                        })()}
            </BaseBottomSheet>

            {/* ══ ADD/EDIT LOAN MODAL ═══════════════════════════════════════ */}
            <BaseBottomSheet visible={showAddLoan} onClose={closeLoanModal} maxHeight="92%">

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
                                <Text style={{ fontSize: 18, fontWeight: '800', color: colors.textPrimary }}>{editingLoan ? t('analytics.editLoan') : t('analytics.newLoan')}</Text>
                                <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 1 }}>
                                    {loanName.trim() || t('analytics.goalFormEnterName')}
                                </Text>
                            </View>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                            {/* Icon */}
                            <Text style={labelStyle}>{t('common.icon')}</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                                <View style={{ flexDirection: 'row', gap: 6 }}>
                                    {['Home', 'Car', 'CreditCard', 'Landmark', 'Briefcase', 'ShoppingCart', 'Laptop', 'Heart', 'GraduationCap', 'Plane'].map(ic => (
                                        <TouchableOpacity key={ic} onPress={() => setLoanIcon(ic)} style={{
                                            width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                                            backgroundColor: loanIcon === ic ? 'rgba(255,107,107,0.25)' : 'rgba(255,255,255,0.05)',
                                            borderWidth: 1.5, borderColor: loanIcon === ic ? '#FF6B6B' : 'transparent',
                                        }}>
                                            <CategoryIcon iconName={ic} color={loanIcon === ic ? '#FF6B6B' : colors.textMuted} size={20} />
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </ScrollView>

                            {/* Color */}
                            <Text style={labelStyle}>{t('common.color')}</Text>
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
                            <Text style={labelStyle}>{t('common.name')}</Text>
                            <TextInput style={inputStyle} placeholder={t('analytics.mortgagePlaceholder')} placeholderTextColor={colors.textDisabled} value={loanName} onChangeText={setLoanName} />

                            {/* Loan type */}
                            <Text style={labelStyle}>{t('analytics.loanType')}</Text>
                            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                                {(['mortgage', 'auto', 'consumer', 'other'] as LoanType[]).map(lt => (
                                    <TouchableOpacity key={lt} onPress={() => setLoanType(lt)} style={{
                                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                                        backgroundColor: loanType === lt ? 'rgba(255,107,107,0.15)' : 'rgba(255,255,255,0.05)',
                                        borderWidth: 1.5, borderColor: loanType === lt ? '#FF6B6B' : 'rgba(255,255,255,0.08)',
                                    }}>
                                        <Text style={{ fontSize: 13, color: loanType === lt ? '#FF6B6B' : colors.textMuted, fontWeight: '600' }}>{LOAN_TYPE_LABELS[lt]}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            {loanType === 'other' && (
                                <TextInput style={inputStyle} placeholder={t('analytics.loanTypePlaceholder')} placeholderTextColor={colors.textDisabled} value={loanCustomType} onChangeText={setLoanCustomType} />
                            )}

                            {/* Amount + currency */}
                            <Text style={labelStyle}>{t('analytics.loanAmount')}</Text>
                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                                <TextInput style={[inputStyle, { flex: 1, marginBottom: 0 }]} keyboardType="decimal-pad" placeholder="100000" placeholderTextColor={colors.textDisabled} value={loanAmount} onChangeText={v => setLoanAmount(v.replace(/[^0-9.,]/g, ''))} />
                                <TouchableOpacity onPress={() => setShowLoanCurrencyDropdown(true)} style={{
                                    flexDirection: 'row', alignItems: 'center', gap: 6,
                                    paddingHorizontal: 14, borderRadius: 12,
                                    backgroundColor: 'rgba(255,255,255,0.06)',
                                    borderWidth: 1.5, borderColor: 'rgba(255,107,107,0.3)', minWidth: 88,
                                }}>
                                    <Text style={{ fontSize: 18 }}>{CURRENCIES.find(c => c.code === loanCurrency)?.flag}</Text>
                                    <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }}>{loanCurrency}</Text>
                                    <Text style={{ color: colors.textMuted, fontSize: 11, marginLeft: 2 }}>▾</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Paid amount (edit mode) */}
                            {editingLoan && (
                                <>
                                    <Text style={labelStyle}>{t('analytics.alreadyPaid')}</Text>
                                    <TextInput style={inputStyle} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textDisabled} value={loanPaidAmount} onChangeText={setLoanPaidAmount} />
                                </>
                            )}

                            {/* Source account */}
                            {!editingLoan && (
                                <View style={{ marginBottom: 12 }}>
                                    <Text style={{ fontSize: 11, color: colors.textDisabled, marginBottom: 4 }}>{t('analytics.loanSourceAccount')}</Text>
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
                                                        <Text style={{ fontSize: 13, color: sel ? '#7C6FFF' : colors.textMuted, fontWeight: '600' }}>{acc.name}</Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </ScrollView>
                                </View>
                            )}

                            {/* Payment type */}
                            <Text style={labelStyle}>{t('analytics.paymentType').replace(':', '')}</Text>
                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                                {([['annuity', t('analytics.annuityShort')], ['differentiated', t('analytics.differentiatedShort')]] as [PaymentType, string][]).map(([pt, label]) => (
                                    <TouchableOpacity key={pt} onPress={() => setLoanPaymentType(pt)} style={{
                                        flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                                        backgroundColor: loanPaymentType === pt ? 'rgba(255,107,107,0.15)' : 'rgba(255,255,255,0.05)',
                                        borderWidth: 1.5, borderColor: loanPaymentType === pt ? '#FF6B6B' : 'rgba(255,255,255,0.08)',
                                    }}>
                                        <Text style={{ fontSize: 13, color: loanPaymentType === pt ? '#FF6B6B' : colors.textMuted, fontWeight: '600' }}>{label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Dates */}
                            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={labelStyle}>{t('analytics.startDate')}</Text>
                                    <TouchableOpacity onPress={() => setShowLoanStartPicker(!showLoanStartPicker)} style={{
                                        backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12,
                                        paddingHorizontal: 14, paddingVertical: 12,
                                        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)',
                                    }}>
                                        <Text style={{ color: colors.textPrimary, fontSize: 14 }}>{format(loanStartDate, 'dd.MM.yyyy')}</Text>
                                    </TouchableOpacity>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={labelStyle}>{t('analytics.endDate')}</Text>
                                    <TouchableOpacity onPress={() => setShowLoanEndPicker(!showLoanEndPicker)} style={{
                                        backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12,
                                        paddingHorizontal: 14, paddingVertical: 12,
                                        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)',
                                    }}>
                                        <Text style={{ color: colors.textPrimary, fontSize: 14 }}>{format(loanEndDate, 'dd.MM.yyyy')}</Text>
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
                                    <Text style={labelStyle}>{t('analytics.paymentDay')}</Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 14, paddingVertical: 10 }}>
                                        <TextInput
                                            style={{ color: colors.textPrimary, fontSize: 14, flex: 1 }}
                                            keyboardType="number-pad"
                                            placeholder="15"
                                            placeholderTextColor={colors.textDisabled}
                                            value={loanPaymentDay}
                                            onChangeText={v => {
                                                const num = v.replace(/[^0-9]/g, '');
                                                const day = parseInt(num);
                                                if (num === '' || (day >= 1 && day <= 31)) setLoanPaymentDay(num);
                                            }}
                                            maxLength={2}
                                        />
                                        <Text style={{ color: colors.textDisabled, fontSize: 12 }}>{t('analytics.dayNumber')}</Text>
                                    </View>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={labelStyle}>{t('analytics.remind')}</Text>
                                    <TouchableOpacity onPress={() => setShowLoanReminderPicker(!showLoanReminderPicker)} style={{
                                        backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12,
                                        paddingHorizontal: 14, paddingVertical: 12,
                                        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)',
                                    }}>
                                        <Text style={{ color: colors.textPrimary, fontSize: 14 }}>{format(loanReminderDate, 'dd.MM.yyyy')}</Text>
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
                                    <Text style={labelStyle}>{t('analytics.ratePeriods')}</Text>
                                    {(() => {
                                        const lastP = loanRateDrafts[loanRateDrafts.length - 1];
                                        const canAdd = lastP && lastP.rate.trim() !== '' && !isNaN(parseFloat(lastP.rate)) && parseFloat(lastP.rate) > 0;
                                        return (
                                            <TouchableOpacity disabled={!canAdd} onPress={() => {
                                                const prev = loanRateDrafts[loanRateDrafts.length - 1];
                                                const newFrom = prev.toDate ?? new Date();
                                                setLoanRateDrafts([...loanRateDrafts, { rate: '', fromDate: newFrom, toDate: null }]);
                                            }}>
                                                <Text style={{ color: '#FF6B6B', fontSize: 13, fontWeight: '600', opacity: canAdd ? 1 : 0.3 }}>{t('analytics.addPeriod')}</Text>
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
                                        const endLabel = period.toDate ? format(period.toDate, 'dd.MM.yyyy') : t('analytics.indefinite');
                                        const showPicker = loanRatePickerIdx === idx;
                                        return (
                                            <View key={idx}>
                                                {idx > 0 && <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />}
                                                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}>
                                                    <TouchableOpacity onPress={() => setLoanRatePickerIdx(showPicker ? null : idx)} style={{ flex: 1 }}>
                                                        <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                                                            {format(fromDate, 'dd.MM.yyyy')} — <Text style={{ color: period.toDate ? colors.textSecondary : colors.textDisabled }}>{endLabel}</Text>
                                                        </Text>
                                                    </TouchableOpacity>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                        <TextInput
                                                            style={{
                                                                backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8,
                                                                color: colors.textPrimary, fontSize: 14, fontWeight: '600',
                                                                paddingHorizontal: 10, paddingVertical: 6,
                                                                minWidth: 48, textAlign: 'center',
                                                                borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
                                                            }}
                                                            keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textDisabled}
                                                            value={period.rate}
                                                            onChangeText={v => {
                                                                const updated = [...loanRateDrafts];
                                                                updated[idx] = { ...updated[idx], rate: v };
                                                                setLoanRateDrafts(updated);
                                                            }}
                                                        />
                                                        <Text style={{ color: colors.textMuted, fontSize: 13 }}>%</Text>
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
                                                                <Text style={{ color: !period.toDate ? '#FF6B6B' : colors.textMuted, fontSize: 12, fontWeight: '600' }}>{t('analytics.indefiniteCap')}</Text>
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
                                <Text style={{ fontSize: 11, color: colors.textDisabled, marginBottom: 4 }}>{t('analytics.paymentAccount')}</Text>
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
                                                    <Text style={{ fontSize: 13, color: sel ? '#FF6B6B' : colors.textMuted, fontWeight: '600' }}>{acc.name}</Text>
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
                                        <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 2 }}>{t('analytics.monthlyPaymentPreview')}</Text>
                                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#FF6B6B' }}>{formatAmount(pmt, loanCurrency)}</Text>
                                        <Text style={{ fontSize: 11, color: colors.textDisabled, marginTop: 2 }}>{t('analytics.loanTermInfo', { months, overpayment: formatAmount(pmt * months - amt, loanCurrency) })}</Text>
                                    </View>
                                );
                            })()}

                            {/* Save button */}
                            <TouchableOpacity
                                onPress={() => householdId && (editingLoan ? updateLoan(householdId) : createLoan(householdId))}
                                disabled={savingLoan}
                                style={{ marginTop: 8, marginBottom: 20, paddingVertical: 14, backgroundColor: '#FF6B6B', borderRadius: 14, alignItems: 'center', opacity: savingLoan ? 0.5 : 1 }}>
                                <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '700' }}>{savingLoan ? `${t('common.save')}…` : t('common.save')}</Text>
                            </TouchableOpacity>
                        </ScrollView>

                        {/* Currency dropdown */}
                        <Modal visible={showLoanCurrencyDropdown} transparent animationType="fade">
                            <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} activeOpacity={1}
                                onPress={() => { setShowLoanCurrencyDropdown(false); setLoanCurrencySearch(''); }} />
                            <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.bgSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingBottom: 40, maxHeight: '60%' }}>
                                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 16 }} />
                                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary, paddingHorizontal: 20, marginBottom: 12 }}>{t('analytics.currency')}</Text>
                                <View style={{ marginHorizontal: 20, marginBottom: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
                                    <Text style={{ fontSize: 15, color: colors.textDisabled, marginRight: 8 }}>🔍</Text>
                                    <TextInput value={loanCurrencySearch} onChangeText={setLoanCurrencySearch} placeholder={t('analytics.searchCurrency')} placeholderTextColor={colors.textDisabled} style={{ flex: 1, color: colors.textPrimary, fontSize: 14 }} autoCorrect={false} autoCapitalize="none" />
                                </View>
                                <FlatList
                                    data={CURRENCIES.filter(c => !loanCurrencySearch || c.code.toLowerCase().includes(loanCurrencySearch.toLowerCase()) || c.name.toLowerCase().includes(loanCurrencySearch.toLowerCase()))}
                                    keyExtractor={i => i.code}
                                    renderItem={({ item }) => (
                                        <TouchableOpacity onPress={() => { setLoanCurrency(item.code); setShowLoanCurrencyDropdown(false); setLoanCurrencySearch(''); }}
                                            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 20, backgroundColor: item.code === loanCurrency ? 'rgba(255,107,107,0.1)' : 'transparent' }}>
                                            <Text style={{ fontSize: 20 }}>{item.flag}</Text>
                                            <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600' }}>{item.code}</Text>
                                            <Text style={{ color: colors.textMuted, fontSize: 13, flex: 1 }}>{item.name}</Text>
                                            {item.code === loanCurrency && <Text style={{ color: '#FF6B6B', fontSize: 16 }}>✓</Text>}
                                        </TouchableOpacity>
                                    )}
                                />
                            </View>
                        </Modal>
            </BaseBottomSheet>

            {/* ══ ADD GOAL MODAL ════════════════════════════════════════════ */}
            <BaseBottomSheet visible={showAddGoal} onClose={closeGoalModal} maxHeight="92%">

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
                                <Text style={{ fontSize: 18, fontWeight: '800', color: colors.textPrimary }}>
                                    {editingGoal ? t('analytics.editGoal') : t('analytics.newGoal')}
                                </Text>
                                <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 1 }}>
                                    {goalName.trim() || t('analytics.goalFormEnterName')}
                                </Text>
                            </View>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                            {/* ── 1. Название ── */}
                            <Text style={labelStyle}>{t('analytics.goalFormTitle')}</Text>
                            <TextInput
                                value={goalName}
                                onChangeText={setGoalName}
                                placeholder={t('analytics.goalFormPlaceholder')}
                                placeholderTextColor={colors.textDisabled}
                                style={inputStyle}
                            />

                            {/* ── 2. Иконка + Цвет в одну строку ── */}
                            <View style={{ flexDirection: 'row', gap: 16, marginBottom: 20 }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={labelStyle}>{t('common.icon')}</Text>
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
                                <View>
                                    <Text style={labelStyle}>{t('common.color')}</Text>
                                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', maxWidth: 140 }}>
                                        {['#7C6FFF','#4FFFB0','#FFB84F','#FF6B6B','#4FC3FF','#F472B6','#34D399','#FB923C'].map(c => (
                                            <TouchableOpacity key={c} onPress={() => setGoalColor(c)} style={{
                                                width: 28, height: 28, borderRadius: 14,
                                                backgroundColor: c,
                                                borderWidth: goalColor === c ? 3 : 1.5,
                                                borderColor: goalColor === c ? '#fff' : 'transparent',
                                                alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                {goalColor === c && <Text style={{ fontSize: 12 }}>✓</Text>}
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                            </View>

                            {/* ── 3. Сумма ── */}
                            <Text style={labelStyle}>{t('analytics.targetAmount')}</Text>
                            <TextInput
                                value={goalTarget}
                                onChangeText={setGoalTarget}
                                placeholder="0.00"
                                placeholderTextColor={colors.textDisabled}
                                keyboardType="decimal-pad"
                                style={[inputStyle, { marginBottom: 12 }]}
                            />

                            {/* ── Валюта ── */}
                            <Text style={labelStyle}>{t('analytics.currency') ?? 'Валюта'}</Text>
                            <TouchableOpacity
                                onPress={() => setShowCurrencyDropdown(true)}
                                style={{
                                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                                    paddingHorizontal: 14, paddingVertical: 14, borderRadius: 12, marginBottom: 16,
                                    backgroundColor: colors.bgTertiary,
                                    borderWidth: 1.5,
                                    borderColor: colors.brand ?? '#7C6FFF',
                                }}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                    <Text style={{ fontSize: 22 }}>{CURRENCIES.find(c => c.code === goalCurrency)?.flag}</Text>
                                    <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700' }}>{goalCurrency}</Text>
                                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                                        {CURRENCIES.find(c => c.code === goalCurrency)?.name ?? ''}
                                    </Text>
                                </View>
                                <Text style={{ color: colors.textMuted, fontSize: 14 }}>▾</Text>
                            </TouchableOpacity>

                            {/* ── Currency dropdown modal ── */}
                            <Modal visible={showCurrencyDropdown} transparent animationType="fade">
                                <TouchableOpacity
                                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}
                                    activeOpacity={1}
                                    onPress={() => { setShowCurrencyDropdown(false); setCurrencySearch(''); }}
                                />
                                <View style={{
                                    position: 'absolute', bottom: 0, left: 0, right: 0,
                                    backgroundColor: colors.bgSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24,
                                    paddingTop: 12, paddingBottom: 40, maxHeight: '60%',
                                }}>
                                    <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 16 }} />
                                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary, paddingHorizontal: 20, marginBottom: 12 }}>{t('analytics.currency')}</Text>
                                    <View style={{ marginHorizontal: 20, marginBottom: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
                                        <Text style={{ fontSize: 15, color: colors.textDisabled, marginRight: 8 }}>🔍</Text>
                                        <TextInput
                                            value={currencySearch}
                                            onChangeText={setCurrencySearch}
                                            placeholder={t('analytics.searchCurrency')}
                                            placeholderTextColor={colors.textDisabled}
                                            style={{ flex: 1, color: colors.textPrimary, fontSize: 14 }}
                                            autoCorrect={false}
                                            autoCapitalize="none"
                                        />
                                        {currencySearch.length > 0 && (
                                            <TouchableOpacity onPress={() => setCurrencySearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                                <Text style={{ color: colors.textDisabled, fontSize: 16 }}>✕</Text>
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
                                                        <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }}>{c.name}</Text>
                                                    </View>
                                                    {selected && <Text style={{ color: '#7C6FFF', fontSize: 16 }}>✓</Text>}
                                                </TouchableOpacity>
                                            );
                                        }}
                                    />
                                </View>
                            </Modal>

                            {/* ── 4. Списывать со счёта ── */}
                            <Text style={labelStyle}>{t('analytics.debitAccount')}</Text>
                            {accounts.length === 0 ? (
                                <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
                                    <Text style={{ color: colors.textDisabled, fontSize: 13 }}>{t('analytics.noAccountsHint')}</Text>
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
                                                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>{acc.name}</Text>
                                                    <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 1 }}>
                                                        {formatAmount(acc.balance, acc.currency)}
                                                    </Text>
                                                </View>
                                                <View style={{
                                                    width: 22, height: 22, borderRadius: 11,
                                                    backgroundColor: selected ? '#7C6FFF' : 'rgba(255,255,255,0.08)',
                                                    alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                    {selected && <Text style={{ color: colors.textPrimary, fontSize: 11, fontWeight: '800' }}>✓</Text>}
                                                </View>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            )}

                            {/* ── 5. Начальный взнос (только при создании) ── */}
                            {!editingGoal && (
                                <>
                                    <Text style={labelStyle}>{t('analytics.initialDeposit')} <Text style={{ textTransform: 'none', fontWeight: '400', color: colors.textDisabled }}>({t('common.optional')})</Text></Text>
                                    <TextInput
                                        value={goalInitialDeposit}
                                        onChangeText={v => setGoalInitialDeposit(v.replace(/[^0-9.,]/g, ''))}
                                        placeholder="0.00"
                                        placeholderTextColor={colors.textDisabled}
                                        keyboardType="decimal-pad"
                                        style={inputStyle}
                                    />
                                </>
                            )}

                            {/* ── 6. Дата достижения ── */}
                            <Text style={labelStyle}>{t('analytics.targetDate')} <Text style={{ textTransform: 'none', fontWeight: '400', color: colors.textDisabled }}>({t('common.optional')})</Text></Text>
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
                                        <View style={{ backgroundColor: 'rgba(124,111,255,0.15)', paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', minWidth: 62 }}>
                                            <Text style={{ color: '#a78bfa', fontSize: 26, fontWeight: '700', lineHeight: 30 }}>
                                                {format(goalDateObj, 'd')}
                                            </Text>
                                        </View>
                                        <View style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 12, justifyContent: 'center' }}>
                                            <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700', textTransform: 'capitalize' }}>
                                                {format(goalDateObj, 'LLLL', { locale: ru })}
                                            </Text>
                                            <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600', marginTop: 2 }}>
                                                {format(goalDateObj, 'yyyy')} {t('analytics.yearSuffix')}
                                            </Text>
                                        </View>
                                        <TouchableOpacity
                                            onPress={() => setGoalDateObj(null)}
                                            style={{ paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' }}
                                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                        >
                                            <Text style={{ color: colors.textDisabled, fontSize: 18 }}>✕</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 }}>
                                        <Text style={{ fontSize: 20 }}>📅</Text>
                                        <Text style={{ color: colors.textDisabled, fontSize: 15 }}>{t('analytics.tapToSelect')}</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                            {showGoalDatePicker && (
                                <View style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 12, backgroundColor: colors.bgSecondary }}>
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

                            {/* ── Кнопки ── */}
                            <View style={{ flexDirection: 'row', gap: 12 }}>
                                <TouchableOpacity onPress={closeGoalModal} style={{
                                    flex: 1, paddingVertical: 14, borderRadius: 14,
                                    backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center',
                                }}>
                                    <Text style={{ color: colors.textMuted, fontSize: 15, fontWeight: '600' }}>{t('common.cancel')}</Text>
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
                                            {editingGoal ? t('common.save') : t('analytics.createGoal')}
                                        </Text>
                                    }
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
            </BaseBottomSheet>

            {/* ══ GOAL DETAIL BOTTOM SHEET ═════════════════════════════════ */}
            <BaseBottomSheet visible={!!selectedGoal} onClose={closeGoalDetail} maxHeight="92%">
                    {selectedGoal && (() => {
                        const g = selectedGoal;
                        const ratio = g.target > 0 ? Math.min(g.saved / g.target, 1) : 0;
                        const pctG = Math.round(ratio * 100);

                        return (
                            <ScrollView ref={goalDetailScrollRef} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                                {/* Header */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                                    <Text style={{ fontSize: 28 }}>{g.icon}</Text>
                                    <Text style={{ fontSize: 20, fontWeight: '800', color: colors.textPrimary, flex: 1 }} numberOfLines={1}>{g.name}</Text>
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
                                        <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 3 }}>{t('analytics.goalSaved')}</Text>
                                        <Text style={{ fontSize: 20, fontWeight: '800', color: '#4FFFB0' }}>{formatAmount(g.saved, g.currency)}</Text>
                                    </View>
                                    <View style={{ alignItems: 'flex-end' }}>
                                        <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 3 }}>{t('analytics.goalTargetLabel')}</Text>
                                        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.textPrimary }}>{formatAmount(g.target, g.currency)}</Text>
                                    </View>
                                </View>
                                <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 2, marginBottom: 20, overflow: 'hidden' }}>
                                    <View style={{ height: 4, width: `${pctG}%`, backgroundColor: '#4FFFB0', borderRadius: 2 }} />
                                </View>

                                {/* Calculator */}
                                <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
                                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 14 }}>{t('analytics.growthCalc')}</Text>

                                    {/* Rate */}
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                        <Text style={{ fontSize: 13, color: colors.textSecondary }}>{t('analytics.rate')}</Text>
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
                                                    color: colors.textPrimary, fontSize: 15, fontWeight: '700',
                                                    paddingHorizontal: 12, paddingVertical: 8,
                                                    minWidth: 60, textAlign: 'center',
                                                }}
                                            />
                                            <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t('analytics.annualPercent')}</Text>
                                        </View>
                                    </View>

                                    {/* Compounding */}
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                                        <Text style={{ fontSize: 13, color: colors.textSecondary }}>{t('analytics.compounding')}</Text>
                                        <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: 3, gap: 2 }}>
                                            {(['monthly', 'yearly'] as const).map(c => (
                                                <TouchableOpacity key={c} onPress={() => setGoalCompounding(c)} style={{
                                                    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                                                    backgroundColor: goalCompounding === c ? 'rgba(255,255,255,0.14)' : 'transparent',
                                                }}>
                                                    <Text style={{
                                                        fontSize: 12,
                                                        color: goalCompounding === c ? '#fff' : colors.textMuted,
                                                        fontWeight: goalCompounding === c ? '600' : '400',
                                                    }}>{c === 'monthly' ? t('analytics.monthly') : t('analytics.yearly')}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>

                                    <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: 12 }} />

                                    {/* Results */}
                                    {[
                                        { label: t('analytics.currentBalance'), value: formatAmount(g.saved, g.currency), color: colors.textPrimary },
                                        { label: t('analytics.forecastTo', { date: format(goalCalc.endDate, 'd MMM yyyy', { locale: ru }) }), value: formatAmount(goalCalc.forecast, g.currency), color: '#4FFFB0' },
                                        { label: `   ${t('analytics.ofWhichInterest')}`, value: `+${formatAmount(goalCalc.interest, g.currency)}`, color: '#4E9F3D', indent: true },
                                        { label: t('analytics.needToAdd'), value: goalCalc.needToAdd > 0 ? formatAmount(goalCalc.needToAdd, g.currency) : t('analytics.goalReached'), color: goalCalc.needToAdd > 0 ? '#f9a825' : '#4FFFB0' },
                                    ].map((row, i) => (
                                        <View key={i} style={{
                                            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                                            paddingVertical: 7,
                                            borderTopWidth: i > 0 ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.04)',
                                        }}>
                                            <Text style={{ fontSize: (row as any).indent ? 12 : 13, color: (row as any).indent ? colors.textMuted : colors.textSecondary, flex: 1 }}>{row.label}</Text>
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
                                        <Text style={{ color: '#4FFFB0', fontSize: 14, fontWeight: '600' }}>{t('analytics.topUpGoal')}</Text>
                                    </TouchableOpacity>
                                ) : (
                                    <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(79,255,176,0.15)' }}>
                                        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 }}>{t('analytics.topUpGoal')}</Text>

                                        <Text style={labelStyle}>{t('analytics.sum')}</Text>
                                        <TextInput
                                            value={goalTopUpAmount}
                                            onChangeText={setGoalTopUpAmount}
                                            placeholder="0"
                                            placeholderTextColor={colors.textDisabled}
                                            keyboardType="decimal-pad"
                                            style={inputStyle}
                                        />

                                        <Text style={labelStyle}>{t('analytics.fromAccount')}</Text>
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
                                                            <Text style={{ color: colors.textMuted, fontSize: 11 }}>{formatAmount(acc.balance, acc.currency)}</Text>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>
                                        </ScrollView>

                                        {goalTopUpAccountId && (() => {
                                            const srcAcc = accounts.find(a => a.id === goalTopUpAccountId);
                                            const amt = parseFloat(goalTopUpAmount.replace(',', '.')) || 0;
                                            if (srcAcc && amt > srcAcc.balance) {
                                                return <Text style={{ fontSize: 11, color: '#FFB84F', marginBottom: 4 }}>{t('analytics.insufficientFunds', { amount: formatAmount(srcAcc.balance, srcAcc.currency) })}</Text>;
                                            }
                                            return null;
                                        })()}

                                        <Text style={labelStyle}>{t('common.date')}</Text>
                                        <TouchableOpacity onPress={() => setShowGoalTopUpDatePicker(!showGoalTopUpDatePicker)} style={{
                                            backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12,
                                            paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
                                            borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)',
                                        }}>
                                            <Text style={{ color: colors.textPrimary, fontSize: 14 }}>{format(goalTopUpDate, 'dd.MM.yyyy')}</Text>
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
                                                <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: '600' }}>{t('common.cancel')}</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={confirmGoalTopUp} disabled={savingGoalTopUp || !goalTopUpAmount.trim()} style={{
                                                flex: 2, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
                                                backgroundColor: '#4FFFB0', opacity: savingGoalTopUp || !goalTopUpAmount.trim() ? 0.5 : 1,
                                            }}>
                                                {savingGoalTopUp
                                                    ? <ActivityIndicator color="#000" />
                                                    : <Text style={{ color: '#000', fontSize: 14, fontWeight: '700' }}>{t('analytics.topUpGoal')}</Text>
                                                }
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )}

                                {/* Delete goal */}
                                {!showDeleteGoal ? (
                                    <TouchableOpacity onPress={openDeleteGoal} style={{
                                        paddingVertical: 14, borderRadius: 14, alignItems: 'center',
                                        backgroundColor: 'rgba(239,68,68,0.07)',
                                        borderWidth: 1, borderColor: 'rgba(239,68,68,0.18)',
                                    }}>
                                        <Text style={{ color: '#ef4444', fontSize: 14, fontWeight: '600' }}>{t('analytics.deleteGoal')}</Text>
                                    </TouchableOpacity>
                                ) : (
                                    <View style={{ backgroundColor: 'rgba(239,68,68,0.05)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(239,68,68,0.15)' }}>
                                        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', marginBottom: 4 }}>
                                            {t('analytics.deleteGoalMsg', { name: g.name })}
                                        </Text>
                                        {g.saved > 0 && (
                                            <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center', marginBottom: 12 }}>
                                                {t('analytics.goalBalance', { amount: formatAmount(g.saved, g.currency) })}
                                            </Text>
                                        )}

                                        {g.saved > 0 && (
                                            <>
                                                <Text style={{ fontSize: 12, color: colors.textMuted, fontWeight: '600', marginBottom: 10 }}>
                                                    {t('analytics.whereToTransfer')}
                                                </Text>

                                                {/* Option: to account */}
                                                <TouchableOpacity onPress={() => setDeleteTransferMode('account')} style={{
                                                    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12,
                                                    borderRadius: 12, marginBottom: 6,
                                                    backgroundColor: deleteTransferMode === 'account' ? 'rgba(124,111,255,0.12)' : 'rgba(255,255,255,0.04)',
                                                    borderWidth: 1.5,
                                                    borderColor: deleteTransferMode === 'account' ? '#7C6FFF' : 'transparent',
                                                }}>
                                                    <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: deleteTransferMode === 'account' ? '#7C6FFF' : 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                                                        {deleteTransferMode === 'account' && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#7C6FFF' }} />}
                                                    </View>
                                                    <Text style={{ color: colors.textPrimary, fontSize: 14, flex: 1 }}>{t('analytics.toAccount')}</Text>
                                                </TouchableOpacity>
                                                {deleteTransferMode === 'account' && (
                                                    <View style={{ marginLeft: 28, marginBottom: 8, gap: 4 }}>
                                                        {accounts.map(acc => (
                                                            <TouchableOpacity key={acc.id} onPress={() => setDeleteTransferAccountId(acc.id)} style={{
                                                                flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10,
                                                                borderRadius: 10,
                                                                backgroundColor: deleteTransferAccountId === acc.id ? 'rgba(124,111,255,0.1)' : 'transparent',
                                                            }}>
                                                                <Text style={{ fontSize: 16 }}>{acc.icon ?? '🏦'}</Text>
                                                                <Text style={{ color: deleteTransferAccountId === acc.id ? '#a78bfa' : colors.textSecondary, fontSize: 13, fontWeight: deleteTransferAccountId === acc.id ? '600' : '400' }}>
                                                                    {acc.name}
                                                                </Text>
                                                                {deleteTransferAccountId === acc.id && <Text style={{ color: '#7C6FFF', fontSize: 12, marginLeft: 'auto' }}>✓</Text>}
                                                            </TouchableOpacity>
                                                        ))}
                                                    </View>
                                                )}

                                                {/* Option: to another goal */}
                                                {goalsState.filter(og => og.id !== g.id).length > 0 && (
                                                    <>
                                                        <TouchableOpacity onPress={() => setDeleteTransferMode('goal')} style={{
                                                            flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12,
                                                            borderRadius: 12, marginBottom: 6,
                                                            backgroundColor: deleteTransferMode === 'goal' ? 'rgba(124,111,255,0.12)' : 'rgba(255,255,255,0.04)',
                                                            borderWidth: 1.5,
                                                            borderColor: deleteTransferMode === 'goal' ? '#7C6FFF' : 'transparent',
                                                        }}>
                                                            <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: deleteTransferMode === 'goal' ? '#7C6FFF' : 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                                                                {deleteTransferMode === 'goal' && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#7C6FFF' }} />}
                                                            </View>
                                                            <Text style={{ color: colors.textPrimary, fontSize: 14, flex: 1 }}>{t('analytics.toGoal')}</Text>
                                                        </TouchableOpacity>
                                                        {deleteTransferMode === 'goal' && (
                                                            <View style={{ marginLeft: 28, marginBottom: 8, gap: 4 }}>
                                                                {goalsState.filter(og => og.id !== g.id).map(og => (
                                                                    <TouchableOpacity key={og.id} onPress={() => setDeleteTransferGoalId(og.id)} style={{
                                                                        flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10,
                                                                        borderRadius: 10,
                                                                        backgroundColor: deleteTransferGoalId === og.id ? 'rgba(124,111,255,0.1)' : 'transparent',
                                                                    }}>
                                                                        <Text style={{ fontSize: 16 }}>{og.icon}</Text>
                                                                        <Text style={{ color: deleteTransferGoalId === og.id ? '#a78bfa' : colors.textSecondary, fontSize: 13, fontWeight: deleteTransferGoalId === og.id ? '600' : '400' }}>
                                                                            {og.name}
                                                                        </Text>
                                                                        {deleteTransferGoalId === og.id && <Text style={{ color: '#7C6FFF', fontSize: 12, marginLeft: 'auto' }}>✓</Text>}
                                                                    </TouchableOpacity>
                                                                ))}
                                                            </View>
                                                        )}
                                                    </>
                                                )}

                                                {/* Option: don't transfer */}
                                                <TouchableOpacity onPress={() => setDeleteTransferMode('none')} style={{
                                                    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12,
                                                    borderRadius: 12, marginBottom: 14,
                                                    backgroundColor: deleteTransferMode === 'none' ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.04)',
                                                    borderWidth: 1.5,
                                                    borderColor: deleteTransferMode === 'none' ? '#ef4444' : 'transparent',
                                                }}>
                                                    <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: deleteTransferMode === 'none' ? '#ef4444' : 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                                                        {deleteTransferMode === 'none' && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' }} />}
                                                    </View>
                                                    <Text style={{ color: deleteTransferMode === 'none' ? '#ef4444' : colors.textMuted, fontSize: 14, flex: 1 }}>{t('analytics.dontTransfer')}</Text>
                                                </TouchableOpacity>
                                            </>
                                        )}

                                        <View style={{ flexDirection: 'row', gap: 10 }}>
                                            <TouchableOpacity onPress={() => setShowDeleteGoal(false)} style={{
                                                flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
                                                backgroundColor: 'rgba(255,255,255,0.06)',
                                            }}>
                                                <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: '600' }}>{t('common.cancel')}</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={confirmDeleteGoal} disabled={deletingGoal} style={{
                                                flex: 2, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
                                                backgroundColor: '#ef4444', opacity: deletingGoal ? 0.5 : 1,
                                            }}>
                                                {deletingGoal
                                                    ? <ActivityIndicator color="#fff" />
                                                    : <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }}>
                                                        {g.saved > 0 && deleteTransferMode !== 'none' ? t('analytics.deleteAndTransfer') : t('common.delete')}
                                                    </Text>
                                                }
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )}

                                <View style={{ height: 20 }} />
                            </ScrollView>
                        );
                    })()}
            </BaseBottomSheet>

            {/* ══ ADD/EDIT DEPOSIT MODAL ═══════════════════════════════════ */}
            <BaseBottomSheet visible={showAddDeposit} onClose={closeDepositModal} maxHeight="92%">

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
                                <Text style={{ fontSize: 18, fontFamily: fonts.bodyBold, color: colors.textPrimary }}>{editingDeposit ? t('analytics.editDeposit') : t('analytics.newDeposit')}</Text>
                                <Text style={{ fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginTop: 1 }}>
                                    {depositName.trim() || t('analytics.goalFormEnterName')}
                                </Text>
                            </View>
                            <TouchableOpacity onPress={closeDepositModal} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bgTertiary, alignItems: 'center', justifyContent: 'center' }}>
                                <X color={colors.textMuted} size={16} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                            {/* ── Иконка ── */}
                            <Text style={labelStyle}>{t('common.icon')}</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                                <View style={{ flexDirection: 'row', gap: 6 }}>
                                    {['Landmark', 'Banknote', 'Wallet', 'CreditCard', 'Coins', 'CircleDollarSign', 'TrendingUp', 'Building2', 'Briefcase', 'Bitcoin'].map(ic => (
                                        <TouchableOpacity key={ic} onPress={() => setDepositIcon(ic)} style={{
                                            width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                                            backgroundColor: depositIcon === ic ? 'rgba(124,111,255,0.25)' : 'rgba(255,255,255,0.05)',
                                            borderWidth: 1.5,
                                            borderColor: depositIcon === ic ? '#7C6FFF' : 'transparent',
                                        }}>
                                            <CategoryIcon iconName={ic} color={depositIcon === ic ? '#7C6FFF' : colors.textMuted} size={20} />
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </ScrollView>

                            {/* ── Цвет ── */}
                            <Text style={labelStyle}>{t('common.color')}</Text>
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
                            <Text style={labelStyle}>{t('common.name')}</Text>
                            <TextInput
                                style={inputStyle}
                                placeholder={t('analytics.depositNamePlaceholder')}
                                placeholderTextColor={colors.textDisabled}
                                value={depositName}
                                onChangeText={setDepositName}
                            />

                            {/* Amount + Currency (unified) */}
                            <Text style={labelStyle}>{t('analytics.depositAmount')}</Text>
                            <View style={{
                                flexDirection: 'row', alignItems: 'center', marginBottom: 8,
                                backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12,
                                borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)',
                                paddingHorizontal: 14,
                                opacity: editingDeposit ? 0.85 : 1,
                            }}>
                                <TextInput
                                    style={{ flex: 1, paddingVertical: 12, color: '#fff', fontSize: 15, fontFamily: fonts.body }}
                                    keyboardType="numeric"
                                    placeholder="25000"
                                    placeholderTextColor={colors.textDisabled}
                                    value={depositAmount}
                                    onChangeText={setDepositAmount}
                                    editable={!editingDeposit}
                                />
                                <TouchableOpacity
                                    onPress={() => !editingDeposit && setShowDepositCurrencyDropdown(true)}
                                    activeOpacity={editingDeposit ? 1 : 0.7}
                                    style={{
                                        flexDirection: 'row', alignItems: 'center', gap: 6,
                                        paddingLeft: 12, paddingVertical: 12,
                                        borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.15)',
                                    }}
                                >
                                    <Text style={{ fontSize: 16 }}>{CURRENCIES.find(c => c.code === depositCurrency)?.flag}</Text>
                                    <Text style={{ color: '#fff', fontSize: 14, fontFamily: fonts.bodySemiBold }}>{depositCurrency}</Text>
                                    {!editingDeposit && <Text style={{ color: colors.textMuted, fontSize: 11 }}>▾</Text>}
                                </TouchableOpacity>
                            </View>

                            {/* From account (create mode only) */}
                            {!editingDeposit && (
                                <View style={{ marginBottom: 12 }}>
                                    <Text style={{ fontSize: 11, color: colors.textDisabled, marginBottom: 4 }}>{t('analytics.fromAccountOpt')}</Text>
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
                                                        <Text style={{ fontSize: 13, color: sel ? '#7C6FFF' : colors.textMuted, fontWeight: '600' }}>{acc.name}</Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </ScrollView>
                                    {topUpAccountId && (() => {
                                        const srcAcc = accounts.find(a => a.id === topUpAccountId);
                                        const transferAmt = parseFloat(depositAmount || '0');
                                        if (srcAcc && transferAmt > srcAcc.balance) {
                                            return <Text style={{ fontSize: 11, color: '#FFB84F', marginTop: 4 }}>{t('analytics.insufficientOnAccount', { amount: formatAmount(srcAcc.balance, srcAcc.currency) })}</Text>;
                                        }
                                        return null;
                                    })()}
                                </View>
                            )}

                            {/* Top-up section (edit mode only — always open) */}
                            {editingDeposit && (
                                <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(79,255,176,0.15)' }}>
                                    <Text style={{ fontSize: 14, fontFamily: fonts.bodySemiBold, color: colors.textPrimary, marginBottom: 12 }}>{t('analytics.topUpDeposit')}</Text>

                                    <Text style={labelStyle}>{t('analytics.sum')}</Text>
                                    <TextInput
                                        value={depositTopUpAmount}
                                        onChangeText={setDepositTopUpAmount}
                                        placeholder="0"
                                        placeholderTextColor={colors.textDisabled}
                                        keyboardType="decimal-pad"
                                        style={inputStyle}
                                    />

                                    <Text style={labelStyle}>{t('analytics.fromAccount')}</Text>
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
                                                        <Text style={{ color: sel ? '#a78bfa' : '#fff', fontSize: 13, fontFamily: fonts.body }}>{acc.name}</Text>
                                                        <Text style={{ color: colors.textMuted, fontSize: 11, fontFamily: fonts.body }}>{formatAmount(acc.balance, acc.currency)}</Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </ScrollView>

                                    {depositTopUpAccountId && (() => {
                                        const srcAcc = accounts.find(a => a.id === depositTopUpAccountId);
                                        const amt = parseFloat(depositTopUpAmount.replace(',', '.')) || 0;
                                        if (srcAcc && amt > srcAcc.balance) {
                                            return <Text style={{ fontSize: 11, fontFamily: fonts.body, color: '#FFB84F', marginBottom: 4 }}>{t('analytics.insufficientFunds', { amount: formatAmount(srcAcc.balance, srcAcc.currency) })}</Text>;
                                        }
                                        return null;
                                    })()}

                                    <Text style={labelStyle}>{t('common.date')}</Text>
                                    <TouchableOpacity onPress={() => setShowDepositTopUpDatePicker(!showDepositTopUpDatePicker)} style={{
                                        backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12,
                                        paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
                                        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)',
                                    }}>
                                        <Text style={{ color: colors.textPrimary, fontSize: 14, fontFamily: fonts.body }}>{format(depositTopUpDate, 'dd.MM.yyyy')}</Text>
                                    </TouchableOpacity>
                                    {showDepositTopUpDatePicker && (
                                        <DateTimePicker value={depositTopUpDate} mode="date" display="inline" themeVariant="dark"
                                            onChange={(_, d) => { setShowDepositTopUpDatePicker(false); if (d) setDepositTopUpDate(d); }} />
                                    )}

                                    <TouchableOpacity onPress={confirmDepositTopUp} disabled={savingDepositTopUp || !depositTopUpAmount.trim()} style={{
                                        paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 8,
                                        backgroundColor: '#4FFFB0', opacity: savingDepositTopUp || !depositTopUpAmount.trim() ? 0.5 : 1,
                                    }}>
                                        {savingDepositTopUp
                                            ? <ActivityIndicator color="#000" />
                                            : <Text style={{ color: '#000', fontSize: 14, fontFamily: fonts.bodySemiBold }}>{t('analytics.topUpGoal')}</Text>
                                        }
                                    </TouchableOpacity>
                                </View>
                            )}

                            {/* Currency dropdown */}
                            <Modal visible={showDepositCurrencyDropdown} transparent animationType="fade">
                                <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} activeOpacity={1}
                                    onPress={() => { setShowDepositCurrencyDropdown(false); setDepositCurrencySearch(''); }} />
                                <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.bgSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingBottom: 40, maxHeight: '60%' }}>
                                    <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 16 }} />
                                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary, paddingHorizontal: 20, marginBottom: 12 }}>{t('analytics.currency')}</Text>
                                    <View style={{ marginHorizontal: 20, marginBottom: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
                                        <Text style={{ fontSize: 15, color: colors.textDisabled, marginRight: 8 }}>🔍</Text>
                                        <TextInput
                                            value={depositCurrencySearch}
                                            onChangeText={setDepositCurrencySearch}
                                            placeholder={t('analytics.searchCurrency')}
                                            placeholderTextColor={colors.textDisabled}
                                            style={{ flex: 1, color: colors.textPrimary, fontSize: 14 }}
                                            autoCorrect={false} autoCapitalize="none"
                                        />
                                        {depositCurrencySearch.length > 0 && (
                                            <TouchableOpacity onPress={() => setDepositCurrencySearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                                <Text style={{ color: colors.textDisabled, fontSize: 16 }}>✕</Text>
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
                                                        <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }}>{c.name}</Text>
                                                    </View>
                                                    {selected && <Text style={{ color: '#7C6FFF', fontSize: 16 }}>✓</Text>}
                                                </TouchableOpacity>
                                            );
                                        }}
                                    />
                                </View>
                            </Modal>

                            {/* Compounding */}
                            <Text style={labelStyle}>{t('analytics.compounding')}</Text>
                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
                                {(['monthly', 'yearly'] as const).map(c => (
                                    <TouchableOpacity key={c} onPress={() => setDepositCompounding(c)}
                                        style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: depositCompounding === c ? 'rgba(124,111,255,0.2)' : 'rgba(255,255,255,0.06)', borderWidth: 1.5, borderColor: depositCompounding === c ? 'rgba(124,111,255,0.4)' : 'rgba(255,255,255,0.08)' }}>
                                        <Text style={{ fontSize: 13, color: depositCompounding === c ? '#7C6FFF' : colors.textMuted, fontWeight: '600' }}>
                                            {c === 'monthly' ? t('analytics.monthly') : t('analytics.yearly')}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Start date */}
                            <Text style={labelStyle}>{t('analytics.startDate')}</Text>
                            <TouchableOpacity onPress={() => setShowDepositStartPicker(true)}
                                style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 4, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)' }}>
                                <Text style={{ color: colors.textPrimary, fontSize: 14 }}>{format(depositStartDate, 'dd.MM.yyyy')}</Text>
                            </TouchableOpacity>
                            {showDepositStartPicker && (
                                <DateTimePicker value={depositStartDate} mode="date" display="inline" themeVariant="dark"
                                    onChange={(_, d) => { setShowDepositStartPicker(false); if (d) setDepositStartDate(d); }} />
                            )}

                            {/* End date (optional) */}
                            <Text style={[labelStyle, { marginTop: 12 }]}>{t('analytics.endDate')}</Text>
                            <TouchableOpacity onPress={() => { if (depositEndDate) { setDepositEndDate(null); } else { setDepositEndDate(addMonths(new Date(), 12)); setShowDepositEndPicker(true); } }}
                                style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 4, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)' }}>
                                <Text style={{ color: depositEndDate ? '#fff' : colors.textDisabled, fontSize: 14 }}>
                                    {depositEndDate ? format(depositEndDate, 'dd.MM.yyyy') : t('analytics.noTerm')}
                                </Text>
                            </TouchableOpacity>
                            {showDepositEndPicker && depositEndDate && (
                                <DateTimePicker value={depositEndDate} mode="date" display="inline" themeVariant="dark"
                                    onChange={(_, d) => { setShowDepositEndPicker(false); if (d) setDepositEndDate(d); }} />
                            )}

                            {/* ── Rate Periods (compact list) ── */}
                            <View style={{ marginTop: 16 }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <Text style={labelStyle}>{t('analytics.ratePeriods')}</Text>
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
                                                <Text style={{ color: '#7C6FFF', fontSize: 13, fontWeight: '600', opacity: canAdd ? 1 : 0.3 }}>{t('analytics.addPeriod')}</Text>
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
                                        const endLabel = period.toDate ? format(period.toDate, 'dd.MM.yyyy') : t('analytics.indefinite');
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
                                                        <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                                                            {format(fromDate, 'dd.MM.yyyy')} — <Text style={{ color: period.toDate ? colors.textSecondary : colors.textDisabled }}>{endLabel}</Text>
                                                        </Text>
                                                    </TouchableOpacity>

                                                    {/* Rate input */}
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                        <TextInput
                                                            style={{
                                                                backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8,
                                                                color: colors.textPrimary, fontSize: 14, fontWeight: '600',
                                                                paddingHorizontal: 10, paddingVertical: 6,
                                                                minWidth: 48, textAlign: 'center',
                                                                borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
                                                            }}
                                                            keyboardType="numeric"
                                                            placeholder="0"
                                                            placeholderTextColor={colors.textDisabled}
                                                            value={period.rate}
                                                            onChangeText={v => {
                                                                const updated = [...ratePeriodDrafts];
                                                                updated[idx] = { ...updated[idx], rate: v };
                                                                setRatePeriodDrafts(updated);
                                                            }}
                                                        />
                                                        <Text style={{ color: colors.textMuted, fontSize: 13 }}>%</Text>
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
                                                                <Text style={{ color: !period.toDate ? '#7C6FFF' : colors.textMuted, fontSize: 12, fontWeight: '600' }}>{t('analytics.indefiniteCap')}</Text>
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
                                <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '700' }}>{savingDeposit ? `${t('common.save')}…` : t('common.save')}</Text>
                            </TouchableOpacity>
                        </ScrollView>
            </BaseBottomSheet>


            {/* ══ EXTRAS CONFIG MODAL ═════════════════════════════════════ */}
            <BaseBottomSheet visible={showExtrasModal} onClose={() => setShowExtrasModal(false)} maxHeight="80%" scrollable={false}>
                        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 }}>{t('analytics.extrasTitle')}</Text>
                        <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 16 }}>
                            {t('analytics.extrasHint')}
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
                                                        if (next.has(cat.id)) { next.delete(cat.id); } else { next.add(cat.id); }
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
                                                <Text style={{ fontSize: 14, color: colors.textPrimary }}>{cat.name}</Text>
                                                {hasTags && (
                                                    <Text style={{ fontSize: 10, color: colors.textDisabled, marginTop: 1 }}>
                                                        {isExpanded ? '▼' : '▶'} {t('analytics.subcategories', { count: cat.tags.length })}
                                                    </Text>
                                                )}
                                            </View>
                                            {/* Category-level toggle (only if no tags, or as whole-category extra) */}
                                            {!hasTags && catDraft && (
                                                <>
                                                    {catDraft.active && (
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 10 }}>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 6, height: 30 }}>
                                                                <Text style={{ fontSize: 12, color: colors.textDisabled }}>{getCurrencySymbol(currency)}</Text>
                                                                <TextInput
                                                                    style={{ width: 36, height: 30, color: colors.textPrimary, fontSize: 12, textAlign: 'center' }}
                                                                    keyboardType="numeric"
                                                                    placeholder="0"
                                                                    placeholderTextColor={colors.textDisabled}
                                                                    value={catDraft.amount}
                                                                    onChangeText={v => setExtraDraft(prev => ({ ...prev, [`cat:${cat.id}`]: { ...prev[`cat:${cat.id}`], amount: v.replace(/[^0-9.]/g, '') } }))}
                                                                />
                                                            </View>
                                                            <Text style={{ fontSize: 10, color: colors.textDisabled, marginLeft: 4 }}>{t('analytics.perMonth')}</Text>
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
                                                        <Text style={{ fontSize: 11, color: colors.textDisabled, marginRight: 4 }}>└</Text>
                                                        <Text style={{ flex: 1, fontSize: 13, color: colors.textSecondary }}>{t('analytics.wholeCategory')}</Text>
                                                        {catDraft.active && (
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 10 }}>
                                                                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 6, height: 28 }}>
                                                                    <Text style={{ fontSize: 12, color: colors.textDisabled }}>{getCurrencySymbol(currency)}</Text>
                                                                    <TextInput
                                                                        style={{ width: 40, height: 28, color: colors.textPrimary, fontSize: 12, textAlign: 'center' }}
                                                                        keyboardType="numeric"
                                                                        placeholder="0"
                                                                        placeholderTextColor={colors.textDisabled}
                                                                        value={catDraft.amount}
                                                                        onChangeText={v => setExtraDraft(prev => ({ ...prev, [`cat:${cat.id}`]: { ...prev[`cat:${cat.id}`], amount: v.replace(/[^0-9.]/g, '') } }))}
                                                                    />
                                                                </View>
                                                                <Text style={{ fontSize: 9, color: colors.textDisabled, marginLeft: 3 }}>{t('analytics.perMonth')}</Text>
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
                                                            <Text style={{ fontSize: 11, color: colors.textDisabled, marginRight: 4 }}>└</Text>
                                                            <Text style={{ flex: 1, fontSize: 13, color: colors.textPrimary }}>{tag.name}</Text>
                                                            {tagDraft.active && (
                                                                <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 10 }}>
                                                                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 6, height: 28 }}>
                                                                        <Text style={{ fontSize: 12, color: colors.textDisabled }}>{getCurrencySymbol(currency)}</Text>
                                                                        <TextInput
                                                                            style={{ width: 40, height: 28, color: colors.textPrimary, fontSize: 12, textAlign: 'center' }}
                                                                            keyboardType="numeric"
                                                                            placeholder="0"
                                                                            placeholderTextColor={colors.textDisabled}
                                                                            value={tagDraft.amount}
                                                                            onChangeText={v => setExtraDraft(prev => ({ ...prev, [`tag:${tag.id}`]: { ...prev[`tag:${tag.id}`], amount: v.replace(/[^0-9.]/g, '') } }))}
                                                                        />
                                                                    </View>
                                                                    <Text style={{ fontSize: 9, color: colors.textDisabled, marginLeft: 3 }}>{t('analytics.perMonth')}</Text>
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
                            disabled={savingExtras || !Object.values(extraDraft).some(d => d.active && parseFloat(d.amount) > 0)}
                            style={{
                                marginTop: 16, paddingVertical: 14,
                                backgroundColor: '#7C6FFF', borderRadius: 14,
                                alignItems: 'center', opacity: savingExtras || !Object.values(extraDraft).some(d => d.active && parseFloat(d.amount) > 0) ? 0.35 : 1,
                            }}>
                            <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '700' }}>
                                {savingExtras ? `${t('common.save')}…` : t('common.save')}
                            </Text>
                        </TouchableOpacity>
            </BaseBottomSheet>

            {/* Add watched categories sheet */}
            <BaseBottomSheet visible={showAddWatchedSheet} onClose={() => setShowAddWatchedSheet(false)} maxHeight="75%">
                <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700', marginBottom: 16 }}>{t('analytics.selectCategories')}</Text>
                {allCategories.map(cat => {
                    const isWatched = watchedCategoryIds.includes(cat.id);
                    const catWithExpenses = overviewByPeriod[catPeriod]?.categories?.find(c => c.id === cat.id);
                    return (
                        <TouchableOpacity key={cat.id} onPress={() => toggleWatchedCategory(cat.id)}
                            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' }}>
                            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: cat.color + '22', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                <CategoryIcon iconName={cat.icon} color={cat.color} size={18} />
                            </View>
                            <Text style={{ flex: 1, color: colors.textPrimary, fontSize: 15 }}>{cat.name}</Text>
                            {catWithExpenses && <Text style={{ color: colors.textMuted, fontSize: 12, marginRight: 12 }}>{formatAmount(catWithExpenses.amount, currency)}</Text>}
                            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: isWatched ? '#7C6FFF' : 'transparent', borderWidth: 2, borderColor: isWatched ? '#7C6FFF' : colors.borderLight, alignItems: 'center', justifyContent: 'center' }}>
                                {isWatched && <Check color="#fff" size={14} />}
                            </View>
                        </TouchableOpacity>
                    );
                })}
                <TouchableOpacity onPress={() => setShowAddWatchedSheet(false)}
                    style={{ marginTop: 20, paddingVertical: 14, borderRadius: 14, backgroundColor: '#7C6FFF', alignItems: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{t('common.done')}</Text>
                </TouchableOpacity>
            </BaseBottomSheet>

            {/* Category detail bottom sheet */}
            <BaseBottomSheet visible={!!selectedCategory} onClose={() => setSelectedCategory(null)} maxHeight="85%">
                {selectedCategory && (
                    <>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: (selectedCategory.color ?? '#888') + '22', alignItems: 'center', justifyContent: 'center' }}>
                                <CategoryIcon iconName={selectedCategory.icon ?? 'ShoppingCart'} color={selectedCategory.color ?? '#888'} size={22} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700' }}>{selectedCategory.name}</Text>
                                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                                    {selectedCategory.percent.toFixed(1)}% {t('analytics.ofExpenses')}
                                </Text>
                            </View>
                            <Text style={{ color: '#f87171', fontSize: 18, fontWeight: '700' }}>
                                −{formatAmount(selectedCategory.amount, selectedCategory.currency)}
                            </Text>
                        </View>

                        {categoryPrevAmount > 0 && (
                            <View style={{ backgroundColor: colors.bgTertiary, borderRadius: 12, padding: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t('analytics.prevPeriod')}</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600' }}>
                                        {formatAmount(categoryPrevAmount, selectedCategory.currency)}
                                    </Text>
                                    {selectedCategory.amount > categoryPrevAmount ? (
                                        <Text style={{ color: '#f87171', fontSize: 12 }}>
                                            ↑ {(((selectedCategory.amount - categoryPrevAmount) / categoryPrevAmount) * 100).toFixed(0)}%
                                        </Text>
                                    ) : (
                                        <Text style={{ color: '#22c55e', fontSize: 12 }}>
                                            ↓ {(((categoryPrevAmount - selectedCategory.amount) / categoryPrevAmount) * 100).toFixed(0)}%
                                        </Text>
                                    )}
                                </View>
                            </View>
                        )}

                        <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginBottom: 10 }}>
                            {t('analytics.transactionsLabel')}
                        </Text>

                        {loadingCategoryTxs ? (
                            <ActivityIndicator color="#7C6FFF" style={{ marginVertical: 20 }} />
                        ) : categoryTxs.length === 0 ? (
                            <Text style={{ color: colors.textDisabled, fontSize: 14, textAlign: 'center', paddingVertical: 20 }}>
                                {t('analytics.noTransactions')}
                            </Text>
                        ) : (
                            categoryTxs.map((tx: any) => (
                                <View key={tx.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.bgTertiary }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: colors.textPrimary, fontSize: 14 }} numberOfLines={1}>
                                            {tx.note || selectedCategory.name}
                                        </Text>
                                        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                                            {format(new Date(tx.date), 'd MMM', { locale: ru })}
                                        </Text>
                                    </View>
                                    <Text style={{ color: '#f87171', fontSize: 14, fontWeight: '600' }}>
                                        −{formatAmount(tx.amount, tx.currency)}
                                    </Text>
                                </View>
                            ))
                        )}
                    </>
                )}
            </BaseBottomSheet>

        </View>
    );
}
