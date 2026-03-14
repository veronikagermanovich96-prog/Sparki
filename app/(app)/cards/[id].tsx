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
    }, [id]);

    async function loadCard() {
        const { data } = await supabase.from('loyalty_cards').select('*').eq('id', id).single();
        setCard(data ?? null);
        setLoading(false);
    }

    const handleDelete = () => {
        Alert.alert('Удалить карту?', card?.name ?? '', [
            { text: 'Отмена', style: 'cancel' },
            {
                text: 'Удалить', style: 'destructive',
                onPress: async () => {
                    await supabase.from('loyalty_cards').delete().eq('id', id);
                    router.back();
                }
            }
        ]);
    };

    if (loading) {
        return (
            <View style={[styles.container, { paddingTop: insets.top }]}>
                <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />
            </View>
        );
    }

    if (!card) {
        return (
            <View style={[styles.container, { paddingTop: insets.top }]}>
                <Text style={{ color: '#fff', textAlign: 'center', marginTop: 40 }}>Карта не найдена</Text>
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
                            width={1.8}
                            height={80}
                        />
                    </View>
                </View>
            );
        }

        // manual — just show the number
        return (
            <View style={styles.barcodeContainer}>
                <View style={styles.manualCode}>
                    <Text style={styles.manualCodeTxt}>{card.barcode}</Text>
                </View>
            </View>
        );
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
                    <ArrowLeft color="#fff" size={22} />
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>{card.name}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => router.push(`/cards/edit/${id}` as any)}
                    >
                        <Edit2 color="#fff" size={20} />
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
                    <Text style={styles.noBarcodeTitle}>Штрих-код не добавлен</Text>
                    <TouchableOpacity
                        style={styles.addBarcodeBtn}
                        onPress={() => router.push(`/cards/edit/${id}` as any)}
                    >
                        <Text style={styles.addBarcodeTxt}>Добавить штрих-код</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#030712' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#1f2937',
    },
    iconBtn: {
        padding: 6,
        borderRadius: 8,
    },
    headerTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: '#fff', textAlign: 'center', marginHorizontal: 8 },
    cardVisual: {
        margin: 20,
        borderRadius: 20,
        padding: 24,
        minHeight: 140,
        justifyContent: 'space-between',
    },
    cardName: { fontSize: 22, fontWeight: '700', color: '#fff' },
    cardDiscount: { fontSize: 36, fontWeight: '800', color: 'rgba(255,255,255,0.9)', marginTop: 12 },
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
    manualCodeTxt: { fontSize: 28, fontWeight: '700', color: '#111827', letterSpacing: 3 },
    noBarcode: { alignItems: 'center', marginTop: 40, gap: 16 },
    noBarcodeTitle: { fontSize: 16, color: '#6b7280' },
    addBarcodeBtn: {
        backgroundColor: '#1f2937',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 10,
    },
    addBarcodeTxt: { fontSize: 14, color: '#3b82f6', fontWeight: '600' },
});
