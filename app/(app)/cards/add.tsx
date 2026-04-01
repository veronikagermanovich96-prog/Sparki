import { useState, useRef } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, ScrollView,
    StyleSheet, Alert, Modal, ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Camera, X } from 'lucide-react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { supabase } from '@/lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { useTranslation } from 'react-i18next';

type BarcodeType = 'ean13' | 'qr' | 'code128' | 'manual';

const PRESET_COLORS = [
    '#E63946', '#2196F3', '#2ECC71', '#F39C12',
    '#9B59B6', '#1ABC9C', '#E91E63', '#607D8B',
];

export default function AddCardScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colors, fonts } = useTheme();
    const { t } = useTranslation();
    const [permission, requestPermission] = useCameraPermissions();

    const BARCODE_TYPES: { value: BarcodeType; label: string }[] = [
        { value: 'ean13', label: 'EAN-13' },
        { value: 'code128', label: 'Code 128' },
        { value: 'qr', label: t('cards.qrCode') },
        { value: 'manual', label: t('cards.manual') },
    ];

    const [name, setName] = useState('');
    const [discount, setDiscount] = useState('');
    const [color, setColor] = useState(PRESET_COLORS[0]);
    const [barcode, setBarcode] = useState('');
    const [barcodeType, setBarcodeType] = useState<BarcodeType>('ean13');
    const [scannerVisible, setScannerVisible] = useState(false);
    const [saving, setSaving] = useState(false);
    const scannedRef = useRef(false);

    const openScanner = async () => {
        if (!permission?.granted) {
            const { granted } = await requestPermission();
            if (!granted) {
                Alert.alert(t('cards.noCameraAccess'), t('cards.noCameraMsg'));
                return;
            }
        }
        scannedRef.current = false;
        setScannerVisible(true);
    };

    const handleBarcodeScanned = ({ data, type }: { data: string; type: string }) => {
        if (scannedRef.current) return;
        scannedRef.current = true;
        setBarcode(data);
        if (type?.includes('qr')) setBarcodeType('qr');
        else if (type?.includes('ean13') || type?.includes('ean-13')) setBarcodeType('ean13');
        else setBarcodeType('code128');
        setScannerVisible(false);
    };

    const handleSave = async () => {
        if (!name.trim()) {
            Alert.alert(t('common.error'), t('cards.enterCardName'));
            return;
        }
        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('No user');
            const { data: member } = await supabase
                .from('household_members')
                .select('household_id')
                .eq('user_id', user.id)
                .single();
            if (!member) throw new Error('No household');

            const { error } = await supabase.from('loyalty_cards').insert({
                household_id: member.household_id,
                name: name.trim(),
                color,
                barcode: barcode.trim() || null,
                barcode_type: barcode.trim() ? barcodeType : null,
                discount: discount ? parseFloat(discount) : null,
            });
            if (error) throw error;
            router.back();
        } catch (e: any) {
            Alert.alert(t('common.error'), e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.bgPrimary }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.bgTertiary }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <ArrowLeft color={colors.textPrimary} size={22} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors.textPrimary }]}>{t('cards.newCard')}</Text>
                <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.saveBtn}>
                    {saving ? <ActivityIndicator color={colors.textPrimary} size="small" /> : <Text style={styles.saveTxt}>{t('common.save')}</Text>}
                </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

                {/* Preview */}
                <View style={[styles.preview, { backgroundColor: color }]}>
                    <Text style={styles.previewName}>{name || t('cards.cardNamePreview')}</Text>
                    {discount ? <Text style={styles.previewDiscount}>{discount}%</Text> : null}
                </View>

                {/* Name */}
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('cards.cardName')}</Text>
                <TextInput
                    style={[styles.input, { backgroundColor: colors.bgSecondary, color: colors.textPrimary }]}
                    value={name}
                    onChangeText={setName}
                    placeholder={t('cards.cardPlaceholder')}
                    placeholderTextColor={colors.textDisabled}
                    maxLength={40}
                />

                {/* Discount */}
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('cards.discount')}</Text>
                <TextInput
                    style={[styles.input, { backgroundColor: colors.bgSecondary, color: colors.textPrimary }]}
                    value={discount}
                    onChangeText={v => setDiscount(v.replace(/[^0-9.]/g, ''))}
                    placeholder="0"
                    placeholderTextColor={colors.textDisabled}
                    keyboardType="decimal-pad"
                    maxLength={5}
                />

                {/* Color */}
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('common.color')}</Text>
                <View style={styles.colorRow}>
                    {PRESET_COLORS.map(c => (
                        <TouchableOpacity
                            key={c}
                            style={[styles.colorDot, { backgroundColor: c }, color === c && [styles.colorDotSelected, { borderColor: colors.textPrimary }]]}
                            onPress={() => setColor(c)}
                        />
                    ))}
                </View>

                {/* Barcode */}
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('cards.barcode')}</Text>
                <View style={styles.barcodeRow}>
                    <TextInput
                        style={[styles.input, { flex: 1, marginBottom: 0, backgroundColor: colors.bgSecondary, color: colors.textPrimary }]}
                        value={barcode}
                        onChangeText={setBarcode}
                        placeholder={t('cards.barcodePlaceholder')}
                        placeholderTextColor={colors.textDisabled}
                        keyboardType="default"
                    />
                    <TouchableOpacity style={[styles.scanBtn, { backgroundColor: colors.bgSecondary }]} onPress={openScanner}>
                        <Camera color={colors.textSecondary} size={20} />
                    </TouchableOpacity>
                </View>

                {/* Barcode type */}
                {barcode.trim() ? (
                    <>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>{t('cards.barcodeType')}</Text>
                        <View style={styles.typeRow}>
                            {BARCODE_TYPES.map(bt => (
                                <TouchableOpacity
                                    key={bt.value}
                                    style={[styles.typeChip, { backgroundColor: colors.bgSecondary, borderColor: colors.borderLight }, barcodeType === bt.value && styles.typeChipActive]}
                                    onPress={() => setBarcodeType(bt.value)}
                                >
                                    <Text style={[styles.typeChipTxt, { color: colors.textSecondary }, barcodeType === bt.value && { color: colors.textPrimary }]}>
                                        {bt.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </>
                ) : null}
            </ScrollView>

            {/* Camera Scanner Modal */}
            <Modal visible={scannerVisible} animationType="slide">
                <View style={{ flex: 1, backgroundColor: '#000' }}>
                    <CameraView
                        style={{ flex: 1 }}
                        facing="back"
                        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'qr', 'code128', 'code39'] }}
                        onBarcodeScanned={handleBarcodeScanned}
                    />
                    <View style={[styles.scannerOverlay, { paddingBottom: insets.bottom + 24 }]}>
                        <Text style={styles.scannerHint}>{t('cards.scanHint')}</Text>
                        <TouchableOpacity style={styles.scannerClose} onPress={() => setScannerVisible(false)}>
                            <X color="#fff" size={22} />
                            <Text style={styles.scannerCloseTxt}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
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
    backBtn: { padding: 4 },
    title: { fontSize: 17, fontWeight: '600', fontFamily: 'Geist-SemiBold' },
    saveBtn: { padding: 4 },
    saveTxt: { fontSize: 15, fontWeight: '600', color: '#3b82f6', fontFamily: 'Geist-SemiBold' },
    content: { padding: 20, gap: 0, paddingBottom: 60 },
    preview: {
        borderRadius: 16,
        padding: 20,
        marginBottom: 28,
        minHeight: 110,
        justifyContent: 'space-between',
    },
    previewName: { fontSize: 18, fontWeight: '700', color: '#fff', fontFamily: 'Geist-SemiBold' },
    previewDiscount: { fontSize: 28, fontWeight: '800', color: 'rgba(255,255,255,0.9)', marginTop: 8, fontFamily: 'Geist-Bold' },
    label: { fontSize: 13, fontWeight: '500', marginBottom: 8, marginTop: 20, fontFamily: 'Geist-Medium' },
    input: {
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        marginBottom: 0,
        fontFamily: 'Geist',
    },
    colorRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
    colorDot: { width: 36, height: 36, borderRadius: 18 },
    colorDotSelected: { borderWidth: 3 },
    barcodeRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
    scanBtn: {
        borderRadius: 12,
        width: 46,
        height: 46,
        alignItems: 'center',
        justifyContent: 'center',
    },
    typeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    typeChip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
    },
    typeChipActive: { backgroundColor: '#1d4ed8', borderColor: '#3b82f6' },
    typeChipTxt: { fontSize: 13, fontFamily: 'Geist' },
    scannerOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        alignItems: 'center',
        gap: 16,
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingTop: 24,
    },
    scannerHint: { color: '#fff', fontSize: 15, fontFamily: 'Geist' },
    scannerClose: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    scannerCloseTxt: { color: '#fff', fontSize: 15, fontFamily: 'Geist' },
});
