import {
    ArrowRightLeft, Banknote, Bitcoin, BookOpen, Briefcase, Building2,
    Car, Check, CircleDollarSign, Clock, Coins, CreditCard,
    Film, Gift, Globe, Heart, Home, Landmark,
    Package, Pencil, PiggyBank, Plane, Plus, Repeat2,
    ShoppingCart, Shirt, Smartphone, Trash2, TrendingUp, Wallet, X,
} from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator, Alert, ScrollView, Switch, Text,
    TextInput, TouchableOpacity, View,
} from 'react-native';
import { BaseBottomSheet } from '@/components/ui/BaseBottomSheet';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useFocusEffect } from 'expo-router';
import {
    addDays, addMonths, addWeeks, addYears,
    format, parseISO,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { formatAmount } from '@/constants/currencies';
import { Account, Category, Frequency, ExpenseType } from '@/types';
import { useTheme } from '@/context/ThemeContext';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_ICON_MAP: Record<string, React.ComponentType<{ color: string; size: number }>> = {
    ShoppingCart, Car, Home, Heart, Shirt, Film,
    Smartphone, BookOpen, Plane, Briefcase, TrendingUp,
    Gift, Package, CircleDollarSign, ArrowRightLeft,
};

const ACCOUNT_ICON_MAP: Record<string, React.ComponentType<{ color: string; size: number }>> = {
    CreditCard, Wallet, Building2, Banknote, Coins,
    PiggyBank, TrendingUp, Landmark, CircleDollarSign,
    Briefcase, Home, Car, Smartphone, Globe, Bitcoin,
};

const FREQ_KEYS: Record<Frequency, string> = {
    daily:   'recurring.daily',
    weekly:  'recurring.weekly',
    monthly: 'recurring.monthlyFreq',
    yearly:  'recurring.yearly',
};

const FREQ_SHORT_KEYS: Record<Frequency, string> = {
    daily:   'recurring.perDay',
    weekly:  'recurring.perWeek',
    monthly: 'recurring.perMonth',
    yearly:  'recurring.perYear',
};

const _EXPENSE_TYPE_KEYS: Record<ExpenseType, string> = { // eslint-disable-line @typescript-eslint/no-unused-vars
    base:        'recurring.baseType',
    everyday:    'recurring.everydayType',
    development: 'recurring.developmentType',
    forself:     'recurring.forSelfType',
    work:        'recurring.workType',
    other:       'recurring.otherType',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecurringRow {
    id: string;
    name: string;
    type: 'income' | 'expense';
    expense_type: ExpenseType | null;
    amount: number;
    currency: string;
    frequency: Frequency;
    next_date: string;
    notify_days_before: number;
    is_active: boolean;
    account_id: string;
    category_id: string | null;
    category_name: string;
    category_icon: string | null;
    category_color: string | null;
    account_name: string;
    account_balance: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateInput(raw: string): string {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 4) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

function nextDateAfterPay(current: string, freq: Frequency): string {
    const d = parseISO(current);
    const next =
        freq === 'daily'   ? addDays(d, 1)   :
        freq === 'weekly'  ? addWeeks(d, 1)  :
        freq === 'monthly' ? addMonths(d, 1) :
                             addYears(d, 1);
    return format(next, 'yyyy-MM-dd');
}

function getDueBadge(nextDate: string): { label: string; color: string } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = parseISO(nextDate);
    const diffDays = Math.round((d.getTime() - today.getTime()) / 86400000);

    if (diffDays < 0)   return { label: i18n.t('recurring.overdueByDays', { days: Math.abs(diffDays) }),  color: '#ef4444' };
    if (diffDays === 0) return { label: i18n.t('recurring.dueToday'),                                color: '#f97316' };
    if (diffDays <= 7)  return { label: i18n.t('recurring.dueInDays', { days: diffDays }),                   color: '#f59e0b' };
    return { label: format(d, 'd MMM', { locale: ru }), color: '#6b7280' };
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RecurringScreen() {
    const { colors } = useTheme();
    const { t } = useTranslation();
    const [items,       setItems]       = useState<RecurringRow[]>([]);
    const [accounts,    setAccounts]    = useState<Account[]>([]);
    const [categories,  setCategories]  = useState<Category[]>([]);
    const [loading,     setLoading]     = useState(true);
    const [householdId, setHouseholdId] = useState('');
    const [userId,      setUserId]      = useState('');

    // Form state
    const [showForm,    setShowForm]    = useState(false);
    const [editing,     setEditing]     = useState<RecurringRow | null>(null);
    const [fName,       setFName]       = useState('');
    const [fType,       setFType]       = useState<'income' | 'expense'>('expense');
    const [fExpType,    setFExpType]    = useState<ExpenseType>('everyday');
    const [fAmount,     setFAmount]     = useState('');
    const [fFreq,       setFFreq]       = useState<Frequency>('monthly');
    const [fNextDate,   setFNextDate]   = useState('');
    const [fNotify,     setFNotify]     = useState(3);
    const [fAccountId,  setFAccountId]  = useState('');
    const [fCategoryId, setFCategoryId] = useState('');
    const [saving,      setSaving]      = useState(false);

    useFocusEffect(useCallback(() => { loadData(); }, []));

    async function loadData() {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }
        setUserId(user.id);

        const { data: member } = await supabase
            .from('household_members')
            .select('household_id')
            .eq('user_id', user.id)
            .single();
        if (!member) { setLoading(false); return; }

        const hid = member.household_id;
        setHouseholdId(hid);

        const [{ data: accs }, { data: cats }, { data: recs }] = await Promise.all([
            supabase.from('accounts')
                .select('*')
                .eq('household_id', hid)
                .eq('is_deleted', false)
                .order('created_at'),
            supabase.from('categories')
                .select('*')
                .eq('household_id', hid)
                .eq('is_hidden', false)
                .order('name'),
            supabase.from('recurring_payments')
                .select('*, categories(name, icon, color), accounts(name, color, balance)')
                .eq('household_id', hid)
                .order('next_date', { ascending: true }),
        ]);

        setAccounts(accs ?? []);
        setCategories(cats ?? []);
        setItems((recs ?? []).map((r: any) => ({
            id:                 r.id,
            name:               r.name,
            type:               r.type,
            expense_type:       r.expense_type,
            amount:             r.amount,
            currency:           r.currency,
            frequency:          r.frequency,
            next_date:          r.next_date,
            notify_days_before: r.notify_days_before,
            is_active:          r.is_active,
            account_id:         r.account_id,
            category_id:        r.category_id,
            category_name:      r.categories?.name    ?? '—',
            category_icon:      r.categories?.icon    ?? null,
            category_color:     r.categories?.color   ?? null,
            account_name:       r.accounts?.name      ?? '—',
            account_balance:    r.accounts?.balance   ?? 0,
        })));

        setLoading(false);
    }

    // ── Open form ─────────────────────────────────────────────────────────────

    function openAdd() {
        setEditing(null);
        setFName(''); setFType('expense'); setFExpType('everyday');
        setFAmount(''); setFFreq('monthly');
        setFNextDate(format(new Date(), 'yyyy-MM-dd'));
        setFNotify(3);
        setFAccountId(accounts[0]?.id ?? '');
        setFCategoryId('');
        setShowForm(true);
    }

    function openEdit(item: RecurringRow) {
        setEditing(item);
        setFName(item.name);
        setFType(item.type);
        setFExpType(item.expense_type ?? 'everyday');
        setFAmount(String(item.amount));
        setFFreq(item.frequency);
        setFNextDate(item.next_date);
        setFNotify(item.notify_days_before);
        setFAccountId(item.account_id);
        setFCategoryId(item.category_id ?? '');
        setShowForm(true);
    }

    // ── Save ──────────────────────────────────────────────────────────────────

    async function handleSave() {
        if (!fName.trim() || !fAmount || !fAccountId) return;
        const amount = parseFloat(fAmount);
        if (isNaN(amount) || amount <= 0) return;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fNextDate)) {
            Alert.alert(t('recurring.invalidDate'), t('recurring.invalidDateFmt'));
            return;
        }

        const acc = accounts.find(a => a.id === fAccountId);
        const payload = {
            household_id:       householdId,
            account_id:         fAccountId,
            category_id:        fCategoryId || null,
            name:               fName.trim(),
            type:               fType,
            expense_type:       fType === 'expense' ? (categories.find(c => c.id === fCategoryId)?.expense_type ?? fExpType ?? 'everyday') : null,
            amount,
            currency:           acc?.currency ?? 'EUR',
            frequency:          fFreq,
            next_date:          fNextDate,
            notify_days_before: fNotify,
        };

        setSaving(true);
        if (editing) {
            const { error } = await supabase.from('recurring_payments').update(payload).eq('id', editing.id);
            if (error) { Alert.alert(t('common.error'), error.message); setSaving(false); return; }
        } else {
            const { error } = await supabase.from('recurring_payments').insert({ ...payload, is_active: true });
            if (error) { Alert.alert(t('common.error'), error.message); setSaving(false); return; }
        }
        setSaving(false);
        setShowForm(false);
        loadData();
    }

    // ── Mark as paid ──────────────────────────────────────────────────────────

    async function markAsPaid(item: RecurringRow) {
        Alert.alert(
            t('recurring.confirmPayment'),
            `${item.name} · ${formatAmount(item.amount, item.currency)}`,
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('recurring.paid'),
                    onPress: async () => {
                        const nextDate    = nextDateAfterPay(item.next_date, item.frequency);
                        const balanceDiff = item.type === 'expense' ? -item.amount : item.amount;
                        await Promise.all([
                            supabase.from('transactions').insert({
                                household_id: householdId,
                                account_id:   item.account_id,
                                category_id:  item.category_id,
                                user_id:      userId,
                                type:         item.type,
                                amount:       item.amount,
                                currency:     item.currency,
                                amount_base:  item.amount,
                                note:         item.name,
                                date:         format(new Date(), 'yyyy-MM-dd'),
                                recurring_id: item.id,
                            }),
                            supabase.from('recurring_payments')
                                .update({ next_date: nextDate })
                                .eq('id', item.id),
                            supabase.from('accounts')
                                .update({
                                    balance:    item.account_balance + balanceDiff,
                                    updated_at: new Date().toISOString(),
                                })
                                .eq('id', item.account_id),
                        ]);
                        loadData();
                    },
                },
            ],
        );
    }

    // ── Toggle active ─────────────────────────────────────────────────────────

    async function toggleActive(item: RecurringRow) {
        await supabase.from('recurring_payments').update({ is_active: !item.is_active }).eq('id', item.id);
        setItems(prev => prev.map(r => r.id === item.id ? { ...r, is_active: !r.is_active } : r));
    }

    // ── Delete ────────────────────────────────────────────────────────────────

    async function deleteItem(id: string) {
        Alert.alert(t('recurring.deletePayment'), t('recurring.deleteIrreversible'), [
            { text: t('common.cancel'), style: 'cancel' },
            {
                text: t('common.delete'), style: 'destructive',
                onPress: async () => {
                    await supabase.from('recurring_payments').delete().eq('id', id);
                    setItems(prev => prev.filter(r => r.id !== id));
                },
            },
        ]);
    }

    // ── Derived ───────────────────────────────────────────────────────────────

    const monthlyInfra = items
        .filter(r => r.is_active && r.type === 'expense' && r.expense_type === 'base')
        .reduce((sum, r) => {
            const toMonthly: Record<Frequency, number> = { daily: 30, weekly: 4.33, monthly: 1, yearly: 1 / 12 };
            return sum + r.amount * toMonthly[r.frequency];
        }, 0);

    const overdueItems = items.filter(r => {
        if (!r.is_active) return false;
        const d = parseISO(r.next_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return d < today;
    });
    const expenseItems = items.filter(r => r.type === 'expense');
    const incomeItems  = items.filter(r => r.type === 'income');
    const infraCurrency = items.find(r => r.expense_type === 'base')?.currency ?? 'EUR';

    // ── Render helpers ────────────────────────────────────────────────────────

    function renderRightActions(item: RecurringRow) {
        return (
            <View style={{ flexDirection: 'row' }}>
                <TouchableOpacity
                    onPress={() => { openEdit(item); }}
                    style={{ width: 60, backgroundColor: colors.borderLight, justifyContent: 'center', alignItems: 'center' }}
                >
                    <Pencil color={colors.textSecondary} size={18} />
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => deleteItem(item.id)}
                    style={{ width: 60, backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center' }}
                >
                    <Trash2 color={colors.textPrimary} size={18} />
                </TouchableOpacity>
            </View>
        );
    }

    function renderItem(item: RecurringRow) {
        const CategoryIcon = item.category_icon ? CATEGORY_ICON_MAP[item.category_icon] : null;
        const iconColor    = item.category_color ?? (item.type === 'income' ? '#22c55e' : colors.textMuted);
        const due          = getDueBadge(item.next_date);
        const amountColor  = item.type === 'income' ? '#22c55e' : '#ef4444';

        return (
            <ReanimatedSwipeable key={item.id} renderRightActions={() => renderRightActions(item)}>
                <View style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 20, paddingVertical: 14,
                    backgroundColor: colors.bgPrimary,
                    borderBottomWidth: 1, borderBottomColor: colors.bgSecondary,
                    opacity: item.is_active ? 1 : 0.45,
                }}>
                    {/* Category icon */}
                    <View style={{
                        width: 44, height: 44, borderRadius: 22,
                        backgroundColor: iconColor + '22',
                        alignItems: 'center', justifyContent: 'center',
                        marginRight: 14,
                    }}>
                        {CategoryIcon
                            ? <CategoryIcon color={iconColor} size={20} />
                            : <Repeat2 color={iconColor} size={20} />
                        }
                    </View>

                    {/* Info */}
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}>{item.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 8, flexWrap: 'wrap' }}>
                            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                                {t(FREQ_KEYS[item.frequency])} · {item.account_name}
                            </Text>
                            {item.expense_type === 'base' && (
                                <View style={{ backgroundColor: '#1e3a5f', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                                    <Text style={{ color: '#60a5fa', fontSize: 10, fontWeight: '600' }}>{t('recurring.baseType')}</Text>
                                </View>
                            )}
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 }}>
                            <Clock color={due.color} size={11} />
                            <Text style={{ color: due.color, fontSize: 12 }}>{due.label}</Text>
                        </View>
                    </View>

                    {/* Amount + controls */}
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                        <Text style={{ color: amountColor, fontSize: 14, fontWeight: '700' }}>
                            {item.type === 'income' ? '+' : '−'}{formatAmount(item.amount, item.currency)}
                            <Text style={{ color: colors.textDisabled, fontSize: 10, fontWeight: '400' }}>
                                {t(FREQ_SHORT_KEYS[item.frequency])}
                            </Text>
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Switch
                                value={item.is_active}
                                onValueChange={() => toggleActive(item)}
                                trackColor={{ false: colors.borderLight, true: '#166534' }}
                                thumbColor={item.is_active ? '#22c55e' : colors.textMuted}
                                style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
                            />
                            {item.is_active && (
                                <TouchableOpacity
                                    onPress={() => markAsPaid(item)}
                                    style={{
                                        backgroundColor: '#14532d',
                                        borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
                                    }}
                                >
                                    <Check color="#22c55e" size={14} />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                </View>
            </ReanimatedSwipeable>
        );
    }

    function renderSection(title: string, sectionItems: RecurringRow[]) {
        if (sectionItems.length === 0) return null;
        return (
            <View>
                <View style={{ paddingHorizontal: 20, paddingVertical: 8, backgroundColor: '#0a0f1e' }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                        {title}
                    </Text>
                </View>
                {sectionItems.map(item => renderItem(item))}
            </View>
        );
    }

    const filteredCategories = categories.filter(c =>
        fType === 'income' ? c.type === 'income' : c.type === 'expense',
    );

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>

            {/* Header */}
            <View style={{ paddingTop: 60, paddingBottom: 12, paddingHorizontal: 20 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 24, fontWeight: '700' }}>{t('recurring.title')}</Text>
                {monthlyInfra > 0 && (
                    <Text style={{ color: colors.textDisabled, fontSize: 13, marginTop: 4 }}>
                        {t('recurring.infraSummary', { amount: formatAmount(monthlyInfra, infraCurrency) })}
                    </Text>
                )}
            </View>

            {loading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator color="#3b82f6" size="large" />
                </View>
            ) : items.length === 0 ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Repeat2 color={colors.borderLight} size={48} />
                    <Text style={{ color: colors.textMuted, fontSize: 16, marginTop: 8 }}>{t('recurring.noPayments')}</Text>
                    <Text style={{ color: colors.textDisabled, fontSize: 14 }}>{t('recurring.noPaymentsHint')}</Text>
                </View>
            ) : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
                    {overdueItems.length > 0 && (
                        <View>
                            <View style={{ paddingHorizontal: 20, paddingVertical: 10, backgroundColor: 'rgba(239,68,68,0.08)', borderBottomWidth: 1, borderBottomColor: 'rgba(239,68,68,0.15)' }}>
                                <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                                    {t('recurring.attentionNeeded', { count: overdueItems.length })}
                                </Text>
                            </View>
                            {overdueItems.map(item => renderItem(item))}
                        </View>
                    )}
                    {renderSection(t('recurring.expenses'), expenseItems)}
                    {renderSection(t('recurring.income'), incomeItems)}
                </ScrollView>
            )}

            {/* FAB */}
            <TouchableOpacity
                onPress={openAdd}
                activeOpacity={0.85}
                style={{
                    position: 'absolute', bottom: 32, right: 24,
                    width: 56, height: 56, borderRadius: 28,
                    backgroundColor: '#2563eb',
                    alignItems: 'center', justifyContent: 'center',
                    shadowColor: '#2563eb', shadowOpacity: 0.4, shadowRadius: 12,
                }}
            >
                <Plus color={colors.textPrimary} size={26} />
            </TouchableOpacity>

            {/* ══════════════ Add / Edit Modal ══════════════ */}
            <BaseBottomSheet visible={showForm} onClose={() => setShowForm(false)} maxHeight="92%">
                        <View style={{ width: 40, height: 4, backgroundColor: colors.borderLight, borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />

                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                            <Text style={[titleStyle, { color: colors.textPrimary }]}>{editing ? t('recurring.editTitle') : t('recurring.newTitle')}</Text>
                            <TouchableOpacity onPress={() => setShowForm(false)}><X color={colors.textMuted} size={22} /></TouchableOpacity>
                        </View>

                            {/* Name */}
                            <FieldLabel>{t('common.name')}</FieldLabel>
                            <TextInput
                                style={[inputStyle, { backgroundColor: colors.bgTertiary, borderColor: colors.borderLight, color: colors.textPrimary }]}
                                placeholder={t('recurring.namePlaceholder')}
                                placeholderTextColor={colors.textDisabled}
                                value={fName}
                                onChangeText={setFName}
                                autoFocus={!editing}
                            />

                            {/* Type */}
                            <FieldLabel>{t('recurring.type')}</FieldLabel>
                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
                                {(['expense', 'income'] as const).map(tp => (
                                    <TouchableOpacity
                                        key={tp}
                                        onPress={() => { setFType(tp); setFCategoryId(''); }}
                                        style={{
                                            flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
                                            backgroundColor: fType === tp
                                                ? (tp === 'expense' ? '#7f1d1d' : '#14532d')
                                                : colors.bgTertiary,
                                            borderWidth: 1.5,
                                            borderColor: fType === tp
                                                ? (tp === 'expense' ? '#ef4444' : '#22c55e')
                                                : colors.borderLight,
                                        }}
                                    >
                                        <Text style={{
                                            color: fType === tp ? (tp === 'expense' ? '#ef4444' : '#22c55e') : colors.textMuted,
                                            fontWeight: '600', fontSize: 14,
                                        }}>
                                            {tp === 'expense' ? t('recurring.typeExpense') : t('recurring.typeIncome')}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Amount */}
                            <FieldLabel>{t('common.amount')}</FieldLabel>
                            <TextInput
                                style={[inputStyle, { backgroundColor: colors.bgTertiary, borderColor: colors.borderLight, color: colors.textPrimary, fontSize: 26, fontWeight: '700', textAlign: 'center', paddingVertical: 18 }]}
                                placeholder="0"
                                placeholderTextColor={colors.textDisabled}
                                value={fAmount}
                                onChangeText={setFAmount}
                                keyboardType="decimal-pad"
                            />

                            {/* Frequency */}
                            <FieldLabel>{t('recurring.frequency')}</FieldLabel>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                                {(['daily', 'weekly', 'monthly', 'yearly'] as Frequency[]).map(f => (
                                    <TouchableOpacity
                                        key={f}
                                        onPress={() => setFFreq(f)}
                                        style={{
                                            paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
                                            backgroundColor: fFreq === f ? '#2563eb' : colors.bgTertiary,
                                            borderWidth: 1, borderColor: fFreq === f ? '#3b82f6' : colors.borderLight,
                                        }}
                                    >
                                        <Text style={{ color: fFreq === f ? colors.textPrimary : colors.textSecondary, fontSize: 13, fontWeight: '500' }}>
                                            {t(FREQ_KEYS[f])}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Next date */}
                            <FieldLabel>{t('recurring.nextDate')}</FieldLabel>
                            <TextInput
                                style={[inputStyle, { backgroundColor: colors.bgTertiary, borderColor: colors.borderLight, color: colors.textPrimary }]}
                                placeholder="2026-04-01"
                                placeholderTextColor={colors.textDisabled}
                                value={fNextDate}
                                onChangeText={v => setFNextDate(formatDateInput(v))}
                                keyboardType="numeric"
                                maxLength={10}
                            />

                            {/* Account */}
                            <FieldLabel>{t('recurring.account')}</FieldLabel>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                                {accounts.map(acc => {
                                    const IC  = ACCOUNT_ICON_MAP[acc.icon ?? 'CreditCard'] ?? CreditCard;
                                    const col = acc.color ?? '#3b82f6';
                                    const sel = fAccountId === acc.id;
                                    return (
                                        <TouchableOpacity
                                            key={acc.id}
                                            onPress={() => setFAccountId(acc.id)}
                                            style={{
                                                flexDirection: 'row', alignItems: 'center',
                                                paddingHorizontal: 14, paddingVertical: 10,
                                                borderRadius: 12, marginRight: 8,
                                                backgroundColor: sel ? col + '22' : colors.bgTertiary,
                                                borderWidth: 1.5, borderColor: sel ? col : colors.borderLight,
                                                gap: 8,
                                            }}
                                        >
                                            <IC color={sel ? col : colors.textMuted} size={16} />
                                            <View>
                                                <Text style={{ color: sel ? colors.textPrimary : colors.textSecondary, fontSize: 13, fontWeight: '600' }}>{acc.name}</Text>
                                                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{formatAmount(acc.balance, acc.currency)}</Text>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>

                            {/* Category */}
                            <FieldLabel>{t('recurring.categoryOpt')}</FieldLabel>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 24 }}>
                                <TouchableOpacity
                                    onPress={() => setFCategoryId('')}
                                    style={{
                                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, marginRight: 8,
                                        backgroundColor: fCategoryId === '' ? colors.borderLight : colors.bgTertiary,
                                        borderWidth: 1, borderColor: fCategoryId === '' ? colors.textMuted : colors.borderLight,
                                    }}
                                >
                                    <Text style={{ color: fCategoryId === '' ? colors.textPrimary : colors.textMuted, fontSize: 13 }}>{t('recurring.noCategory')}</Text>
                                </TouchableOpacity>
                                {filteredCategories.map(cat => {
                                    const col = cat.color ?? '#6b7280';
                                    const sel = fCategoryId === cat.id;
                                    return (
                                        <TouchableOpacity
                                            key={cat.id}
                                            onPress={() => setFCategoryId(cat.id)}
                                            style={{
                                                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, marginRight: 8,
                                                backgroundColor: sel ? col + '22' : colors.bgTertiary,
                                                borderWidth: 1, borderColor: sel ? col : colors.borderLight,
                                            }}
                                        >
                                            <Text style={{ color: sel ? col : colors.textSecondary, fontSize: 13, fontWeight: sel ? '600' : '400' }}>
                                                {cat.name}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>

                            {/* Notify */}
                            <FieldLabel>{t('recurring.notifyBefore')}</FieldLabel>
                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 28 }}>
                                {[1, 3, 7].map(n => (
                                    <TouchableOpacity
                                        key={n}
                                        onPress={() => setFNotify(n)}
                                        style={{
                                            flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                                            backgroundColor: fNotify === n ? '#2563eb' : colors.bgTertiary,
                                            borderWidth: 1, borderColor: fNotify === n ? '#3b82f6' : colors.borderLight,
                                        }}
                                    >
                                        <Text style={{ color: fNotify === n ? colors.textPrimary : colors.textSecondary, fontWeight: '600', fontSize: 14 }}>
                                            {t('recurring.dayN', { count: n })}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Save */}
                            <TouchableOpacity
                                onPress={handleSave}
                                disabled={saving || !fName.trim() || !fAmount || !fAccountId}
                                style={{
                                    backgroundColor: '#2563eb', borderRadius: 14,
                                    paddingVertical: 16, alignItems: 'center', marginBottom: 12,
                                    opacity: saving || !fName.trim() || !fAmount || !fAccountId ? 0.5 : 1,
                                }}
                            >
                                <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 16 }}>
                                    {saving ? t('common.saving') : editing ? t('common.save') : t('common.create')}
                                </Text>
                            </TouchableOpacity>
            </BaseBottomSheet>
        </View>
    );
}

// ─── Small components ─────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
    const { colors } = useTheme();
    return <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 8 }}>{children}</Text>;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const titleStyle = {
    fontSize: 20,
    fontWeight: '700' as const,
} as const;

const inputStyle = {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 20,
} as const;
