import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, TouchableOpacity, View, SafeAreaView, Dimensions } from 'react-native';
import { useTranslation } from 'react-i18next';

const { width: _screenWidth } = Dimensions.get('window'); // eslint-disable-line @typescript-eslint/no-unused-vars

// ─── Quiz Data ───────────────────────────────────────────────────────────────

interface QuizQuestion {
    icon: string;
    categoryKey: string;
    slug: string;
    questionKey: string;
    optionKeys: { labelKey: string; type: string }[];
}

const QUESTIONS: QuizQuestion[] = [
    {
        icon: '🍽',
        categoryKey: 'quiz.restaurants',
        slug: 'restaurants',
        questionKey: 'quiz.q1',
        optionKeys: [
            { labelKey: 'quiz.q1a1', type: 'forself' },
            { labelKey: 'quiz.q1a2', type: 'everyday' },
            { labelKey: 'quiz.q1a3', type: 'base' },
        ],
    },
    {
        icon: '🚕',
        categoryKey: 'quiz.taxi',
        slug: 'taxi',
        questionKey: 'quiz.q2',
        optionKeys: [
            { labelKey: 'quiz.q2a1', type: 'forself' },
            { labelKey: 'quiz.q2a2', type: 'everyday' },
            { labelKey: 'quiz.q2a3', type: 'base' },
        ],
    },
    {
        icon: '👗',
        categoryKey: 'quiz.clothing',
        slug: 'clothing',
        questionKey: 'quiz.q3',
        optionKeys: [
            { labelKey: 'quiz.q3a1', type: 'base' },
            { labelKey: 'quiz.q3a2', type: 'everyday' },
            { labelKey: 'quiz.q3a3', type: 'forself' },
        ],
    },
    {
        icon: '💅',
        categoryKey: 'quiz.beauty',
        slug: 'beauty',
        questionKey: 'quiz.q4',
        optionKeys: [
            { labelKey: 'quiz.q4a1', type: 'forself' },
            { labelKey: 'quiz.q4a2', type: 'everyday' },
            { labelKey: 'quiz.q4a3', type: 'base' },
        ],
    },
    {
        icon: '🏋️',
        categoryKey: 'quiz.sport',
        slug: 'sport',
        questionKey: 'quiz.q5',
        optionKeys: [
            { labelKey: 'quiz.q5a1', type: 'forself' },
            { labelKey: 'quiz.q5a2', type: 'development' },
            { labelKey: 'quiz.q5a3', type: 'base' },
        ],
    },
    {
        icon: '📱',
        categoryKey: 'quiz.subscriptions',
        slug: 'subscriptions',
        questionKey: 'quiz.q6',
        optionKeys: [
            { labelKey: 'quiz.q6a1', type: 'other' },
            { labelKey: 'quiz.q6a2', type: 'everyday' },
            { labelKey: 'quiz.q6a3', type: 'forself' },
        ],
    },
    {
        icon: '✈️',
        categoryKey: 'quiz.travel',
        slug: 'travel',
        questionKey: 'quiz.q7',
        optionKeys: [
            { labelKey: 'quiz.q7a1', type: 'forself' },
            { labelKey: 'quiz.q7a2', type: 'forself' },
            { labelKey: 'quiz.q7a3', type: 'everyday' },
        ],
    },
    {
        icon: '🎁',
        categoryKey: 'quiz.gifts',
        slug: 'gifts',
        questionKey: 'quiz.q8',
        optionKeys: [
            { labelKey: 'quiz.q8a1', type: 'other' },
            { labelKey: 'quiz.q8a2', type: 'forself' },
            { labelKey: 'quiz.q8a3', type: 'everyday' },
        ],
    },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function CategoriesQuiz() {
    const router = useRouter();
    const { colors } = useTheme();
    const { t } = useTranslation();

    const [step, setStep] = useState(-1); // -1 = intro
    const [answers, setAnswers] = useState<(number | null)[]>(
        new Array(QUESTIONS.length).fill(null),
    );
    const [saving, setSaving] = useState(false);

    const currentAnswer = step >= 0 ? answers[step] : null;

    async function savePreferences() {
        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: member } = await supabase
                .from('household_members')
                .select('household_id')
                .eq('user_id', user.id)
                .single();
            if (!member) return;

            const hid = member.household_id;

            // Build preference rows
            const rows = QUESTIONS.map((q, i) => ({
                household_id: hid,
                category_slug: q.slug,
                expense_type: q.optionKeys[answers[i] ?? 0].type,
                updated_at: new Date().toISOString(),
            }));

            // Upsert preferences
            await supabase
                .from('household_category_preferences')
                .upsert(rows, { onConflict: 'household_id,category_slug' });

            // Also update matching categories in the categories table
            for (const row of rows) {
                const nameMap: Record<string, string[]> = {
                    restaurants: ['Рестораны и кафе', 'Кафе', 'Кафе и рестораны'],
                    taxi: ['Такси'],
                    clothing: ['Одежда', 'Одежда и обувь'],
                    beauty: ['Красота'],
                    sport: ['Спорт', 'Спорт и фитнес', 'Фитнес'],
                    subscriptions: ['Подписки'],
                    travel: ['Путешествия'],
                    gifts: ['Подарки'],
                };
                const names = nameMap[row.category_slug] ?? [];
                if (names.length > 0) {
                    await supabase
                        .from('categories')
                        .update({ expense_type: row.expense_type })
                        .eq('household_id', hid)
                        .in('name', names);
                }
            }

            // Mark onboarding completed
            await supabase
                .from('households')
                .update({ onboarding_completed: true })
                .eq('id', hid);
        } catch {
            // silently continue
        } finally {
            setSaving(false);
        }

        router.replace('/(app)/' as any);
    }

    function skip() {
        router.replace('/(app)/' as any);
    }

    // ── Intro Screen ──
    if (step === -1) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 }}>
                    <Text style={{ fontSize: 48, marginBottom: 24 }}>🎯</Text>
                    <Text style={{ color: colors.textPrimary, fontSize: 26, fontWeight: '700', textAlign: 'center', marginBottom: 16 }}>
                        {t('quiz.title')}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 48 }}>
                        {t('quiz.desc')}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: 'center', marginBottom: 40 }}>
                        {t('quiz.hint')}
                    </Text>

                    <TouchableOpacity
                        onPress={() => setStep(0)}
                        activeOpacity={0.8}
                        style={{
                            backgroundColor: '#7C6FFF',
                            borderRadius: 16,
                            paddingVertical: 16,
                            paddingHorizontal: 48,
                            width: '100%',
                            alignItems: 'center',
                            marginBottom: 16,
                        }}
                    >
                        <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>{t('quiz.startSetup')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={skip} activeOpacity={0.7}>
                        <Text style={{ color: colors.textMuted, fontSize: 15 }}>{t('quiz.skipSetup')}</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    // ── Finale Screen ──
    if (step === QUESTIONS.length) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 }}>
                    <Text style={{ fontSize: 48, marginBottom: 24 }}>✅</Text>
                    <Text style={{ color: colors.textPrimary, fontSize: 26, fontWeight: '700', textAlign: 'center', marginBottom: 16 }}>
                        {t('quiz.doneTitle')}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 12 }}>
                        {t('quiz.doneDesc')}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: 'center', marginBottom: 48 }}>
                        {t('quiz.doneHint')}
                    </Text>

                    <TouchableOpacity
                        onPress={savePreferences}
                        disabled={saving}
                        activeOpacity={0.8}
                        style={{
                            backgroundColor: '#7C6FFF',
                            borderRadius: 16,
                            paddingVertical: 16,
                            paddingHorizontal: 48,
                            width: '100%',
                            alignItems: 'center',
                            opacity: saving ? 0.5 : 1,
                        }}
                    >
                        <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>
                            {saving ? t('common.saving') : t('quiz.startUsing')}
                        </Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    // ── Question Screen ──
    const q = QUESTIONS[step];
    const progress = (step + 1) / QUESTIONS.length;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
            <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 20 }}>
                {/* Progress */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600' }}>
                        {t('quiz.stepOf', { step: step + 1, total: QUESTIONS.length })}
                    </Text>
                </View>
                <View style={{ height: 4, backgroundColor: colors.bgTertiary, borderRadius: 2, marginBottom: 40 }}>
                    <View style={{ height: 4, backgroundColor: '#7C6FFF', borderRadius: 2, width: `${progress * 100}%` }} />
                </View>

                {/* Icon + Category */}
                <Text style={{ fontSize: 48, textAlign: 'center', marginBottom: 12 }}>{q.icon}</Text>
                <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 24 }}>
                    {t(q.categoryKey)}
                </Text>

                {/* Question */}
                <Text style={{ color: colors.textSecondary, fontSize: 16, textAlign: 'center', marginBottom: 32, lineHeight: 24 }}>
                    {t(q.questionKey)}
                </Text>

                {/* Options */}
                <View style={{ gap: 12 }}>
                    {q.optionKeys.map((opt, i) => {
                        const selected = currentAnswer === i;
                        return (
                            <TouchableOpacity
                                key={i}
                                onPress={() => {
                                    const next = [...answers];
                                    next[step] = i;
                                    setAnswers(next);
                                }}
                                activeOpacity={0.7}
                                style={{
                                    backgroundColor: selected ? '#1e1b4b' : colors.bgSecondary,
                                    borderWidth: 1.5,
                                    borderColor: selected ? '#7C6FFF' : colors.bgTertiary,
                                    borderRadius: 14,
                                    paddingVertical: 16,
                                    paddingHorizontal: 20,
                                }}
                            >
                                <Text style={{ color: selected ? '#c4b5fd' : '#d1d5db', fontSize: 15, lineHeight: 22 }}>
                                    {t(opt.labelKey)}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* Spacer */}
                <View style={{ flex: 1 }} />

                {/* Navigation */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 24, gap: 12 }}>
                    <TouchableOpacity
                        onPress={() => setStep(s => s - 1)}
                        activeOpacity={0.7}
                        style={{
                            flex: 1,
                            backgroundColor: colors.bgTertiary,
                            borderRadius: 14,
                            paddingVertical: 14,
                            alignItems: 'center',
                        }}
                    >
                        <Text style={{ color: colors.textSecondary, fontSize: 16, fontWeight: '600' }}>{t('quiz.back')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => setStep(s => s + 1)}
                        disabled={currentAnswer === null}
                        activeOpacity={0.8}
                        style={{
                            flex: 1,
                            backgroundColor: currentAnswer !== null ? '#7C6FFF' : colors.borderLight,
                            borderRadius: 14,
                            paddingVertical: 14,
                            alignItems: 'center',
                        }}
                    >
                        <Text style={{
                            color: currentAnswer !== null ? '#fff' : colors.textMuted,
                            fontSize: 16,
                            fontWeight: '600',
                        }}>
                            {t('quiz.next')}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </SafeAreaView>
    );
}
