import { CurrencyPicker } from '@/components/ui/CurrencyPicker';
import { CURRENCY_MAP, formatAmount } from '@/constants/currencies';
import { useTheme } from '@/context/ThemeContext';
import { format, startOfMonth, startOfWeek, startOfYear, startOfDay } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { Account, Frequency } from '@/types';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import {
    ArrowDownToLine,
    ArrowRightLeft,
    Banknote,
    Bitcoin,
    Briefcase,
    Building2,
    Car,
    Check,
    CircleDollarSign,
    Coins,
    CreditCard,
    Globe,
    GripVertical,
    Home,
    Landmark,
    PiggyBank,
    Plus,
    Smartphone,
    TrendingUp,
    Wallet,
    X,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { TouchableOpacity as GHTouch } from 'react-native-gesture-handler';
import { router, useFocusEffect } from 'expo-router';

// ─── Constants ────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ color: string; size: number }>> = {
    CreditCard, Wallet, Building2, Banknote, Coins,
    PiggyBank, TrendingUp, Landmark, CircleDollarSign,
    Briefcase, Home, Car, Smartphone, Globe, Bitcoin,
};
const ICON_NAMES = Object.keys(ICON_MAP);

const COLOR_PRESETS = [
    '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444',
    '#f97316', '#eab308', '#22c55e', '#14b8a6',
    '#a78bfa', '#6b7280',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PERIOD_LABELS: Record<Frequency, string> = {
    daily: i18n.t('accounts.dailyLimit'),
    weekly: i18n.t('accounts.weeklyLimit'),
    monthly: i18n.t('accounts.monthlyLimit'),
    yearly: i18n.t('accounts.yearlyLimit'),
};

const PERIOD_PICKER_LABELS: Record<Frequency, string> = {
    daily: i18n.t('accounts.periodDay'),
    weekly: i18n.t('accounts.periodWeek'),
    monthly: i18n.t('accounts.periodMonth'),
    yearly: i18n.t('accounts.periodYear'),
};

function getSpendingPeriodStart(period: Frequency): string {
    const now = new Date();
    switch (period) {
        case 'daily': return format(startOfDay(now), 'yyyy-MM-dd');
        case 'weekly': return format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        case 'monthly': return format(startOfMonth(now), 'yyyy-MM-dd');
        case 'yearly': return format(startOfYear(now), 'yyyy-MM-dd');
    }
}

async function fetchExchangeRate(from: string, to: string): Promise<number> {
    if (from === to) return 1;
    try {
        const res = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`);
        const json = await res.json();
        return json.rates?.[to] ?? 1;
    } catch {
        return 1;
    }
}

// ─── AccountCard ──────────────────────────────────────────────────────────────

interface AccountCardProps {
    account: Account;
    spending: number;
    onPress: () => void;
    onAddFunds: () => void;
    onTransfer: () => void;
    onDrag: () => void;
    isActive: boolean;
}

function AccountCard({ account, spending, onPress, onAddFunds, onTransfer, onDrag, isActive }: AccountCardProps) {
    const { colors, fonts } = useTheme();
    const { t } = useTranslation();
    const IconComp = ICON_MAP[account.icon ?? 'CreditCard'] ?? CreditCard;
    const color = account.color ?? '#3b82f6';

    return (
        <View style={{
            backgroundColor: isActive ? '#1a2535' : colors.bgSecondary,
            borderWidth: 1,
            borderColor: isActive ? (color + '66') : colors.bgTertiary,
            borderRadius: 16,
            marginBottom: 10,
            overflow: 'hidden',
        }}>
            {/* Main row — tap to detail, long-press to drag */}
            <GHTouch
                onPress={onPress}
                onLongPress={onDrag}
                delayLongPress={200}
                disabled={isActive}
                activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}
            >
                <View style={{
                    width: 48, height: 48, borderRadius: 14,
                    backgroundColor: color + '22',
                    alignItems: 'center', justifyContent: 'center', marginRight: 14,
                }}>
                    <IconComp color={color} size={22} />
                </View>

                <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 16, fontFamily: fonts.bodySemiBold }}>{account.name}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2, fontFamily: fonts.body }}>
                        {CURRENCY_MAP[account.currency]?.flag ?? ''} {account.currency}
                    </Text>
                    {account.exclude_from_dashboard && (
                        <Text style={{ color: colors.textDisabled, fontSize: 11, marginTop: 2, fontFamily: fonts.body }}>{t('accounts.hiddenFromCalc')}</Text>
                    )}
                </View>

                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 16, fontFamily: fonts.bodyBold }}>
                        {formatAmount(account.balance, account.currency)}
                    </Text>
                    <GripVertical color={colors.borderLight} size={16} />
                </View>
            </GHTouch>

            {/* Action buttons */}
            <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.bgTertiary }}>
                <GHTouch
                    onPress={onAddFunds}
                    activeOpacity={0.6}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 11, gap: 6 }}
                >
                    <ArrowDownToLine color="#22c55e" size={15} />
                    <Text style={{ color: '#22c55e', fontSize: 13, fontWeight: '600', fontFamily: fonts.bodySemiBold }}>{t('accounts.topUp')}</Text>
                </GHTouch>

                <View style={{ width: 1, backgroundColor: colors.bgTertiary }} />

                <GHTouch
                    onPress={onTransfer}
                    activeOpacity={0.6}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 11, gap: 6 }}
                >
                    <ArrowRightLeft color="#3b82f6" size={15} />
                    <Text style={{ color: '#3b82f6', fontSize: 13, fontWeight: '600', fontFamily: fonts.bodySemiBold }}>{t('accounts.transfer')}</Text>
                </GHTouch>
            </View>

            {/* Spending limit progress bar */}
            {account.spending_limit != null && account.spending_limit > 0 && (() => {
                const pct = Math.min(1, spending / account.spending_limit!);
                const barColor = pct < 0.7 ? '#22c55e' : pct < 0.9 ? '#f97316' : '#ef4444';
                const periodLabel = PERIOD_LABELS[account.spending_limit_period ?? 'monthly'];
                return (
                    <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.bgTertiary }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                            <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: fonts.body }}>{periodLabel}</Text>
                            <Text style={{ color: pct >= 0.9 ? '#ef4444' : colors.textSecondary, fontSize: 12, fontWeight: '500', fontFamily: fonts.bodyMedium }}>
                                {formatAmount(spending, account.currency)} / {formatAmount(account.spending_limit!, account.currency)}
                            </Text>
                        </View>
                        <View style={{ height: 4, backgroundColor: colors.bgTertiary, borderRadius: 2 }}>
                            <View style={{ width: `${pct * 100}%` as any, height: 4, backgroundColor: barColor, borderRadius: 2 }} />
                        </View>
                    </View>
                );
            })()}
        </View>
    );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function AccountsScreen() {
    const { colors, fonts } = useTheme();
    const { t } = useTranslation();
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [householdId, setHouseholdId] = useState<string | null>(null);

    // Monthly spending per account
    const [accountSpending, setAccountSpending] = useState<Record<string, number>>({});

    // Add modal
    const [showAddModal, setShowAddModal] = useState(false);
    const [addName, setAddName] = useState('');
    const [addCurrency, setAddCurrency] = useState('EUR');
    const [addBalance, setAddBalance] = useState('0');
    const [addIcon, setAddIcon] = useState('CreditCard');
    const [addColor, setAddColor] = useState('#3b82f6');
    const [addExclude, setAddExclude] = useState(false);
    const [addLimit, setAddLimit] = useState('');
    const [addLimitPeriod, setAddLimitPeriod] = useState<Frequency>('monthly');
    const [addSaving, setAddSaving] = useState(false);

    // Add Funds modal
    const [showAddFundsModal, setShowAddFundsModal] = useState(false);
    const [addFundsAccount, setAddFundsAccount] = useState<Account | null>(null);
    const [addFundsAmount, setAddFundsAmount] = useState('');
    const [addFundsNote, setAddFundsNote] = useState('');
    const [addFundsSaving, setAddFundsSaving] = useState(false);

    // Transfer modal
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [transferFrom, setTransferFrom] = useState<Account | null>(null);
    const [transferTo, setTransferTo] = useState<Account | null>(null);
    const [transferAmount, setTransferAmount] = useState('');
    const [transferRate, setTransferRate] = useState('1');
    const [transferNote, setTransferNote] = useState('');
    const [transferSaving, setTransferSaving] = useState(false);
    const [loadingRate, setLoadingRate] = useState(false);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { loadData(); }, []);

    // Refresh list when returning from detail screen
    useFocusEffect(useCallback(() => {
        if (householdId) {
            fetchAccounts(householdId);
            fetchSpending(householdId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [householdId]));

    async function loadData() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: member } = await supabase
            .from('household_members')
            .select('household_id')
            .eq('user_id', user.id)
            .single();

        if (member) {
            setHouseholdId(member.household_id);
            const accs = await fetchAccounts(member.household_id);
            await fetchSpending(member.household_id, accs);
        }
        setLoading(false);
    }

    async function fetchAccounts(hid: string): Promise<Account[]> {
        // Try sort_order first; fall back to created_at if column doesn't exist
        const { data, error } = await supabase
            .from('accounts')
            .select('*')
            .eq('household_id', hid)
            .eq('is_deleted', false)
            .order('sort_order', { ascending: true, nullsFirst: true })
            .order('created_at', { ascending: true });

        if (error) {
            const { data: fallback } = await supabase
                .from('accounts')
                .select('*')
                .eq('household_id', hid)
                .eq('is_deleted', false)
                .order('created_at', { ascending: true });
            setAccounts(fallback ?? []);
            return fallback ?? [];
        } else {
            setAccounts(data ?? []);
            return data ?? [];
        }
    }

    async function fetchSpending(hid: string, accs?: Account[]) {
        const list = accs ?? accounts;
        // Determine the earliest period start across all accounts
        const periods = new Set<Frequency>();
        for (const a of list) {
            if (a.spending_limit && a.spending_limit > 0) {
                periods.add(a.spending_limit_period ?? 'monthly');
            }
        }
        // Use the earliest possible start date to fetch all needed transactions in one query
        const starts = Array.from(periods).map(p => getSpendingPeriodStart(p));
        const earliest = starts.length > 0 ? starts.sort()[0] : format(startOfMonth(new Date()), 'yyyy-MM-dd');

        const { data } = await supabase
            .from('transactions')
            .select('account_id, amount, date')
            .eq('household_id', hid)
            .eq('type', 'expense')
            .eq('is_deleted', false)
            .gte('date', earliest);

        // Sum per account, only counting transactions within each account's period
        const map: Record<string, number> = {};
        for (const t of data ?? []) {
            const acc = list.find(a => a.id === t.account_id);
            const period = acc?.spending_limit_period ?? 'monthly';
            const periodStart = getSpendingPeriodStart(period);
            if (t.date >= periodStart) {
                map[t.account_id] = (map[t.account_id] ?? 0) + t.amount;
            }
        }
        setAccountSpending(map);
    }

    // ─── Drag & drop reorder ─────────────────────────────────────────────────

    async function handleReorder(reordered: Account[]) {
        setAccounts(reordered);
        // Persist sort_order — requires: ALTER TABLE accounts ADD COLUMN sort_order integer;
        await Promise.allSettled(
            reordered.map((acc, idx) =>
                supabase.from('accounts').update({ sort_order: idx }).eq('id', acc.id)
            )
        );
    }

    // ─── Add Account ─────────────────────────────────────────────────────────

    function openAdd() {
        setAddName(''); setAddCurrency('EUR'); setAddBalance('0');
        setAddIcon('CreditCard'); setAddColor('#3b82f6'); setAddExclude(false);
        setAddLimit(''); setAddLimitPeriod('monthly');
        setShowAddModal(true);
    }

    async function saveAdd() {
        if (!addName.trim() || !householdId) return;
        setAddSaving(true);

        await supabase.from('accounts').insert({
            household_id: householdId,
            name: addName.trim(),
            currency: addCurrency,
            balance: parseFloat(addBalance) || 0,
            icon: addIcon,
            color: addColor,
            exclude_from_dashboard: addExclude,
            spending_limit: addLimit ? parseFloat(addLimit) : null,
            spending_limit_period: addLimit ? addLimitPeriod : null,
            sort_order: accounts.length,
        });

        setAddSaving(false);
        setShowAddModal(false);
        fetchAccounts(householdId);
    }

    // ─── Add Funds ───────────────────────────────────────────────────────────

    function openAddFunds(account: Account) {
        setAddFundsAccount(account);
        setAddFundsAmount('');
        setAddFundsNote('');
        setShowAddFundsModal(true);
    }

    async function handleAddFunds() {
        if (!addFundsAccount || !householdId) return;
        const amount = parseFloat(addFundsAmount);
        if (isNaN(amount) || amount <= 0) return;

        setAddFundsSaving(true);
        const { data: { user } } = await supabase.auth.getUser();

        await Promise.all([
            supabase.from('accounts').update({
                balance: addFundsAccount.balance + amount,
                updated_at: new Date().toISOString(),
            }).eq('id', addFundsAccount.id),
            user && supabase.from('transactions').insert({
                household_id: householdId,
                account_id: addFundsAccount.id,
                user_id: user.id,
                type: 'income',
                amount,
                currency: addFundsAccount.currency,
                amount_base: amount,
                note: addFundsNote.trim() || null,
                date: new Date().toISOString().split('T')[0],
            }),
        ]);

        setAddFundsSaving(false);
        setShowAddFundsModal(false);
        fetchAccounts(householdId);
    }

    // ─── Transfer ────────────────────────────────────────────────────────────

    async function openTransfer(fromAccount: Account) {
        const firstOther = accounts.find(a => a.id !== fromAccount.id) ?? null;
        setTransferFrom(fromAccount);
        setTransferTo(firstOther);
        setTransferAmount('');
        setTransferNote('');
        setTransferRate('1');
        setShowTransferModal(true);

        if (firstOther && firstOther.currency !== fromAccount.currency) {
            setLoadingRate(true);
            const rate = await fetchExchangeRate(fromAccount.currency, firstOther.currency);
            setTransferRate(String(rate));
            setLoadingRate(false);
        }
    }

    async function selectTransferTo(account: Account) {
        setTransferTo(account);
        if (!transferFrom) return;
        if (account.currency !== transferFrom.currency) {
            setLoadingRate(true);
            const rate = await fetchExchangeRate(transferFrom.currency, account.currency);
            setTransferRate(String(rate));
            setLoadingRate(false);
        } else {
            setTransferRate('1');
        }
    }

    async function handleTransfer() {
        if (!transferFrom || !transferTo || !householdId) return;
        const amountFrom = parseFloat(transferAmount);
        if (isNaN(amountFrom) || amountFrom <= 0) return;

        const rate = parseFloat(transferRate) || 1;
        const amountTo = amountFrom * rate;

        setTransferSaving(true);

        await Promise.all([
            supabase.from('transfers').insert({
                household_id: householdId,
                from_account_id: transferFrom.id,
                to_account_id: transferTo.id,
                amount_from: amountFrom,
                amount_to: amountTo,
                currency_from: transferFrom.currency,
                currency_to: transferTo.currency,
                exchange_rate: rate !== 1 ? rate : null,
                date: new Date().toISOString().split('T')[0],
                note: transferNote.trim() || null,
            }),
            supabase.from('accounts').update({
                balance: transferFrom.balance - amountFrom,
                updated_at: new Date().toISOString(),
            }).eq('id', transferFrom.id),
            supabase.from('accounts').update({
                balance: transferTo.balance + amountTo,
                updated_at: new Date().toISOString(),
            }).eq('id', transferTo.id),
        ]);

        setTransferSaving(false);
        setShowTransferModal(false);
        fetchAccounts(householdId);
    }

    const transferedAmount = (parseFloat(transferAmount) || 0) * (parseFloat(transferRate) || 1);

    // ─── Derived ─────────────────────────────────────────────────────────────

    const activeBalance = accounts.filter(a => !a.exclude_from_dashboard).reduce((s, a) => s + a.balance, 0);
    const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
    const hasHidden = accounts.some(a => a.exclude_from_dashboard);

    // ─── Render ──────────────────────────────────────────────────────────────

    return (
        <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
            {/* Header */}
            <View style={{ paddingTop: 64, paddingHorizontal: 24, paddingBottom: 16 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 15, marginBottom: 4, fontFamily: fonts.body }}>{t('accounts.title')}</Text>
                <Text style={{ color: colors.textPrimary, fontSize: 40, fontWeight: '700', fontFamily: fonts.heading }}>
                    {formatAmount(activeBalance, 'EUR')}
                </Text>
                {hasHidden && (
                    <Text style={{ color: colors.textDisabled, fontSize: 13, marginTop: 4, fontFamily: fonts.body }}>
                        {t('accounts.totalOnAccounts', { amount: formatAmount(totalBalance, 'EUR') })}
                    </Text>
                )}
            </View>

            {/* List */}
            {loading ? (
                <ActivityIndicator color={colors.textPrimary} style={{ marginTop: 40 }} />
            ) : (
                <DraggableFlatList
                    data={accounts}
                    keyExtractor={item => item.id}
                    contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 4, paddingBottom: 120 }}
                    onDragEnd={({ data }) => handleReorder(data)}
                    ListEmptyComponent={
                        <View style={{ alignItems: 'center', marginTop: 80 }}>
                            <Text style={{ color: colors.borderLight, fontSize: 16, fontFamily: fonts.body }}>{t('accounts.noAccounts')}</Text>
                            <Text style={{ color: colors.bgTertiary, fontSize: 14, marginTop: 8, fontFamily: fonts.body }}>{t('accounts.tapToAdd')}</Text>
                        </View>
                    }
                    renderItem={({ item, drag, isActive }: RenderItemParams<Account>) => (
                        <ScaleDecorator>
                            <AccountCard
                                account={item}
                                spending={accountSpending[item.id] ?? 0}
                                onPress={() => router.push(`/accounts/${item.id}`)}
                                onAddFunds={() => openAddFunds(item)}
                                onTransfer={() => openTransfer(item)}
                                onDrag={drag}
                                isActive={isActive}
                            />
                        </ScaleDecorator>
                    )}
                />
            )}

            {/* FAB */}
            <TouchableOpacity
                onPress={openAdd}
                activeOpacity={0.8}
                style={{
                    position: 'absolute', bottom: 32, right: 24,
                    width: 56, height: 56, borderRadius: 28,
                    backgroundColor: '#2563eb',
                    alignItems: 'center', justifyContent: 'center',
                }}
            >
                <Plus color="#fff" size={26} />
            </TouchableOpacity>

            {/* ════════════════════════════════════════
                Add Account modal
            ════════════════════════════════════════ */}
            <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                    <Pressable style={{ flex: 1 }} onPress={() => setShowAddModal(false)} />
                    <View style={[sheetStyle, { backgroundColor: colors.bgSecondary }]}>
                        <SheetHandle />
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                            <Text style={[titleStyle, { color: colors.textPrimary, fontFamily: fonts.heading }]}>{t('accounts.newAccount')}</Text>
                            <TouchableOpacity onPress={() => setShowAddModal(false)}><X color={colors.textMuted} size={22} /></TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                            <Label>{t('accounts.accountName')}</Label>
                            <TextInput style={[inputStyle, { backgroundColor: colors.bgTertiary, borderColor: colors.borderLight, color: colors.textPrimary, fontFamily: fonts.body }]} placeholder={t('accounts.placeholder')} placeholderTextColor={colors.textDisabled} value={addName} onChangeText={setAddName} />

                            <Label>{t('common.currency')}</Label>
                            <CurrencyPicker value={addCurrency} onSelect={setAddCurrency} />

                            <Label>{t('accounts.initialBalance')}</Label>
                            <TextInput style={[inputStyle, { backgroundColor: colors.bgTertiary, borderColor: colors.borderLight, color: colors.textPrimary, fontFamily: fonts.body }]} placeholder="0" placeholderTextColor={colors.textDisabled} value={addBalance} onChangeText={setAddBalance} keyboardType="decimal-pad" />

                            <Label>{t('common.icon')}</Label>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                                {ICON_NAMES.map(iconName => {
                                    const IC = ICON_MAP[iconName]!;
                                    const sel = addIcon === iconName;
                                    return (
                                        <TouchableOpacity key={iconName} onPress={() => setAddIcon(iconName)} style={{
                                            width: 48, height: 48, borderRadius: 14, marginRight: 8,
                                            borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
                                            backgroundColor: sel ? addColor + '33' : colors.bgTertiary,
                                            borderColor: sel ? addColor : colors.borderLight,
                                        }}>
                                            <IC color={sel ? addColor : colors.textMuted} size={22} />
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>

                            <Label>{t('common.color')}</Label>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
                                {COLOR_PRESETS.map(c => (
                                    <TouchableOpacity key={c} onPress={() => setAddColor(c)} style={{
                                        width: 36, height: 36, borderRadius: 18, backgroundColor: c,
                                        alignItems: 'center', justifyContent: 'center',
                                        borderWidth: addColor === c ? 2 : 0, borderColor: '#fff',
                                    }}>
                                        {addColor === c && <Check color="#fff" size={16} />}
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgTertiary, borderRadius: 14, padding: 16, marginBottom: 20 }}>
                                <View style={{ flex: 1, marginRight: 12 }}>
                                    <Text style={{ color: colors.textPrimary, fontSize: 15, fontFamily: fonts.body }}>{t('accounts.hideFromBalance')}</Text>
                                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2, fontFamily: fonts.body }}>{t('accounts.hideHint')}</Text>
                                </View>
                                <Switch value={addExclude} onValueChange={setAddExclude} trackColor={{ false: colors.borderLight, true: '#2563eb' }} thumbColor="#fff" />
                            </View>

                            <Label>{t('accounts.spendingLimit', { currency: addCurrency })}</Label>
                            <TextInput
                                style={[inputStyle, { backgroundColor: colors.bgTertiary, borderColor: colors.borderLight, color: colors.textPrimary, fontFamily: fonts.body }]}
                                placeholder={t('accounts.noLimit')}
                                placeholderTextColor={colors.textDisabled}
                                value={addLimit}
                                onChangeText={t => setAddLimit(t.replace(/[^0-9.]/g, ''))}
                                keyboardType="decimal-pad"
                            />
                            {!!addLimit && parseFloat(addLimit) > 0 && (
                                <>
                                    <Label>{t('accounts.limitPeriod')}</Label>
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                                        {(['daily', 'weekly', 'monthly', 'yearly'] as Frequency[]).map(f => (
                                            <TouchableOpacity
                                                key={f}
                                                onPress={() => setAddLimitPeriod(f)}
                                                style={{
                                                    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
                                                    backgroundColor: addLimitPeriod === f ? '#2563eb' : colors.bgTertiary,
                                                    borderWidth: 1, borderColor: addLimitPeriod === f ? '#3b82f6' : colors.borderLight,
                                                }}
                                            >
                                                <Text style={{ color: addLimitPeriod === f ? '#fff' : colors.textSecondary, fontSize: 13, fontFamily: fonts.body }}>
                                                    {PERIOD_PICKER_LABELS[f]}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </>
                            )}
                            <Text style={{ color: colors.textDisabled, fontSize: 12, marginTop: -12, marginBottom: 20, marginLeft: 4, fontFamily: fonts.body }}>
                                {t('accounts.progressBarHint')}
                            </Text>

                            <PrimaryButton label={addSaving ? t('common.saving') : t('accounts.createAccount')} onPress={saveAdd} disabled={addSaving || !addName.trim()} />
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ════════════════════════════════════════
                Add Funds modal
            ════════════════════════════════════════ */}
            <Modal visible={showAddFundsModal} transparent animationType="slide" onRequestClose={() => setShowAddFundsModal(false)}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                    <Pressable style={{ flex: 1 }} onPress={() => setShowAddFundsModal(false)} />
                    <View style={[sheetStyle, { backgroundColor: colors.bgSecondary }]}>
                        <SheetHandle />

                        {addFundsAccount && (() => {
                            const IC = ICON_MAP[addFundsAccount.icon ?? 'CreditCard'] ?? CreditCard;
                            const col = addFundsAccount.color ?? '#3b82f6';
                            return (
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
                                    <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: col + '22', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                        <IC color={col} size={20} />
                                    </View>
                                    <View>
                                        <Text style={[titleStyle, { color: colors.textPrimary, fontFamily: fonts.heading }]}>{t('accounts.topUpTitle')}</Text>
                                        <Text style={{ color: colors.textMuted, fontSize: 13, fontFamily: fonts.body }}>
                                            {addFundsAccount.name} · {formatAmount(addFundsAccount.balance, addFundsAccount.currency)}
                                        </Text>
                                    </View>
                                </View>
                            );
                        })()}

                        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                            <Label>{addFundsAccount ? t('accounts.topUpAmount', { currency: addFundsAccount.currency }) : t('common.amount')}</Label>
                            <TextInput
                                style={[inputStyle, { backgroundColor: colors.bgTertiary, borderColor: colors.borderLight, color: colors.textPrimary, fontSize: 28, fontWeight: '700', textAlign: 'center', paddingVertical: 20, fontFamily: fonts.bodyBold }]}
                                placeholder="0"
                                placeholderTextColor={colors.textDisabled}
                                value={addFundsAmount}
                                onChangeText={setAddFundsAmount}
                                keyboardType="decimal-pad"
                                autoFocus
                            />

                            <Label>{t('accounts.topUpNote')}</Label>
                            <TextInput style={[inputStyle, { backgroundColor: colors.bgTertiary, borderColor: colors.borderLight, color: colors.textPrimary, fontFamily: fonts.body }]} placeholder={t('accounts.topUpPlaceholder')} placeholderTextColor={colors.textDisabled} value={addFundsNote} onChangeText={setAddFundsNote} />

                            <PrimaryButton
                                label={addFundsSaving ? t('common.saving') : `${t('accounts.topUp')}${addFundsAmount ? ' ' + formatAmount(parseFloat(addFundsAmount) || 0, addFundsAccount?.currency ?? 'EUR') : ''}`}
                                onPress={handleAddFunds}
                                disabled={addFundsSaving || !addFundsAmount || parseFloat(addFundsAmount) <= 0}
                                color="#22c55e"
                            />
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ════════════════════════════════════════
                Transfer modal
            ════════════════════════════════════════ */}
            <Modal visible={showTransferModal} transparent animationType="slide" onRequestClose={() => setShowTransferModal(false)}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                    <Pressable style={{ flex: 1 }} onPress={() => setShowTransferModal(false)} />
                    <View style={[sheetStyle, { backgroundColor: colors.bgSecondary }]}>
                        <SheetHandle />

                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                            <Text style={[titleStyle, { color: colors.textPrimary, fontFamily: fonts.heading }]}>{t('accounts.transferTitle')}</Text>
                            <TouchableOpacity onPress={() => setShowTransferModal(false)}><X color={colors.textMuted} size={22} /></TouchableOpacity>
                        </View>

                        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 10 }}>
                                <MiniAccountBadge account={transferFrom} label={t('accounts.from')} />
                                <ArrowRightLeft color={colors.textMuted} size={18} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 6, fontFamily: fonts.body }}>{t('accounts.to')}</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                        {accounts
                                            .filter(a => a.id !== transferFrom?.id)
                                            .map(a => {
                                                const IC = ICON_MAP[a.icon ?? 'CreditCard'] ?? CreditCard;
                                                const col = a.color ?? '#3b82f6';
                                                const selected = transferTo?.id === a.id;
                                                return (
                                                    <TouchableOpacity
                                                        key={a.id}
                                                        onPress={() => selectTransferTo(a)}
                                                        style={{
                                                            flexDirection: 'row', alignItems: 'center',
                                                            backgroundColor: selected ? col + '22' : colors.bgTertiary,
                                                            borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
                                                            marginRight: 8, borderWidth: 1.5,
                                                            borderColor: selected ? col : colors.borderLight,
                                                        }}
                                                    >
                                                        <IC color={selected ? col : colors.textMuted} size={16} />
                                                        <Text style={{ color: selected ? colors.textPrimary : colors.textSecondary, marginLeft: 6, fontSize: 13, fontWeight: '600', fontFamily: fonts.bodySemiBold }}>{a.name}</Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                    </ScrollView>
                                </View>
                            </View>

                            <Label>{transferFrom ? t('accounts.transferAmount', { currency: transferFrom.currency }) : t('common.amount')}</Label>
                            <TextInput
                                style={[inputStyle, { backgroundColor: colors.bgTertiary, borderColor: colors.borderLight, color: colors.textPrimary, fontSize: 28, fontWeight: '700', textAlign: 'center', paddingVertical: 20, fontFamily: fonts.bodyBold }]}
                                placeholder="0"
                                placeholderTextColor={colors.textDisabled}
                                value={transferAmount}
                                onChangeText={setTransferAmount}
                                keyboardType="decimal-pad"
                                autoFocus
                            />

                            {transferFrom && transferTo && transferFrom.currency !== transferTo.currency && (
                                <View style={{ backgroundColor: colors.bgTertiary, borderRadius: 14, padding: 16, marginBottom: 20 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                        <Text style={{ color: colors.textSecondary, fontSize: 13, fontFamily: fonts.body }}>
                                            {t('accounts.exchangeRate', { from: transferFrom.currency, to: transferTo.currency })}
                                        </Text>
                                        {loadingRate && <ActivityIndicator size="small" color={colors.textMuted} />}
                                    </View>
                                    <TextInput
                                        style={[inputStyle, { backgroundColor: colors.bgTertiary, borderColor: colors.borderLight, color: colors.textPrimary, marginBottom: 0, fontFamily: fonts.body }]}
                                        placeholder="1.00"
                                        placeholderTextColor={colors.textDisabled}
                                        value={transferRate}
                                        onChangeText={setTransferRate}
                                        keyboardType="decimal-pad"
                                    />
                                    {parseFloat(transferAmount) > 0 && (
                                        <Text style={{ color: '#22c55e', fontSize: 14, marginTop: 10, textAlign: 'center', fontFamily: fonts.body }}>
                                            {t('accounts.willReceive', { amount: formatAmount(transferedAmount, transferTo.currency) })}
                                        </Text>
                                    )}
                                </View>
                            )}

                            {transferFrom && transferTo && transferFrom.currency === transferTo.currency && parseFloat(transferAmount) > 0 && (
                                <Text style={{ color: '#22c55e', fontSize: 14, marginBottom: 16, textAlign: 'center', fontFamily: fonts.body }}>
                                    {t('accounts.willReceive', { amount: formatAmount(parseFloat(transferAmount), transferTo.currency) })}
                                </Text>
                            )}

                            <Label>{t('accounts.transferNote')}</Label>
                            <TextInput style={[inputStyle, { backgroundColor: colors.bgTertiary, borderColor: colors.borderLight, color: colors.textPrimary, fontFamily: fonts.body }]} placeholder={t('accounts.transferPlaceholder')} placeholderTextColor={colors.textDisabled} value={transferNote} onChangeText={setTransferNote} />

                            <PrimaryButton
                                label={transferSaving ? t('accounts.executing') : t('accounts.doTransfer')}
                                onPress={handleTransfer}
                                disabled={transferSaving || !transferAmount || parseFloat(transferAmount) <= 0 || !transferTo}
                            />
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

// ─── Small reusable pieces ────────────────────────────────────────────────────

function MiniAccountBadge({ account, label }: { account: Account | null; label: string }) {
    const { colors, fonts } = useTheme();
    if (!account) return null;
    const IC = ICON_MAP[account.icon ?? 'CreditCard'] ?? CreditCard;
    const col = account.color ?? '#3b82f6';
    return (
        <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 6, fontFamily: fonts.body }}>{label}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: col + '22', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
                <IC color={col} size={16} />
                <Text style={{ color: colors.textPrimary, marginLeft: 6, fontSize: 13, fontWeight: '600', fontFamily: fonts.bodySemiBold }}>{account.name}</Text>
            </View>
        </View>
    );
}

function SheetHandle() {
    const { colors } = useTheme();
    return <View style={{ width: 40, height: 4, backgroundColor: colors.borderLight, borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />;
}

function Label({ children }: { children: React.ReactNode }) {
    const { colors, fonts } = useTheme();
    return <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 8, fontFamily: fonts.bodySemiBold }}>{children}</Text>;
}

function PrimaryButton({ label, onPress, disabled, color = '#2563eb' }: {
    label: string; onPress: () => void; disabled?: boolean; color?: string;
}) {
    const { fonts } = useTheme();
    return (
        <TouchableOpacity onPress={onPress} disabled={disabled}
            style={{ backgroundColor: color, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 12, opacity: disabled ? 0.5 : 1 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16, fontFamily: fonts.bodySemiBold }}>{label}</Text>
        </TouchableOpacity>
    );
}

// ─── Sheet / input styles ─────────────────────────────────────────────────────

const sheetStyle = {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
    maxHeight: '92%',
} as const;

const titleStyle = {
    fontSize: 20,
    fontWeight: '700',
} as const;

const inputStyle = {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 20,
};
