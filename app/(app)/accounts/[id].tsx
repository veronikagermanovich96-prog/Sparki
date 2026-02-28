import { CURRENCY_MAP, formatAmount } from '@/constants/currencies';
import { supabase } from '@/lib/supabase';
import { Account, Transaction } from '@/types';
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

// ─── Types ────────────────────────────────────────────────────────────────────

type TxWithCategory = Transaction & {
    category: { name: string; icon: string | null; color: string | null } | null;
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AccountDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();

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
    const [editSaving, setEditSaving] = useState(false);

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

        const { data: member } = await supabase
            .from('household_members')
            .select('household_id')
            .eq('user_id', user.id)
            .single();
        if (!member) return;

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
        setEditExclude(account.exclude_from_dashboard);
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
                exclude_from_dashboard: editExclude,
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
            `Удалить счёт «${account.name}»?`,
            'Это действие нельзя отменить.',
            [
                { text: 'Отмена', style: 'cancel' },
                { text: 'Удалить', style: 'destructive', onPress: checkAndDelete },
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
                'Что сделать с историей?',
                `На счёте ${count} транзакций — они будут удалены.`,
                [
                    { text: 'Назад', style: 'cancel' },
                    { text: 'Удалить всё', style: 'destructive', onPress: () => performDelete(account, 'delete') },
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

    // ─── Transaction row ──────────────────────────────────────────────────────

    function TransactionRow({ txn }: { txn: TxWithCategory }) {
        const isIncome = txn.type === 'income';
        const isTransfer = txn.type === 'transfer';
        const amountColor = isIncome ? '#22c55e' : isTransfer ? '#3b82f6' : '#ef4444';
        const sign = isIncome ? '+' : '−';

        const label = txn.category?.name
            ?? (isTransfer ? 'Перевод' : isIncome ? 'Пополнение' : 'Расход');

        let dateStr = '';
        try {
            dateStr = format(new Date(txn.date), 'd MMM yyyy', { locale: ru });
        } catch { /* ignore */ }

        return (
            <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 13,
                paddingHorizontal: 20,
                borderBottomWidth: 1,
                borderBottomColor: '#111827',
            }}>
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
                    <Text style={{ color: '#e5e7eb', fontSize: 14, fontWeight: '500' }}>{label}</Text>
                    {txn.note ? (
                        <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }} numberOfLines={1}>{txn.note}</Text>
                    ) : null}
                    <Text style={{ color: '#4b5563', fontSize: 12, marginTop: 2 }}>{dateStr}</Text>
                </View>

                <Text style={{ color: amountColor, fontWeight: '600', fontSize: 15 }}>
                    {sign}{formatAmount(txn.amount, txn.currency)}
                </Text>
            </View>
        );
    }

    // ─── Loading state ────────────────────────────────────────────────────────

    if (loading || !account) {
        return (
            <View style={{ flex: 1, backgroundColor: '#030712', justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator color="#fff" size="large" />
            </View>
        );
    }

    const IC = ICON_MAP[account.icon ?? 'CreditCard'] ?? CreditCard;
    const col = account.color ?? '#3b82f6';

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <View style={{ flex: 1, backgroundColor: '#030712' }}>

            {/* ── Top bar ── */}
            <View style={{
                flexDirection: 'row', alignItems: 'center',
                paddingTop: 60, paddingHorizontal: 20, paddingBottom: 12,
            }}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={{ marginRight: 10 }}>
                    <ChevronLeft color="#fff" size={26} />
                </TouchableOpacity>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                    {account.name}
                </Text>
                <TouchableOpacity onPress={openEdit} hitSlop={12}>
                    <Pencil color="#6b7280" size={20} />
                </TouchableOpacity>
            </View>

            {/* ── Account card ── */}
            <View style={{
                marginHorizontal: 20,
                backgroundColor: '#111827',
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
                        <Text style={{ color: '#9ca3af', fontSize: 13 }}>
                            {CURRENCY_MAP[account.currency]?.flag ?? ''} {account.currency}
                        </Text>
                        {account.exclude_from_dashboard && (
                            <Text style={{ color: '#4b5563', fontSize: 11, marginTop: 3 }}>Скрыт из расчётов</Text>
                        )}
                    </View>

                    {/* Quick exclude toggle */}
                    <Switch
                        value={!account.exclude_from_dashboard}
                        onValueChange={v => toggleExclude(!v)}
                        trackColor={{ false: '#374151', true: col + 'aa' }}
                        thumbColor="#fff"
                    />
                </View>

                <Text style={{ color: '#fff', fontSize: 34, fontWeight: '800', letterSpacing: -0.5 }}>
                    {formatAmount(account.balance, account.currency)}
                </Text>
                {account.exclude_from_dashboard && (
                    <Text style={{ color: '#4b5563', fontSize: 12, marginTop: 6 }}>
                        Не учитывается в общем балансе
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
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', flex: 1 }}>
                    История транзакций
                </Text>
                {txLoading && <ActivityIndicator size="small" color="#6b7280" />}
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 60 }}>
                {!txLoading && transactions.length === 0 ? (
                    <View style={{ alignItems: 'center', marginTop: 48 }}>
                        <Text style={{ color: '#374151', fontSize: 15 }}>Нет транзакций</Text>
                        <Text style={{ color: '#1f2937', fontSize: 13, marginTop: 6 }}>
                            Пополните счёт или добавьте расход
                        </Text>
                    </View>
                ) : (
                    transactions.map(txn => <TransactionRow key={txn.id} txn={txn} />)
                )}
            </ScrollView>

            {/* ════════════════════════════════════════
                Edit bottom sheet
            ════════════════════════════════════════ */}
            <Modal
                visible={showEditSheet}
                transparent
                animationType="slide"
                onRequestClose={() => setShowEditSheet(false)}
            >
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                    <Pressable style={{ flex: 1 }} onPress={() => setShowEditSheet(false)} />
                    <View style={sheetStyle}>
                        <SheetHandle />
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                            <Text style={titleStyle}>Редактировать счёт</Text>
                            <TouchableOpacity onPress={() => setShowEditSheet(false)}>
                                <X color="#6b7280" size={22} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                            <Label>Название</Label>
                            <TextInput
                                style={inputStyle}
                                placeholder="Основная карта"
                                placeholderTextColor="#4b5563"
                                value={editName}
                                onChangeText={setEditName}
                            />

                            <Label>Иконка</Label>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                                {ICON_NAMES.map(iconName => {
                                    const IC2 = ICON_MAP[iconName]!;
                                    const sel = editIcon === iconName;
                                    return (
                                        <TouchableOpacity key={iconName} onPress={() => setEditIcon(iconName)} style={{
                                            width: 48, height: 48, borderRadius: 14, marginRight: 8,
                                            borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
                                            backgroundColor: sel ? editColor + '33' : '#1f2937',
                                            borderColor: sel ? editColor : '#374151',
                                        }}>
                                            <IC2 color={sel ? editColor : '#6b7280'} size={22} />
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>

                            <Label>Цвет</Label>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
                                {COLOR_PRESETS.map(c => (
                                    <TouchableOpacity key={c} onPress={() => setEditColor(c)} style={{
                                        width: 36, height: 36, borderRadius: 18, backgroundColor: c,
                                        alignItems: 'center', justifyContent: 'center',
                                        borderWidth: editColor === c ? 2 : 0, borderColor: '#fff',
                                    }}>
                                        {editColor === c && <Check color="#fff" size={16} />}
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <View style={{
                                flexDirection: 'row', alignItems: 'center',
                                backgroundColor: '#1f2937', borderRadius: 14,
                                padding: 16, marginBottom: 24,
                            }}>
                                <View style={{ flex: 1, marginRight: 12 }}>
                                    <Text style={{ color: '#fff', fontSize: 15 }}>Скрыть из активного баланса</Text>
                                    <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>Счёт виден, но не учитывается в лимитах</Text>
                                </View>
                                <Switch
                                    value={editExclude}
                                    onValueChange={setEditExclude}
                                    trackColor={{ false: '#374151', true: '#2563eb' }}
                                    thumbColor="#fff"
                                />
                            </View>

                            <PrimaryButton
                                label={editSaving ? 'Сохранение…' : 'Сохранить'}
                                onPress={saveEdit}
                                disabled={editSaving || !editName.trim()}
                            />
                            <DangerButton label="Удалить счёт" onPress={confirmDelete} />
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ════════════════════════════════════════
                Transfer-on-delete sheet
            ════════════════════════════════════════ */}
            <Modal
                visible={showTransferDeleteSheet}
                transparent
                animationType="slide"
                onRequestClose={() => setShowTransferDeleteSheet(false)}
            >
                <Pressable style={{ flex: 1 }} onPress={() => setShowTransferDeleteSheet(false)} />
                <View style={sheetStyle}>
                    <SheetHandle />
                    <Text style={[titleStyle, { marginBottom: 6 }]}>Что сделать с историей?</Text>
                    <Text style={{ color: '#6b7280', fontSize: 14, marginBottom: 20 }}>
                        Перенести транзакции на другой счёт или удалить?
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
                                        backgroundColor: '#1f2937', borderRadius: 14,
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
                                    <Text style={{ color: '#fff', fontSize: 15, flex: 1 }}>{acc.name}</Text>
                                    <Text style={{ color: '#6b7280', fontSize: 13 }}>
                                        {formatAmount(acc.balance, acc.currency)}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}

                    <DangerButton
                        label="Удалить все транзакции"
                        onPress={() => pendingDeleteAccount && performDelete(pendingDeleteAccount, 'delete')}
                    />
                    <TouchableOpacity
                        onPress={() => setShowTransferDeleteSheet(false)}
                        style={{ paddingVertical: 14, alignItems: 'center' }}
                    >
                        <Text style={{ color: '#6b7280' }}>Назад</Text>
                    </TouchableOpacity>
                </View>
            </Modal>
        </View>
    );
}

// ─── Small pieces ─────────────────────────────────────────────────────────────

function SheetHandle() {
    return <View style={{ width: 40, height: 4, backgroundColor: '#374151', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />;
}

function Label({ children }: { children: React.ReactNode }) {
    return <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 8 }}>{children}</Text>;
}

function PrimaryButton({ label, onPress, disabled, color = '#2563eb' }: {
    label: string; onPress: () => void; disabled?: boolean; color?: string;
}) {
    return (
        <TouchableOpacity onPress={onPress} disabled={disabled} style={{
            backgroundColor: color, borderRadius: 14, paddingVertical: 16,
            alignItems: 'center', marginBottom: 12, opacity: disabled ? 0.5 : 1,
        }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{label}</Text>
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

const sheetStyle = {
    backgroundColor: '#111827',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
    maxHeight: '92%',
} as const;

const titleStyle = {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
} as const;

const inputStyle = {
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
    marginBottom: 20,
} as const;
