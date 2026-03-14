import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { differenceInDays, format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ChevronLeft, Pencil } from 'lucide-react-native';
import { IconArray, DotData } from '@/components/icon-array/IconArray';
import { supabase } from '@/lib/supabase';
import { formatAmount, CURRENCIES } from '@/constants/currencies';
import { Account } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type Compounding = 'monthly' | 'yearly';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const labelStyle = { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6 } as const;
const inputStyle = {
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, color: '#fff',
    fontSize: 15, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 20,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)',
} as const;

function Legend({ color, label, outline }: { color: string; label: string; outline?: boolean }) {
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{
                width: 10, height: 10, borderRadius: 5,
                backgroundColor: outline ? 'transparent' : color,
                borderWidth: outline ? 1.5 : 0,
                borderColor: color,
            }} />
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{label}</Text>
        </View>
    );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function GoalScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{
        id: string;
        name: string;
        icon: string;
        color: string;
        target: string;
        saved: string;
        currency: string;
        targetDate: string;
        accountId: string;
    }>();

    const id          = params.id ?? '';
    const name        = params.name ?? '';
    const icon        = params.icon ?? '🎯';
    const color       = params.color ?? '#7C6FFF';
    const target      = parseFloat(params.target ?? '0') || 0;
    const saved       = parseFloat(params.saved  ?? '0') || 0;
    const currency    = params.currency ?? 'EUR';
    const targetDate  = params.targetDate && params.targetDate !== 'null' ? params.targetDate : null;
    const accountId   = params.accountId ?? '';

    // ── Calculator state ─────────────────────────────────────────────────────
    const [rate, setRate]               = useState(5.0);
    const [rateInput, setRateInput]     = useState('5.0');
    const [compounding, setCompounding] = useState<Compounding>('monthly');
    const [archiving, setArchiving]     = useState(false);
    const [showArchiveSheet, setShowArchiveSheet] = useState(false);

    // ── Edit state ───────────────────────────────────────────────────────────
    const [showEditModal, setShowEditModal] = useState(false);
    const [editName, setEditName] = useState(name);
    const [editIcon, setEditIcon] = useState(icon);
    const [editColor, setEditColor] = useState(color);
    const [editTarget, setEditTarget] = useState(String(target));
    const [editCurrency, setEditCurrency] = useState(currency);
    const [editDate, setEditDate] = useState<Date | null>(targetDate ? new Date(targetDate) : null);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);
    const [currencySearch, setCurrencySearch] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);

    // ── Top-up state ──────────────────────────────────────────────────────
    const [showTopUp, setShowTopUp] = useState(false);
    const [topUpAmount, setTopUpAmount] = useState('');
    const [topUpAccountId, setTopUpAccountId] = useState('');
    const [topUpDate, setTopUpDate] = useState<Date>(new Date());
    const [showTopUpDatePicker, setShowTopUpDatePicker] = useState(false);
    const [savingTopUp, setSavingTopUp] = useState(false);
    const [accounts, setAccounts] = useState<Account[]>([]);

    // ── Fetch accounts ────────────────────────────────────────────────────
    useEffect(() => {
        (async () => {
            const uid = (await supabase.auth.getUser()).data.user?.id;
            if (!uid) return;
            const { data: hm } = await supabase.from('household_members').select('household_id').eq('user_id', uid).single();
            if (!hm) return;
            const { data } = await supabase.from('accounts').select('*').eq('household_id', hm.household_id).eq('is_deleted', false).order('sort_order');
            setAccounts((data ?? []) as Account[]);
        })();
    }, []);

    // Load persisted settings
    useEffect(() => {
        if (!id) return;
        AsyncStorage.getItem(`goal_calc_${id}`).then(raw => {
            if (!raw) return;
            try {
                const { rate: r, compounding: c } = JSON.parse(raw);
                if (typeof r === 'number' && r >= 0 && r <= 50) {
                    setRate(r);
                    setRateInput(String(r));
                }
                if (c === 'monthly' || c === 'yearly') setCompounding(c as Compounding);
            } catch {}
        });
    }, [id]);

    // Persist settings
    useEffect(() => {
        if (!id) return;
        AsyncStorage.setItem(`goal_calc_${id}`, JSON.stringify({ rate, compounding }));
    }, [rate, compounding, id]);

    // ── Compound interest calculation ────────────────────────────────────────
    const calc = useMemo(() => {
        const now = new Date();
        const endDate = targetDate
            ? new Date(targetDate)
            : new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

        const daysLeft  = Math.max(0, differenceInDays(endDate, now));
        const yearsLeft = daysLeft / 365;
        const r = rate / 100;
        const n = compounding === 'monthly' ? 12 : 1;

        const interest  = yearsLeft > 0 && r > 0
            ? saved * (Math.pow(1 + r / n, n * yearsLeft) - 1)
            : 0;
        const forecast  = saved + interest;
        const needToAdd = Math.max(0, target - forecast);

        return { interest, forecast, needToAdd, endDate, daysLeft };
    }, [rate, compounding, saved, target, targetDate]);

    // ── 100-dot Icon Array ───────────────────────────────────────────────────
    const dots: DotData[] = useMemo(() => {
        const savedPct    = target > 0 ? Math.min(saved / target, 1) : 0;
        const interestPct = target > 0
            ? Math.min(Math.max(calc.interest, 0) / target, Math.max(0, 1 - savedPct))
            : 0;

        const savedDots    = Math.round(savedPct * 100);
        const interestDots = Math.min(Math.round(interestPct * 100), 100 - savedDots);

        return Array.from({ length: 100 }).map((_, i) => {
            if (i < savedDots)
                return { color: '#1E5128', state: 'filled' as const };
            if (i < savedDots + interestDots)
                return { color: '#4E9F3D', state: 'filled' as const };
            return { color: '#2d3748', state: 'empty' as const };
        });
    }, [saved, target, calc.interest]);

    // ── Actions ──────────────────────────────────────────────────────────────

    async function confirmArchive() {
        setArchiving(true);
        await supabase
            .from('savings_goals')
            .update({ is_archived: true, is_active: false })
            .eq('id', id);
        setArchiving(false);
        setShowArchiveSheet(false);
        router.back();
    }

    function openEdit() {
        setEditName(name);
        setEditIcon(icon);
        setEditColor(color);
        setEditTarget(String(target));
        setEditCurrency(currency);
        setEditDate(targetDate ? new Date(targetDate) : null);
        setShowEditModal(true);
    }

    async function saveEdit() {
        const targetAmt = parseFloat(editTarget.replace(',', '.'));
        if (!editName.trim() || isNaN(targetAmt) || targetAmt <= 0) return;

        setSavingEdit(true);
        await supabase.from('savings_goals').update({
            name: editName.trim(),
            icon: editIcon,
            color: editColor,
            target_amount: targetAmt,
            currency: editCurrency,
            target_date: editDate ? format(editDate, 'yyyy-MM-dd') : null,
        }).eq('id', id);

        setSavingEdit(false);
        setShowEditModal(false);
        router.back();
    }

    async function confirmTopUp() {
        const amt = parseFloat(topUpAmount.replace(',', '.'));
        if (isNaN(amt) || amt <= 0) return;

        setSavingTopUp(true);
        try {
            // Update saved amount on the goal
            const newSaved = saved + amt;
            await supabase.from('savings_goals').update({ current_amount: newSaved }).eq('id', id);

            // Deduct from account if selected
            if (topUpAccountId) {
                const srcAcc = accounts.find(a => a.id === topUpAccountId);
                if (srcAcc) {
                    await supabase.from('accounts').update({
                        balance: srcAcc.balance - amt,
                    }).eq('id', topUpAccountId);

                    // Record transaction
                    const uid = (await supabase.auth.getUser()).data.user?.id;
                    if (uid) {
                        const { data: hm } = await supabase.from('household_members').select('household_id').eq('user_id', uid).single();
                        if (hm) {
                            await supabase.from('transactions').insert({
                                household_id: hm.household_id,
                                account_id: topUpAccountId,
                                category_id: null,
                                type: 'expense',
                                amount: amt,
                                currency,
                                date: format(topUpDate, 'yyyy-MM-dd'),
                                description: `Пополнение цели «${name}»`,
                                created_by: uid,
                            });
                        }
                    }
                }
            }

            setShowTopUp(false);
            setTopUpAmount('');
            setTopUpAccountId('');
            setTopUpDate(new Date());
            router.back();
        } catch (e: any) {
            Alert.alert('Ошибка', e.message);
        } finally {
            setSavingTopUp(false);
        }
    }

    const ratio = target > 0 ? Math.min(saved / target, 1) : 0;
    const pct   = Math.round(ratio * 100);
    const editTargetNum = parseFloat(editTarget.replace(',', '.')) || 0;
    const targetBelowSaved = editTargetNum > 0 && editTargetNum < saved;

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <View style={{ flex: 1, backgroundColor: '#090D1A' }}>
            {/* Header */}
            <View style={{
                paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16,
                flexDirection: 'row', alignItems: 'center', gap: 12,
            }}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
                    <ChevronLeft color="#9ca3af" size={24} />
                </TouchableOpacity>
                <Text style={{ fontSize: 26, marginRight: 2 }}>{icon}</Text>
                <Text style={{ fontSize: 20, fontWeight: '800', color: '#fff', flex: 1 }} numberOfLines={1}>
                    {name}
                </Text>
                <TouchableOpacity onPress={openEdit} hitSlop={10} style={{
                    width: 36, height: 36, borderRadius: 12,
                    backgroundColor: 'rgba(124,111,255,0.12)',
                    alignItems: 'center', justifyContent: 'center',
                }}>
                    <Pencil color="#7C6FFF" size={18} />
                </TouchableOpacity>
            </View>

            <ScrollView
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 48 }}
                showsVerticalScrollIndicator={false}
            >
                {/* ── Icon Array card ─────────────────────────────────────── */}
                <View style={{
                    backgroundColor: '#131929',
                    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
                    borderRadius: 20, padding: 22, marginBottom: 12, alignItems: 'center',
                }}>
                    <IconArray dots={dots} columns={10} dotSize={22} gap={7} />

                    {/* Legend */}
                    <View style={{ flexDirection: 'row', gap: 18, marginTop: 18 }}>
                        <Legend color="#1E5128" label={`Взносы ${pct}%`} />
                        <Legend color="#4E9F3D" label="Проценты" />
                        <Legend color="#2d3748" label="Остаток" outline />
                    </View>

                    {/* Amounts row */}
                    <View style={{
                        flexDirection: 'row', justifyContent: 'space-between',
                        width: '100%', marginTop: 18,
                    }}>
                        <View>
                            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 3 }}>Накоплено</Text>
                            <Text style={{ fontSize: 20, fontWeight: '800', color: '#4FFFB0' }}>
                                {formatAmount(saved, currency)}
                            </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 3 }}>Цель</Text>
                            <Text style={{ fontSize: 20, fontWeight: '800', color: '#fff' }}>
                                {formatAmount(target, currency)}
                            </Text>
                        </View>
                    </View>

                    {/* Progress bar */}
                    <View style={{
                        height: 4, backgroundColor: 'rgba(255,255,255,0.07)',
                        borderRadius: 2, width: '100%', marginTop: 12, overflow: 'hidden',
                    }}>
                        <View style={{
                            height: 4,
                            width: `${pct}%`,
                            backgroundColor: '#4FFFB0',
                            borderRadius: 2,
                        }} />
                    </View>
                </View>

                {/* ── Calculator card ──────────────────────────────────────── */}
                <View style={{
                    backgroundColor: '#131929',
                    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
                    borderRadius: 20, padding: 20, marginBottom: 12,
                }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 18 }}>
                        Калькулятор роста
                    </Text>

                    {/* Rate row */}
                    <View style={{
                        flexDirection: 'row', alignItems: 'center',
                        justifyContent: 'space-between', marginBottom: 14,
                    }}>
                        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>Ставка</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <TextInput
                                value={rateInput}
                                onChangeText={t => {
                                    setRateInput(t);
                                    const v = parseFloat(t.replace(',', '.'));
                                    if (!isNaN(v) && v >= 0 && v <= 50) setRate(v);
                                }}
                                onBlur={() => setRateInput(String(rate))}
                                keyboardType="decimal-pad"
                                style={{
                                    backgroundColor: 'rgba(255,255,255,0.06)',
                                    borderRadius: 10, borderWidth: 1.5,
                                    borderColor: 'rgba(255,255,255,0.08)',
                                    color: '#fff', fontSize: 15, fontWeight: '700',
                                    paddingHorizontal: 12, paddingVertical: 8,
                                    minWidth: 60, textAlign: 'center',
                                }}
                            />
                            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>% год.</Text>
                        </View>
                    </View>

                    {/* Compounding toggle */}
                    <View style={{
                        flexDirection: 'row', alignItems: 'center',
                        justifyContent: 'space-between', marginBottom: 18,
                    }}>
                        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>Капитализация</Text>
                        <View style={{
                            flexDirection: 'row',
                            backgroundColor: 'rgba(255,255,255,0.06)',
                            borderRadius: 10, padding: 3, gap: 2,
                        }}>
                            {(['monthly', 'yearly'] as Compounding[]).map(c => (
                                <TouchableOpacity
                                    key={c}
                                    onPress={() => setCompounding(c)}
                                    style={{
                                        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                                        backgroundColor: compounding === c ? 'rgba(255,255,255,0.14)' : 'transparent',
                                    }}
                                >
                                    <Text style={{
                                        fontSize: 12,
                                        color: compounding === c ? '#fff' : 'rgba(255,255,255,0.38)',
                                        fontWeight: compounding === c ? '600' : '400',
                                    }}>
                                        {c === 'monthly' ? 'Ежемесячно' : 'Ежегодно'}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* Divider */}
                    <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: 16 }} />

                    {/* Result rows */}
                    {[
                        {
                            label: 'Текущий баланс',
                            value: formatAmount(saved, currency),
                            color: '#fff',
                            indent: false,
                        },
                        {
                            label: `Прогноз к ${format(calc.endDate, 'd MMM yyyy', { locale: ru })}`,
                            value: formatAmount(calc.forecast, currency),
                            color: '#4FFFB0',
                            indent: false,
                        },
                        {
                            label: '   из них % доход',
                            value: `+${formatAmount(calc.interest, currency)}`,
                            color: '#4E9F3D',
                            indent: true,
                        },
                        {
                            label: 'Нужно довнести',
                            value: calc.needToAdd > 0
                                ? formatAmount(calc.needToAdd, currency)
                                : '✓ Цель достигнута',
                            color: calc.needToAdd > 0 ? '#f9a825' : '#4FFFB0',
                            indent: false,
                        },
                    ].map((row, i) => (
                        <View key={i} style={{
                            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                            paddingVertical: 9,
                            borderTopWidth: i > 0 ? 1 : 0,
                            borderTopColor: 'rgba(255,255,255,0.04)',
                        }}>
                            <Text style={{
                                fontSize: row.indent ? 12 : 13,
                                color: row.indent ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.55)',
                                flex: 1,
                            }}>
                                {row.label}
                            </Text>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: row.color }}>
                                {row.value}
                            </Text>
                        </View>
                    ))}
                </View>

                {/* ── Top-up button ─────────────────────────────────────── */}
                <TouchableOpacity
                    onPress={() => setShowTopUp(true)}
                    style={{
                        paddingVertical: 14, borderRadius: 14, alignItems: 'center',
                        backgroundColor: 'rgba(79,255,176,0.08)',
                        borderWidth: 1.5, borderColor: 'rgba(79,255,176,0.25)',
                        marginBottom: 10,
                    }}
                >
                    <Text style={{ color: '#4FFFB0', fontSize: 14, fontWeight: '600' }}>
                        Пополнить
                    </Text>
                </TouchableOpacity>

                {/* ── Finish goal button ──────────────────────────────────── */}
                <TouchableOpacity
                    onPress={() => setShowArchiveSheet(true)}
                    style={{
                        paddingVertical: 14, borderRadius: 14, alignItems: 'center',
                        backgroundColor: 'rgba(239,68,68,0.07)',
                        borderWidth: 1, borderColor: 'rgba(239,68,68,0.18)',
                    }}
                >
                    <Text style={{ color: '#ef4444', fontSize: 14, fontWeight: '600' }}>
                        Завершить цель
                    </Text>
                </TouchableOpacity>
            </ScrollView>

            {/* ── Finish confirmation bottom sheet ────────────────────────── */}
            <Modal
                visible={showArchiveSheet}
                transparent
                animationType="slide"
                onRequestClose={() => setShowArchiveSheet(false)}
            >
                <TouchableOpacity
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}
                    activeOpacity={1}
                    onPress={() => setShowArchiveSheet(false)}
                />
                <View style={{
                    backgroundColor: '#111827',
                    borderTopLeftRadius: 24, borderTopRightRadius: 24,
                    paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40,
                }}>
                    <View style={{
                        width: 36, height: 4, borderRadius: 2,
                        backgroundColor: 'rgba(255,255,255,0.15)',
                        alignSelf: 'center', marginBottom: 24,
                    }} />

                    <View style={{
                        width: 56, height: 56, borderRadius: 28, alignSelf: 'center',
                        backgroundColor: 'rgba(239,68,68,0.1)',
                        borderWidth: 1.5, borderColor: 'rgba(239,68,68,0.25)',
                        alignItems: 'center', justifyContent: 'center', marginBottom: 16,
                    }}>
                        <Text style={{ fontSize: 26 }}>{icon}</Text>
                    </View>

                    <Text style={{
                        fontSize: 18, fontWeight: '800', color: '#fff',
                        textAlign: 'center', marginBottom: 8,
                    }}>
                        Завершить цель «{name}»?
                    </Text>
                    <Text style={{
                        fontSize: 13, color: 'rgba(255,255,255,0.45)',
                        textAlign: 'center', lineHeight: 20, marginBottom: 28,
                    }}>
                        Накопленные средства останутся на счету.
                    </Text>

                    <TouchableOpacity
                        onPress={confirmArchive}
                        disabled={archiving}
                        style={{
                            paddingVertical: 15, borderRadius: 14, alignItems: 'center',
                            backgroundColor: '#ef4444', marginBottom: 10,
                        }}
                    >
                        {archiving
                            ? <ActivityIndicator color="#fff" />
                            : <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>
                                Завершить
                            </Text>
                        }
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => setShowArchiveSheet(false)}
                        style={{
                            paddingVertical: 15, borderRadius: 14, alignItems: 'center',
                            backgroundColor: 'rgba(255,255,255,0.06)',
                        }}
                    >
                        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, fontWeight: '600' }}>
                            Отмена
                        </Text>
                    </TouchableOpacity>
                </View>
            </Modal>

            {/* ── Top-up bottom sheet ───────────────────────────────────── */}
            <Modal visible={showTopUp} transparent animationType="slide" onRequestClose={() => setShowTopUp(false)}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                    <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} activeOpacity={1} onPress={() => setShowTopUp(false)} />
                    <View style={{
                        backgroundColor: '#111827', borderTopLeftRadius: 24, borderTopRightRadius: 24,
                        paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36,
                    }}>
                        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 20 }} />

                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 20 }}>
                            Пополнить цель
                        </Text>

                        {/* Amount */}
                        <Text style={labelStyle}>Сумма</Text>
                        <TextInput
                            value={topUpAmount}
                            onChangeText={setTopUpAmount}
                            placeholder="0"
                            placeholderTextColor="rgba(255,255,255,0.2)"
                            keyboardType="decimal-pad"
                            style={inputStyle}
                        />

                        {/* From account */}
                        <Text style={labelStyle}>Со счёта (опц.)</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                {accounts.map(acc => {
                                    const sel = topUpAccountId === acc.id;
                                    return (
                                        <TouchableOpacity
                                            key={acc.id}
                                            onPress={() => setTopUpAccountId(sel ? '' : acc.id)}
                                            style={{
                                                flexDirection: 'row', alignItems: 'center', gap: 6,
                                                paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
                                                backgroundColor: sel ? 'rgba(124,111,255,0.15)' : 'rgba(255,255,255,0.05)',
                                                borderWidth: 1.5,
                                                borderColor: sel ? '#7C6FFF' : 'rgba(255,255,255,0.08)',
                                            }}
                                        >
                                            <Text style={{ fontSize: 14 }}>{acc.icon || '💳'}</Text>
                                            <Text style={{ color: sel ? '#a78bfa' : '#fff', fontSize: 13, fontWeight: '500' }}>
                                                {acc.name}
                                            </Text>
                                            <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>
                                                {formatAmount(acc.balance, acc.currency)}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </ScrollView>

                        {/* Insufficient funds warning */}
                        {topUpAccountId && (() => {
                            const srcAcc = accounts.find(a => a.id === topUpAccountId);
                            const amt = parseFloat(topUpAmount.replace(',', '.')) || 0;
                            if (srcAcc && amt > srcAcc.balance) {
                                return (
                                    <Text style={{ fontSize: 11, color: '#FFB84F', marginBottom: 4 }}>
                                        Недостаточно средств на счёте ({formatAmount(srcAcc.balance, srcAcc.currency)})
                                    </Text>
                                );
                            }
                            return null;
                        })()}

                        <View style={{ height: 12 }} />

                        {/* Date */}
                        <Text style={labelStyle}>Дата</Text>
                        <TouchableOpacity
                            onPress={() => setShowTopUpDatePicker(!showTopUpDatePicker)}
                            style={{
                                backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12,
                                paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
                                borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)',
                            }}
                        >
                            <Text style={{ color: '#fff', fontSize: 14 }}>
                                {format(topUpDate, 'dd.MM.yyyy')}
                            </Text>
                        </TouchableOpacity>
                        {showTopUpDatePicker && (
                            <DateTimePicker
                                value={topUpDate}
                                mode="date"
                                display="inline"
                                themeVariant="dark"
                                onChange={(_, d) => { setShowTopUpDatePicker(false); if (d) setTopUpDate(d); }}
                            />
                        )}

                        {/* Confirm */}
                        <TouchableOpacity
                            onPress={confirmTopUp}
                            disabled={savingTopUp || !topUpAmount.trim()}
                            style={{
                                marginTop: 16, paddingVertical: 14, backgroundColor: '#4FFFB0',
                                borderRadius: 14, alignItems: 'center',
                                opacity: savingTopUp || !topUpAmount.trim() ? 0.5 : 1,
                            }}
                        >
                            {savingTopUp
                                ? <ActivityIndicator color="#000" />
                                : <Text style={{ color: '#000', fontSize: 15, fontWeight: '700' }}>Пополнить</Text>
                            }
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ── Edit goal modal ─────────────────────────────────────────── */}
            <Modal visible={showEditModal} animationType="slide" transparent onRequestClose={() => setShowEditModal(false)}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                    <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowEditModal(false)} />
                    <View style={{ backgroundColor: '#111827', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36, maxHeight: '92%' }}>
                        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 16 }} />

                        {/* Header */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                            <View style={{
                                width: 48, height: 48, borderRadius: 14,
                                backgroundColor: editColor + '20',
                                borderWidth: 1.5, borderColor: editColor + '50',
                                alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Text style={{ fontSize: 24 }}>{editIcon}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff' }}>Редактировать цель</Text>
                                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
                                    {editName.trim() || name}
                                </Text>
                            </View>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                            {/* Icon picker */}
                            <Text style={labelStyle}>Иконка</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                                <View style={{ flexDirection: 'row', gap: 6 }}>
                                    {['🎯','🏖️','💻','🚗','🏠','🎓','✈️','📱','🎮','💪','🛡️','📈','🌍','🎁','💰','🎸','🏋️','🐶'].map(em => (
                                        <TouchableOpacity key={em} onPress={() => setEditIcon(em)} style={{
                                            width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                                            backgroundColor: editIcon === em ? 'rgba(124,111,255,0.25)' : 'rgba(255,255,255,0.05)',
                                            borderWidth: 1.5,
                                            borderColor: editIcon === em ? '#7C6FFF' : 'transparent',
                                        }}>
                                            <Text style={{ fontSize: 20 }}>{em}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </ScrollView>

                            {/* Color picker */}
                            <Text style={labelStyle}>Цвет</Text>
                            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                                {['#7C6FFF', '#4FFFB0', '#FFB84F', '#FF6B6B', '#4FC3FF', '#F472B6', '#34D399', '#FB923C'].map(c => (
                                    <TouchableOpacity key={c} onPress={() => setEditColor(c)} style={{
                                        width: 32, height: 32, borderRadius: 16,
                                        backgroundColor: c,
                                        borderWidth: editColor === c ? 3 : 1.5,
                                        borderColor: editColor === c ? '#fff' : 'transparent',
                                        alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        {editColor === c && <Text style={{ fontSize: 14 }}>✓</Text>}
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Name */}
                            <Text style={labelStyle}>Название</Text>
                            <TextInput
                                value={editName}
                                onChangeText={setEditName}
                                placeholder="Название цели"
                                placeholderTextColor="rgba(255,255,255,0.2)"
                                style={inputStyle}
                            />

                            {/* Target + Currency */}
                            <Text style={labelStyle}>Целевая сумма</Text>
                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                                <TextInput
                                    value={editTarget}
                                    onChangeText={setEditTarget}
                                    placeholder="0"
                                    placeholderTextColor="rgba(255,255,255,0.2)"
                                    keyboardType="decimal-pad"
                                    style={[inputStyle, { flex: 1, marginBottom: 0 }]}
                                />
                                <TouchableOpacity
                                    onPress={() => setShowCurrencyDropdown(true)}
                                    style={{
                                        flexDirection: 'row', alignItems: 'center', gap: 6,
                                        paddingHorizontal: 14, borderRadius: 12,
                                        backgroundColor: 'rgba(255,255,255,0.06)',
                                        borderWidth: 1.5, borderColor: 'rgba(124,111,255,0.3)',
                                        minWidth: 88,
                                    }}
                                >
                                    <Text style={{ fontSize: 18 }}>{CURRENCIES.find(c => c.code === editCurrency)?.flag}</Text>
                                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{editCurrency}</Text>
                                    <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginLeft: 2 }}>▾</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Warning: target below saved */}
                            {targetBelowSaved && (
                                <Text style={{ fontSize: 11, color: '#FFB84F', marginBottom: 12 }}>
                                    Сумма меньше уже накопленного ({formatAmount(saved, currency)})
                                </Text>
                            )}
                            {!targetBelowSaved && <View style={{ height: 12 }} />}

                            {/* Currency dropdown */}
                            <Modal visible={showCurrencyDropdown} transparent animationType="fade">
                                <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} activeOpacity={1}
                                    onPress={() => { setShowCurrencyDropdown(false); setCurrencySearch(''); }} />
                                <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#1a2235', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingBottom: 40, maxHeight: '60%' }}>
                                    <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 16 }} />
                                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff', paddingHorizontal: 20, marginBottom: 12 }}>Валюта</Text>
                                    <View style={{ marginHorizontal: 20, marginBottom: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
                                        <TextInput
                                            value={currencySearch}
                                            onChangeText={setCurrencySearch}
                                            placeholder="Поиск..."
                                            placeholderTextColor="rgba(255,255,255,0.25)"
                                            style={{ flex: 1, color: '#fff', fontSize: 14 }}
                                            autoCorrect={false} autoCapitalize="none"
                                        />
                                    </View>
                                    <FlatList
                                        data={CURRENCIES.filter(c => {
                                            const q = currencySearch.toLowerCase();
                                            return !q || c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
                                        })}
                                        keyExtractor={c => c.code}
                                        renderItem={({ item: c }) => {
                                            const sel = editCurrency === c.code;
                                            return (
                                                <TouchableOpacity
                                                    onPress={() => { setEditCurrency(c.code); setShowCurrencyDropdown(false); setCurrencySearch(''); }}
                                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 13, backgroundColor: sel ? 'rgba(124,111,255,0.12)' : 'transparent' }}>
                                                    <Text style={{ fontSize: 22 }}>{c.flag}</Text>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ fontSize: 14, fontWeight: sel ? '700' : '500', color: sel ? '#a78bfa' : '#fff' }}>{c.code}</Text>
                                                        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{c.name}</Text>
                                                    </View>
                                                    {sel && <Text style={{ color: '#7C6FFF', fontSize: 16 }}>✓</Text>}
                                                </TouchableOpacity>
                                            );
                                        }}
                                    />
                                </View>
                            </Modal>

                            {/* Target date */}
                            <Text style={labelStyle}>Дата достижения (опц.)</Text>
                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
                                <TouchableOpacity
                                    onPress={() => {
                                        if (!editDate) setEditDate(new Date(new Date().getFullYear() + 1, new Date().getMonth(), new Date().getDate()));
                                        setShowDatePicker(true);
                                    }}
                                    style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)' }}>
                                    <Text style={{ color: editDate ? '#fff' : 'rgba(255,255,255,0.2)', fontSize: 14 }}>
                                        {editDate ? format(editDate, 'dd.MM.yyyy') : 'Без даты'}
                                    </Text>
                                </TouchableOpacity>
                                {editDate && (
                                    <TouchableOpacity onPress={() => setEditDate(null)}
                                        style={{ paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }}>
                                        <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 18 }}>✕</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                            {showDatePicker && editDate && (
                                <DateTimePicker value={editDate} mode="date" display="inline" themeVariant="dark"
                                    onChange={(_, d) => { setShowDatePicker(false); if (d) setEditDate(d); }} />
                            )}

                            {/* Save */}
                            <TouchableOpacity
                                onPress={saveEdit}
                                disabled={savingEdit}
                                style={{ marginTop: 20, marginBottom: 20, paddingVertical: 14, backgroundColor: '#7C6FFF', borderRadius: 14, alignItems: 'center', opacity: savingEdit ? 0.5 : 1 }}>
                                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{savingEdit ? 'Сохранение...' : 'Сохранить'}</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}
