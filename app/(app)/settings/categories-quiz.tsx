import { supabase } from '@/lib/supabase';
import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View, SafeAreaView } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

// ─── Quiz Data ───────────────────────────────────────────────────────────────

interface QuizQuestion {
    icon: string;
    category: string;
    slug: string;
    question: string;
    options: { label: string; type: string }[];
}

const QUESTIONS: QuizQuestion[] = [
    {
        icon: '🍽',
        category: 'Рестораны и кафе',
        slug: 'restaurants',
        question: 'Как ты обычно используешь рестораны?',
        options: [
            { label: 'Редко — особый случай, праздник', type: 'forself' },
            { label: 'Регулярно — часть повседневной жизни', type: 'everyday' },
            { label: 'Постоянно — это моя основная еда', type: 'base' },
        ],
    },
    {
        icon: '🚕',
        category: 'Такси',
        slug: 'taxi',
        question: 'Как ты передвигаешься по городу?',
        options: [
            { label: 'В основном общественный транспорт, такси — редко', type: 'forself' },
            { label: 'Такси несколько раз в неделю', type: 'everyday' },
            { label: 'Такси — мой основной транспорт', type: 'base' },
        ],
    },
    {
        icon: '👗',
        category: 'Одежда и обувь',
        slug: 'clothing',
        question: 'Как ты относишься к покупке одежды?',
        options: [
            { label: 'Покупаю редко — только когда нужно', type: 'base' },
            { label: 'Обновляю гардероб несколько раз в год', type: 'everyday' },
            { label: 'Слежу за модой, покупаю регулярно', type: 'forself' },
        ],
    },
    {
        icon: '💅',
        category: 'Красота',
        slug: 'beauty',
        question: 'Как часто ты посещаешь салон, парикмахерскую, маникюр?',
        options: [
            { label: 'Редко — по особым случаям', type: 'forself' },
            { label: 'Раз в месяц — это часть ухода', type: 'everyday' },
            { label: 'Регулярно — это важная часть жизни', type: 'base' },
        ],
    },
    {
        icon: '🏋️',
        category: 'Спорт и фитнес',
        slug: 'sport',
        question: 'Как спорт вписан в твою жизнь?',
        options: [
            { label: 'Иногда — по настроению', type: 'forself' },
            { label: 'Регулярно — это моя привычка', type: 'development' },
            { label: 'Ежедневно — это образ жизни', type: 'base' },
        ],
    },
    {
        icon: '📱',
        category: 'Подписки',
        slug: 'subscriptions',
        question: 'Как ты используешь стриминг и цифровые подписки?',
        options: [
            { label: 'Почти не использую', type: 'other' },
            { label: 'Есть несколько — Netflix, Spotify и т.д.', type: 'everyday' },
            { label: 'Много подписок — это важная часть досуга', type: 'forself' },
        ],
    },
    {
        icon: '✈️',
        category: 'Путешествия',
        slug: 'travel',
        question: 'Как часто ты путешествуешь?',
        options: [
            { label: 'Редко — раз в год или реже', type: 'forself' },
            { label: 'Несколько раз в год', type: 'forself' },
            { label: 'Постоянно — это часть моей работы или образа жизни', type: 'everyday' },
        ],
    },
    {
        icon: '🎁',
        category: 'Подарки',
        slug: 'gifts',
        question: 'Как ты относишься к подаркам?',
        options: [
            { label: 'Покупаю только на праздники', type: 'other' },
            { label: 'Люблю радовать близких — покупаю регулярно', type: 'forself' },
            { label: 'Подарки — важная часть моих отношений с людьми', type: 'everyday' },
        ],
    },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function CategoriesQuiz() {
    const TYPE_LABELS: Record<string, string> = {
        base: 'Базовые', everyday: 'Повседневные', development: 'Развитие',
        forself: 'Для себя', work: 'Работа', other: 'Разное',
    };

    const router = useRouter();
    const navigation = useNavigation();
    const { colors } = useTheme();

    const [step, setStep] = useState(-1); // -1 = intro
    const [answers, setAnswers] = useState<(number | null)[]>(
        new Array(QUESTIONS.length).fill(null),
    );
    const [saving, setSaving] = useState(false);
    const [loadingPrefs, setLoadingPrefs] = useState(true);

    // Hide tab bar
    useEffect(() => {
        const parent = navigation.getParent();
        parent?.setOptions({ tabBarStyle: { display: 'none' } });
        return () => {
            parent?.setOptions({
                tabBarStyle: {
                    backgroundColor: colors.bgPrimary,
                    borderTopColor: colors.bgTertiary,
                    display: 'flex',
                },
            });
        };
    }, [navigation, colors]);

    // Load existing preferences
    useEffect(() => {
        (async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) { setLoadingPrefs(false); return; }
                const { data: member } = await supabase
                    .from('household_members')
                    .select('household_id')
                    .eq('user_id', user.id)
                    .single();
                if (!member) { setLoadingPrefs(false); return; }

                const { data: prefs } = await supabase
                    .from('household_category_preferences')
                    .select('category_slug, expense_type')
                    .eq('household_id', member.household_id);

                if (prefs && prefs.length > 0) {
                    const prefMap = new Map(prefs.map(p => [p.category_slug, p.expense_type]));
                    const restored = QUESTIONS.map((q, i) => {
                        const saved = prefMap.get(q.slug);
                        if (!saved) return null;
                        const idx = q.options.findIndex(o => o.type === saved);
                        return idx >= 0 ? idx : null;
                    });
                    setAnswers(restored);
                }
            } catch { /* ignore */ }
            setLoadingPrefs(false);
        })();
    }, []);

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
                expense_type: q.options[answers[i] ?? 0].type,
                updated_at: new Date().toISOString(),
            }));

            // Upsert preferences
            await supabase
                .from('household_category_preferences')
                .upsert(rows, { onConflict: 'household_id,category_slug' });

            // Update matching categories
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
        } catch { /* ignore */ }
        setSaving(false);
        router.dismissAll();
    }

    // ── Loading state ──
    if (loadingPrefs) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator color="#7C6FFF" size="large" />
            </SafeAreaView>
        );
    }

    // ── Intro Screen ──
    const hasExistingPrefs = answers.some(a => a !== null);

    if (step === -1) {
        if (hasExistingPrefs) {
            // Show current settings with option to update
            return (
                <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 }}>
                        <Text style={{ fontSize: 48, marginBottom: 24 }}>⚙️</Text>
                        <Text style={{ color: colors.textPrimary, fontSize: 26, fontWeight: '700', textAlign: 'center', marginBottom: 16 }}>
                            Обновить персонализацию
                        </Text>

                        {/* Current settings summary */}
                        <View style={{ width: '100%', marginBottom: 32, gap: 8 }}>
                            {QUESTIONS.map((q, i) => (
                                answers[i] !== null && (
                                    <View key={i} style={{
                                        flexDirection: 'row',
                                        justifyContent: 'space-between',
                                        paddingVertical: 8,
                                        borderBottomWidth: 0.5,
                                        borderBottomColor: colors.bgTertiary,
                                    }}>
                                        <Text style={{ color: colors.textSecondary, fontSize: 14, flex: 1, flexShrink: 1 }}>
                                            {q.icon} {q.category}
                                        </Text>
                                        <Text style={{ color: '#7C6FFF', fontSize: 14, flexShrink: 1, textAlign: 'right' }}>
                                            {TYPE_LABELS[q.options[answers[i]!].type] ?? q.options[answers[i]!].type}
                                        </Text>
                                    </View>
                                )
                            ))}
                        </View>

                        <TouchableOpacity
                            onPress={() => setStep(0)}
                            activeOpacity={0.8}
                            style={{
                                backgroundColor: '#7C6FFF',
                                borderRadius: 16,
                                paddingVertical: 16,
                                width: '100%',
                                alignItems: 'center',
                                marginBottom: 16,
                            }}
                        >
                            <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700' }}>Изменить настройки</Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
                            <Text style={{ color: colors.textMuted, fontSize: 15 }}>Назад</Text>
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            );
        }

        // First-time intro
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 }}>
                    <Text style={{ fontSize: 48, marginBottom: 24 }}>🎯</Text>
                    <Text style={{ color: colors.textPrimary, fontSize: 26, fontWeight: '700', textAlign: 'center', marginBottom: 16 }}>
                        Персонализация категорий
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 48 }}>
                        Ответь на 8 коротких вопросов —{'\n'}приложение подстроит категории{'\n'}под твой образ жизни.
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: 'center', marginBottom: 40 }}>
                        Это займёт 2 минуты и сделает{'\n'}аналитику точнее именно для тебя.
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
                        <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700' }}>Начать настройку</Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
                        <Text style={{ color: colors.textMuted, fontSize: 15 }}>Назад</Text>
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
                        Готово!
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 12 }}>
                        Категории настроены под тебя.{'\n'}Аналитика и прогноз теперь{'\n'}отражают твой образ жизни.
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: 'center', marginBottom: 48 }}>
                        Ты всегда можешь изменить это{'\n'}в Настройки → Персонализация категорий
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
                        <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700' }}>
                            {saving ? 'Сохраняю...' : 'Начать пользоваться'}
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
                        {step + 1} из {QUESTIONS.length}
                    </Text>
                </View>
                <View style={{ height: 4, backgroundColor: colors.bgTertiary, borderRadius: 2, marginBottom: 40 }}>
                    <View style={{ height: 4, backgroundColor: '#7C6FFF', borderRadius: 2, width: `${progress * 100}%` }} />
                </View>

                {/* Icon + Category */}
                <Text style={{ fontSize: 48, textAlign: 'center', marginBottom: 12 }}>{q.icon}</Text>
                <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 24 }}>
                    {q.category}
                </Text>

                {/* Question */}
                <Text style={{ color: colors.textSecondary, fontSize: 16, textAlign: 'center', marginBottom: 32, lineHeight: 24 }}>
                    {q.question}
                </Text>

                {/* Options */}
                <View style={{ gap: 12 }}>
                    {q.options.map((opt, i) => {
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
                                <Text style={{ color: selected ? '#c4b5fd' : colors.textSecondary, fontSize: 15, lineHeight: 22 }}>
                                    {opt.label}
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
                        <Text style={{ color: colors.textSecondary, fontSize: 16, fontWeight: '600' }}>← Назад</Text>
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
                            color: currentAnswer !== null ? colors.textPrimary : colors.textMuted,
                            fontSize: 16,
                            fontWeight: '600',
                        }}>
                            Далее →
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </SafeAreaView>
    );
}
