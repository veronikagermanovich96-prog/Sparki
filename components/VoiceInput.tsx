/**
 * VoiceInput – record speech → parse locally → save transactions
 */
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator, Alert, Animated, Easing,
    ScrollView, Text, TextInput, TouchableOpacity, View,
    NativeModules,
} from 'react-native';
import { Check, Mic, MicOff, Pencil, RotateCcw, X } from 'lucide-react-native';
// Conditional import: only load if native module is linked (crashes in Expo Go otherwise)
let Voice: any = null;
if (NativeModules.Voice) {
    try { Voice = require('@react-native-voice/voice').default; } catch { /* not linked */ }
}
type SpeechResultsEvent = { value?: string[] };
type SpeechErrorEvent = { error?: any };
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/context/ThemeContext';
import { BaseBottomSheet } from '@/components/ui/BaseBottomSheet';
import { supabase } from '@/lib/supabase';
import { format, subDays } from 'date-fns';
import type { Account, Category } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParsedTx {
    type: 'expense' | 'income' | 'transfer';
    amount: number;
    currency: string;
    category: Category | null;
    date: string;
    note: string;
    checked: boolean;
}

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

// ── Local text parser ─────────────────────────────────────────────────────────

function parseVoiceText(text: string, cats: Category[], currency: string): ParsedTx[] {
    const results: ParsedTx[] = [];
    const sentences = text.split(/,|и ещё|ещё|также|плюс/i);

    for (const sentence of sentences) {
        const s = sentence.trim().toLowerCase();
        if (!s) continue;

        // Detect type
        let type: 'expense' | 'income' | 'transfer' = 'expense';
        if (/получил|зарплата|доход|пришло|заработал/.test(s)) type = 'income';
        if (/перевёл|перевел|отправил/.test(s)) type = 'transfer';

        // Extract amount
        const amountMatch = s.match(/(\d+[\s\d]*[.,]?\d*)/);
        const amount = amountMatch
            ? parseFloat(amountMatch[1].replace(/\s/g, '').replace(',', '.'))
            : 0;
        if (!amount) continue;

        // Match category by keyword
        const category = cats.find(c =>
            s.includes(c.name.toLowerCase()) ||
            s.includes(c.name.toLowerCase().split(' ')[0]),
        ) ?? null;

        // Detect date
        let date = format(new Date(), 'yyyy-MM-dd');
        if (/вчера/.test(s)) date = format(subDays(new Date(), 1), 'yyyy-MM-dd');

        results.push({
            type, amount, currency,
            category, date,
            note: sentence.trim(),
            checked: true,
        });
    }

    console.log('Transcript:', text);
    console.log('Parsed result:', JSON.stringify(results));
    return results;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function VoiceInput({
    visible, onClose, onSaved,
    householdId, accounts, categories, baseCurrency,
}: VoiceInputProps) {
    const { colors } = useTheme();
    const { t } = useTranslation();

    const [stage, setStage] = useState<Stage>('recording');
    const [transcript, setTranscript] = useState('');
    const [parsed, setParsed] = useState<ParsedTx[]>([]);
    const [error, setError] = useState('');
    const [editingIdx, setEditingIdx] = useState<number | null>(null);
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const isListening = useRef(false);

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
        const onResults = (e: SpeechResultsEvent) => {
            const text = e.value?.[0] ?? '';
            setTranscript(text);
        };
        const onError = (e: SpeechErrorEvent) => {
            console.warn('Voice error', e.error);
            if (isListening.current) {
                stopAndProcess();
            }
        };
        const onEnd = () => {
            if (isListening.current) {
                stopAndProcess();
            }
        };

        Voice.onSpeechResults = onResults;
        Voice.onSpeechError = onError;
        Voice.onSpeechEnd = onEnd;

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

    async function resetAndStart() {
        setStage('recording');
        setTranscript('');
        setParsed([]);
        setError('');
        if (!Voice) {
            setError(t('voice.micError'));
            setStage('results');
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

    async function stopAndProcess() {
        isListening.current = false;
        try { if (Voice) await Voice.stop(); } catch { /* ignore */ }
        setTimeout(() => {
            setTranscript(prev => {
                if (prev.trim()) {
                    setStage('processing');
                    // Parse locally (synchronous but wrapped in setTimeout for UI update)
                    setTimeout(() => {
                        const items = parseVoiceText(prev.trim(), categories, baseCurrency);
                        if (items.length === 0) {
                            setError(t('voice.parseError'));
                        }
                        setParsed(items);
                        setStage('results');
                    }, 100);
                } else {
                    setError(t('voice.noSpeech'));
                    setStage('results');
                }
                return prev;
            });
        }, 300);
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

        const defaultAccount = accounts[0];
        if (!defaultAccount) { setError(t('voice.noAccount')); setStage('results'); return; }

        try {
            for (const tx of toSave) {
                const cat = tx.category
                    ?? categories.find(c => c.type === tx.type);

                if (!cat) continue;

                const accountId = defaultAccount.id;
                const amount = Math.abs(tx.amount);

                await supabase.from('transactions').insert({
                    household_id: householdId,
                    account_id: accountId,
                    category_id: cat.id,
                    type: tx.type,
                    amount,
                    currency: tx.currency || baseCurrency,
                    date: tx.date,
                    note: tx.note || null,
                    created_by: user.id,
                });

                const delta = tx.type === 'income' ? amount : -amount;
                await supabase.from('accounts')
                    .update({ balance: defaultAccount.balance + delta })
                    .eq('id', accountId);
            }

            onSaved();
        } catch (err) {
            console.warn('Save error', err);
            Alert.alert(t('common.error'), t('voice.saveError'));
            setStage('results');
        }
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
                <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: 'bold' }}>
                    {t('voice.title')}
                </Text>
                <TouchableOpacity onPress={onClose} hitSlop={12}>
                    <X color={colors.textMuted} size={22} />
                </TouchableOpacity>
            </View>

            {/* RECORDING */}
            {stage === 'recording' && (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                    <Animated.View style={{ transform: [{ scale: pulseAnim }], marginBottom: 24 }}>
                        <View style={{
                            width: 80, height: 80, borderRadius: 40,
                            backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Mic color="#fff" size={36} />
                        </View>
                    </Animated.View>
                    <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '600', marginBottom: 8 }}>
                        {t('voice.listening')}
                    </Text>
                    {transcript ? (
                        <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', paddingHorizontal: 20, marginBottom: 16 }}>
                            «{transcript}»
                        </Text>
                    ) : null}
                    <TouchableOpacity
                        onPress={stopAndProcess}
                        style={{
                            paddingVertical: 14, paddingHorizontal: 32, borderRadius: 14,
                            backgroundColor: colors.bgTertiary, marginTop: 8,
                        }}
                    >
                        <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}>
                            {t('voice.stopRecording')}
                        </Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* PROCESSING */}
            {stage === 'processing' && (
                <View style={{ alignItems: 'center', paddingVertical: 50 }}>
                    <ActivityIndicator size="large" color="#7C6FFF" />
                    <Text style={{ color: colors.textSecondary, fontSize: 15, marginTop: 16 }}>
                        {t('voice.processing')}
                    </Text>
                    {transcript ? (
                        <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingHorizontal: 20, marginTop: 8 }}>
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
                            <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 12 }}>
                                {error}
                            </Text>
                        </View>
                    ) : null}

                    {parsed.length > 0 && (
                        <View style={{ gap: 8, marginBottom: 20 }}>
                            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 4 }}>
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
                                        <Text style={{ fontSize: 18 }}>{tx.category?.icon ?? typeIcon(tx.type)}</Text>

                                        {/* Info */}
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600' }}>
                                                {tx.category?.name ?? tx.note}
                                            </Text>
                                            {tx.note ? (
                                                <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>
                                                    {tx.note}
                                                </Text>
                                            ) : null}
                                        </View>

                                        {/* Amount */}
                                        <Text style={{
                                            fontSize: 15, fontWeight: '700',
                                            color: tx.type === 'income' ? '#16a34a' : '#dc2626',
                                        }}>
                                            {typeSign(tx.type)}{tx.amount.toLocaleString()} {tx.currency}
                                        </Text>

                                        {/* Edit button */}
                                        <TouchableOpacity onPress={() => setEditingIdx(editingIdx === idx ? null : idx)} style={{ padding: 4 }}>
                                            <Pencil color={colors.textMuted} size={16} />
                                        </TouchableOpacity>
                                    </TouchableOpacity>

                                    {/* Inline edit fields */}
                                    {editingIdx === idx && (
                                        <View style={{ paddingHorizontal: 14, paddingBottom: 12, gap: 8 }}>
                                            {/* Amount */}
                                            <TextInput
                                                value={String(tx.amount)}
                                                onChangeText={v => setParsed(prev => prev.map((p, i) =>
                                                    i === idx ? { ...p, amount: parseFloat(v) || 0 } : p,
                                                ))}
                                                keyboardType="decimal-pad"
                                                style={{ backgroundColor: colors.bgTertiary, color: colors.textPrimary,
                                                    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15 }}
                                            />

                                            {/* Category selector */}
                                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                                    {categories.filter(c => c.type === tx.type || c.type === 'expense').map(cat => (
                                                        <TouchableOpacity
                                                            key={cat.id}
                                                            onPress={() => setParsed(prev => prev.map((p, i) =>
                                                                i === idx ? { ...p, category: cat } : p,
                                                            ))}
                                                            style={{
                                                                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
                                                                backgroundColor: tx.category?.id === cat.id ? '#7C6FFF' : colors.bgTertiary,
                                                            }}
                                                        >
                                                            <Text style={{ color: tx.category?.id === cat.id ? '#fff' : colors.textSecondary, fontSize: 13 }}>
                                                                {cat.icon} {cat.name}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    ))}
                                                </View>
                                            </ScrollView>

                                            {/* Date */}
                                            <View style={{ backgroundColor: colors.bgTertiary, borderRadius: 10,
                                                paddingHorizontal: 12, paddingVertical: 8 }}>
                                                <Text style={{ color: colors.textPrimary, fontSize: 14 }}>{tx.date}</Text>
                                            </View>

                                            {/* Note */}
                                            <TextInput
                                                value={tx.note}
                                                onChangeText={v => setParsed(prev => prev.map((p, i) =>
                                                    i === idx ? { ...p, note: v } : p,
                                                ))}
                                                placeholder={t('transactionForm.notePlaceholder')}
                                                placeholderTextColor={colors.textDisabled}
                                                style={{ backgroundColor: colors.bgTertiary, color: colors.textPrimary,
                                                    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14 }}
                                            />

                                            {/* Done */}
                                            <TouchableOpacity
                                                onPress={() => setEditingIdx(null)}
                                                style={{ backgroundColor: '#7C6FFF', borderRadius: 10,
                                                    paddingVertical: 10, alignItems: 'center' }}
                                            >
                                                <Text style={{ color: '#fff', fontWeight: '600' }}>{t('common.done')}</Text>
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
                            <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '600' }}>
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
                                <Text style={{ color: '#000', fontSize: 15, fontWeight: '700' }}>
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
                    <Text style={{ color: colors.textSecondary, fontSize: 15, marginTop: 16 }}>
                        {t('voice.saving')}
                    </Text>
                </View>
            )}
        </BaseBottomSheet>
    );
}
