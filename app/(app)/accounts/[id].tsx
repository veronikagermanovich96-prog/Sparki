import { CurrencyPicker } from '@/components/ui/CurrencyPicker';
import TransactionForm, { EditingTx } from '@/components/TransactionForm';
import { CURRENCY_MAP, formatAmount } from '@/constants/currencies';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { Account, Transaction, Frequency } from '@/types';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { router, useLocalSearchParams } from 'expo-router';
import {
    ArrowDownToLine,
    ArrowRightLeft,
    Banknote,
    Bitcoin,
    Briefcase,
    Building2,
    Car,
    Check,
    ChevronLeft,
    CircleDollarSign,
    Coins,
    CreditCard,
    Globe,
    Home,
    Landmark,
    Minus,
    Pencil,
    PiggyBank,
    Smartphone,
    TrendingUp,
    Wallet,
    X,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { BaseBottomSheet } from '@/components/ui/BaseBottomSheet';

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

const PERIOD_PICKER_LABELS: Record<Frequency, string> = {
    daily: i18n.t('accounts.periodDay'),
    weekly: i18n.t('accounts.periodWeek'),
    monthly: i18n.t('accounts.periodMonth'),
    yearly: i18n.t('accounts.periodYear'),
};

// ─── Types ────────────────────────────────────────────────────────────────────

type TxWithCategory = Transaction & {
    category: { name: string; icon: string | null; color: string | null } | null;
};

type AccountLight  = { id: string; name: string; color: string | null; currency: string; balance: number }; // eslint-disable-line @typescript-eslint/no-unused-vars
type CategoryLight = { id: string; name: string; slug: string | null; icon: string | null; color: string | null; type: 'income' | 'expense'; expense_type: string | null; is_system: boolean };

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AccountDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { colors } = useTheme();
    const { t } = useTranslation();

    const [account, setAccount] = useState<Account | null>(null);
    const [allAccounts, setAllAccounts] = useState<Account[]>([]);
    const [transactions, setTransactions] = useState<TxWithCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [txLoading, setTxLoading] = useState(true);

    // Edit sheet
    const [showEditSheet, setShowEditSheet] = useState(false);
    const [editName, setEditName] = useState('');
    const [editIcon, setEditIcon] = useState('CreditCard');
    const [editColor, setEditColor] = useState('#3b82f6');
    const [editExclude, setEditExclude] = useState(false);
    const [editLimit, setEditLimit] = useState('');
    const [editLimitPeriod, setEditLimitPeriod] = useState<Frequency>('monthly');
    const [editCurrency, setEditCurrency] = useState('EUR');
    const [editSaving, setEditSaving] = useState(false);

    // Transaction form
    const [formVisible, setFormVisible] = useState(false);
    const [editingTx, setEditingTx] = useState<EditingTx | null>(null);
    const [categories, setCategories] = useState<CategoryLight[]>([]);
    const [householdId, setHouseholdId] = useState('');
    const [userId, setUserId] = useState('');
    const [baseCurrency, setBaseCurrency] = useState('EUR');

    // Transfer-on-delete sheet
    const [showTransferDeleteSheet, setShowTransferDeleteSheet] = useState(false);
    const [pendingDeleteAccount, setPendingDeleteAccount] = useState<Account | null>(null);

    useEffect(() => {
        if (id) loadData(id);
    }, [id]);

    async function loadData(accountId: string) {
        setLoading(true);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setUserId(user.id);

        const { data: member } = await supabase
            .from('household_members')
            .select('household_id')
            .eq('user_id', user.id)
            .single();
        if (!member) return;
        setHouseholdId(member.household_id);

        // Fetch the account
        const { data: acc } = await supabase
            .from('accounts')
            .select('*')
            .eq('id', accountId)
            .single();

        if (acc) {
            setAccount(acc);
            setEditName(acc.name);
            setEditIcon(acc.icon ?? 'CreditCard');
            setEditColor(acc.color ?? '#3b82f6');
            setEditCurrency(acc.currency);
            setEditExclude(acc.exclude_from_dashboard);
        }
        setLoading(false);

        // Fetch all accounts (for transfer-on-delete picker)
        const { data: allAcc } = await supabase
            .from('accounts')
            .select('*')
            .eq('household_id', member.household_id)
            .eq('is_deleted', false);
        setAllAccounts(allAcc ?? []);

        // Fetch categories
        const { data: cats } = await supabase
            .from('categories')
            .select('id, name, icon, color, type, expense_type, is_system')
            .eq('household_id', member.household_id)
            .eq('is_deleted', false)
            .order('sort_order');
        setCategories((cats as CategoryLight[]) ?? []);

        // Base currency from first non-excluded account
        const primary = (allAcc ?? []).find(a => !a.exclude_from_dashboard);
        if (primary) setBaseCurrency(primary.currency);

        // Fetch transactions for this account
        setTxLoading(true);
        const { data: txns } = await supabase
            .from('transactions')
            .select('*, category:categories(name, icon, color)')
            .eq('account_id', accountId)
            .eq('is_deleted', false)
            .order('date', { ascending: false })
            .limit(100);
        setTransactions((txns as TxWithCategory[]) ?? []);
        setTxLoading(false);
    }

    // ─── Edit ─────────────────────────────────────────────────────────────────

    function openEdit() {
        if (!account) return;
        setEditName(account.name);
        setEditIcon(account.icon ?? 'CreditCard');
        setEditColor(account.color ?? '#3b82f6');
        setEditCurrency(account.currency);
        setEditExclude(account.exclude_from_dashboard);
        setEditLimit(account.spending_limit != null ? String(account.spending_limit) : '');
        setEditLimitPeriod(account.spending_limit_period ?? 'monthly');
        setShowEditSheet(true);
    }

    async function saveEdit() {
        if (!account || !editName.trim()) return;
        setEditSaving(true);

        const { data: updated } = await supabase
            .from('accounts')
            .update({
                name: editName.trim(),
                icon: editIcon,
                color: editColor,
                currency: editCurrency,
                exclude_from_dashboard: editExclude,
                spending_limit: editLimit ? parseFloat(editLimit) : null,
                spending_limit_period: editLimit ? editLimitPeriod : null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', account.id)
            .select()
            .single();

        if (updated) setAccount(updated as Account);
        setEditSaving(false);
        setShowEditSheet(false);
    }

    async function toggleExclude(value: boolean) {
        if (!account) return;
        setEditExclude(value);
        setAccount({ ...account, exclude_from_dashboard: value });
        await supabase
            .from('accounts')
            .update({ exclude_from_dashboard: value, updated_at: new Date().toISOString() })
            .eq('id', account.id);
    }

    // ─── Delete ───────────────────────────────────────────────────────────────

    function confirmDelete() {
        if (!account) return;
        Alert.alert(
            t('accounts.deleteAccountTitle', { name: account.name }),
            t('accounts.deleteIrreversible'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('common.delete'), style: 'destructive', onPress: checkAndDelete },
            ],
        );
    }

    async function checkAndDelete() {
        if (!account) return;

        const { count } = await supabase
            .from('transactions')
            .select('*', { count: 'exact', head: true })
            .eq('account_id', account.id)
            .eq('is_deleted', false);

        const others = allAccounts.filter(a => a.id !== account.id);

        if (!count) {
            // No transactions — just delete
            performDelete(account, 'delete');
        } else if (others.length === 0) {
            // Has transactions, no other accounts to transfer to
            Alert.alert(
                t('accounts.whatToDoWithHistory'),
                t('accounts.accountHasNTransactions', { count }),
                [
                    { text: t('common.back'), style: 'cancel' },
                    { text: t('accounts.deleteAll'), style: 'destructive', onPress: () => performDelete(account, 'delete') },
                ],
            );
        } else {
            // Offer transfer to another account
            setPendingDeleteAccount(account);
            setShowEditSheet(false);
            setShowTransferDeleteSheet(true);
        }
    }

    async function performDelete(acc: Account, mode: 'delete' | 'transfer', targetId?: string) {
        setShowTransferDeleteSheet(false);

        if (mode === 'transfer' && targetId) {
            const { data: txns } = await supabase
                .from('transactions')
                .select('id, note')
                .eq('account_id', acc.id)
                .eq('is_deleted', false);

            for (const txn of txns ?? []) {
                await supabase.from('transactions').update({
                    account_id: targetId,
                    note: txn.note ? `${txn.note} (ex ${acc.name})` : `ex ${acc.name}`,
                }).eq('id', txn.id);
            }
        }

        await supabase.from('accounts').update({
            is_deleted: true,
            deleted_at: new Date().toISOString(),
            former_name: acc.name,
        }).eq('id', acc.id);

        router.back();
    }

    // ─── Transaction form ─────────────────────────────────────────────────────

    function openForm(txn?: TxWithCategory) {
        if (txn) {
            setEditingTx({
                id: txn.id,
                type: txn.type,
                amount: txn.amount,
                currency: txn.currency,
                exchange_rate: txn.exchange_rate,
                date: txn.date,
                note: txn.note,
                receipt_url: txn.receipt_url,
                recurring_id: txn.recurring_id,
                account_id: txn.account_id,
                category_id: txn.category_id,
                tag_id: (txn as any).tag_id ?? null,
            });
        } else {
            setEditingTx(null);
        }
        setFormVisible(true);
    }

    // ─── Transaction row ──────────────────────────────────────────────────────

    function TransactionRow({ txn }: { txn: TxWithCategory }) {
        const isIncome = txn.type === 'income';
        const isTransfer = txn.type === 'transfer';
        const amountColor = isIncome ? '#22c55e' : isTransfer ? '#3b82f6' : '#ef4444';
        const sign = isIncome ? '+' : '−';

        const label = txn.category?.name
            ?? (isTransfer ? t('accounts.transferType') : isIncome ? t('accounts.topUpType') : t('accounts.expenseType'));

        let dateStr = '';
        try {
            dateStr = format(new Date(txn.date), 'd MMM yyyy', { locale: ru });
        } catch { /* ignore */ }

        return (
            <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => openForm(txn)}
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 13,
                    paddingHorizontal: 20,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.bgSecondary,
                }}
            >
                <View style={{
                    width: 38, height: 38, borderRadius: 11,
                    backgroundColor: amountColor + '1a',
                    alignItems: 'center', justifyContent: 'center',
                    marginRight: 12,
                }}>
                    {isIncome
                        ? <ArrowDownToLine color={amountColor} size={17} />
                        : isTransfer
                            ? <ArrowRightLeft color={amountColor} size={17} />
                            : <Minus color={amountColor} size={17} />
                    }
                </View>

                <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '500' }}>{label}</Text>
                    {txn.note ? (
                        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{txn.note}</Text>
                    ) : null}
                    <Text style={{ color: colors.textDisabled, fontSize: 12, marginTop: 2 }}>{dateStr}</Text>
                </View>

                <Text style={{ color: amountColor, fontWeight: '600', fontSize: 15 }}>
                    {sign}{formatAmount(txn.amount, txn.currency)}
                </Text>
            </TouchableOpacity>
        );
    }

    // ─── Loading state ────────────────────────────────────────────────────────

    if (loading || !account) {
        return (
            <View style={{ flex: 1, backgroundColor: colors.bgPrimary, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator color={colors.textPrimary} size="large" />
            </View>
        );
    }

    const IC = ICON_MAP[account.icon ?? 'CreditCard'] ?? CreditCard;
    const col = account.color ?? '#3b82f6';

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>

            {/* ── Top bar ── */}
            <View style={{
                flexDirection: 'row', alignItems: 'center',
                paddingTop: 60, paddingHorizontal: 20, paddingBottom: 12,
            }}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={{ marginRight: 10 }}>
                    <ChevronLeft color={colors.textPrimary} size={26} />
                </TouchableOpacity>
                <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                    {account.name}
                </Text>
                <TouchableOpacity onPress={openEdit} hitSlop={12}>
                    <Pencil color={colors.textMuted} size={20} />
                </TouchableOpacity>
            </View>

            {/* ── Account card ── */}
            <View style={{
                marginHorizontal: 20,
                backgroundColor: colors.bgSecondary,
                borderRadius: 20,
                padding: 20,
                marginBottom: 8,
                borderWidth: 1,
                borderColor: col + '44',
            }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                    <View style={{
                        width: 52, height: 52, borderRadius: 15,
                        backgroundColor: col + '22',
                        alignItems: 'center', justifyContent: 'center',
                        marginRight: 14,
                    }}>
                        <IC color={col} size={24} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                            {CURRENCY_MAP[account.currency]?.flag ?? ''} {account.currency}
                        </Text>
                        {account.exclude_from_dashboard && (
                            <Text style={{ color: colors.textDisabled, fontSize: 11, marginTop: 3 }}>{t('accounts.hiddenFromCalc')}</Text>
                        )}
                    </View>

                    {/* Quick exclude toggle */}
                    <Switch
                        value={!account.exclude_from_dashboard}
                        onValueChange={v => toggleExclude(!v)}
                        trackColor={{ false: colors.borderLight, true: col + 'aa' }}
                        thumbColor={colors.textPrimary}
                    />
                </View>

                <Text style={{ color: colors.textPrimary, fontSize: 34, fontWeight: '800', letterSpacing: -0.5 }}>
                    {formatAmount(account.balance, account.currency)}
                </Text>
                {account.exclude_from_dashboard && (
                    <Text style={{ color: colors.textDisabled, fontSize: 12, marginTop: 6 }}>
                        {t('accounts.notCountedInBalance')}
                    </Text>
                )}
            </View>

            {/* ── Transactions section ── */}
            <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 20,
                paddingVertical: 12,
            }}>
                <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700', flex: 1 }}>
                    {t('accounts.transactionHistory')}
                </Text>
                {txLoading && <ActivityIndicator size="small" color={colors.textMuted} />}
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 60 }}>
                {!txLoading && transactions.length === 0 ? (
                    <View style={{ alignItems: 'center', marginTop: 48 }}>
                        <Text style={{ color: colors.borderLight, fontSize: 15 }}>{t('accounts.noTransactions')}</Text>
                        <Text style={{ color: colors.bgTertiary, fontSize: 13, marginTop: 6 }}>
                            {t('accounts.addOrTopUp')}
                        </Text>
                    </View>
                ) : (
                    transactions.map(txn => <TransactionRow key={txn.id} txn={txn} />)
                )}
            </ScrollView>

            {/* ════════════════════════════════════════
                Edit bottom sheet
            ════════════════════════════════════════ */}
            <BaseBottomSheet visible={showEditSheet} onClose={() => setShowEditSheet(false)} maxHeight="92%">
                        <SheetHandle />
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                            <Text style={[titleStyle, { color: colors.textPrimary }]}>{t('accounts.editAccount')}</Text>
                            <TouchableOpacity onPress={() => setShowEditSheet(false)}>
                                <X color={colors.textMuted} size={22} />
                            </TouchableOpacity>
                        </View>

                            <Label>{t('accounts.accountName')}</Label>
                            <TextInput
                                style={[inputStyle, { backgroundColor: colors.bgTertiary, borderColor: colors.borderLight, color: colors.textPrimary }]}
                                placeholder={t('accounts.placeholder')}
                                placeholderTextColor={colors.textDisabled}
                                value={editName}
                                onChangeText={setEditName}
                            />

                            <Label>{t('common.icon')}</Label>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                                {ICON_NAMES.map(iconName => {
                                    const IC2 = ICON_MAP[iconName]!;
                                    const sel = editIcon === iconName;
                                    return (
                                        <TouchableOpacity key={iconName} onPress={() => setEditIcon(iconName)} style={{
                                            width: 48, height: 48, borderRadius: 14, marginRight: 8,
                                            borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
                                            backgroundColor: sel ? editColor + '33' : colors.bgTertiary,
                                            borderColor: sel ? editColor : colors.borderLight,
                                        }}>
                                            <IC2 color={sel ? editColor : colors.textMuted} size={22} />
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>

                            <Label>{t('common.color')}</Label>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
                                {COLOR_PRESETS.map(c => (
                                    <TouchableOpacity key={c} onPress={() => setEditColor(c)} style={{
                                        width: 36, height: 36, borderRadius: 18, backgroundColor: c,
                                        alignItems: 'center', justifyContent: 'center',
                                        borderWidth: editColor === c ? 2 : 0, borderColor: colors.textPrimary,
                                    }}>
                                        {editColor === c && <Check color={colors.textPrimary} size={16} />}
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <Label>{t('common.currency')}</Label>
                            <CurrencyPicker value={editCurrency} onSelect={setEditCurrency} />

                            <View style={{
                                flexDirection: 'row', alignItems: 'center',
                                backgroundColor: colors.bgTertiary, borderRadius: 14,
                                padding: 16, marginBottom: 24,
                            }}>
                                <View style={{ flex: 1, marginRight: 12 }}>
                                    <Text style={{ color: colors.textPrimary, fontSize: 15 }}>{t('accounts.hideFromBalance')}</Text>
                                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{t('accounts.hideHint')}</Text>
                                </View>
                                <Switch
                                    value={editExclude}
                                    onValueChange={setEditExclude}
                                    trackColor={{ false: colors.borderLight, true: '#2563eb' }}
                                    thumbColor={colors.textPrimary}
                                />
                            </View>

                            <Label>{t('accounts.spendingLimit', { currency: editCurrency })}</Label>
                            <TextInput
                                style={[inputStyle, { backgroundColor: colors.bgTertiary, borderColor: colors.borderLight, color: colors.textPrimary }]}
                                placeholder={t('accounts.noLimit')}
                                placeholderTextColor={colors.textDisabled}
                                value={editLimit}
                                onChangeText={t => setEditLimit(t.replace(/[^0-9.]/g, ''))}
                                keyboardType="decimal-pad"
                            />
                            {!!editLimit && parseFloat(editLimit) > 0 && (
                                <>
                                    <Label>{t('accounts.limitPeriod')}</Label>
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                                        {(['daily', 'weekly', 'monthly', 'yearly'] as Frequency[]).map(f => (
                                            <TouchableOpacity
                                                key={f}
                                                onPress={() => setEditLimitPeriod(f)}
                                                style={{
                                                    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
                                                    backgroundColor: editLimitPeriod === f ? '#2563eb' : colors.bgTertiary,
                                                    borderWidth: 1, borderColor: editLimitPeriod === f ? '#3b82f6' : colors.borderLight,
                                                }}
                                            >
                                                <Text style={{ color: editLimitPeriod === f ? colors.textPrimary : colors.textSecondary, fontSize: 13 }}>
                                                    {PERIOD_PICKER_LABELS[f]}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </>
                            )}
                            <Text style={{ color: colors.textDisabled, fontSize: 12, marginTop: -12, marginBottom: 20, marginLeft: 4 }}>
                                {t('accounts.progressBarHint')}
                            </Text>

                            <PrimaryButton
                                label={editSaving ? t('common.saving') : t('common.save')}
                                onPress={saveEdit}
                                disabled={editSaving || !editName.trim()}
                            />
                            <DangerButton label={t('accounts.deleteAccount')} onPress={confirmDelete} />
            </BaseBottomSheet>

            {/* ════════════════════════════════════════
                Transfer-on-delete sheet
            ════════════════════════════════════════ */}
            <BaseBottomSheet visible={showTransferDeleteSheet} onClose={() => setShowTransferDeleteSheet(false)} scrollable={false}>
                    <SheetHandle />
                    <Text style={[titleStyle, { color: colors.textPrimary, marginBottom: 6 }]}>{t('accounts.whatToDoWithHistory')}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 14, marginBottom: 20 }}>
                        {t('accounts.moveTransactions')}
                    </Text>

                    {allAccounts
                        .filter(a => a.id !== pendingDeleteAccount?.id)
                        .map(acc => {
                            const IC2 = ICON_MAP[acc.icon ?? 'CreditCard'] ?? CreditCard;
                            const c = acc.color ?? '#3b82f6';
                            return (
                                <TouchableOpacity
                                    key={acc.id}
                                    onPress={() => pendingDeleteAccount && performDelete(pendingDeleteAccount, 'transfer', acc.id)}
                                    style={{
                                        flexDirection: 'row', alignItems: 'center',
                                        backgroundColor: colors.bgTertiary, borderRadius: 14,
                                        padding: 14, marginBottom: 8,
                                    }}
                                >
                                    <View style={{
                                        width: 40, height: 40, borderRadius: 12,
                                        backgroundColor: c + '22',
                                        alignItems: 'center', justifyContent: 'center', marginRight: 12,
                                    }}>
                                        <IC2 color={c} size={18} />
                                    </View>
                                    <Text style={{ color: colors.textPrimary, fontSize: 15, flex: 1 }}>{acc.name}</Text>
                                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                                        {formatAmount(acc.balance, acc.currency)}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}

                    <DangerButton
                        label={t('accounts.deleteAllTransactions')}
                        onPress={() => pendingDeleteAccount && performDelete(pendingDeleteAccount, 'delete')}
                    />
                    <TouchableOpacity
                        onPress={() => setShowTransferDeleteSheet(false)}
                        style={{ paddingVertical: 14, alignItems: 'center' }}
                    >
                        <Text style={{ color: colors.textMuted }}>{t('common.back')}</Text>
                    </TouchableOpacity>
            </BaseBottomSheet>

            <TransactionForm
                visible={formVisible}
                onClose={() => { setFormVisible(false); setEditingTx(null); }}
                onSaved={() => { setFormVisible(false); setEditingTx(null); if (id) loadData(id); }}
                accounts={allAccounts.map(a => ({ id: a.id, name: a.name, color: a.color, currency: a.currency, balance: a.balance }))}
                categories={categories}
                householdId={householdId}
                userId={userId}
                baseCurrency={baseCurrency}
                editingTx={editingTx}
                initialAccountId={id}
            />
        </View>
    );
}

// ─── Small pieces ─────────────────────────────────────────────────────────────

function SheetHandle() {
    const { colors } = useTheme();
    return <View style={{ width: 40, height: 4, backgroundColor: colors.borderLight, borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />;
}

function Label({ children }: { children: React.ReactNode }) {
    const { colors } = useTheme();
    return <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 8 }}>{children}</Text>;
}

function PrimaryButton({ label, onPress, disabled, color = '#2563eb' }: {
    label: string; onPress: () => void; disabled?: boolean; color?: string;
}) {
    const { colors } = useTheme();
    return (
        <TouchableOpacity onPress={onPress} disabled={disabled} style={{
            backgroundColor: color, borderRadius: 14, paddingVertical: 16,
            alignItems: 'center', marginBottom: 12, opacity: disabled ? 0.5 : 1,
        }}>
            <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 16 }}>{label}</Text>
        </TouchableOpacity>
    );
}

function DangerButton({ label, onPress }: { label: string; onPress: () => void }) {
    return (
        <TouchableOpacity onPress={onPress} style={{
            borderWidth: 1, borderColor: '#7f1d1d', borderRadius: 14,
            paddingVertical: 16, alignItems: 'center', marginBottom: 8,
        }}>
            <Text style={{ color: '#ef4444', fontWeight: '600', fontSize: 16 }}>{label}</Text>
        </TouchableOpacity>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
} as const;
