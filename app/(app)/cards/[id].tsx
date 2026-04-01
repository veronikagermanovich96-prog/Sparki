import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Edit2, Trash2 } from 'lucide-react-native';
import * as Brightness from 'expo-brightness';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import Barcode from 'react-native-barcode-svg';
import QRCode from 'react-native-qrcode-svg';
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

export default function CardDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colors, fonts } = useTheme();
    const { t } = useTranslation();
    const [card, setCard] = useState<LoyaltyCard | null>(null);
    const [loading, setLoading] = useState(true);
    const [prevBrightness, setPrevBrightness] = useState<number | null>(null);

    useEffect(() => {
        loadCard();
        // Max brightness + keep awake
        (async () => {
            const { status } = await Brightness.requestPermissionsAsync();
            if (status === 'granted') {
                const current = await Brightness.getBrightnessAsync();
                setPrevBrightness(current);
                await Brightness.setBrightnessAsync(1);
            }
            await activateKeepAwakeAsync();
        })();

        return () => {
            // Restore brightness and deactivate keep awake
            deactivateKeepAwake();
            if (prevBrightness !== null) {
                Brightness.setBrightnessAsync(prevBrightness).catch(() => {});
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    async function loadCard() {
        const { data } = await supabase.from('loyalty_cards').select('*').eq('id', id).single();
        setCard(data ?? null);
        setLoading(false);
    }

    const handleDelete = () => {
        Alert.alert(t('cards.deleteCard'), card?.name ?? '', [
            { text: t('common.cancel'), style: 'cancel' },
            {
                text: t('common.delete'), style: 'destructive',
                onPress: async () => {
                    await supabase.from('loyalty_cards').delete().eq('id', id);
                    router.back();
                }
            }
        ]);
    };

    if (loading) {
        return (
            <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.bgPrimary }]}>
                <ActivityIndicator color={colors.textPrimary} style={{ marginTop: 40 }} />
            </View>
        );
    }

    if (!card) {
        return (
            <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.bgPrimary }]}>
                <Text style={{ color: colors.textPrimary, textAlign: 'center', marginTop: 40, fontFamily: fonts.body }}>{t('cards.cardNotFound')}</Text>
            </View>
        );
    }

    const renderBarcode = () => {
        if (!card.barcode) return null;

        if (card.barcode_type === 'qr') {
            return (
                <View style={styles.barcodeContainer}>
                    <QRCode
                        value={card.barcode}
                        size={200}
                        color="#000"
                        backgroundColor="#fff"
                    />
                </View>
            );
        }

        if (card.barcode_type === 'ean13' || card.barcode_type === 'code128') {
            const format = card.barcode_type === 'ean13' ? 'EAN13' : 'CODE128';
            return (
                <View style={styles.barcodeContainer}>
                    <View style={{ backgroundColor: '#fff', padding: 16, borderRadius: 12 }}>
                        <Barcode
                            value={card.barcode}
                            format={format}
                        />
                    </View>
                </View>
            );
        }

        // manual — just show the number
        return (
            <View style={styles.barcodeContainer}>
                <View style={styles.manualCode}>
                    <Text style={[styles.manualCodeTxt, { color: colors.bgSecondary }]}>{card.barcode}</Text>
                </View>
            </View>
        );
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.bgPrimary }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.bgTertiary }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
                    <ArrowLeft color={colors.textPrimary} size={22} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>{card.name}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => router.push(`/cards/edit/${id}` as any)}
                    >
                        <Edit2 color={colors.textPrimary} size={20} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconBtn} onPress={handleDelete}>
                        <Trash2 color="#ef4444" size={20} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Card Visual */}
            <View style={[styles.cardVisual, { backgroundColor: card.color }]}>
                <Text style={styles.cardName}>{card.name}</Text>
                {card.discount != null && card.discount > 0 && (
                    <Text style={styles.cardDiscount}>{card.discount}%</Text>
                )}
            </View>

            {/* Barcode */}
            {renderBarcode()}

            {!card.barcode && (
                <View style={styles.noBarcode}>
                    <Text style={[styles.noBarcodeTitle, { color: colors.textMuted }]}>{t('cards.noBarcode')}</Text>
                    <TouchableOpacity
                        style={[styles.addBarcodeBtn, { backgroundColor: colors.bgTertiary }]}
                        onPress={() => router.push(`/cards/edit/${id}` as any)}
                    >
                        <Text style={styles.addBarcodeTxt}>{t('cards.addBarcode')}</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
    },
    iconBtn: {
        padding: 6,
        borderRadius: 8,
    },
    headerTitle: { flex: 1, fontSize: 17, fontWeight: '600', textAlign: 'center', marginHorizontal: 8, fontFamily: 'Geist-SemiBold' },
    cardVisual: {
        margin: 20,
        borderRadius: 20,
        padding: 24,
        minHeight: 140,
        justifyContent: 'space-between',
    },
    cardName: { fontSize: 22, fontWeight: '700', color: '#fff', fontFamily: 'Geist-SemiBold' },
    cardDiscount: { fontSize: 36, fontWeight: '800', color: 'rgba(255,255,255,0.9)', marginTop: 12, fontFamily: 'Geist-Bold' },
    barcodeContainer: {
        alignItems: 'center',
        marginTop: 24,
        paddingHorizontal: 20,
    },
    manualCode: {
        backgroundColor: '#fff',
        borderRadius: 12,
        paddingHorizontal: 24,
        paddingVertical: 20,
    },
    manualCodeTxt: { fontSize: 28, fontWeight: '700', letterSpacing: 3, fontFamily: 'Geist-Bold' },
    noBarcode: { alignItems: 'center', marginTop: 40, gap: 16 },
    noBarcodeTitle: { fontSize: 16, fontFamily: 'Geist' },
    addBarcodeBtn: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 10,
    },
    addBarcodeTxt: { fontSize: 14, color: '#3b82f6', fontWeight: '600', fontFamily: 'Geist-SemiBold' },
});
