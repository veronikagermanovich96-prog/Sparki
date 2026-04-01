import { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Plus, Tag } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { useTranslation } from 'react-i18next';

interface LoyaltyCard {
    id: string;
    household_id: string;
    name: string;
    color: string;
    barcode: string | null;
    barcode_type: 'ean13' | 'qr' | 'code128' | 'manual' | null;
    discount: number | null;
    sort_order: number;
    created_at: string;
}

export default function CardsScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colors, fonts } = useTheme();
    const { t } = useTranslation();
    const [cards, setCards] = useState<LoyaltyCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [householdId, setHouseholdId] = useState<string | null>(null);

    async function loadCards(hid: string) {
        const { data } = await supabase
            .from('loyalty_cards')
            .select('*')
            .eq('household_id', hid)
            .order('sort_order')
            .order('created_at');
        setCards(data ?? []);
    }

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data: member } = await supabase
                .from('household_members')
                .select('household_id')
                .eq('user_id', user.id)
                .single();
            if (!member) return;
            setHouseholdId(member.household_id);
            await loadCards(member.household_id);
            setLoading(false);
        })();
    }, []);

    useFocusEffect(useCallback(() => {
        if (householdId) loadCards(householdId);
    }, [householdId]));

    const renderCard = ({ item }: { item: LoyaltyCard }) => (
        <TouchableOpacity
            style={[styles.card, { backgroundColor: item.color }]}
            onPress={() => router.push(`/cards/${item.id}` as any)}
            activeOpacity={0.8}
        >
            <View style={styles.cardContent}>
                <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
                {item.discount != null && item.discount > 0 && (
                    <Text style={styles.cardDiscount}>{item.discount}%</Text>
                )}
            </View>
            {item.barcode ? (
                <View style={styles.cardBarIndicator} />
            ) : null}
        </TouchableOpacity>
    );

    if (loading) {
        return (
            <View style={{ flex: 1, backgroundColor: colors.bgPrimary, paddingTop: insets.top }}>
                <View style={styles.header}>
                    <Text style={{ fontSize: 28, fontWeight: '700', color: colors.textPrimary, fontFamily: fonts.heading }}>{t('cards.title')}</Text>
                </View>
                <ActivityIndicator color={colors.textPrimary} style={{ marginTop: 40 }} />
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: colors.bgPrimary, paddingTop: insets.top }}>
            <View style={styles.header}>
                <Text style={{ fontSize: 28, fontWeight: '700', color: colors.textPrimary, fontFamily: fonts.heading }}>{t('cards.title')}</Text>
                <TouchableOpacity
                    onPress={() => router.push('/cards/add' as any)}
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bgTertiary, alignItems: 'center', justifyContent: 'center' }}
                >
                    <Plus color={colors.textPrimary} size={22} />
                </TouchableOpacity>
            </View>

            {cards.length === 0 ? (
                <View style={styles.empty}>
                    <Tag color={colors.borderLight} size={56} />
                    <Text style={{ fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginTop: 8, fontFamily: fonts.heading }}>{t('cards.noCards')}</Text>
                    <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20, fontFamily: fonts.body }}>{t('cards.noCardsHint')}</Text>
                    <TouchableOpacity
                        style={styles.emptyButton}
                        onPress={() => router.push('/cards/add' as any)}
                    >
                        <Text style={styles.emptyButtonText}>{t('cards.addCard')}</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={cards}
                    keyExtractor={item => item.id}
                    renderItem={renderCard}
                    numColumns={2}
                    columnWrapperStyle={styles.row}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
    },
    list: { paddingHorizontal: 16, paddingBottom: 32 },
    row: { gap: 12, marginBottom: 12 },
    card: {
        flex: 1,
        borderRadius: 16,
        padding: 16,
        minHeight: 120,
        justifyContent: 'space-between',
    },
    cardContent: { flex: 1, justifyContent: 'space-between' },
    cardName: { fontSize: 15, fontWeight: '600', color: '#fff', fontFamily: 'Geist-SemiBold' },
    cardDiscount: {
        fontSize: 22,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.9)',
        marginTop: 8,
        fontFamily: 'Geist-Bold',
    },
    cardBarIndicator: {
        height: 3,
        borderRadius: 2,
        backgroundColor: 'rgba(0,0,0,0.25)',
        marginTop: 12,
    },
    empty: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 40,
        gap: 12,
    },
    emptyButton: {
        marginTop: 16,
        backgroundColor: '#3b82f6',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 12,
    },
    emptyButtonText: { fontSize: 15, fontWeight: '600', color: '#fff', fontFamily: 'Geist-SemiBold' },
});
