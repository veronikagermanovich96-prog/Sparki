import { useState, useEffect, useRef } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, ScrollView,
    StyleSheet, Alert, Modal, ActivityIndicator
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Camera, X } from 'lucide-react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { supabase } from '@/lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type BarcodeType = 'ean13' | 'qr' | 'code128' | 'manual';

const PRESET_COLORS = [
    '#E63946', '#2196F3', '#2ECC71', '#F39C12',
    '#9B59B6', '#1ABC9C', '#E91E63', '#607D8B',
];

const BARCODE_TYPES: { value: BarcodeType; label: string }[] = [
    { value: 'ean13', label: 'EAN-13' },
    { value: 'code128', label: 'Code 128' },
    { value: 'qr', label: 'QR-код' },
    { value: 'manual', label: 'Вручную' },
];

export default function EditCardScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [permission, requestPermission] = useCameraPermissions();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [name, setName] = useState('');
    const [discount, setDiscount] = useState('');
    const [color, setColor] = useState(PRESET_COLORS[0]);
    const [barcode, setBarcode] = useState('');
    const [barcodeType, setBarcodeType] = useState<BarcodeType>('ean13');
    const [scannerVisible, setScannerVisible] = useState(false);
    const scannedRef = useRef(false);

    useEffect(() => {
        (async () => {
            const { data } = await supabase.from('loyalty_cards').select('*').eq('id', id).single();
            if (data) {
                setName(data.name);
                setDiscount(data.discount != null ? String(data.discount) : '');
                setColor(data.color);
                setBarcode(data.barcode ?? '');
                setBarcodeType(data.barcode_type ?? 'ean13');
            }
            setLoading(false);
        })();
    }, [id]);

    const openScanner = async () => {
        if (!permission?.granted) {
            const { granted } = await requestPermission();
            if (!granted) {
                Alert.alert('Нет доступа к камере', 'Разрешите доступ к камере в настройках.');
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
            Alert.alert('Ошибка', 'Введите название карты');
            return;
        }
        setSaving(true);
        try {
            const { error } = await supabase.from('loyalty_cards').update({
                name: name.trim(),
                color,
                barcode: barcode.trim() || null,
                barcode_type: barcode.trim() ? barcodeType : null,
                discount: discount ? parseFloat(discount) : null,
            }).eq('id', id);
            if (error) throw error;
            router.back();
        } catch (e: any) {
            Alert.alert('Ошибка', e.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <View style={[styles.container, { paddingTop: insets.top }]}>
                <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />
            </View>
        );
    }

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <ArrowLeft color="#fff" size={22} />
                </TouchableOpacity>
                <Text style={styles.title}>Редактировать карту</Text>
                <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.saveBtn}>
                    {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveTxt}>Сохранить</Text>}
                </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

                {/* Preview */}
                <View style={[styles.preview, { backgroundColor: color }]}>
                    <Text style={styles.previewName}>{name || 'Название карты'}</Text>
                    {discount ? <Text style={styles.previewDiscount}>{discount}%</Text> : null}
                </View>

                {/* Name */}
                <Text style={styles.label}>Название</Text>
                <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="Пятёрочка, Wildberries..."
                    placeholderTextColor="#4b5563"
                    maxLength={40}
                />

                {/* Discount */}
                <Text style={styles.label}>Скидка (%)</Text>
                <TextInput
                    style={styles.input}
                    value={discount}
                    onChangeText={t => setDiscount(t.replace(/[^0-9.]/g, ''))}
                    placeholder="0"
                    placeholderTextColor="#4b5563"
                    keyboardType="decimal-pad"
                    maxLength={5}
                />

                {/* Color */}
                <Text style={styles.label}>Цвет</Text>
                <View style={styles.colorRow}>
                    {PRESET_COLORS.map(c => (
                        <TouchableOpacity
                            key={c}
                            style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorDotSelected]}
                            onPress={() => setColor(c)}
                        />
                    ))}
                </View>

                {/* Barcode */}
                <Text style={styles.label}>Штрих-код / QR</Text>
                <View style={styles.barcodeRow}>
                    <TextInput
                        style={[styles.input, { flex: 1, marginBottom: 0 }]}
                        value={barcode}
                        onChangeText={setBarcode}
                        placeholder="Номер карты или код"
                        placeholderTextColor="#4b5563"
                    />
                    <TouchableOpacity style={styles.scanBtn} onPress={openScanner}>
                        <Camera color="#9ca3af" size={20} />
                    </TouchableOpacity>
                </View>

                {/* Barcode type */}
                {barcode.trim() ? (
                    <>
                        <Text style={styles.label}>Тип кода</Text>
                        <View style={styles.typeRow}>
                            {BARCODE_TYPES.map(bt => (
                                <TouchableOpacity
                                    key={bt.value}
                                    style={[styles.typeChip, barcodeType === bt.value && styles.typeChipActive]}
                                    onPress={() => setBarcodeType(bt.value)}
                                >
                                    <Text style={[styles.typeChipTxt, barcodeType === bt.value && styles.typeChipTxtActive]}>
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
                        <Text style={styles.scannerHint}>Наведите на штрих-код или QR</Text>
                        <TouchableOpacity style={styles.scannerClose} onPress={() => setScannerVisible(false)}>
                            <X color="#fff" size={22} />
                            <Text style={styles.scannerCloseTxt}>Отмена</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
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
    backBtn: { padding: 4 },
    title: { fontSize: 17, fontWeight: '600', color: '#fff' },
    saveBtn: { padding: 4 },
    saveTxt: { fontSize: 15, fontWeight: '600', color: '#3b82f6' },
    content: { padding: 20, paddingBottom: 60 },
    preview: {
        borderRadius: 16,
        padding: 20,
        marginBottom: 28,
        minHeight: 110,
        justifyContent: 'space-between',
    },
    previewName: { fontSize: 18, fontWeight: '700', color: '#fff' },
    previewDiscount: { fontSize: 28, fontWeight: '800', color: 'rgba(255,255,255,0.9)', marginTop: 8 },
    label: { fontSize: 13, fontWeight: '500', color: '#9ca3af', marginBottom: 8, marginTop: 20 },
    input: {
        backgroundColor: '#111827',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        color: '#fff',
        fontSize: 15,
    },
    colorRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
    colorDot: { width: 36, height: 36, borderRadius: 18 },
    colorDotSelected: { borderWidth: 3, borderColor: '#fff' },
    barcodeRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
    scanBtn: {
        backgroundColor: '#111827',
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
        backgroundColor: '#111827',
        borderWidth: 1,
        borderColor: '#374151',
    },
    typeChipActive: { backgroundColor: '#1d4ed8', borderColor: '#3b82f6' },
    typeChipTxt: { fontSize: 13, color: '#9ca3af' },
    typeChipTxtActive: { color: '#fff' },
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
    scannerHint: { color: '#fff', fontSize: 15 },
    scannerClose: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    scannerCloseTxt: { color: '#fff', fontSize: 15 },
});
