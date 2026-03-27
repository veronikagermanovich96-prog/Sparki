import {
    Activity, ArrowRightLeft, Award,
    Banknote, Bike, Bitcoin, BookOpen, Briefcase, Building2, Bus,
    Camera, Car, Check, ChevronDown, ChevronRight, CircleDollarSign, Coffee, Coins, CreditCard,
    Droplets, Dumbbell, Film, Flag, Flame, Fuel, Gift, Globe, GraduationCap,
    Heart, Home, Landmark, MapPin, Monitor, Music,
    Package, PawPrint, Pill, Plane, Plus, Receipt, Scissors,
    Repeat, Search, ShoppingBag, ShoppingCart, Shirt, Sofa, Star,
    Tag, Train, TrendingDown, TrendingUp, Trophy, Tv, Utensils,
    SlidersHorizontal, Wallet, Wifi, X, Zap,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator, Alert, ScrollView, SectionList,
    Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { BaseBottomSheet } from '@/components/ui/BaseBottomSheet';
import DateTimePicker from '@react-native-community/datetimepicker';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useFocusEffect } from 'expo-router';
import { endOfDay, format, startOfDay, startOfMonth, startOfWeek, startOfYear, subDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { formatAmount } from '@/constants/currencies';
import TransactionForm from '@/components/TransactionForm';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';

// ─── Icon map ─────────────────────────────────────────────────────────────────

type IconComp = React.ComponentType<{ color: string; size: number }>;

const ICON_MAP: Record<string, IconComp> = {
    // Food & Drink
    ShoppingCart, Coffee, Utensils, ShoppingBag,
    // Transport
    Car, Bus, Bike, Train, Plane, Fuel, Ship: undefined as any,
    // Home & Utilities
    Home, Sofa, Zap, Wifi, Flame, Droplets,
    // Health & Sport
    Heart, Dumbbell, Activity, Pill,
    // Entertainment
    Film, Music, Tv, Monitor, Trophy, Star,
    // Shopping & Style
    Shirt, Tag, Gift, Scissors,
    // Travel
    MapPin, Globe,
    // Education
    BookOpen, GraduationCap,
    // Finance
    CreditCard, Wallet, PiggyBank: undefined as any,
    Coins, Banknote, Landmark, Bitcoin, CircleDollarSign, TrendingUp, TrendingDown,
    // Work & Business
    Briefcase, Building2, Receipt, Package,
    // Other
    PawPrint, Award, Flag, ArrowRightLeft,
};

// Filter out undefined (aliases we'll skip)
const ICON_KEYS = Object.keys(ICON_MAP).filter(k => !!ICON_MAP[k]);

// Re-export cleaned map
const CAT_ICONS = ICON_KEYS.reduce<Record<string, IconComp>>((acc, k) => {
    acc[k] = ICON_MAP[k]!;
    return acc;
}, {});


// ─── Types ────────────────────────────────────────────────────────────────────

interface TxRow {
    id: string;
    type: 'income' | 'expense' | 'transfer';
    amount: number;
    currency: string;
    amount_base: number | null;
    exchange_rate: number | null;
    date: string;
    note: string | null;
    receipt_url: string | null;
    recurring_id: string | null;
    account_id: string;
    account_name: string;
    account_color: string | null;
    category_id: string | null;
    category_name: string;
    category_icon: string | null;
    category_color: string | null;
    expense_type: string | null;
    tag_id: string | null;
    tag_name: string | null;
}

type AccountLight   = { id: string; name: string; color: string | null; currency: string; balance: number };
type CategoryLight  = { id: string; name: string; slug: string | null; icon: string | null; color: string | null; type: 'income' | 'expense'; expense_type: string | null; is_system: boolean };
type TagLight       = { id: string; name: string };

type FilterType        = 'all' | 'income' | 'expense' | 'transfer';
type FilterPeriod      = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom';
type FilterExpenseType = 'all' | 'base' | 'everyday' | 'development' | 'forself' | 'work' | 'other';
function getPeriodRange(p: FilterPeriod, customFrom?: Date | null, customTo?: Date | null): { from: string | null; to: string | null } {
    const now = new Date();
    if (p === 'today')     return { from: format(startOfDay(now), 'yyyy-MM-dd'), to: format(endOfDay(now), 'yyyy-MM-dd') };
    if (p === 'yesterday') { const y = subDays(now, 1); return { from: format(startOfDay(y), 'yyyy-MM-dd'), to: format(endOfDay(y), 'yyyy-MM-dd') }; }
    if (p === 'week')      return { from: format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'), to: null };
    if (p === 'month')     return { from: format(startOfMonth(now), 'yyyy-MM-dd'), to: null };
    if (p === 'year')      return { from: format(startOfYear(now), 'yyyy-MM-dd'), to: null };
    if (p === 'custom')    return {
        from: customFrom ? format(startOfDay(customFrom), 'yyyy-MM-dd') : format(startOfMonth(now), 'yyyy-MM-dd'),
        to:   customTo   ? format(endOfDay(customTo),   'yyyy-MM-dd') : null,
    };
    return { from: null, to: null };
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function TransactionsScreen() {
    const { colors } = useTheme();
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();

    // ── Data ─────────────────────────────────────────────────────────────────
    const [txs,        setTxs]        = useState<TxRow[]>([]);
    const [accounts,   setAccounts]   = useState<AccountLight[]>([]);
    const [categories, setCategories] = useState<CategoryLight[]>([]);
    const [householdId,  setHouseholdId]  = useState('');
    const [userId,       setUserId]       = useState('');
    const [baseCurrency, setBaseCurrency] = useState('EUR');
    const [loading,      setLoading]      = useState(true);

    // ── Filters ──────────────────────────────────────────────────────────────
    const [search,             setSearch]             = useState('');
    const [searchVisible,      setSearchVisible]      = useState(false);
    const [filterType,         setFilterType]         = useState<FilterType>('all');
    const [filterPeriod,       setFilterPeriod]       = useState<FilterPeriod>('month');
    const [filterAccountId,    setFilterAccountId]    = useState<string | null>(null);
    const [filterCategoryId,   setFilterCategoryId]   = useState<string | null>(null);
    const [filterTagId,        setFilterTagId]        = useState<string | null>(null);
    const [filterSheetTags,    setFilterSheetTags]    = useState<TagLight[]>([]);
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
    const [filterExpenseType,  setFilterExpenseType]  = useState<FilterExpenseType>('all');
    const [filterRecurring,    setFilterRecurring]    = useState<'all' | 'recurring' | 'non_recurring'>('all');
    const [customFrom,         setCustomFrom]         = useState<Date | null>(null);
    const [customTo,           setCustomTo]           = useState<Date | null>(null);
    const [periodSheetVisible, setPeriodSheetVisible] = useState(false);
    const [activeSheet,        setActiveSheet]        = useState<'account' | 'category' | 'expensetype' | 'recurring' | 'filters' | null>(null);
    const [showCustomFrom,     setShowCustomFrom]     = useState(false);
    const [showCustomTo,       setShowCustomTo]       = useState(false);

    // ── Transaction form ──────────────────────────────────────────────────────
    const [formVisible,    setFormVisible]    = useState(false);
    const [editingTx,      setEditingTx]      = useState<TxRow | null>(null);

    // ── Load ─────────────────────────────────────────────────────────────────

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useFocusEffect(useCallback(() => { loadData(); }, []));

    useEffect(() => {
        if (!householdId) return;
        setLoading(true);
        fetchTxs(householdId, filterType, filterPeriod, filterAccountId, filterCategoryId, filterExpenseType, customFrom, customTo, filterRecurring, filterTagId)
            .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterType, filterPeriod, filterAccountId, filterCategoryId, filterExpenseType, customFrom, customTo, filterRecurring, filterTagId]);

    async function loadData() {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }
        setUserId(user.id);

        const { data: member } = await supabase
            .from('household_members').select('household_id').eq('user_id', user.id).single();
        if (!member) { setLoading(false); return; }

        const hid = member.household_id;

        const [accsRes, catsRes, houseRes] = await Promise.all([
            supabase.from('accounts').select('id, name, color, currency, balance')
                .eq('household_id', hid).eq('is_deleted', false).order('created_at'),
            supabase.from('categories').select('id, name, slug, icon, color, type, expense_type, is_system')
                .eq('household_id', hid).eq('is_hidden', false),
            supabase.from('households').select('base_currency').eq('id', hid).single(),
        ]);

        setAccounts(accsRes.data ?? []);
        setCategories(catsRes.data ?? []);
        setBaseCurrency(houseRes.data?.base_currency ?? 'EUR');

        await fetchTxs(hid, filterType, filterPeriod, filterAccountId, filterCategoryId, filterExpenseType, customFrom, customTo, filterRecurring);
        setHouseholdId(hid);
        setLoading(false);
    }

    async function fetchTxs(
        hid: string, type: FilterType, period: FilterPeriod,
        accId: string | null, catId: string | null,
        expType: FilterExpenseType = 'all',
        cFrom: Date | null = null, cTo: Date | null = null,
        recurFilter: 'all' | 'recurring' | 'non_recurring' = 'all',
        tagId: string | null = null,
    ) {
        const { from, to } = getPeriodRange(period, cFrom, cTo);
        let q = supabase
            .from('transactions')
            .select('id, type, amount, currency, amount_base, exchange_rate, date, note, receipt_url, recurring_id, account_id, category_id, tag_id, category_tags(name), categories(name, icon, color, expense_type), accounts(name, color)')
            .eq('household_id', hid).eq('is_deleted', false)
            .order('date', { ascending: false }).order('created_at', { ascending: false }).limit(500);

        if (from)                        q = q.gte('date', from);
        if (to)                          q = q.lte('date', to);
        if (type !== 'all')              q = q.eq('type', type);
        if (accId)                       q = q.eq('account_id', accId);
        if (catId)                       q = q.eq('category_id', catId);
        if (expType !== 'all')           q = q.eq('expense_type', expType);
        if (recurFilter === 'recurring')     q = q.not('recurring_id', 'is', null);
        if (recurFilter === 'non_recurring') q = q.is('recurring_id', null);
        if (tagId)                           q = q.eq('tag_id', tagId);

        const { data } = await q;
        setTxs((data ?? []).map((t: any) => ({
            id: t.id, type: t.type,
            amount: t.amount, currency: t.currency,
            amount_base: t.amount_base, exchange_rate: t.exchange_rate,
            date: t.date, note: t.note, receipt_url: t.receipt_url, recurring_id: t.recurring_id,
            account_id: t.account_id, account_name: t.accounts?.name ?? '—', account_color: t.accounts?.color ?? null,
            category_id: t.category_id,
            category_name:  t.categories?.name  ?? (t.type === 'transfer' ? i18n.t('transactions.transfer') : '—'),
            category_icon:  t.categories?.icon  ?? null,
            category_color: t.categories?.color ?? null,
            expense_type:   t.categories?.expense_type ?? null,
            tag_id:   t.tag_id ?? null,
            tag_name: t.category_tags?.name ?? null,
        })));
    }

    async function reloadCategories(hid: string) {
        const { data } = await supabase.from('categories')
            .select('id, name, slug, icon, color, type, expense_type, is_system')
            .eq('household_id', hid).eq('is_hidden', false);
        setCategories(data ?? []);
    }

    // ── Transaction form helpers ──────────────────────────────────────────────

    function openForm(tx?: TxRow) {
        setEditingTx(tx ?? null);
        setFormVisible(true);
    }

    async function onFormSaved() {
        setFormVisible(false);
        setLoading(true);
        await fetchTxs(householdId, filterType, filterPeriod, filterAccountId, filterCategoryId, filterExpenseType, customFrom, customTo, filterRecurring, filterTagId);
        setLoading(false);
    }

    async function loadFilterTags(catId: string) {
        const { data } = await supabase
            .from('category_tags')
            .select('id, name')
            .eq('category_id', catId)
            .order('sort_order').order('created_at');
        setFilterSheetTags(data ?? []);
    }

    async function deleteTx(id: string) {
        Alert.alert(t('transactions.deleteTransaction'), t('transactions.deleteIrreversible'), [
            { text: t('common.cancel'), style: 'cancel' },
            {
                text: t('common.delete'), style: 'destructive',
                onPress: async () => {
                    await supabase.from('transactions').update({ is_deleted: true }).eq('id', id);
                    setTxs(prev => prev.filter(t => t.id !== id));
                },
            },
        ]);
    }

    // ── Derived ──────────────────────────────────────────────────────────────

    const filtered = useMemo(() => {
        if (!search.trim()) return txs;
        const q = search.toLowerCase();
        return txs.filter(t =>
            t.category_name.toLowerCase().includes(q) ||
            (t.note?.toLowerCase().includes(q) ?? false) ||
            t.account_name.toLowerCase().includes(q),
        );
    }, [txs, search]);

    const sections = useMemo(() => {
        const map = new Map<string, TxRow[]>();
        for (const t of filtered) { const arr = map.get(t.date) ?? []; arr.push(t); map.set(t.date, arr); }
        return Array.from(map.entries()).map(([date, data]) => ({ date, data }));
    }, [filtered]);

    // ── Render helpers ────────────────────────────────────────────────────────

    function renderRightActions(id: string) {
        return (
            <TouchableOpacity onPress={() => deleteTx(id)}
                style={{ backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center', width: 88 }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{t('common.delete')}</Text>
            </TouchableOpacity>
        );
    }

    function renderRow({ item }: { item: TxRow }) {
        const Ic          = item.category_icon ? CAT_ICONS[item.category_icon] : null;
        const iconColor   = item.category_color ?? colors.textMuted;
        const amountColor = item.type === 'income' ? '#22c55e' : item.type === 'transfer' ? colors.textMuted : '#ef4444';
        const prefix      = item.type === 'income' ? '+' : item.type === 'expense' ? '−' : '⇄';

        return (
            <ReanimatedSwipeable renderRightActions={() => renderRightActions(item.id)}>
                <TouchableOpacity onPress={() => openForm(item)} activeOpacity={0.8}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.bgPrimary, borderBottomWidth: 1, borderBottomColor: colors.bgSecondary }}>
                    <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: iconColor + '22', alignItems: 'center', justifyContent: 'center' }}>
                        {Ic ? <Ic color={iconColor} size={19} /> : <ArrowRightLeft color={iconColor} size={19} />}
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '500' }}>{item.category_name}</Text>
                            {item.tag_name && (
                                <View style={{ backgroundColor: '#172554', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                                    <Text style={{ color: '#60a5fa', fontSize: 11 }}>{item.tag_name}</Text>
                                </View>
                            )}
                        </View>
                        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }} numberOfLines={1}>
                            {item.account_name}{item.note ? ` · ${item.note}` : ''}
                        </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ color: amountColor, fontSize: 15, fontWeight: '600' }}>
                            {prefix}{formatAmount(item.amount, item.currency)}
                        </Text>
                        {(item.recurring_id || item.receipt_url) && (
                            <View style={{ flexDirection: 'row', gap: 4, marginTop: 3 }}>
                                {item.recurring_id && <Repeat color={colors.textDisabled} size={11} />}
                                {item.receipt_url  && <Camera color={colors.textDisabled} size={11} />}
                            </View>
                        )}
                    </View>
                </TouchableOpacity>
            </ReanimatedSwipeable>
        );
    }

    function renderSectionHeader({ section }: { section: { date: string; data: TxRow[] } }) {
        const label        = format(new Date(section.date + 'T00:00:00'), 'EEEE, d MMMM', { locale: ru });
        const cur          = baseCurrency;
        const totalExpense = section.data.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount_base ?? t.amount), 0);
        const totalIncome  = section.data.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount_base ?? t.amount), 0);
        const transfers    = section.data.filter(t => t.type === 'transfer').length;
        return (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 7, backgroundColor: colors.bgTertiary }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12, textTransform: 'capitalize', fontWeight: '500' }}>{label}</Text>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    {filterType === 'transfer'
                        ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>{t('transactions.transferCount', { count: transfers })}</Text>
                        : <>
                            {totalExpense > 0 && <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '600' }}>−{formatAmount(totalExpense, cur)}</Text>}
                            {totalIncome  > 0 && <Text style={{ color: '#22c55e', fontSize: 12, fontWeight: '600' }}>+{formatAmount(totalIncome, cur)}</Text>}
                          </>
                    }
                </View>
            </View>
        );
    }

    const hasExtraFilters = filterCategoryId !== null || filterTagId !== null || filterExpenseType !== 'all' || filterRecurring !== 'all' || filterAccountId !== null;

    const typeFilters: { label: string; value: FilterType }[] = [
        { label: t('transactions.all'), value: 'all' }, { label: t('transactions.expense'), value: 'expense' },
        { label: t('transactions.income'), value: 'income' }, { label: t('transactions.transfer'), value: 'transfer' },
    ];
    const PERIOD_LABELS: Record<FilterPeriod, string> = {
        today: t('transactions.today'), yesterday: t('transactions.yesterday'), week: t('transactions.week'),
        month: t('transactions.month'), year: t('transactions.year'), custom: t('transactions.custom'),
    };

    function periodChipLabel(): string {
        if (filterPeriod !== 'custom') return PERIOD_LABELS[filterPeriod];
        if (!customFrom && !customTo) return t('transactions.period');
        const fmtShort = (d: Date) => format(d, 'd MMM', { locale: ru });
        if (customFrom && customTo) {
            if (format(customFrom, 'MM') === format(customTo, 'MM'))
                return `${format(customFrom, 'd')}–${fmtShort(customTo)}`;
            return `${fmtShort(customFrom)} – ${fmtShort(customTo)}`;
        }
        if (customFrom) return `${t('transactions.fromDate')} ${fmtShort(customFrom)}`;
        return `${t('transactions.toDate')} ${fmtShort(customTo!)}`;
    }

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>

            {/* Header */}
            <View style={{ paddingTop: insets.top + 6, paddingBottom: 12, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.textPrimary, fontSize: 24, fontWeight: '700' }}>{t('transactions.title')}</Text>
                <TouchableOpacity onPress={() => { setSearchVisible(v => !v); if (searchVisible) setSearch(''); }} style={{ padding: 4 }}>
                    {searchVisible ? <X color={colors.textSecondary} size={22} /> : <Search color={colors.textSecondary} size={22} />}
                </TouchableOpacity>
            </View>

            {/* Search */}
            {searchVisible && (
                <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
                    <TextInput value={search} onChangeText={setSearch} placeholder={t('transactions.searchPlaceholder')}
                        placeholderTextColor={colors.textDisabled} autoFocus
                        style={{ backgroundColor: colors.bgSecondary, color: colors.textPrimary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 }}
                    />
                </View>
            )}

            {/* Row 1 — Type filter */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
                style={{ flexGrow: 0, paddingBottom: 6, minHeight: 36 }}
                contentContainerStyle={{ paddingHorizontal: 12, gap: 6, alignItems: 'center' }}>
                {typeFilters.map(f => (
                    <TouchableOpacity key={f.value} onPress={() => setFilterType(f.value)}
                        style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: filterType === f.value ? '#7C6FFF' : colors.bgTertiary }}>
                        <Text style={{ color: filterType === f.value ? '#ffffff' : colors.textPrimary, fontSize: 13, fontWeight: '500' }}>{f.label}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {/* Row 2 — Фильтры button + sticky PeriodChip */}
            {(() => {
                const expLabels: Record<FilterExpenseType, string> = { all: t('transactions.expenseType'), base: t('transactions.base'), everyday: t('transactions.everyday'), development: t('transactions.development'), forself: t('transactions.forSelf'), work: t('transactions.work'), other: t('transactions.other') };
                const recLabels: Record<string, string> = { all: t('transactions.recurrence'), recurring: t('transactions.recurring'), non_recurring: t('transactions.oneTime') };
                const catName = filterCategoryId ? (categories.find(c => c.id === filterCategoryId)?.name ?? null) : null;
                const tagName = filterTagId ? (filterSheetTags.find(t => t.id === filterTagId)?.name ?? null) : null;

                const badge = (label: string, onClear: () => void) => (
                    <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 10, paddingRight: 6, paddingVertical: 5, borderRadius: 20, backgroundColor: '#172554', borderWidth: 1.5, borderColor: '#3b82f6' }}>
                        <Text style={{ color: '#60a5fa', fontSize: 12, fontWeight: '600' }}>{label}</Text>
                        <TouchableOpacity onPress={onClear} hitSlop={6}>
                            <X color="#60a5fa" size={12} />
                        </TouchableOpacity>
                    </View>
                );

                return (
                    <>
                        <View style={{ flexDirection: 'row', alignItems: 'center', paddingBottom: hasExtraFilters ? 6 : 10 }}>
                            <View style={{ flex: 1, paddingLeft: 12 }}>
                                <TouchableOpacity onPress={() => setActiveSheet('filters')}
                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: hasExtraFilters ? '#3b82f6' : colors.borderLight, backgroundColor: hasExtraFilters ? '#172554' : colors.bgTertiary }}>
                                    <SlidersHorizontal size={13} color={hasExtraFilters ? '#60a5fa' : colors.textSecondary} />
                                    <Text style={{ color: hasExtraFilters ? '#60a5fa' : colors.textSecondary, fontSize: 12, fontWeight: hasExtraFilters ? '600' : '400' }}>{t('transactions.filters')}</Text>
                                </TouchableOpacity>
                            </View>
                            <TouchableOpacity onPress={() => setPeriodSheetVisible(true)}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, marginHorizontal: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#2563eb', backgroundColor: '#172554' }}>
                                <Text style={{ color: '#60a5fa', fontSize: 12, fontWeight: '600' }}>{periodChipLabel()}</Text>
                                <ChevronDown color="#60a5fa" size={11} />
                            </TouchableOpacity>
                        </View>

                        {hasExtraFilters && (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}
                                style={{ flexGrow: 0, paddingBottom: 10 }}
                                contentContainerStyle={{ paddingHorizontal: 12, gap: 8, alignItems: 'center' }}>
                                {filterAccountId && badge(
                                    accounts.find(a => a.id === filterAccountId)?.name ?? t('transactions.account'),
                                    () => setFilterAccountId(null)
                                )}
                                {filterCategoryId && badge(
                                    tagName ? `${catName} · ${tagName}` : catName ?? t('transactions.category'),
                                    () => { setFilterCategoryId(null); setFilterTagId(null); setFilterSheetTags([]); }
                                )}
                                {filterTagId && !filterCategoryId && badge(
                                    tagName ?? t('transactions.tag'),
                                    () => setFilterTagId(null)
                                )}
                                {filterExpenseType !== 'all' && badge(expLabels[filterExpenseType], () => setFilterExpenseType('all'))}
                                {filterRecurring !== 'all' && badge(recLabels[filterRecurring], () => setFilterRecurring('all'))}
                            </ScrollView>
                        )}
                    </>
                );
            })()}

            {/* List */}
            {loading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator color="#3b82f6" size="large" />
                </View>
            ) : sections.length === 0 ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 16 }}>
                        {search.trim() ? t('transactions.notFound') : hasExtraFilters || filterPeriod !== 'month' ? t('common.nothingFound') : t('transactions.noTransactions')}
                    </Text>
                    <Text style={{ color: colors.textDisabled, fontSize: 14 }}>
                        {search.trim()
                            ? t('transactions.searchNoResults', { query: search.trim() })
                            : hasExtraFilters || filterPeriod !== 'month'
                                ? t('transactions.tryChangeFilters')
                                : t('transactions.tapPlusToAdd')}
                    </Text>
                </View>
            ) : (
                <SectionList
                    sections={sections} keyExtractor={item => item.id}
                    renderItem={renderRow} renderSectionHeader={renderSectionHeader}
                    stickySectionHeadersEnabled showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 100 }}
                />
            )}

            {/* FAB */}
            <TouchableOpacity onPress={() => openForm()}
                style={{ position: 'absolute', bottom: 24, right: 24, backgroundColor: '#2563eb', width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' }}
                activeOpacity={0.85}>
                <Plus color="#fff" size={28} />
            </TouchableOpacity>

            {/* ════ PeriodSheet ════ */}
            <BaseBottomSheet visible={periodSheetVisible} onClose={() => setPeriodSheetVisible(false)} scrollable={false}>
                            <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700', marginBottom: 16 }}>{t('transactions.period')}</Text>
                            {([
                                { value: 'today'     as const, label: t('transactions.today') },
                                { value: 'yesterday' as const, label: t('transactions.yesterday') },
                                { value: 'week'      as const, label: t('transactions.week') },
                                { value: 'month'     as const, label: t('transactions.month') },
                                { value: 'year'      as const, label: t('transactions.year') },
                            ]).map(p => (
                                <TouchableOpacity key={p.value} onPress={() => { setFilterPeriod(p.value); setCustomFrom(null); setCustomTo(null); setPeriodSheetVisible(false); }}
                                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.bgTertiary }}>
                                    <Text style={{ color: filterPeriod === p.value ? '#60a5fa' : colors.textPrimary, fontSize: 16, fontWeight: filterPeriod === p.value ? '600' : '400' }}>{p.label}</Text>
                                    {filterPeriod === p.value && <Check color="#3b82f6" size={18} />}
                                </TouchableOpacity>
                            ))}
                            <View style={{ height: 1, backgroundColor: colors.borderLight, marginVertical: 8 }} />
                            <TouchableOpacity onPress={() => setFilterPeriod('custom')}
                                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 }}>
                                <Text style={{ color: filterPeriod === 'custom' ? '#60a5fa' : colors.textPrimary, fontSize: 16, fontWeight: filterPeriod === 'custom' ? '600' : '400' }}>{t('transactions.customPeriod')}</Text>
                                {filterPeriod === 'custom' && <Check color="#3b82f6" size={18} />}
                            </TouchableOpacity>
                            {filterPeriod === 'custom' && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                                    <TouchableOpacity onPress={() => setShowCustomFrom(true)}
                                        style={{ flex: 1, backgroundColor: colors.bgTertiary, borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: customFrom ? '#3b82f6' : colors.borderLight }}>
                                        <Text style={{ color: customFrom ? colors.textPrimary : colors.textMuted, fontSize: 14 }}>
                                            {customFrom ? format(customFrom, 'd MMM yyyy', { locale: ru }) : t('transactions.fromDate')}
                                        </Text>
                                    </TouchableOpacity>
                                    <Text style={{ color: colors.textDisabled }}>—</Text>
                                    <TouchableOpacity onPress={() => setShowCustomTo(true)}
                                        style={{ flex: 1, backgroundColor: colors.bgTertiary, borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: customTo ? '#3b82f6' : colors.borderLight }}>
                                        <Text style={{ color: customTo ? colors.textPrimary : colors.textMuted, fontSize: 14 }}>
                                            {customTo ? format(customTo, 'd MMM yyyy', { locale: ru }) : t('transactions.toDate')}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                            {showCustomFrom && (
                                <DateTimePicker mode="date" display="inline" themeVariant="dark"
                                    value={customFrom ?? new Date()}
                                    onChange={(_, d) => { setShowCustomFrom(false); if (d) { setCustomFrom(d); if (customTo && d > customTo) setCustomTo(null); } }} />
                            )}
                            {showCustomTo && (
                                <DateTimePicker mode="date" display="inline" themeVariant="dark"
                                    value={customTo ?? customFrom ?? new Date()}
                                    minimumDate={customFrom ?? undefined}
                                    onChange={(_, d) => { setShowCustomTo(false); if (d) setCustomTo(d); }} />
                            )}
                            {filterPeriod === 'custom' && (customFrom || customTo) && (
                                <TouchableOpacity onPress={() => setPeriodSheetVisible(false)}
                                    style={{ backgroundColor: '#2563eb', borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 8 }}>
                                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{t('common.apply')}</Text>
                                </TouchableOpacity>
                            )}
            </BaseBottomSheet>

            {/* ════ Dropdown Sheet (account / category / expensetype / recurring) ════ */}
            <BaseBottomSheet visible={activeSheet !== null} onClose={() => setActiveSheet(null)} maxHeight={activeSheet === 'filters' ? '90%' : '75%'}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700' }}>
                                    {activeSheet === 'filters' ? t('transactions.filters') : activeSheet === 'account' ? t('transactions.account') : activeSheet === 'category' ? t('transactions.category') : activeSheet === 'expensetype' ? t('transactions.expenseType') : t('transactions.recurrence')}
                                </Text>
                                <TouchableOpacity onPress={() => setActiveSheet(null)} hitSlop={8}><X color={colors.textMuted} size={20} /></TouchableOpacity>
                            </View>

                                {/* ── Unified Filters ── */}
                                {activeSheet === 'filters' && (() => {
                                    const secHeader = (label: string) => (
                                        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 10, marginTop: 20 }}>{label}</Text>
                                    );
                                    return (
                                        <View>
                                            {/* Счёт */}
                                            {secHeader(t('transactions.sectionAccount'))}
                                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
                                                {[{ id: null as string | null, name: t('transactions.allAccounts'), color: null as string | null }, ...accounts].map(acc => {
                                                    const active = acc.id === filterAccountId;
                                                    return (
                                                        <TouchableOpacity key={acc.id ?? '__all__'} onPress={() => setFilterAccountId(acc.id)}
                                                            style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: active ? '#3b82f6' : colors.borderLight, backgroundColor: active ? '#172554' : colors.bgTertiary }}>
                                                            <Text style={{ color: active ? '#60a5fa' : colors.textSecondary, fontSize: 13, fontWeight: active ? '600' : '400' }}>{acc.name}</Text>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </ScrollView>

                                            {/* Категория */}
                                            {secHeader(t('transactions.sectionCategory'))}
                                            <TouchableOpacity onPress={() => setCollapsedSections(prev => {
                                                const next = new Set(prev);
                                                if (next.has('category')) next.delete('category'); else next.add('category');
                                                return next;
                                            })} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.bgTertiary }}>
                                                <Text style={{ color: filterCategoryId === null ? '#60a5fa' : '#e5e7eb', fontSize: 15, fontWeight: '600' }}>
                                                    {filterCategoryId === null ? t('transactions.allCategories') : categories.find(c => c.id === filterCategoryId)?.name ?? t('transactions.allCategories')}
                                                </Text>
                                                {collapsedSections.has('category')
                                                    ? <ChevronRight color={colors.textMuted} size={16} />
                                                    : <ChevronDown color={colors.textMuted} size={16} />
                                                }
                                            </TouchableOpacity>
                                            {!collapsedSections.has('category') && <View style={{ gap: 2 }}>
                                                {[{ id: null as string | null, name: t('transactions.allCategories'), icon: null, color: null, type: 'expense' as const, expense_type: null, is_system: true, slug: null },
                                                  ...categories.filter(c => filterType === 'income' ? c.type === 'income' : c.type === 'expense')
                                                ].map(cat => {
                                                    const active = cat.id === filterCategoryId;
                                                    const Ic = cat.icon ? CAT_ICONS[cat.icon] : null;
                                                    return (
                                                        <View key={cat.id ?? '__all__'}>
                                                            <TouchableOpacity onPress={() => {
                                                                if (cat.id === null) { setFilterCategoryId(null); setFilterTagId(null); setFilterSheetTags([]); }
                                                                else { setFilterCategoryId(cat.id); setFilterTagId(null); loadFilterTags(cat.id); }
                                                            }}
                                                                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: active && cat.id !== null ? 0 : 1, borderBottomColor: colors.bgTertiary }}>
                                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                                                    {Ic
                                                                        ? <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: (cat.color ?? colors.textMuted) + '22', alignItems: 'center', justifyContent: 'center' }}>
                                                                            <Ic color={cat.color ?? colors.textMuted} size={14} />
                                                                          </View>
                                                                        : cat.color ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: cat.color }} /> : null
                                                                    }
                                                                    <Text style={{ color: active ? '#60a5fa' : '#e5e7eb', fontSize: 15, fontWeight: active ? '600' : '400' }}>{cat.name}</Text>
                                                                </View>
                                                                {active && <Check color="#3b82f6" size={16} />}
                                                            </TouchableOpacity>
                                                            {active && cat.id !== null && filterSheetTags.length > 0 && (
                                                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.bgTertiary }}>
                                                                    {filterSheetTags.map(tag => {
                                                                        const tagActive = filterTagId === tag.id;
                                                                        return (
                                                                            <TouchableOpacity key={tag.id} onPress={() => setFilterTagId(tagActive ? null : tag.id)}
                                                                                style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1.5, borderColor: tagActive ? '#3b82f6' : colors.borderLight, backgroundColor: tagActive ? '#172554' : colors.bgTertiary }}>
                                                                                <Text style={{ color: tagActive ? '#60a5fa' : colors.textSecondary, fontSize: 12, fontWeight: tagActive ? '600' : '400' }}>{tag.name}</Text>
                                                                            </TouchableOpacity>
                                                                        );
                                                                    })}
                                                                </View>
                                                            )}
                                                        </View>
                                                    );
                                                })}
                                            </View>}

                                            {/* Тип расходов */}
                                            {secHeader(t('transactions.sectionExpenseType'))}
                                            <TouchableOpacity onPress={() => setCollapsedSections(prev => {
                                                const next = new Set(prev);
                                                if (next.has('expType')) next.delete('expType'); else next.add('expType');
                                                return next;
                                            })} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.bgTertiary }}>
                                                <Text style={{ color: filterExpenseType === 'all' ? '#60a5fa' : '#e5e7eb', fontSize: 15, fontWeight: '600' }}>
                                                    {filterExpenseType === 'all' ? t('transactions.allTypes') :
                                                     filterExpenseType === 'base' ? t('transactions.base') :
                                                     filterExpenseType === 'everyday' ? t('transactions.everyday') :
                                                     filterExpenseType === 'development' ? t('transactions.development') :
                                                     filterExpenseType === 'forself' ? t('transactions.forSelf') :
                                                     filterExpenseType === 'work' ? t('transactions.work') : t('transactions.other')}
                                                </Text>
                                                {collapsedSections.has('expType')
                                                    ? <ChevronRight color={colors.textMuted} size={16} />
                                                    : <ChevronDown color={colors.textMuted} size={16} />
                                                }
                                            </TouchableOpacity>
                                            {!collapsedSections.has('expType') && <View style={{ gap: 2 }}>
                                                {([
                                                    { value: 'all' as const,         label: t('transactions.allTypes') },
                                                    { value: 'base' as const,        label: t('transactions.base') },
                                                    { value: 'everyday' as const,    label: t('transactions.everyday') },
                                                    { value: 'development' as const, label: t('transactions.development') },
                                                    { value: 'forself' as const,     label: t('transactions.forSelf') },
                                                    { value: 'work' as const,        label: t('transactions.work') },
                                                    { value: 'other' as const,       label: t('transactions.other') },
                                                ]).map(opt => {
                                                    const active = filterExpenseType === opt.value;
                                                    return (
                                                        <TouchableOpacity key={opt.value} onPress={() => setFilterExpenseType(opt.value)}
                                                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.bgTertiary }}>
                                                            <Text style={{ color: active ? '#60a5fa' : '#e5e7eb', fontSize: 15, fontWeight: active ? '600' : '400' }}>{opt.label}</Text>
                                                            {active && <Check color="#3b82f6" size={16} />}
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>}

                                            {/* Рекуррентность */}
                                            {secHeader(t('transactions.sectionRecurrence'))}
                                            <TouchableOpacity onPress={() => setCollapsedSections(prev => {
                                                const next = new Set(prev);
                                                if (next.has('recurrence')) next.delete('recurrence'); else next.add('recurrence');
                                                return next;
                                            })} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.bgTertiary }}>
                                                <Text style={{ color: filterRecurring === 'all' ? '#60a5fa' : '#e5e7eb', fontSize: 15, fontWeight: '600' }}>
                                                    {filterRecurring === 'all' ? t('transactions.allPayments') :
                                                     filterRecurring === 'recurring' ? t('transactions.recurring') : t('transactions.oneTime')}
                                                </Text>
                                                {collapsedSections.has('recurrence')
                                                    ? <ChevronRight color={colors.textMuted} size={16} />
                                                    : <ChevronDown color={colors.textMuted} size={16} />
                                                }
                                            </TouchableOpacity>
                                            {!collapsedSections.has('recurrence') && <View style={{ gap: 2, marginBottom: 24 }}>
                                                {([
                                                    { value: 'all' as const,          label: t('transactions.allPayments') },
                                                    { value: 'recurring' as const,    label: t('transactions.recurring') },
                                                    { value: 'non_recurring' as const, label: t('transactions.oneTime') },
                                                ]).map(opt => {
                                                    const active = filterRecurring === opt.value;
                                                    return (
                                                        <TouchableOpacity key={opt.value} onPress={() => setFilterRecurring(opt.value)}
                                                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.bgTertiary }}>
                                                            <Text style={{ color: active ? '#60a5fa' : '#e5e7eb', fontSize: 15, fontWeight: active ? '600' : '400' }}>{opt.label}</Text>
                                                            {active && <Check color="#3b82f6" size={16} />}
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>}

                                            {/* Buttons */}
                                            <View style={{ flexDirection: 'row', gap: 12 }}>
                                                <TouchableOpacity
                                                    onPress={() => { setFilterAccountId(null); setFilterCategoryId(null); setFilterTagId(null); setFilterSheetTags([]); setFilterExpenseType('all'); setFilterRecurring('all'); setActiveSheet(null); }}
                                                    style={{ flex: 1, borderRadius: 16, paddingVertical: 13, alignItems: 'center', borderWidth: 1.5, borderColor: colors.borderLight }}>
                                                    <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 15 }}>{t('transactions.reset')}</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity onPress={() => setActiveSheet(null)}
                                                    style={{ flex: 2, borderRadius: 16, paddingVertical: 13, alignItems: 'center', backgroundColor: '#2563eb' }}>
                                                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{t('common.apply')}</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    );
                                })()}

                                {/* ── Account ── */}
                                {activeSheet === 'account' && (
                                    <View style={{ gap: 2 }}>
                                        {[{ id: null as string | null, name: t('transactions.allAccounts'), color: null as string | null },...accounts].map(acc => {
                                            const active = acc.id === filterAccountId;
                                            return (
                                                <TouchableOpacity key={acc.id ?? '__all__'} onPress={() => { setFilterAccountId(acc.id); setActiveSheet(null); }}
                                                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.bgTertiary }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                                        {acc.color && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: acc.color }} />}
                                                        <Text style={{ color: active ? '#60a5fa' : '#e5e7eb', fontSize: 16, fontWeight: active ? '600' : '400' }}>{acc.name}</Text>
                                                    </View>
                                                    {active && <Check color="#3b82f6" size={18} />}
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                )}

                                {/* ── Category ── */}
                                {activeSheet === 'category' && (
                                    <View style={{ gap: 2 }}>
                                        {[{ id: null as string | null, name: t('transactions.allCategories'), icon: null, color: null, type: 'expense' as const, expense_type: null, is_system: true },
                                          ...categories.filter(c => filterType === 'income' ? c.type === 'income' : c.type === 'expense')
                                        ].map(cat => {
                                            const active = cat.id === filterCategoryId;
                                            const Ic = cat.icon ? CAT_ICONS[cat.icon] : null;
                                            return (
                                                <View key={cat.id ?? '__all__'}>
                                                    <TouchableOpacity onPress={() => {
                                                        if (cat.id === null) {
                                                            setFilterCategoryId(null);
                                                            setFilterTagId(null);
                                                            setFilterSheetTags([]);
                                                            setActiveSheet(null);
                                                        } else {
                                                            setFilterCategoryId(cat.id);
                                                            setFilterTagId(null);
                                                            loadFilterTags(cat.id);
                                                        }
                                                    }}
                                                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: active && filterSheetTags.length > 0 ? 0 : 1, borderBottomColor: colors.bgTertiary }}>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                                            {Ic
                                                                ? <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: (cat.color ?? colors.textMuted) + '22', alignItems: 'center', justifyContent: 'center' }}>
                                                                    <Ic color={cat.color ?? colors.textMuted} size={15} />
                                                                  </View>
                                                                : cat.color
                                                                    ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: cat.color }} />
                                                                    : null
                                                            }
                                                            <Text style={{ color: active ? '#60a5fa' : '#e5e7eb', fontSize: 16, fontWeight: active ? '600' : '400' }}>{cat.name}</Text>
                                                        </View>
                                                        {active && <Check color="#3b82f6" size={18} />}
                                                    </TouchableOpacity>

                                                    {/* Inline tags under the selected category */}
                                                    {active && cat.id !== null && (
                                                        <View style={{ paddingHorizontal: 4, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.bgTertiary }}>
                                                            {filterSheetTags.length === 0
                                                                ? <Text style={{ color: colors.textDisabled, fontSize: 13 }}>{t('common.noData')}</Text>
                                                                : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                                                    {filterSheetTags.map(tag => {
                                                                        const tagActive = filterTagId === tag.id;
                                                                        return (
                                                                            <TouchableOpacity key={tag.id}
                                                                                onPress={() => { setFilterTagId(tagActive ? null : tag.id); setActiveSheet(null); }}
                                                                                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: tagActive ? '#3b82f6' : colors.borderLight, backgroundColor: tagActive ? '#172554' : colors.bgTertiary }}>
                                                                                <Text style={{ color: tagActive ? '#60a5fa' : colors.textSecondary, fontSize: 13, fontWeight: tagActive ? '600' : '400' }}>{tag.name}</Text>
                                                                            </TouchableOpacity>
                                                                        );
                                                                    })}
                                                                  </View>
                                                            }
                                                        </View>
                                                    )}
                                                </View>
                                            );
                                        })}
                                    </View>
                                )}

                                {/* ── Expense type ── */}
                                {activeSheet === 'expensetype' && (
                                    <View style={{ gap: 2 }}>
                                        {([
                                            { value: 'all'         as const, label: t('transactions.allTypes'),      sub: '' },
                                            { value: 'base'        as const, label: t('transactions.base'),       sub: t('settings.expTypeBaseDesc') },
                                            { value: 'everyday'    as const, label: t('transactions.everyday'),  sub: t('settings.expTypeEverydayDesc') },
                                            { value: 'development' as const, label: t('transactions.development'),      sub: t('settings.expTypeDevelopmentDesc') },
                                            { value: 'forself'     as const, label: t('transactions.forSelf'),      sub: t('settings.expTypeForSelfDesc') },
                                            { value: 'work'        as const, label: t('transactions.work'),       sub: t('settings.expTypeWorkDesc') },
                                            { value: 'other'       as const, label: t('transactions.other'),        sub: t('settings.expTypeOtherDesc') },
                                        ]).map(opt => {
                                            const active = filterExpenseType === opt.value;
                                            return (
                                                <TouchableOpacity key={opt.value} onPress={() => { setFilterExpenseType(opt.value); setActiveSheet(null); }}
                                                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.bgTertiary }}>
                                                    <View>
                                                        <Text style={{ color: active ? '#60a5fa' : '#e5e7eb', fontSize: 16, fontWeight: active ? '600' : '400' }}>{opt.label}</Text>
                                                        {opt.sub ? <Text style={{ color: colors.textDisabled, fontSize: 12, marginTop: 2 }}>{opt.sub}</Text> : null}
                                                    </View>
                                                    {active && <Check color="#3b82f6" size={18} />}
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                )}

                                {/* ── Recurring ── */}
                                {activeSheet === 'recurring' && (
                                    <View style={{ gap: 2 }}>
                                        {([
                                            { value: 'all'         as const, label: t('transactions.allPayments'),       sub: '' },
                                            { value: 'recurring'   as const, label: t('transactions.recurring'),      sub: '' },
                                            { value: 'non_recurring' as const, label: t('transactions.oneTime'),         sub: '' },
                                        ]).map(opt => {
                                            const active = filterRecurring === opt.value;
                                            return (
                                                <TouchableOpacity key={opt.value} onPress={() => { setFilterRecurring(opt.value); setActiveSheet(null); }}
                                                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.bgTertiary }}>
                                                    <View>
                                                        <Text style={{ color: active ? '#60a5fa' : '#e5e7eb', fontSize: 16, fontWeight: active ? '600' : '400' }}>{opt.label}</Text>
                                                        {opt.sub ? <Text style={{ color: colors.textDisabled, fontSize: 12, marginTop: 2 }}>{opt.sub}</Text> : null}
                                                    </View>
                                                    {active && <Check color="#3b82f6" size={18} />}
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                )}

            </BaseBottomSheet>

            <TransactionForm
                visible={formVisible}
                onClose={() => setFormVisible(false)}
                onSaved={onFormSaved}
                accounts={accounts}
                categories={categories}
                householdId={householdId}
                userId={userId}
                baseCurrency={baseCurrency}
                editingTx={editingTx}
                onCategoriesChanged={(hid) => reloadCategories(hid)}
            />


        </View>
    );
}
