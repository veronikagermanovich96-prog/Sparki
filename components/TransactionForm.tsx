import {
    Activity, ArrowLeft, ArrowRightLeft, Award,
    Banknote, Bike, Bitcoin, BookOpen, Briefcase, Building2, Bus,
    Bell, Calculator, Calendar, Camera, Car, Check, ChevronDown, CircleDollarSign, Coffee, Coins, CreditCard, Images,
    Droplets, Dumbbell, Film, Flag, Flame, Fuel, Gift, Globe, GraduationCap,
    Heart, Home, Landmark, MapPin, Monitor, Music,
    Package, PawPrint, Pencil, Pill, Plane, Plus, Receipt, Scissors,
    Delete, RefreshCw, Search, ShoppingBag, ShoppingCart, Shirt, Sofa, Star,
    Tag, Train, TrendingDown, TrendingUp, Trophy, Tv, Utensils,
    Wallet, Wifi, X, Zap,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator, Alert, Image, Keyboard, Modal, ScrollView,
    Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ru } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { formatAmount, CURRENCIES } from '@/constants/currencies';
import { ExpenseType } from '@/types';
import { useTheme } from '@/context/ThemeContext';
import { useTranslation } from 'react-i18next';

// ─── Icon map ─────────────────────────────────────────────────────────────────

type IconComp = React.ComponentType<{ color: string; size: number }>;

const ICON_MAP: Record<string, IconComp> = {
    ShoppingCart, Coffee, Utensils, ShoppingBag,
    Car, Bus, Bike, Train, Plane, Fuel, Ship: undefined as any,
    Home, Sofa, Zap, Wifi, Flame, Droplets,
    Heart, Dumbbell, Activity, Pill,
    Film, Music, Tv, Monitor, Trophy, Star,
    Shirt, Tag, Gift, Scissors,
    MapPin, Globe,
    BookOpen, GraduationCap,
    CreditCard, Wallet, PiggyBank: undefined as any,
    Coins, Banknote, Landmark, Bitcoin, CircleDollarSign, TrendingUp, TrendingDown,
    Briefcase, Building2, Receipt, Package,
    PawPrint, Award, Flag, ArrowRightLeft,
};

const ICON_KEYS = Object.keys(ICON_MAP).filter(k => !!ICON_MAP[k]);
const CAT_ICONS = ICON_KEYS.reduce<Record<string, IconComp>>((acc, k) => {
    acc[k] = ICON_MAP[k]!;
    return acc;
}, {});

const COLORS = ['#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#f97316', '#eab308', '#14b8a6', '#ec4899', '#6b7280', '#f43f5e'];

const CURRENCY_LIST = CURRENCIES;

// ─── Types ────────────────────────────────────────────────────────────────────

type AccountLight  = { id: string; name: string; color: string | null; currency: string; balance: number };
type CategoryLight = { id: string; name: string; slug: string | null; icon: string | null; color: string | null; type: 'income' | 'expense'; expense_type: string | null; is_system: boolean };
type TagLight      = { id: string; name: string };
type RecurFreq     = 'daily' | 'weekly' | 'monthly' | 'yearly';

// Slug → category name fragments for fallback matching when slug is missing in DB
const SLUG_NAME_MAP: Record<string, RegExp> = {
    food: /еда|продукт|groceries|food|lebensmittel|alimentation|alimentación/i,
    cafe: /кафе|ресторан|cafe|restaurant|gaststätte/i,
    transport: /транспорт|transport|verkehr|transporte/i,
    health: /здоровь|health|gesundheit|santé|salud|аптек|pharma/i,
    entertainment: /развлечен|entertainment|unterhaltung|divertissement|entretenimiento/i,
    clothing: /одежд|обувь|clothing|kleidung|vêtements|ropa/i,
    beauty: /красот|beauty|schönheit|beauté|belleza/i,
    sport: /спорт|sport|fitness/i,
};

function matchCategory(cats: CategoryLight[], slug: string | null, fallbackId: string | null): string | null {
    if (!slug) return fallbackId ?? null;
    // 1. Try slug match
    const bySlug = cats.find(c => c.slug === slug);
    if (bySlug) return bySlug.id;
    // 2. Try name-based match
    const nameRe = SLUG_NAME_MAP[slug];
    if (nameRe) {
        const byName = cats.find(c => nameRe.test(c.name));
        if (byName) return byName.id;
    }
    return fallbackId ?? null;
}

export interface EditingTx {
    id: string;
    type: 'income' | 'expense' | 'transfer';
    amount: number;
    currency: string;
    exchange_rate: number | null;
    date: string;
    note: string | null;
    receipt_url: string | null;
    recurring_id: string | null;
    account_id: string;
    category_id: string | null;
    tag_id: string | null;
}

export interface TransactionFormProps {
    visible: boolean;
    onClose: () => void;
    onSaved: () => void;
    accounts: AccountLight[];
    categories: CategoryLight[];
    householdId: string;
    userId: string;
    baseCurrency: string;
    editingTx?: EditingTx | null;
    initialType?: 'income' | 'expense' | 'transfer';
    initialAccountId?: string;
    onCategoriesChanged?: (hid: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcNextDate(
    freq: RecurFreq,
    weekday: number,
    monthDay: number | 'last',
    yearMonth: number,
    yearDay: number,
): string {
    const today = new Date();
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);

    if (freq === 'daily') return format(tomorrow, 'yyyy-MM-dd');

    if (freq === 'weekly') {
        const jsDay = (weekday + 1) % 7;
        const d = new Date(tomorrow);
        while (d.getDay() !== jsDay) d.setDate(d.getDate() + 1);
        return format(d, 'yyyy-MM-dd');
    }

    if (freq === 'monthly') {
        const y = today.getFullYear(); const m = today.getMonth();
        if (monthDay === 'last') {
            const lastCur = new Date(y, m + 1, 0);
            if (lastCur > today) return format(lastCur, 'yyyy-MM-dd');
            return format(new Date(y, m + 2, 0), 'yyyy-MM-dd');
        }
        const dimCur = new Date(y, m + 1, 0).getDate();
        const dayCur = new Date(y, m, Math.min(monthDay, dimCur));
        if (dayCur > today) return format(dayCur, 'yyyy-MM-dd');
        const dimNext = new Date(y, m + 2, 0).getDate();
        return format(new Date(y, m + 1, Math.min(monthDay, dimNext)), 'yyyy-MM-dd');
    }

    const y = today.getFullYear();
    const dim = new Date(y, yearMonth, 0).getDate();
    const d = new Date(y, yearMonth - 1, Math.min(yearDay, dim));
    if (d > today) return format(d, 'yyyy-MM-dd');
    const dimNext = new Date(y + 1, yearMonth, 0).getDate();
    return format(new Date(y + 1, yearMonth - 1, Math.min(yearDay, dimNext)), 'yyyy-MM-dd');
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TransactionForm({
    visible, onClose, onSaved,
    accounts, categories,
    householdId, userId, baseCurrency,
    editingTx, initialType, initialAccountId,
    onCategoriesChanged,
}: TransactionFormProps) {

    const { colors, fonts } = useTheme();
    const { t } = useTranslation();

    // ── Form state ───────────────────────────────────────────────────────────
    const [formType,       setFormType]       = useState<'income' | 'expense' | 'transfer'>('expense');
    const [formAccountId,  setFormAccountId]  = useState('');
    const [formToAccId,    setFormToAccId]    = useState('');
    const [formCategoryId, setFormCategoryId] = useState('');
    const [formAmount,     setFormAmount]     = useState('');
    const [formCurrency,   setFormCurrency]   = useState('EUR');
    const [formRate,       setFormRate]       = useState('');
    const [formDate,       setFormDate]       = useState('');
    const [formNote,       setFormNote]       = useState('');
    const [showCalc,       setShowCalc]       = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [calcExpression, setCalcExpression] = useState('');
    const [formIsRecurring,    setFormIsRecurring]    = useState(false);
    const [formRecurFreq,      setFormRecurFreq]      = useState<RecurFreq>('monthly');
    const [formRecurWeekday,   setFormRecurWeekday]   = useState(0);
    const [formRecurMonthDay,  setFormRecurMonthDay]  = useState<number>(1);
    const [formRecurYearMonth, setFormRecurYearMonth] = useState(new Date().getMonth() + 1);
    const [formRecurYearDay,   setFormRecurYearDay]   = useState(new Date().getDate());
    const [formRecurNotify,    setFormRecurNotify]    = useState(3);
    const [formRecurOverrideDate, setFormRecurOverrideDate] = useState<Date | null>(null);
    const [showRecurDatePicker,   setShowRecurDatePicker]   = useState(false);
    const [currencyOpen,     setCurrencyOpen]     = useState(false);
    const [currencySearch,   setCurrencySearch]   = useState('');
    const [fetchingRate,     setFetchingRate]     = useState(false);
    const [receiptUri,       setReceiptUri]       = useState<string | null>(null);
    const [receiptUploadUrl, setReceiptUploadUrl] = useState<string | null>(null);
    const [uploadingReceipt, setUploadingReceipt] = useState(false);
    const [receiptPreview, setReceiptPreview] = useState(false);
    const [receiptItems, setReceiptItems] = useState<Array<{ name: string; quantity: number; price: number; categorySlug: string | null; checked: boolean; categoryId: string | null }>>([]);
    const [receiptCollapsed, setReceiptCollapsed] = useState<Set<string>>(new Set());
    const [editingReceiptItemIdx, setEditingReceiptItemIdx] = useState<number | null>(null);
    const [receiptManualMode, setReceiptManualMode] = useState(false); // true = prices unknown, user enters category totals
    const [receiptCategoryAmounts, setReceiptCategoryAmounts] = useState<Record<string, string>>({}); // catKey → amount string
    const [saving,           setSaving]           = useState(false);

    // ── Tags ─────────────────────────────────────────────────────────────────
    const [categoryTags,   setCategoryTags]   = useState<TagLight[]>([]);
    const [selectedTagId,  setSelectedTagId]  = useState('');
    const [newTagText,     setNewTagText]     = useState('');
    const [addingTag,      setAddingTag]      = useState(false);
    const [editingTagId,   setEditingTagId]   = useState('');
    const [editingTagText, setEditingTagText] = useState('');
    const [tagSheet,       setTagSheet]       = useState<TagLight | null>(null);

    // ── Category sub-form ────────────────────────────────────────────────────
    const [catFormVisible, setCatFormVisible] = useState(false);
    const [catName,        setCatName]        = useState('');
    const [catIcon,        setCatIcon]        = useState('ShoppingCart');
    const [catColor,       setCatColor]       = useState('#3b82f6');
    const [catExpType,     setCatExpType]     = useState<ExpenseType | ''>('');
    const [savingCat,      setSavingCat]      = useState(false);

    // ── Local categories (to reflect newly created ones) ─────────────────────
    const [localCategories, setLocalCategories] = useState<CategoryLight[]>(categories);
    useEffect(() => { setLocalCategories(categories); }, [categories]);

    // ── Category usage counts for smart sorting ───────────────────────────────
    const [catUsage, setCatUsage] = useState<Record<string, number>>({});
    useEffect(() => {
        if (!householdId) return;
        supabase
            .from('transactions')
            .select('category_id')
            .eq('household_id', householdId)
            .not('category_id', 'is', null)
            .then(({ data }) => {
                if (!data) return;
                const counts: Record<string, number> = {};
                for (const row of data) {
                    const cid = row.category_id as string;
                    counts[cid] = (counts[cid] || 0) + 1;
                }
                setCatUsage(counts);
            });
     
    }, [householdId]);

    // ── Initialize form when visibility or editingTx changes ─────────────────
    useEffect(() => {
        if (!visible) return;
        if (editingTx) {
            setFormType(editingTx.type);
            setFormAccountId(editingTx.account_id);
            setFormToAccId('');
            setFormCategoryId(editingTx.category_id ?? '');
            setFormAmount(String(editingTx.amount));
            setFormCurrency(editingTx.currency);
            setFormRate(editingTx.exchange_rate ? String(editingTx.exchange_rate) : '');
            setFormDate(editingTx.date);
            setFormNote(editingTx.note ?? '');
            setFormIsRecurring(!!editingTx.recurring_id);
            setReceiptUri(editingTx.receipt_url ?? null);
            setReceiptUploadUrl(editingTx.receipt_url ?? null);
            setSelectedTagId(editingTx.tag_id ?? '');
        } else {
            const defType = initialType ?? 'expense';
            const defAccId = initialAccountId ?? accounts[0]?.id ?? '';
            const defAcc = accounts.find(a => a.id === defAccId) ?? accounts[0];
            setFormType(defType);
            setFormAccountId(defAccId);
            setFormToAccId(accounts.find(a => a.id !== defAccId)?.id ?? '');
            setFormCategoryId('');
            setFormAmount('');
            setFormCurrency(defAcc?.currency ?? baseCurrency);
            setFormRate('');
            setFormDate(format(new Date(), 'yyyy-MM-dd'));
            setFormNote('');
            setFormIsRecurring(false);
            setFormRecurFreq('monthly');
            setFormRecurWeekday(0);
            setFormRecurMonthDay(1);
            setFormRecurYearMonth(new Date().getMonth() + 1);
            setFormRecurYearDay(new Date().getDate());
            setFormRecurNotify(3);
            setFormRecurOverrideDate(null);
            setReceiptUri(null);
            setReceiptUploadUrl(null);
            setSelectedTagId('');
        }
        setShowCalc(false);
        setCalcExpression('');
        setShowDatePicker(false);
        setCategoryTags([]);
        setNewTagText('');
        setAddingTag(false);
        setCatFormVisible(false);
        setCurrencyOpen(false);
        setCurrencySearch('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, editingTx]);

    // ── Derived ──────────────────────────────────────────────────────────────
    const showRate = formCurrency !== baseCurrency;
    const formCats = useMemo(() => {
        const expTypeOrder: Record<string, number> = {
            base: 0, everyday: 1, development: 2, forself: 3, work: 4, other: 5,
        };
        const filtered = localCategories.filter(c => c.type === (formType === 'transfer' ? 'expense' : formType));
        const hasUsage = Object.keys(catUsage).length > 0;
        return filtered.sort((a, b) => {
            // Selected category always first
            if (a.id === formCategoryId) return -1;
            if (b.id === formCategoryId) return 1;
            // Then by usage frequency
            const usageA = catUsage[a.id] || 0;
            const usageB = catUsage[b.id] || 0;
            if (hasUsage && (usageA > 0 || usageB > 0)) {
                if (usageA !== usageB) return usageB - usageA;
            }
            // Then by expense_type group
            const groupA = expTypeOrder[a.expense_type ?? 'other'] ?? 5;
            const groupB = expTypeOrder[b.expense_type ?? 'other'] ?? 5;
            return groupA - groupB;
        });
    }, [localCategories, formType, catUsage, formCategoryId]);

    // ── Auto-fetch exchange rate ─────────────────────────────────────────────
    useEffect(() => {
        if (!showRate || !visible) return;
        fetchRate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formCurrency, baseCurrency, visible]);

    async function fetchRate() {
        if (!showRate) return;
        setFetchingRate(true);
        try {
            const { data: cached } = await supabase
                .from('currency_rates_cache')
                .select('rate, fetched_at')
                .eq('base_currency', formCurrency)
                .eq('target_currency', baseCurrency)
                .order('fetched_at', { ascending: false })
                .limit(1).single();

            const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
            if (cached && cached.fetched_at > sixHoursAgo) {
                setFormRate(String(Number(cached.rate).toFixed(4)));
                setFetchingRate(false);
                return;
            }

            let rate: number | null = null;
            try {
                const res  = await fetch(`https://api.frankfurter.app/latest?from=${formCurrency}&to=${baseCurrency}`);
                const json = await res.json();
                rate = json?.rates?.[baseCurrency] ?? null;
            } catch { /* try fallback */ }

            if (!rate) {
                try {
                    const res  = await fetch(`https://open.er-api.com/v6/latest/${formCurrency}`);
                    const json = await res.json();
                    rate = json?.rates?.[baseCurrency] ?? null;
                } catch { /* silent */ }
            }

            if (!rate) { setFetchingRate(false); return; }
            setFormRate(String(Number(rate).toFixed(4)));

            await supabase.from('currency_rates_cache').upsert({
                base_currency:   formCurrency,
                target_currency: baseCurrency,
                rate,
                fetched_at:      new Date().toISOString(),
            }, { onConflict: 'base_currency,target_currency' });
        } catch { /* silent */ }
        setFetchingRate(false);
    }

    // ── Auto-load tags ───────────────────────────────────────────────────────
    useEffect(() => {
        if (!formCategoryId || !visible) { setCategoryTags([]); return; }
        fetchCategoryTags(formCategoryId);
    }, [formCategoryId, visible]);

    async function fetchCategoryTags(catId: string) {
        const { data } = await supabase
            .from('category_tags')
            .select('id, name')
            .eq('category_id', catId)
            .order('sort_order').order('created_at');
        setCategoryTags(data ?? []);
    }

    // ── Form helpers ─────────────────────────────────────────────────────────

    function onFormTypeChange(type: 'income' | 'expense' | 'transfer') {
        setFormType(type);
        setFormCategoryId('');
        if (type === 'transfer') {
            const other = accounts.find(a => a.id !== formAccountId);
            setFormToAccId(other?.id ?? '');
        }
    }

    function onCatSelect(catId: string) {
        setFormCategoryId(catId);
        setSelectedTagId('');
    }

    function onAccountChange(accId: string) {
        setFormAccountId(accId);
        const acc = accounts.find(a => a.id === accId);
        if (acc) setFormCurrency(acc.currency);
    }

    // ── Tags ─────────────────────────────────────────────────────────────────

    async function addTag() {
        const name = newTagText.trim();
        if (!name || !formCategoryId || !householdId) return;
        const { data } = await supabase
            .from('category_tags')
            .insert({ household_id: householdId, category_id: formCategoryId, name })
            .select('id, name').single();
        if (data) {
            setCategoryTags(prev => [...prev, data]);
            setSelectedTagId(data.id);
        }
        setNewTagText('');
        setAddingTag(false);
    }

    async function updateTag() {
        const name = editingTagText.trim();
        if (!name || !editingTagId) { setEditingTagId(''); return; }
        await supabase.from('category_tags').update({ name }).eq('id', editingTagId);
        setCategoryTags(prev => prev.map(t => t.id === editingTagId ? { ...t, name } : t));
        setEditingTagId('');
        setEditingTagText('');
    }

    async function deleteTag(tagId: string) {
        await supabase.from('category_tags').delete().eq('id', tagId);
        setCategoryTags(prev => prev.filter(t => t.id !== tagId));
        if (selectedTagId === tagId) setSelectedTagId('');
    }

    // ── Receipt ──────────────────────────────────────────────────────────────

    async function pickReceipt(source: 'camera' | 'gallery') {
        let result: ImagePicker.ImagePickerResult;
        if (source === 'camera') {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') { Alert.alert(t('transactionForm.noCameraAccess'), t('transactionForm.noCameraMsg')); return; }
            result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.8 });
        } else {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') { Alert.alert(t('transactionForm.noGalleryAccess'), t('transactionForm.noGalleryMsg')); return; }
            result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 });
        }
        if (result.canceled || !result.assets[0]) return;
        const uri = result.assets[0].uri;
        setReceiptUri(uri);
        setUploadingReceipt(true);
        try {
            const ext  = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
            const path = `${householdId}/${Date.now()}.${ext}`;

            // Read file as base64 for reliable upload (blob can be empty in Expo Go)
            const response = await fetch(uri);
            const arrayBuffer = await response.arrayBuffer();
            const uint8 = new Uint8Array(arrayBuffer);
            const { data, error } = await supabase.storage
                .from('receipts')
                .upload(path, uint8, { contentType: `image/${ext === 'png' ? 'png' : 'jpeg'}`, upsert: true });
            if (error) {
                Alert.alert(t('transactionForm.uploadError'), error.message);
                setReceiptUri(null);
            } else {
                const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(data.path);
                setReceiptUploadUrl(publicUrl);

                // OCR: extract data from receipt
                try {
                    const { recognizeReceipt } = await import('@/lib/receiptOcr');
                    const ocr = await recognizeReceipt(publicUrl);
                    if (ocr.amount && (!formAmount || formAmount === '0' || formAmount === '0.00')) setFormAmount(String(ocr.amount));
                    if (ocr.currency) setFormCurrency(ocr.currency);
                    if (ocr.date) {
                        // Only use OCR date if it's within last 30 days
                        const ocrDate = new Date(ocr.date);
                        const daysAgo = (Date.now() - ocrDate.getTime()) / (1000 * 60 * 60 * 24);
                        if (daysAgo <= 30 && daysAgo >= -1) setFormDate(ocr.date);
                    }
                    if (ocr.merchant && !formNote) setFormNote(ocr.merchant);
                    if (ocr.categorySlug && !formCategoryId) {
                        const matched = matchCategory(localCategories, ocr.categorySlug, null);
                        if (matched) setFormCategoryId(matched);
                    }
                    // Multi-item receipt
                    if (ocr.items.length > 1) {
                        const itemsTotal = ocr.items.reduce((s, i) => s + i.price, 0);
                        const receiptTotal = ocr.amount ?? 0;
                        const pricesMatch = receiptTotal === 0 || (itemsTotal >= receiptTotal * 0.5 && itemsTotal <= receiptTotal * 1.2);

                        if (!pricesMatch && receiptTotal > 0) {
                            // Manual mode: prices unknown, user will enter category totals
                            setReceiptManualMode(true);
                            // Set price to 0 — user enters totals per category
                            for (const item of ocr.items) item.price = 0;
                        } else {
                            setReceiptManualMode(false);
                        }

                        {
                            const mapped = ocr.items.map(item => ({
                                ...item,
                                checked: true,
                                categoryId: matchCategory(localCategories, item.categorySlug, formCategoryId),
                            }));
                            setReceiptItems(mapped);
                        }
                    }
                } catch (ocrErr: any) { console.warn('[OCR failed]', ocrErr?.message ?? ocrErr); }
            }
        } catch (e: any) {
            Alert.alert(t('common.error'), e.message);
            setReceiptUri(null);
        }
        setUploadingReceipt(false);
    }

    // ── Category sub-form ────────────────────────────────────────────────────

    function openCatForm() {
        setCatName('');
        setCatIcon('ShoppingCart');
        setCatColor('#3b82f6');
        setCatExpType('');
        setCatFormVisible(true);
    }

    async function reloadCategories(hid: string) {
        const { data } = await supabase.from('categories')
            .select('id, name, slug, icon, color, type, expense_type, is_system')
            .eq('household_id', hid).eq('is_hidden', false);
        setLocalCategories(data ?? []);
        onCategoriesChanged?.(hid);
    }

    async function saveCat() {
        if (!catName.trim() || !householdId) return;
        setSavingCat(true);
        const { data } = await supabase.from('categories').insert({
            household_id: householdId,
            name:         catName.trim(),
            icon:         catIcon,
            color:        catColor,
            type:         formType === 'transfer' ? 'expense' : formType,
            expense_type: formType === 'expense' ? (catExpType || 'everyday') : null,
            is_system:    false,
            is_hidden:    false,
        }).select().single();

        if (data) {
            await reloadCategories(householdId);
            setFormCategoryId(data.id);
        }
        setSavingCat(false);
        setCatFormVisible(false);
    }

    async function deleteCategory(cat: CategoryLight) {
        Alert.alert(t('transactionForm.deleteCategory', { name: cat.name }), t('transactionForm.deleteCategoryMsg'), [
            { text: t('common.cancel'), style: 'cancel' },
            {
                text: t('common.delete'), style: 'destructive',
                onPress: async () => {
                    await supabase.from('categories').update({ is_hidden: true }).eq('id', cat.id);
                    await reloadCategories(householdId);
                    if (formCategoryId === cat.id) setFormCategoryId('');
                },
            },
        ]);
    }

    // ── Calculator ─────────────────────────────────────────────────────────

    function evaluateExpression(expr: string): string {
        if (!expr) return '0';
        try {
            let clean = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
            if (!/^[0-9+\-*/.() ]+$/.test(clean)) return '0';
            // Remove trailing operator so "60+55+" evaluates as "60+55"
            clean = clean.replace(/[+\-*/]+$/, '');
            if (!clean) return '0';
            const result = Function('"use strict"; return (' + clean + ')')();
            if (!isFinite(result)) return '0';
            return parseFloat(result.toFixed(2)).toString();
        } catch { return '0'; }
    }

    function handleCalcButton(btn: string) {
        if (btn === 'C') {
            setCalcExpression('');
        } else if (btn === '⌫') {
            setCalcExpression(prev => prev.slice(0, -1));
        } else if (btn === '=') {
            const result = evaluateExpression(calcExpression);
            if (result !== '?') {
                setFormAmount(result);
                setShowCalc(false);
                setCalcExpression('');
            }
        } else if (btn === '±') {
            setCalcExpression(prev => prev.startsWith('-') ? prev.slice(1) : '-' + prev);
        } else if (btn === '%') {
            const val = parseFloat(evaluateExpression(calcExpression));
            if (!isNaN(val)) setCalcExpression(String(val / 100));
        } else if (btn === '÷') {
            setCalcExpression(prev => prev + '/');
        } else if (btn === '×') {
            setCalcExpression(prev => prev + '*');
        } else if (btn === '−') {
            setCalcExpression(prev => prev + '-');
        } else {
            setCalcExpression(prev => prev + btn);
        }
    }

    // ── Receipt save helper ─────────────────────────────────────────────────

    type CheckedItem = typeof receiptItems[0];

    async function doReceiptSave(items: CheckedItem[], splitByCategory: boolean) {
        setSaving(true);
        try {
            const acc = accounts.find(a => a.id === formAccountId);
            const rate = showRate && formRate ? parseFloat(formRate) : null;

            if (splitByCategory) {
                // Group by category, one transaction per group
                const groups = new Map<string, { catId: string | null; total: number; names: string[]; groupName: string }>();
                for (const item of items) {
                    const catId = item.categoryId || formCategoryId || null;
                    const cat = catId ? localCategories.find(c => c.id === catId) : null;
                    const groupName = cat?.name ?? t('transactionForm.otherCategory');
                    const key = catId ?? '__none__';
                    const g = groups.get(key) ?? { catId, total: 0, names: [], groupName };
                    g.total += item.price;
                    g.names.push(item.name);
                    groups.set(key, g);
                }

                // In manual mode, use user-entered category amounts
                if (receiptManualMode) {
                    for (const [, group] of groups) {
                        const userAmt = receiptCategoryAmounts[group.groupName];
                        if (userAmt) {
                            group.total = parseFloat(userAmt.replace(',', '.')) || 0;
                        }
                    }
                }

                // Proportionally adjust group totals so they sum to formAmount exactly
                const receiptTotal = formAmount ? parseFloat(formAmount) : 0;
                const rawTotal = [...groups.values()].reduce((s, g) => s + g.total, 0);
                if (receiptTotal > 0 && rawTotal > 0 && Math.abs(rawTotal - receiptTotal) > 0.01) {
                    const ratio = receiptTotal / rawTotal;
                    let adjusted = 0;
                    const entries = [...groups.entries()];
                    for (let i = 0; i < entries.length; i++) {
                        const [, g] = entries[i];
                        if (i < entries.length - 1) {
                            g.total = Math.round(g.total * ratio * 100) / 100;
                            adjusted += g.total;
                        } else {
                            // Last group gets the remainder to avoid rounding errors
                            g.total = Math.round((receiptTotal - adjusted) * 100) / 100;
                        }
                    }
                }

                let totalDelta = 0;
                for (const [, group] of groups) {
                    const amt = Math.round(group.total * 100) / 100;
                    const amountBase = rate ? Math.round(amt * rate * 100) / 100 : amt;
                    const note = group.names.length <= 3
                        ? group.names.join(', ')
                        : `${group.names.slice(0, 3).join(', ')} +${group.names.length - 3}`;
                    const { error: txErr } = await supabase.from('transactions').insert({
                        household_id: householdId, account_id: formAccountId,
                        category_id: group.catId, user_id: userId, type: formType,
                        amount: amt, currency: formCurrency,
                        amount_base: amountBase, exchange_rate: rate,
                        note, date: formDate,
                        receipt_url: receiptUploadUrl || null,
                        recurring_id: null, tag_id: null,
                    });
                    if (txErr) {
                        Alert.alert(t('common.error'), txErr.message);
                    } else {
                        totalDelta += formType === 'income' ? amt : -amt;
                    }
                }
                if (acc && totalDelta !== 0) {
                    await supabase.from('accounts').update({
                        balance: Math.round((acc.balance + totalDelta) * 100) / 100,
                    }).eq('id', acc.id);
                }
            } else {
                // Single transaction with total amount
                const totalAmt = formAmount ? parseFloat(formAmount) : items.reduce((s, i) => s + i.price, 0);
                const amt = Math.round(totalAmt * 100) / 100;
                const amountBase = rate ? Math.round(amt * rate * 100) / 100 : amt;
                const { error: txErr } = await supabase.from('transactions').insert({
                    household_id: householdId, account_id: formAccountId,
                    category_id: formCategoryId || null, user_id: userId, type: formType,
                    amount: amt, currency: formCurrency,
                    amount_base: amountBase, exchange_rate: rate,
                    note: formNote.trim() || null, date: formDate,
                    receipt_url: receiptUploadUrl || null,
                    recurring_id: null, tag_id: null,
                });
                if (txErr) { Alert.alert(t('common.error'), txErr.message); }
                else if (acc) {
                    const delta = formType === 'income' ? amt : -amt;
                    await supabase.from('accounts').update({
                        balance: Math.round((acc.balance + delta) * 100) / 100,
                    }).eq('id', acc.id);
                }
            }
        } catch (e: any) {
            Alert.alert(t('common.error'), e.message);
        }
        setSaving(false);
        setReceiptItems([]);
        onClose();
        onSaved();
    }

    // ── Save ─────────────────────────────────────────────────────────────────

    async function saveForm() {
        if (!formAccountId || !householdId) return;

        // Receipt items: ask user about splitting by category
        const checkedItems = receiptItems.filter(i => i.checked);
        if (checkedItems.length > 0) {
            const catIds = new Set(checkedItems.map(i => i.categoryId || formCategoryId || null));
            if (catIds.size > 1) {
                // Multiple categories — ask user
                Alert.alert(
                    t('transactionForm.splitByCategory'),
                    t('transactionForm.splitByCategoryMsg'),
                    [
                        { text: t('transactionForm.saveAsOne'), onPress: () => doReceiptSave(checkedItems, false) },
                        { text: t('transactionForm.splitSave'), onPress: () => doReceiptSave(checkedItems, true) },
                    ],
                    { cancelable: false },
                );
                return;
            }
            await doReceiptSave(checkedItems, false);
            return;
        }

        if (!formAmount) return;
        const amount = parseFloat(formAmount);
        if (isNaN(amount) || amount <= 0) return;
        if (formType !== 'transfer' && !formCategoryId) return;
        setSaving(true);

        const rate       = showRate && formRate ? parseFloat(formRate) : null;
        const amountBase = rate ? amount * rate : amount;

        if (formType === 'transfer') {
            const fromAcc = accounts.find(a => a.id === formAccountId);
            const toAcc   = accounts.find(a => a.id === formToAccId);
            if (!fromAcc || !toAcc) { setSaving(false); return; }
            if (!editingTx) {
                await Promise.all([
                    supabase.from('transactions').insert({ household_id: householdId, user_id: userId, type: 'transfer', amount, currency: fromAcc.currency, amount_base: amountBase, exchange_rate: rate, date: formDate, note: formNote.trim() || null, account_id: formAccountId }),
                    supabase.from('transactions').insert({ household_id: householdId, user_id: userId, type: 'transfer', amount, currency: toAcc.currency,   amount_base: amountBase, exchange_rate: rate, date: formDate, note: formNote.trim() || null, account_id: formToAccId }),
                    supabase.from('accounts').update({ balance: fromAcc.balance - amount }).eq('id', fromAcc.id),
                    supabase.from('accounts').update({ balance: toAcc.balance + amount }).eq('id', toAcc.id),
                ]);
            }
        } else {
            const acc = accounts.find(a => a.id === formAccountId);

            let newRecurringId: string | null = editingTx?.recurring_id ?? null;
            if (formIsRecurring && !editingTx) {
                const nextDate = formRecurOverrideDate
                    ? format(formRecurOverrideDate, 'yyyy-MM-dd')
                    : calcNextDate(formRecurFreq, formRecurWeekday, formRecurMonthDay, formRecurYearMonth, formRecurYearDay);
                const { data: rData } = await supabase.from('recurring_payments').insert({
                    household_id: householdId,
                    account_id: formAccountId,
                    category_id: formCategoryId || null,
                    name: localCategories.find(c => c.id === formCategoryId)?.name ?? t('transactionForm.paymentNote'),
                    type: formType,
                    expense_type: localCategories.find(c => c.id === formCategoryId)?.expense_type || null,
                    amount,
                    currency: formCurrency,
                    frequency: formRecurFreq,
                    next_date: nextDate,
                    notify_days_before: formRecurNotify,
                }).select('id').single();
                newRecurringId = rData?.id ?? null;
            }

            const payload = {
                household_id: householdId, account_id: formAccountId, category_id: formCategoryId || null,
                user_id: userId, type: formType, amount, currency: formCurrency,
                amount_base: amountBase, exchange_rate: rate,
                note: formNote.trim() || null, date: formDate,
                recurring_id: newRecurringId,
                receipt_url: receiptUploadUrl || null,
                tag_id: selectedTagId || null,
            };
            if (editingTx) {
                await supabase.from('transactions').update(payload).eq('id', editingTx.id);
                if (acc) {
                    const revert = editingTx.type === 'income' ? -editingTx.amount : +editingTx.amount;
                    const apply  = formType === 'income' ? +amount : -amount;
                    await supabase.from('accounts').update({ balance: acc.balance + revert + apply }).eq('id', acc.id);
                }
            } else {
                const { error: txErr } = await supabase.from('transactions').insert(payload);
                if (txErr) { Alert.alert(t('common.error'), txErr.message); setSaving(false); return; }
                if (acc) {
                    await supabase.from('accounts').update({
                        balance: formType === 'income' ? acc.balance + amount : acc.balance - amount,
                    }).eq('id', acc.id);
                }
            }
        }

        setSaving(false);
        onClose();
        onSaved();
    }


    // ── Numpad ────────────────────────────────────────────────────────────────

    const [activePanel, setActivePanel] = useState<'numpad' | 'calendar' | 'note' | 'recurring' | 'receipt'>('numpad');

    function handleNumpadKey(key: string) {
        if (key === '⌫') {
            setFormAmount(prev => prev.slice(0, -1));
        } else if (key === ',') {
            setFormAmount(prev => prev.includes('.') ? prev : prev + '.');
        } else if (['+', '−', '×', '÷'].includes(key)) {
            const op = key === '−' ? '-' : key === '×' ? '*' : key === '÷' ? '/' : '+';
            setFormAmount(prev => prev + op);
        } else {
            setFormAmount(prev => prev + key);
        }
    }

    const hasExpr = /[+\-*/]/.test(formAmount);
    const resolvedAmt = hasExpr ? evaluateExpression(formAmount) : formAmount;
    const rateNum = formRate ? parseFloat(formRate) : null;
    const convertedStr = showRate && rateNum && resolvedAmt && resolvedAmt !== '0'
        ? formatAmount(parseFloat(resolvedAmt) * rateNum, baseCurrency)
        : null;

    const NUMPAD_ROWS = [
        ['1', '2', '3', '+'],
        ['4', '5', '6', '−'],
        ['7', '8', '9', '×'],
        [',', '0', '⌫', '÷'],
    ];

    const toolbarIcons: { key: string; id: 'numpad' | 'calendar' | 'note' | 'recurring' | 'receipt'; Icon: React.ComponentType<{color: string; size: number}> }[] = [
        { key: 'tag', id: 'numpad', Icon: Tag },
        { key: 'cal', id: 'calendar', Icon: Calendar },
        { key: 'note', id: 'note', Icon: Pencil },
        { key: 'recur', id: 'recurring', Icon: RefreshCw },
        { key: 'bell', id: 'recurring', Icon: Bell },
        { key: 'cam', id: 'receipt', Icon: Camera },
    ];

    // ── Render ────────────────────────────────────────────────────────────────

    const typeColor = formType === 'income' ? '#22c55e' : formType === 'expense' ? '#f87171' : '#60a5fa';

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={() => {
            if (catFormVisible) { setCatFormVisible(false); return; }
            onClose();
        }}>
        <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>

            {/* ═══ Category sub-form (full overlay) ═══ */}
            {catFormVisible ? (
                <View style={{ flex: 1, backgroundColor: colors.bgPrimary, paddingTop: 60, paddingHorizontal: 24 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                        <TouchableOpacity onPress={() => setCatFormVisible(false)} hitSlop={10} style={{ marginRight: 12 }}>
                            <ArrowLeft color={colors.textMuted} size={22} />
                        </TouchableOpacity>
                        <Text style={{ color: colors.textPrimary, fontSize: 17, fontFamily: fonts.heading, flex: 1 }}>{t('transactionForm.newCategoryTitle')}</Text>
                        <TouchableOpacity onPress={() => setCatFormVisible(false)} hitSlop={10}>
                            <X color={colors.textMuted} size={20} />
                        </TouchableOpacity>
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8, fontFamily: fonts.bodyMedium }}>{t('transactionForm.categoryNameLabel')}</Text>
                        <TextInput value={catName} onChangeText={setCatName}
                            placeholder={t('transactionForm.categoryNamePlaceholder')} placeholderTextColor={colors.textDisabled}
                            style={{ backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16, fontSize: 15, fontFamily: fonts.body }} />
                        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 10, fontFamily: fonts.bodyMedium }}>{t('transactionForm.iconLabel')}</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ gap: 6 }}>
                            {ICON_KEYS.map(k => { const Ic = CAT_ICONS[k]; return (
                                <TouchableOpacity key={k} onPress={() => setCatIcon(k)}
                                    style={{ width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: catIcon === k ? catColor + '33' : colors.bgTertiary, borderWidth: catIcon === k ? 1.5 : 0, borderColor: catColor }}>
                                    <Ic color={catIcon === k ? catColor : colors.textSecondary} size={20} />
                                </TouchableOpacity>
                            ); })}
                        </ScrollView>
                        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 10, fontFamily: fonts.bodyMedium }}>{t('transactionForm.colorLabel')}</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                            {COLORS.map(c => (
                                <TouchableOpacity key={c} onPress={() => setCatColor(c)}
                                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c, alignItems: 'center', justifyContent: 'center', borderWidth: catColor === c ? 2.5 : 0, borderColor: '#fff' }}>
                                    {catColor === c && <Check color="#fff" size={16} />}
                                </TouchableOpacity>
                            ))}
                        </View>
                        <TouchableOpacity onPress={saveCat} disabled={savingCat || !catName.trim()}
                            style={{ paddingVertical: 14, borderRadius: 14, alignItems: 'center', backgroundColor: !catName.trim() ? colors.borderLight : '#7C6FFF', marginBottom: 40 }}>
                            {savingCat ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 15, fontFamily: fonts.bodyBold }}>{t('common.save')}</Text>}
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            ) : (
                /* ═══ Main form ═══ */
                <View style={{ flex: 1 }}>

                    {/* ── Top bar ── */}
                    <View style={{ paddingTop: 52, paddingHorizontal: 16, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <TouchableOpacity onPress={onClose}
                            style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.bgTertiary }}>
                            <Text style={{ color: colors.textSecondary, fontSize: 14, fontFamily: fonts.body }}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                        <Text style={{ color: colors.textPrimary, fontSize: 16, fontFamily: fonts.heading }}>
                            {editingTx ? t('transactionForm.editTitle') : t('transactionForm.newTitle')}
                        </Text>
                        <TouchableOpacity onPress={saveForm} disabled={saving || !formAmount || (formType !== 'transfer' && !formCategoryId)}
                            style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: saving || !formAmount ? colors.bgTertiary : '#7C6FFF' }}>
                            <Text style={{ color: saving || !formAmount ? colors.textDisabled : '#fff', fontSize: 14, fontFamily: fonts.bodySemiBold }}>
                                {saving ? '...' : t('common.save')}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* ── Accounts ── */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}
                        style={{ flexGrow: 0 }}
                        contentContainerStyle={{ paddingHorizontal: 20, gap: 20, paddingVertical: 8 }}>
                        {accounts.map(acc => {
                            const sel = formAccountId === acc.id;
                            return (
                            <TouchableOpacity key={acc.id}
                                onPress={() => { setFormAccountId(acc.id); setFormCurrency(acc.currency); }}>
                                <Text style={{ color: colors.textPrimary, fontSize: 30, fontFamily: fonts.headingRegular, opacity: sel ? 1 : 0.55 }}>{acc.name}</Text>
                                <Text style={{ color: colors.textMuted, fontSize: 15, fontFamily: fonts.body, opacity: sel ? 0.7 : 0.4 }}>{formatAmount(acc.balance, acc.currency)}</Text>
                            </TouchableOpacity>
                            );
                        })}
                        {formType === 'transfer' && formToAccId && (
                            <View style={{ justifyContent: 'center', paddingHorizontal: 8 }}>
                                <ArrowRightLeft color={colors.textMuted} size={18} />
                            </View>
                        )}
                        {formType === 'transfer' && accounts.filter(a => a.id !== formAccountId).map(acc => (
                            <TouchableOpacity key={'to-' + acc.id}
                                onPress={() => setFormToAccId(acc.id)}
                                style={{
                                    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
                                    backgroundColor: formToAccId === acc.id ? '#2563eb22' : colors.bgTertiary,
                                    borderWidth: formToAccId === acc.id ? 1.5 : 0,
                                    borderColor: '#2563eb',
                                }}>
                                <Text style={{ color: colors.textPrimary, fontSize: 14, fontFamily: fonts.bodyMedium }}>{acc.name}</Text>
                                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{formatAmount(acc.balance, acc.currency)}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    {/* ── Amount display ── */}
                    <TouchableOpacity onPress={() => setCurrencyOpen(true)} activeOpacity={0.8} style={{ alignItems: 'center', paddingVertical: 12 }}>
                        <View style={{ height: 2, width: '90%', backgroundColor: typeColor, opacity: 0.3, marginBottom: 10, borderRadius: 1 }} />
                        <Text style={{ color: colors.textPrimary, fontSize: 38, fontFamily: fonts.heading, textAlign: 'center' }}>
                            {hasExpr ? formAmount.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−') : (formAmount || '0')}
                            {' '}<Text style={{ fontSize: 28, color: colors.textSecondary }}>{formCurrency}</Text>
                        </Text>
                        {hasExpr && resolvedAmt !== '0' && (
                            <Text style={{ color: typeColor, fontSize: 16, fontFamily: fonts.bodySemiBold, marginTop: 2 }}>= {resolvedAmt}</Text>
                        )}
                        {convertedStr && (
                            <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2, fontFamily: fonts.body }}>{convertedStr}</Text>
                        )}
                    </TouchableOpacity>

                    {/* ── Category section ── */}
                    {formType !== 'transfer' && (
                        <View style={{ marginBottom: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 6 }}>
                                <Text style={{ color: colors.textPrimary, fontSize: 13, fontFamily: fonts.bodySemiBold }}>{t('transactionForm.category')}</Text>
                                <TouchableOpacity onPress={openCatForm}
                                    style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.bgTertiary, alignItems: 'center', justifyContent: 'center' }}>
                                    <Plus color={colors.textMuted} size={14} />
                                </TouchableOpacity>
                            </View>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}
                                contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}>
                                {formCats.slice(0, 16).map(cat => {
                                    const sel = formCategoryId === cat.id;
                                    const Ic = cat.icon ? CAT_ICONS[cat.icon] : null;
                                    return (
                                        <TouchableOpacity key={cat.id} onPress={() => onCatSelect(cat.id)}
                                            onLongPress={() => deleteCategory(cat)}
                                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
                                                backgroundColor: sel ? (cat.color ?? '#7C6FFF') + '22' : 'transparent',
                                                borderWidth: sel ? 1.5 : 0, borderColor: cat.color ?? '#7C6FFF' }}>
                                            {Ic && <Ic color={sel ? (cat.color ?? '#7C6FFF') : colors.textMuted} size={13} />}
                                            <Text style={{ color: sel ? colors.textPrimary : colors.textSecondary, fontSize: 13, fontFamily: sel ? fonts.bodySemiBold : fonts.body }}>{cat.name}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </View>
                    )}

                    {/* ── Bottom section (pushed to bottom) ── */}
                    <View style={{ marginTop: 'auto' }}>

                    {/* ── Toolbar ── */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.bgTertiary }}>
                        {toolbarIcons.map(({ key, id, Icon }) => (
                            <TouchableOpacity key={key}
                                onPress={() => { Keyboard.dismiss(); setActivePanel(activePanel === id ? 'numpad' : id); }}
                                style={{ padding: 8, borderRadius: 10, backgroundColor: activePanel === id ? 'rgba(124,111,255,0.12)' : 'transparent' }}>
                                <Icon color={activePanel === id ? '#7C6FFF' : colors.textMuted} size={20} />
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* ── Bottom panel ── */}
                    <View style={{ paddingHorizontal: 12, paddingTop: 4 }}>

                        {/* Numpad */}
                        {activePanel === 'numpad' && (
                            <View style={{ gap: 5 }}>
                                {NUMPAD_ROWS.map((row, ri) => (
                                    <View key={ri} style={{ flexDirection: 'row', gap: 5 }}>
                                        {row.map(btn => {
                                            const isOp = ['+', '−', '×', '÷'].includes(btn);
                                            return (
                                                <TouchableOpacity key={btn} onPress={() => handleNumpadKey(btn)} activeOpacity={0.6}
                                                    style={{ flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                                                        backgroundColor: isOp ? 'rgba(124,111,255,0.15)' : colors.bgTertiary }}>
                                                    {btn === '⌫' ? <Delete color={colors.textPrimary} size={20} /> : (
                                                        <Text style={{ fontSize: 22, fontWeight: '500', color: isOp ? '#7C6FFF' : colors.textPrimary }}>{btn}</Text>
                                                    )}
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* Calendar */}
                        {activePanel === 'calendar' && (
                            <View style={{ backgroundColor: colors.bgTertiary, borderRadius: 14, overflow: 'hidden' }}>
                                <DateTimePicker mode="date" display="inline" themeVariant="dark"
                                    value={formDate ? new Date(formDate + 'T00:00:00') : new Date()}
                                    maximumDate={new Date()}
                                    onChange={(_, date) => { if (date) setFormDate(format(date, 'yyyy-MM-dd')); setActivePanel('numpad'); }}
                                />
                            </View>
                        )}

                        {/* Note */}
                        {activePanel === 'note' && (
                            <View>
                                <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8, fontFamily: fonts.bodyMedium }}>{t('transactionForm.noteLabel')}</Text>
                                <TextInput value={formNote} onChangeText={setFormNote}
                                    placeholder={t('transactionForm.notePlaceholder')} placeholderTextColor={colors.textDisabled}
                                    multiline autoFocus
                                    style={{ backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, fontFamily: fonts.body, minHeight: 100, textAlignVertical: 'top' }}
                                />
                                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 10, fontFamily: fonts.bodyMedium }}>{t('transactionForm.dateLabel')}</Text>
                                <Text style={{ color: colors.textPrimary, fontSize: 14, marginTop: 4, fontFamily: fonts.body }}>
                                    {formDate ? format(new Date(formDate + 'T00:00:00'), 'd MMMM yyyy', { locale: ru }) : '—'}
                                </Text>
                            </View>
                        )}

                        {/* Recurring */}
                        {activePanel === 'recurring' && (
                            <ScrollView showsVerticalScrollIndicator={false}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                    <Text style={{ color: colors.textPrimary, fontSize: 14, fontFamily: fonts.bodySemiBold }}>{t('transactionForm.recurring')}</Text>
                                    <TouchableOpacity onPress={() => setFormIsRecurring(!formIsRecurring)}
                                        style={{ width: 44, height: 26, borderRadius: 13, justifyContent: 'center', paddingHorizontal: 2,
                                            backgroundColor: formIsRecurring ? '#7C6FFF' : colors.bgTertiary }}>
                                        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff',
                                            alignSelf: formIsRecurring ? 'flex-end' : 'flex-start' }} />
                                    </TouchableOpacity>
                                </View>
                                {formIsRecurring && (
                                    <View style={{ gap: 10 }}>
                                        <View style={{ flexDirection: 'row', gap: 6 }}>
                                            {(['daily', 'weekly', 'monthly', 'yearly'] as RecurFreq[]).map(f => (
                                                <TouchableOpacity key={f} onPress={() => setFormRecurFreq(f)}
                                                    style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
                                                        backgroundColor: formRecurFreq === f ? '#7C6FFF' : colors.bgTertiary }}>
                                                    <Text style={{ color: formRecurFreq === f ? '#fff' : colors.textSecondary, fontSize: 11, fontFamily: fonts.bodySemiBold }}>
                                                        {t(`transactionForm.freq_${f}`)}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>
                                )}
                            </ScrollView>
                        )}

                        {/* Receipt */}
                        {activePanel === 'receipt' && (
                            <ScrollView showsVerticalScrollIndicator={false}>
                                {receiptUri ? (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.bgTertiary, borderRadius: 14, padding: 12, marginBottom: 12 }}>
                                        <TouchableOpacity onPress={() => setReceiptPreview(true)} activeOpacity={0.6}>
                                            <Image source={{ uri: receiptUri }} style={{ width: 60, height: 60, borderRadius: 10 }} resizeMode="cover" />
                                        </TouchableOpacity>
                                        <View style={{ flex: 1 }}>
                                            {uploadingReceipt ? (
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                    <ActivityIndicator size="small" color="#2563eb" />
                                                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t('common.loading')}</Text>
                                                </View>
                                            ) : receiptUploadUrl ? (
                                                <Text style={{ color: '#22c55e', fontSize: 13, fontFamily: fonts.bodySemiBold }}>{t('transactionForm.uploaded')}</Text>
                                            ) : (
                                                <Text style={{ color: '#ef4444', fontSize: 13 }}>{t('transactionForm.uploadError')}</Text>
                                            )}
                                            <TouchableOpacity onPress={() => { setReceiptUri(null); setReceiptUploadUrl(null); setReceiptItems([]); }} style={{ marginTop: 8 }} hitSlop={8}>
                                                <Text style={{ color: '#ef4444', fontSize: 13 }}>{t('transactionForm.deletePhoto')}</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ) : (
                                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                                        <TouchableOpacity onPress={() => pickReceipt('camera')} activeOpacity={0.8}
                                            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.bgTertiary, borderRadius: 12, paddingVertical: 14 }}>
                                            <Camera color={colors.textMuted} size={18} />
                                            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{t('transactionForm.camera')}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => pickReceipt('gallery')} activeOpacity={0.8}
                                            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.bgTertiary, borderRadius: 12, paddingVertical: 14 }}>
                                            <Images color={colors.textMuted} size={18} />
                                            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{t('transactionForm.gallery')}</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                                {/* Receipt items would go here if present */}
                                {receiptItems.length > 1 && (
                                    <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center' }}>
                                        {t('transactionForm.receiptItems')}: {receiptItems.filter(i => i.checked).length}/{receiptItems.length}
                                    </Text>
                                )}
                            </ScrollView>
                        )}

                    </View>

                    {/* ── Save button ── */}
                    <View style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
                        <TouchableOpacity onPress={saveForm}
                            disabled={saving || !formAmount || (formType !== 'transfer' && !formCategoryId) || !formAccountId}
                            style={{
                                paddingVertical: 14, borderRadius: 14, alignItems: 'center',
                                backgroundColor: saving || !formAmount || (formType !== 'transfer' && !formCategoryId) || !formAccountId
                                    ? colors.borderLight : '#fff',
                            }}>
                            {saving ? <ActivityIndicator color="#000" /> : (
                                <Text style={{ color: '#000', fontFamily: fonts.bodyBold, fontSize: 16 }}>{t('common.save')}</Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* ── Type tabs ── */}
                    <View style={{ flexDirection: 'row', marginHorizontal: 12, marginBottom: 30, padding: 3, borderRadius: 20, backgroundColor: colors.bgTertiary, borderWidth: 1, borderColor: colors.borderLight }}>
                        {[
                            { type: null as 'income' | 'expense' | 'transfer' | null, label: t('transactionForm.history'), col: '#a78bfa' },
                            { type: 'income' as const, label: t('transactionForm.income'), col: '#22c55e' },
                            { type: 'expense' as const, label: t('transactionForm.expense'), col: '#f87171' },
                            { type: 'transfer' as const, label: t('transactionForm.transfer'), col: '#60a5fa' },
                        ].map((item, idx) => {
                            const sel = item.type !== null && formType === item.type;
                            return (
                                <TouchableOpacity key={idx} onPress={() => {
                                    if (item.type === null) { onClose(); return; }
                                    setFormType(item.type);
                                    if (item.type === 'transfer') setFormToAccId(accounts.find(a => a.id !== formAccountId)?.id ?? '');
                                }}
                                    style={{ flex: 1, paddingVertical: 10, borderRadius: 18, alignItems: 'center',
                                        backgroundColor: sel ? item.col + '22' : 'transparent' }}>
                                    <Text style={{ color: sel ? item.col : item.type === null ? '#a78bfa' : colors.textMuted, fontSize: 12, fontFamily: sel ? fonts.bodySemiBold : fonts.body }}>{item.label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    </View>{/* end bottom section */}
                </View>
            )}

            {/* ── Receipt preview overlay ── */}
            {receiptPreview && receiptUri && (
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center', zIndex: 999 }}>
                    <TouchableOpacity onPress={() => setReceiptPreview(false)} style={{ position: 'absolute', top: 60, right: 20, zIndex: 1000, padding: 8 }}>
                        <X color="#fff" size={28} />
                    </TouchableOpacity>
                    <Image source={{ uri: receiptUri }} style={{ width: '90%', height: '80%', borderRadius: 12 }} resizeMode="contain" />
                </View>
            )}

            {/* ── Currency picker overlay ── */}
            {currencyOpen && (
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 900 }}>
                    <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} activeOpacity={1} onPress={() => setCurrencyOpen(false)} />
                    <View style={{ backgroundColor: colors.bgSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 40, maxHeight: '60%' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderLight }}>
                            <Search color={colors.textDisabled} size={15} />
                            <TextInput value={currencySearch} onChangeText={setCurrencySearch} placeholder={t('transactionForm.searchCurrency')}
                                placeholderTextColor={colors.textDisabled} autoFocus
                                style={{ flex: 1, color: colors.textPrimary, fontSize: 14, padding: 0, fontFamily: fonts.body }} />
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                            {CURRENCY_LIST.filter(c => {
                                const q = currencySearch.trim().toLowerCase();
                                return !q || c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
                            }).map((c, i, arr) => (
                                <TouchableOpacity key={c.code}
                                    onPress={() => { setFormCurrency(c.code); setCurrencyOpen(false); setCurrencySearch(''); }}
                                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: colors.borderLight, backgroundColor: formCurrency === c.code ? '#172554' : 'transparent' }}>
                                    <View>
                                        <Text style={{ color: formCurrency === c.code ? '#fff' : '#e5e7eb', fontSize: 14, fontFamily: formCurrency === c.code ? fonts.bodyBold : fonts.body }}>{c.code}</Text>
                                        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>{c.name}</Text>
                                    </View>
                                    {formCurrency === c.code && <Check color="#2563eb" size={16} />}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            )}

        </View>
        </Modal>
    );
}
