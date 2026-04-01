/**
 * VoiceInput – record speech → parse locally → save transactions
 */
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator, Alert, Animated, Easing,
    ScrollView, Text, TextInput, TouchableOpacity, View,
    NativeModules,
} from 'react-native';
import {
    Activity, ArrowRightLeft, Award, Banknote, Bike, BookOpen, Briefcase, Building2, Bus,
    Car, Check, CircleDollarSign, Coffee, Coins, CreditCard, Droplets, Dumbbell,
    Film, Flag, Flame, Fuel, Gift, Globe, GraduationCap, Heart, Home,
    Landmark, MapPin, Mic, MicOff, Monitor, Music, Package, PawPrint, Pencil, Pill, Plane,
    Receipt, RotateCcw, Scissors, Shirt, ShoppingBag, ShoppingCart, Sofa, Star,
    Tag, Train, TrendingDown, TrendingUp, Trophy, Tv, Utensils, Wallet, Wifi, X, Zap,
} from 'lucide-react-native';

type IconComp = React.ComponentType<{ color: string; size: number }>;
const ICON_MAP: Record<string, IconComp> = {
    ShoppingCart, Coffee, Utensils, ShoppingBag, Car, Bus, Bike, Train, Plane, Fuel,
    Home, Sofa, Zap, Wifi, Flame, Droplets, Heart, Dumbbell, Activity, Pill,
    Film, Music, Tv, Monitor, Trophy, Star, Shirt, Tag, Gift, Scissors,
    MapPin, Globe, BookOpen, GraduationCap, CreditCard, Wallet,
    Coins, Banknote, Landmark, CircleDollarSign, TrendingUp, TrendingDown,
    Briefcase, Building2, Receipt, Package, PawPrint, Award, Flag, ArrowRightLeft,
};
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/context/ThemeContext';
import { BaseBottomSheet } from '@/components/ui/BaseBottomSheet';
import { supabase } from '@/lib/supabase';
import { parseVoiceText, learnFromCorrection, type ParsedTransaction } from '@/lib/categoryMatcher';
import type { Account, Category } from '@/types';
// Conditional import: only load if native module is linked (crashes in Expo Go otherwise)
let Voice: any = null;
if (NativeModules.Voice) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    try { Voice = require('@react-native-voice/voice').default; } catch { /* not linked */ }
}
type SpeechResultsEvent = { value?: string[] };
type SpeechErrorEvent = { error?: any };

type ParsedTx = ParsedTransaction;

type Stage = 'recording' | 'processing' | 'results' | 'saving';

interface VoiceInputProps {
    visible: boolean;
    onClose: () => void;
    onSaved: () => void;
    householdId: string;
    accounts: Account[];
    categories: Category[];
    baseCurrency: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function VoiceInput({
    visible, onClose, onSaved,
    householdId, accounts, categories, baseCurrency,
}: VoiceInputProps) {
    const { colors, fonts } = useTheme();
    const { t } = useTranslation();

    const [stage, setStage] = useState<Stage>('recording');
    const [transcript, setTranscript] = useState('');
    const [parsed, setParsed] = useState<ParsedTx[]>([]);
    const [error, setError] = useState('');
    const [editingIdx, setEditingIdx] = useState<number | null>(null);
    const [newCatName, setNewCatName] = useState('');
    const [showNewCat, setShowNewCat] = useState(false);
    const [creatingCat, setCreatingCat] = useState(false);
    const [showCurrencyDrop, setShowCurrencyDrop] = useState(false);
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const isListening = useRef(false);
    const transcriptRef = useRef('');

    // ── Pulse animation ───────────────────────────────────────────────────────
    useEffect(() => {
        if (stage !== 'recording') { pulseAnim.setValue(1); return; }
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.25, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, [stage, pulseAnim]);

    // ── Voice handlers ────────────────────────────────────────────────────────
    useEffect(() => {
        if (!Voice) return;
        Voice.onSpeechResults = (e: SpeechResultsEvent) => {
            const text = e.value?.[0] ?? '';
            transcriptRef.current = text;
            setTranscript(text);
        };
        Voice.onSpeechPartialResults = (e: SpeechResultsEvent) => {
            const text = e.value?.[0] ?? '';
            transcriptRef.current = text;
            setTranscript(text);
        };
        Voice.onSpeechError = (e: SpeechErrorEvent) => {
            console.warn('Voice error', e.error);
            if (isListening.current) {
                isListening.current = false;
                processTranscript();
            }
        };
        Voice.onSpeechEnd = () => {
            if (isListening.current) {
                isListening.current = false;
                // Delay to let final results arrive
                setTimeout(() => processTranscript(), 500);
            }
        };

        return () => {
            Voice.destroy().then(Voice.removeAllListeners);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Start/stop recording ──────────────────────────────────────────────────
    useEffect(() => {
        if (visible) {
            resetAndStart();
        } else if (Voice) {
            Voice.stop().catch(() => {});
            Voice.cancel().catch(() => {});
            isListening.current = false;
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    const voiceAvailable = !!Voice;

    async function resetAndStart() {
        setStage('recording');
        setTranscript('');
        transcriptRef.current = '';
        setParsed([]);
        setError('');
        setEditingIdx(null);
        if (!Voice) {
            // No native module — stay in 'recording' stage with text fallback
            return;
        }
        try {
            isListening.current = true;
            await Voice.start('ru-RU');
        } catch (err) {
            console.warn('Voice start error', err);
            setError(t('voice.micError'));
            setStage('results');
        }
    }

    function submitTextInput() {
        const text = transcript.trim();
        if (!text) return;
        setStage('processing');
        setTimeout(() => {
            const items = parseVoiceText(text, categories, baseCurrency, accounts[0]?.id ?? '');
            if (items.length === 0) {
                setError(t('voice.parseError'));
            }
            setParsed(items);
            setStage('results');
        }, 100);
    }

    async function stopRecording() {
        isListening.current = false;
        try { if (Voice) await Voice.stop(); } catch { /* ignore */ }
        // Wait for final results then process
        setTimeout(() => processTranscript(), 500);
    }

    function processTranscript() {
        const text = transcriptRef.current.trim();
        console.log('Processing transcript:', text);
        if (!text) {
            setError(t('voice.noSpeech'));
            setStage('results');
            return;
        }
        setStage('processing');
        setTimeout(() => {
            const items = parseVoiceText(text, categories, baseCurrency, accounts[0]?.id ?? '');
            console.log('Parsed items:', items.length);
            if (items.length === 0) {
                setError(t('voice.parseError'));
            }
            setParsed(items);
            setStage('results');
        }, 100);
    }

    // ── Toggle item ───────────────────────────────────────────────────────────
    function toggleItem(idx: number) {
        setParsed(prev => prev.map((p, i) => i === idx ? { ...p, checked: !p.checked } : p));
    }

    // ── Save transactions ─────────────────────────────────────────────────────
    async function saveTransactions() {
        const toSave = parsed.filter(p => p.checked);
        if (!toSave.length) return;

        setStage('saving');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setError(t('voice.authError')); setStage('results'); return; }

        if (!accounts.length) { setError(t('voice.noAccount')); setStage('results'); return; }

        try {
            if (toSave.length === 1) {
                // Single item — regular transaction (no split)
                const tx = toSave[0];
                const cat = tx.category
                    ?? categories.find(c => c.type === tx.type)
                    ?? categories[0];

                if (!cat) { onSaved(); return; }

                const accountId = tx.accountId || accounts[0].id;
                const account = accounts.find(a => a.id === accountId) ?? accounts[0];
                const amount = Math.abs(tx.amount);

                const { error: insertErr } = await supabase.from('transactions').insert({
                    household_id: householdId,
                    account_id: accountId,
                    category_id: cat.id,
                    user_id: user.id,
                    type: tx.type,
                    amount,
                    currency: tx.currency || baseCurrency,
                    date: tx.date,
                    note: tx.note || null,
                });

                if (insertErr) {
                    console.warn('Insert error:', insertErr);
                }

                const delta = tx.type === 'income' ? amount : -amount;
                await supabase.from('accounts')
                    .update({ balance: account.balance + delta })
                    .eq('id', accountId);

                if (tx.isRecurring && tx.recurringFrequency) {
                    await supabase.from('recurring_payments').insert({
                        household_id: householdId,
                        name: cat.name ?? tx.note,
                        amount,
                        currency: tx.currency || baseCurrency,
                        account_id: accountId,
                        category_id: cat.id,
                        frequency: tx.recurringFrequency,
                        next_date: tx.date,
                        is_active: true,
                    });
                }
            } else {
                // Multiple items — create ONE split transaction with transaction_items
                const firstTx = toSave[0];
                const accountId = firstTx.accountId || accounts[0].id;
                const account = accounts.find(a => a.id === accountId) ?? accounts[0];
                const totalAmount = toSave.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
                const currency = firstTx.currency || baseCurrency;
                const type = firstTx.type;

                const { data: parentTx, error: insertErr } = await supabase.from('transactions').insert({
                    household_id: householdId,
                    account_id: accountId,
                    category_id: null,
                    user_id: user.id,
                    type,
                    amount: totalAmount,
                    currency,
                    date: firstTx.date,
                    note: firstTx.note || null,
                    is_split: true,
                }).select('id').single();

                if (insertErr || !parentTx) {
                    console.warn('Insert split parent error:', insertErr);
                    setError(t('voice.saveError'));
                    setStage('results');
                    return;
                }

                const items = toSave.map((tx, idx) => {
                    const cat = tx.category
                        ?? categories.find(c => c.type === tx.type)
                        ?? categories[0];
                    return {
                        transaction_id: parentTx.id,
                        category_id: cat?.id ?? null,
                        amount: Math.abs(tx.amount),
                        amount_base: Math.abs(tx.amount),
                        note: tx.note || null,
                        sort_order: idx,
                    };
                });

                const { error: itemsErr } = await supabase.from('transaction_items').insert(items);
                if (itemsErr) {
                    console.warn('Insert transaction_items error:', itemsErr);
                }

                const delta = type === 'income' ? totalAmount : -totalAmount;
                await supabase.from('accounts')
                    .update({ balance: account.balance + delta })
                    .eq('id', accountId);
            }

            onSaved();
        } catch (err) {
            console.warn('Save error', err);
            Alert.alert(t('common.error'), t('voice.saveError'));
            setStage('results');
        }
    }

    // ── Create new category ─────────────────────────────────────────────────
    async function createCategory(idx: number) {
        const name = newCatName.trim();
        if (!name || !householdId) return;
        setCreatingCat(true);
        try {
            const { data } = await supabase.from('categories').insert({
                household_id: householdId,
                name,
                icon: '📁',
                color: '#7C6FFF',
                type: parsed[idx]?.type === 'income' ? 'income' : 'expense',
                expense_type: 'variable',
                is_system: false,
                is_deleted: false,
                is_hidden: false,
                sort_order: 999,
            }).select().single();
            if (data) {
                const newCat = data as Category;
                categories.push(newCat);
                setParsed(prev => prev.map((p, i) => i === idx ? { ...p, category: newCat } : p));
                setShowNewCat(false);
                setNewCatName('');
            }
        } catch (e) {
            console.warn('Create category error', e);
        }
        setCreatingCat(false);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    const checkedCount = parsed.filter(p => p.checked).length;
    const typeIcon = (type: string) => {
        if (type === 'income') return '💰';
        if (type === 'transfer') return '→';
        return '🛒';
    };
    const typeSign = (type: string) => type === 'income' ? '+' : '−';

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <BaseBottomSheet visible={visible} onClose={onClose} maxHeight="80%">
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: 'bold', fontFamily: fonts.heading }}>
                    {t('voice.title')}
                </Text>
                <TouchableOpacity onPress={onClose} hitSlop={12}>
                    <X color={colors.textMuted} size={22} />
                </TouchableOpacity>
            </View>

            {/* RECORDING + TEXT INPUT */}
            {stage === 'recording' && (
                <View style={{ paddingVertical: 16 }}>
                    {/* Mic button (if Voice available) */}
                    {voiceAvailable && (
                        <View style={{ alignItems: 'center', marginBottom: 20 }}>
                            <Animated.View style={{ transform: [{ scale: pulseAnim }], marginBottom: 16 }}>
                                <View style={{
                                    width: 64, height: 64, borderRadius: 32,
                                    backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <Mic color="#fff" size={28} />
                                </View>
                            </Animated.View>
                            {transcript ? (
                                <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', paddingHorizontal: 20, marginBottom: 8, fontFamily: fonts.body }}>
                                    «{transcript}»
                                </Text>
                            ) : (
                                <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 8, fontFamily: fonts.bodyMedium }}>
                                    {t('voice.listening')}
                                </Text>
                            )}
                            <TouchableOpacity
                                onPress={stopRecording}
                                style={{ paddingVertical: 10, paddingHorizontal: 24, borderRadius: 12, backgroundColor: colors.bgTertiary }}
                            >
                                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemiBold }}>
                                    {t('voice.stopRecording')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Divider */}
                    {voiceAvailable && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                            <Text style={{ color: colors.textMuted, fontSize: 12, marginHorizontal: 12, fontFamily: fonts.bodyMedium }}>
                                {t('voice.orType')}
                            </Text>
                            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                        </View>
                    )}

                    {/* Text input (always shown) */}
                    <TextInput
                        value={transcript}
                        onChangeText={v => { setTranscript(v); transcriptRef.current = v; }}
                        placeholder={t('voice.textPlaceholder')}
                        placeholderTextColor={colors.textDisabled}
                        multiline
                        style={{
                            backgroundColor: colors.bgTertiary, color: colors.textPrimary,
                            borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12,
                            fontSize: 15, minHeight: 70, textAlignVertical: 'top', fontFamily: fonts.body,
                        }}
                    />
                    <TouchableOpacity
                        onPress={submitTextInput}
                        disabled={!transcript.trim()}
                        style={{
                            marginTop: 12, paddingVertical: 14, borderRadius: 14,
                            backgroundColor: transcript.trim() ? '#4FFFB0' : 'rgba(79,255,176,0.2)',
                            alignItems: 'center',
                        }}
                    >
                        <Text style={{ color: '#000', fontSize: 15, fontWeight: '700', fontFamily: fonts.bodySemiBold }}>
                            {t('voice.parseText')}
                        </Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* PROCESSING */}
            {stage === 'processing' && (
                <View style={{ alignItems: 'center', paddingVertical: 50 }}>
                    <ActivityIndicator size="large" color="#7C6FFF" />
                    <Text style={{ color: colors.textSecondary, fontSize: 15, marginTop: 16, fontFamily: fonts.body }}>
                        {t('voice.processing')}
                    </Text>
                    {transcript ? (
                        <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingHorizontal: 20, marginTop: 8, fontFamily: fonts.bodyMedium }}>
                            «{transcript}»
                        </Text>
                    ) : null}
                </View>
            )}

            {/* RESULTS */}
            {stage === 'results' && (
                <View>
                    {error ? (
                        <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                            <MicOff color={colors.textMuted} size={32} />
                            <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 12, fontFamily: fonts.body }}>
                                {error}
                            </Text>
                        </View>
                    ) : null}

                    {parsed.length > 0 && (
                        <View style={{ gap: 8, marginBottom: 20 }}>
                            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 4, fontFamily: fonts.bodySemiBold }}>
                                {t('voice.recognized')}
                            </Text>
                            {parsed.map((tx, idx) => (
                                <View key={idx} style={{
                                    borderRadius: 14, overflow: 'hidden',
                                    backgroundColor: tx.checked ? 'rgba(124,111,255,0.08)' : colors.bgTertiary,
                                    borderWidth: 1.5,
                                    borderColor: tx.checked ? '#7C6FFF' : 'transparent',
                                }}>
                                    {/* Main row */}
                                    <TouchableOpacity
                                        onPress={() => toggleItem(idx)}
                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 }}
                                    >
                                        {/* Checkbox */}
                                        <View style={{
                                            width: 22, height: 22, borderRadius: 6,
                                            backgroundColor: tx.checked ? '#7C6FFF' : 'transparent',
                                            borderWidth: tx.checked ? 0 : 2,
                                            borderColor: colors.textDisabled,
                                            alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            {tx.checked && <Check color="#fff" size={14} />}
                                        </View>

                                        {/* Icon */}
                                        <Text style={{ fontSize: 18, fontFamily: fonts.body }}>{tx.category?.icon ?? typeIcon(tx.type)}</Text>

                                        {/* Info */}
                                        <View style={{ flex: 1 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemiBold }}>
                                                    {tx.category?.name ?? tx.note}
                                                </Text>
                                                {tx.isRecurring && (
                                                    <View style={{ backgroundColor: '#7C6FFF', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                                                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600', fontFamily: fonts.bodySemiBold }}>
                                                            {tx.recurringFrequency === 'monthly' ? '🔄 мес' :
                                                             tx.recurringFrequency === 'weekly' ? '🔄 нед' :
                                                             tx.recurringFrequency === 'daily' ? '🔄 дн' : '🔄 год'}
                                                        </Text>
                                                    </View>
                                                )}
                                            </View>
                                            {tx.note ? (
                                                <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: fonts.bodyMedium }} numberOfLines={1}>
                                                    {tx.note}
                                                </Text>
                                            ) : null}
                                        </View>

                                        {/* Amount */}
                                        <Text style={{
                                            fontSize: 15, fontWeight: '700',
                                            color: tx.type === 'income' ? '#16a34a' : '#dc2626',
                                            fontFamily: fonts.bodySemiBold,
                                        }}>
                                            {typeSign(tx.type)}{tx.amount.toLocaleString()} {tx.currency}
                                        </Text>

                                        {/* Edit button */}
                                        <TouchableOpacity onPress={() => { setEditingIdx(editingIdx === idx ? null : idx); setShowCurrencyDrop(false); }} style={{ padding: 4 }}>
                                            <Pencil color={colors.textMuted} size={16} />
                                        </TouchableOpacity>
                                    </TouchableOpacity>

                                    {/* Inline edit — TransactionForm style */}
                                    {editingIdx === idx && (
                                        <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 14 }}>

                                            {/* Type */}
                                            <View style={{ flexDirection: 'row', gap: 8, backgroundColor: colors.bgTertiary, borderRadius: 12, padding: 4 }}>
                                                {([
                                                    { key: 'expense' as const, label: t('dashboard.expense'), color: '#dc2626' },
                                                    { key: 'income' as const, label: t('dashboard.income'), color: '#16a34a' },
                                                    { key: 'transfer' as const, label: t('dashboard.transfer'), color: '#2563eb' },
                                                ]).map(tp => (
                                                    <TouchableOpacity key={tp.key}
                                                        onPress={() => setParsed(prev => prev.map((p, i) => i === idx ? { ...p, type: tp.key } : p))}
                                                        style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                                                            backgroundColor: tx.type === tp.key ? tp.color : 'transparent' }}>
                                                        <Text style={{ color: tx.type === tp.key ? '#fff' : colors.textMuted, fontSize: 13, fontWeight: '700', fontFamily: fonts.bodySemiBold }}>
                                                            {tp.label}
                                                        </Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>

                                            {/* Account */}
                                            <View>
                                                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 6, fontFamily: fonts.bodySemiBold }}>
                                                    {t('transactionForm.account')}
                                                </Text>
                                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                                        {accounts.map(acc => (
                                                            <TouchableOpacity key={acc.id}
                                                                onPress={() => setParsed(prev => prev.map((p, i) => i === idx ? { ...p, accountId: acc.id, currency: acc.currency } : p))}
                                                                style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
                                                                    backgroundColor: tx.accountId === acc.id ? 'rgba(124,111,255,0.15)' : colors.bgTertiary,
                                                                    borderWidth: 1.5, borderColor: tx.accountId === acc.id ? '#7C6FFF' : 'transparent' }}>
                                                                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemiBold }}>{acc.name}</Text>
                                                                <Text style={{ color: colors.textMuted, fontSize: 11, fontFamily: fonts.body }}>{acc.currency} {acc.balance.toLocaleString()}</Text>
                                                            </TouchableOpacity>
                                                        ))}
                                                    </View>
                                                </ScrollView>
                                            </View>

                                            {/* Category */}
                                            <View>
                                                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 6, fontFamily: fonts.bodySemiBold }}>
                                                    {t('transactionForm.category')}
                                                </Text>
                                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                                    {categories
                                                        .filter(c => !c.is_hidden && (c.type === tx.type || c.type === 'expense'))
                                                        .sort((a, b) => {
                                                            if (a.id === tx.category?.id) return -1;
                                                            if (b.id === tx.category?.id) return 1;
                                                            return 0;
                                                        })
                                                        .map(cat => {
                                                            const active = tx.category?.id === cat.id;
                                                            const Ic = cat.icon ? ICON_MAP[cat.icon] : null;
                                                            return (
                                                                <TouchableOpacity key={cat.id}
                                                                    onPress={() => {
                                                                        setParsed(prev => prev.map((p, i) => i === idx ? { ...p, category: cat } : p));
                                                                        learnFromCorrection(tx.note, cat.id);
                                                                    }}
                                                                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6,
                                                                        backgroundColor: active ? 'rgba(124,111,255,0.15)' : colors.bgTertiary,
                                                                        borderWidth: 1.5, borderColor: active ? '#7C6FFF' : 'transparent' }}>
                                                                    {Ic ? <Ic color={active ? '#fff' : (cat.color ?? '#6b7280')} size={14} /> : null}
                                                                    <Text style={{ color: active ? colors.textPrimary : colors.textSecondary, fontSize: 13, fontWeight: active ? '600' : '400', fontFamily: active ? fonts.bodySemiBold : fonts.body }}>{cat.name}</Text>
                                                                </TouchableOpacity>
                                                            );
                                                        })}
                                                </View>

                                                {/* Create new category */}
                                                {!showNewCat ? (
                                                    <TouchableOpacity onPress={() => setShowNewCat(true)}
                                                        style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                        <Text style={{ color: '#7C6FFF', fontSize: 13, fontWeight: '600', fontFamily: fonts.bodySemiBold }}>+ {t('transactionForm.newCategory')}</Text>
                                                    </TouchableOpacity>
                                                ) : (
                                                    <View style={{ marginTop: 8, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                                                        <TextInput
                                                            value={newCatName}
                                                            onChangeText={setNewCatName}
                                                            placeholder={t('transactionForm.categoryName')}
                                                            placeholderTextColor={colors.textDisabled}
                                                            autoFocus
                                                            style={{ flex: 1, backgroundColor: colors.bgTertiary, color: colors.textPrimary,
                                                                borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, fontFamily: fonts.body }}
                                                        />
                                                        <TouchableOpacity
                                                            onPress={() => createCategory(idx)}
                                                            disabled={!newCatName.trim() || creatingCat}
                                                            style={{ backgroundColor: newCatName.trim() ? '#7C6FFF' : colors.bgTertiary,
                                                                borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}>
                                                            {creatingCat
                                                                ? <ActivityIndicator size="small" color="#fff" />
                                                                : <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemiBold }}>+</Text>
                                                            }
                                                        </TouchableOpacity>
                                                        <TouchableOpacity onPress={() => { setShowNewCat(false); setNewCatName(''); }} style={{ padding: 4 }}>
                                                            <X color={colors.textMuted} size={16} />
                                                        </TouchableOpacity>
                                                    </View>
                                                )}
                                            </View>

                                            {/* Amount + Currency */}
                                            <View>
                                                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 6, fontFamily: fonts.bodySemiBold }}>
                                                    {t('transactionForm.amount')}
                                                </Text>
                                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                                    <TextInput
                                                        value={String(tx.amount)}
                                                        onChangeText={v => setParsed(prev => prev.map((p, i) => i === idx ? { ...p, amount: parseFloat(v) || 0 } : p))}
                                                        keyboardType="decimal-pad"
                                                        style={{ flex: 1, backgroundColor: colors.bgTertiary, color: colors.textPrimary,
                                                            borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, fontWeight: '700', fontFamily: fonts.heading }}
                                                    />
                                                    <TouchableOpacity
                                                        onPress={() => setShowCurrencyDrop(prev => !prev)}
                                                        style={{ backgroundColor: colors.bgTertiary, borderRadius: 12,
                                                            paddingHorizontal: 16, justifyContent: 'center' }}>
                                                        <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700', fontFamily: fonts.bodySemiBold }}>
                                                            {tx.currency} ›
                                                        </Text>
                                                    </TouchableOpacity>
                                                </View>
                                                {showCurrencyDrop && (
                                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                                                        {[
                                                            'USD', 'EUR', 'RUB', 'GBP', 'CHF', 'GEL', 'KZT', 'TRY',
                                                            'BYN', 'UAH', 'AED', 'SAR', 'PLN', 'CZK', 'HUF', 'RON',
                                                            'SEK', 'NOK', 'DKK', 'ILS', 'JPY', 'CNY', 'KRW', 'INR',
                                                            'THB', 'VND', 'BRL', 'ARS', 'MXN', 'CAD', 'AUD', 'NZD',
                                                            'SGD', 'HKD', 'TWD', 'ZAR', 'EGP', 'AMD', 'UZS', 'AZN',
                                                        ].map(cur => (
                                                            <TouchableOpacity key={cur}
                                                                onPress={() => {
                                                                    setParsed(prev => prev.map((p, i) => i === idx ? { ...p, currency: cur } : p));
                                                                    setShowCurrencyDrop(false);
                                                                }}
                                                                style={{
                                                                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                                                                    backgroundColor: tx.currency === cur ? '#7C6FFF' : colors.bgTertiary,
                                                                    borderWidth: 1.5,
                                                                    borderColor: tx.currency === cur ? '#7C6FFF' : 'transparent',
                                                                }}>
                                                                <Text style={{
                                                                    color: tx.currency === cur ? '#fff' : colors.textSecondary,
                                                                    fontSize: 14, fontWeight: tx.currency === cur ? '700' : '500',
                                                                    fontFamily: tx.currency === cur ? fonts.bodySemiBold : fonts.body,
                                                                }}>{cur}</Text>
                                                            </TouchableOpacity>
                                                        ))}
                                                    </View>
                                                )}
                                            </View>

                                            {/* Date */}
                                            <View>
                                                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 6, fontFamily: fonts.bodySemiBold }}>
                                                    {t('transactionForm.date')}
                                                </Text>
                                                <View style={{ backgroundColor: colors.bgTertiary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 }}>
                                                    <Text style={{ color: colors.textPrimary, fontSize: 15, fontFamily: fonts.body }}>{tx.date}</Text>
                                                </View>
                                            </View>

                                            {/* Note */}
                                            <View>
                                                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 6, fontFamily: fonts.bodySemiBold }}>
                                                    {t('transactionForm.note')}
                                                </Text>
                                                <TextInput
                                                    value={tx.note}
                                                    onChangeText={v => setParsed(prev => prev.map((p, i) => i === idx ? { ...p, note: v } : p))}
                                                    placeholder={t('transactionForm.notePlaceholder')}
                                                    placeholderTextColor={colors.textDisabled}
                                                    style={{ backgroundColor: colors.bgTertiary, color: colors.textPrimary,
                                                        borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: fonts.body }}
                                                />
                                            </View>

                                            {/* Done */}
                                            <TouchableOpacity onPress={() => setEditingIdx(null)}
                                                style={{ backgroundColor: '#7C6FFF', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
                                                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', fontFamily: fonts.bodySemiBold }}>{t('common.done')}</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                </View>
                            ))}
                        </View>
                    )}

                    {/* Buttons */}
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                        <TouchableOpacity
                            onPress={resetAndStart}
                            style={{
                                flex: 1, paddingVertical: 14, borderRadius: 14,
                                backgroundColor: colors.bgTertiary, alignItems: 'center',
                                flexDirection: 'row', justifyContent: 'center', gap: 8,
                            }}
                        >
                            <RotateCcw color={colors.textSecondary} size={16} />
                            <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemiBold }}>
                                {t('voice.recordAgain')}
                            </Text>
                        </TouchableOpacity>

                        {parsed.length > 0 && (
                            <TouchableOpacity
                                onPress={saveTransactions}
                                disabled={checkedCount === 0}
                                style={{
                                    flex: 2, paddingVertical: 14, borderRadius: 14,
                                    backgroundColor: checkedCount > 0 ? '#4FFFB0' : 'rgba(79,255,176,0.2)',
                                    alignItems: 'center',
                                }}
                            >
                                <Text style={{ color: '#000', fontSize: 15, fontWeight: '700', fontFamily: fonts.bodySemiBold }}>
                                    {t('voice.save', { count: checkedCount })}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            )}

            {/* SAVING */}
            {stage === 'saving' && (
                <View style={{ alignItems: 'center', paddingVertical: 50 }}>
                    <ActivityIndicator size="large" color="#4FFFB0" />
                    <Text style={{ color: colors.textSecondary, fontSize: 15, marginTop: 16, fontFamily: fonts.body }}>
                        {t('voice.saving')}
                    </Text>
                </View>
            )}
        </BaseBottomSheet>
    );
}
