import {
    Activity, ArrowLeft, ArrowRightLeft, Award,
    Banknote, Bike, Bitcoin, BookOpen, Briefcase, Building2, Bus,
    Camera, Car, Check, ChevronDown, CircleDollarSign, Coffee, Coins, CreditCard, Images,
    Droplets, Dumbbell, Film, Flag, Flame, Fuel, Gift, Globe, GraduationCap,
    Heart, Home, Landmark, Laptop, MapPin, Minus, Monitor, Music,
    Package, PawPrint, Pencil, Pill, Plane, Plus, Receipt, Scissors,
    Repeat, Search, ShoppingBag, ShoppingCart, Shirt, Sofa, Star,
    Tag, Train, TrendingDown, TrendingUp, Trophy, Tv, Utensils,
    SlidersHorizontal, Wallet, Wifi, X, Zap,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator, Alert, Image, Modal, ScrollView,
    Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { formatAmount } from '@/constants/currencies';
import { ExpenseType } from '@/types';

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

const CURRENCY_LIST: { code: string; name: string }[] = [
    { code: 'EUR', name: 'Евро' },
    { code: 'USD', name: 'Доллар США' },
    { code: 'RUB', name: 'Рубль' },
    { code: 'GBP', name: 'Фунт стерлингов' },
    { code: 'CNY', name: 'Юань' },
    { code: 'JPY', name: 'Иена' },
    { code: 'CHF', name: 'Швейцарский франк' },
    { code: 'AED', name: 'Дирхам ОАЭ' },
    { code: 'CAD', name: 'Канадский доллар' },
    { code: 'AUD', name: 'Австралийский доллар' },
    { code: 'NZD', name: 'Новозеландский доллар' },
    { code: 'SEK', name: 'Шведская крона' },
    { code: 'NOK', name: 'Норвежская крона' },
    { code: 'DKK', name: 'Датская крона' },
    { code: 'PLN', name: 'Злотый' },
    { code: 'CZK', name: 'Чешская крона' },
    { code: 'HUF', name: 'Форинт' },
    { code: 'RON', name: 'Румынский лей' },
    { code: 'BGN', name: 'Болгарский лев' },
    { code: 'ISK', name: 'Исландская крона' },
    { code: 'TRY', name: 'Турецкая лира' },
    { code: 'ILS', name: 'Израильский шекель' },
    { code: 'KRW', name: 'Вона' },
    { code: 'INR', name: 'Индийская рупия' },
    { code: 'SGD', name: 'Сингапурский доллар' },
    { code: 'HKD', name: 'Гонконгский доллар' },
    { code: 'TWD', name: 'Тайваньский доллар' },
    { code: 'THB', name: 'Тайский бат' },
    { code: 'MYR', name: 'Ринггит' },
    { code: 'IDR', name: 'Индонезийская рупия' },
    { code: 'PHP', name: 'Филиппинское песо' },
    { code: 'VND', name: 'Донг' },
    { code: 'SAR', name: 'Саудовский риял' },
    { code: 'QAR', name: 'Катарский риял' },
    { code: 'KWD', name: 'Кувейтский динар' },
    { code: 'BHD', name: 'Бахрейнский динар' },
    { code: 'OMR', name: 'Оманский риял' },
    { code: 'EGP', name: 'Египетский фунт' },
    { code: 'ZAR', name: 'Южноафриканский рэнд' },
    { code: 'NGN', name: 'Нигерийская найра' },
    { code: 'KES', name: 'Кенийский шиллинг' },
    { code: 'MAD', name: 'Марокканский дирхам' },
    { code: 'BRL', name: 'Бразильский реал' },
    { code: 'MXN', name: 'Мексиканское песо' },
    { code: 'ARS', name: 'Аргентинское песо' },
    { code: 'CLP', name: 'Чилийское песо' },
    { code: 'COP', name: 'Колумбийское песо' },
    { code: 'PEN', name: 'Перуанский соль' },
    { code: 'UAH', name: 'Гривна' },
    { code: 'KZT', name: 'Тенге' },
    { code: 'GEL', name: 'Грузинский лари' },
    { code: 'AMD', name: 'Армянский драм' },
    { code: 'AZN', name: 'Азербайджанский манат' },
    { code: 'BYN', name: 'Белорусский рубль' },
    { code: 'UZS', name: 'Узбекский сум' },
    { code: 'PKR', name: 'Пакистанская рупия' },
    { code: 'BDT', name: 'Бангладешская така' },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type AccountLight  = { id: string; name: string; color: string | null; currency: string; balance: number };
type CategoryLight = { id: string; name: string; icon: string | null; color: string | null; type: 'income' | 'expense'; expense_type: string | null; is_system: boolean };
type TagLight      = { id: string; name: string };
type RecurFreq     = 'daily' | 'weekly' | 'monthly' | 'yearly';

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
        setCategoryTags([]);
        setNewTagText('');
        setAddingTag(false);
        setCatFormVisible(false);
        setCurrencyOpen(false);
        setCurrencySearch('');
    }, [visible, editingTx]);

    // ── Derived ──────────────────────────────────────────────────────────────
    const showRate = formCurrency !== baseCurrency;
    const formCats = useMemo(
        () => localCategories.filter(c => c.type === (formType === 'transfer' ? 'expense' : formType)),
        [localCategories, formType],
    );

    // ── Auto-fetch exchange rate ─────────────────────────────────────────────
    useEffect(() => {
        if (!showRate || !visible) return;
        fetchRate();
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
            if (status !== 'granted') { Alert.alert('Нет доступа к камере', 'Разрешите доступ в настройках'); return; }
            result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.8, allowsEditing: true, aspect: [4, 3] });
        } else {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') { Alert.alert('Нет доступа к галерее', 'Разрешите доступ в настройках'); return; }
            result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8, allowsEditing: true, aspect: [4, 3] });
        }
        if (result.canceled || !result.assets[0]) return;
        const uri = result.assets[0].uri;
        setReceiptUri(uri);
        setUploadingReceipt(true);
        try {
            const response = await fetch(uri);
            const blob     = await response.blob();
            const ext      = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
            const path     = `${householdId}/${Date.now()}.${ext}`;
            const { data, error } = await supabase.storage
                .from('receipts')
                .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: true });
            if (error) {
                Alert.alert('Ошибка загрузки', error.message);
                setReceiptUri(null);
            } else {
                const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(data.path);
                setReceiptUploadUrl(publicUrl);
            }
        } catch (e: any) {
            Alert.alert('Ошибка', e.message);
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
            .select('id, name, icon, color, type, expense_type, is_system')
            .or(`household_id.eq.${hid},household_id.is.null`).eq('is_hidden', false);
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
        Alert.alert(`Удалить «${cat.name}»?`, 'Транзакции с этой категорией останутся.', [
            { text: 'Отмена', style: 'cancel' },
            {
                text: 'Удалить', style: 'destructive',
                onPress: async () => {
                    await supabase.from('categories').update({ is_hidden: true }).eq('id', cat.id);
                    await reloadCategories(householdId);
                    if (formCategoryId === cat.id) setFormCategoryId('');
                },
            },
        ]);
    }

    // ── Save ─────────────────────────────────────────────────────────────────

    async function saveForm() {
        if (!formAmount || !formAccountId || !householdId) return;
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
                    name: localCategories.find(c => c.id === formCategoryId)?.name ?? 'Платёж',
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
                await supabase.from('transactions').insert(payload);
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

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={() => {
            if (tagSheet) { setTagSheet(null); return; }
            if (catFormVisible) { setCatFormVisible(false); return; }
            onClose();
        }}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
                <View style={{ backgroundColor: '#111827', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40, maxHeight: '95%' }}>

                    {catFormVisible ? (
                        /* ══ Category sub-form ══ */
                        <>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                                <TouchableOpacity onPress={() => setCatFormVisible(false)} hitSlop={10} style={{ marginRight: 12 }}>
                                    <ArrowLeft color="#6b7280" size={22} />
                                </TouchableOpacity>
                                <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', flex: 1 }}>Новая категория</Text>
                                <TouchableOpacity onPress={() => setCatFormVisible(false)} hitSlop={10}>
                                    <X color="#6b7280" size={20} />
                                </TouchableOpacity>
                            </View>

                            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                                {/* Name */}
                                <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 8 }}>НАЗВАНИЕ</Text>
                                <TextInput value={catName} onChangeText={setCatName}
                                    placeholder={formType === 'income' ? 'Например, Фриланс' : 'Например, Рестораны'}
                                    placeholderTextColor="#4b5563" autoFocus
                                    style={{ backgroundColor: '#1f2937', color: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 20, fontSize: 15 }}
                                />

                                {/* Icon grid */}
                                <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 10 }}>ИКОНКА</Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                                    {ICON_KEYS.map(key => {
                                        const Ic     = CAT_ICONS[key];
                                        const active = catIcon === key;
                                        return (
                                            <TouchableOpacity key={key} onPress={() => setCatIcon(key)} activeOpacity={0.7}
                                                style={{ width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: active ? catColor : '#374151', backgroundColor: active ? catColor + '22' : '#1f2937' }}>
                                                <Ic color={active ? catColor : '#6b7280'} size={22} />
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>

                                {/* Color */}
                                <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 10 }}>ЦВЕТ</Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
                                    {COLORS.map(c => (
                                        <TouchableOpacity key={c} onPress={() => setCatColor(c)}
                                            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c, alignItems: 'center', justifyContent: 'center', borderWidth: catColor === c ? 2 : 0, borderColor: '#fff' }}>
                                            {catColor === c && <Check color="#fff" size={18} />}
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                {/* Expense type */}
                                {formType === 'expense' && (
                                    <>
                                        <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 10 }}>ТИП РАСХОДА</Text>
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                                            {([
                                                { value: 'base',        label: '🏠 Базовые',      desc: 'Жильё, ЖКУ, связь, кредиты' },
                                                { value: 'everyday',    label: '🛒 Повседневные',  desc: 'Еда, транспорт, бытовые' },
                                                { value: 'development', label: '📈 Развитие',      desc: 'Здоровье, образование, спорт' },
                                                { value: 'forself',     label: '🎉 Для себя',     desc: 'Развлечения, хобби, подарки' },
                                                { value: 'work',        label: '💼 Рабочие',      desc: 'Инструменты, офис' },
                                                { value: 'other',       label: '📋 Прочее',       desc: 'Штрафы, налоги' },
                                            ]).map(opt => (
                                                <TouchableOpacity key={opt.value} onPress={() => setCatExpType(opt.value as any)} activeOpacity={0.8}
                                                    style={{ width: '48%', padding: 10, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', borderColor: catExpType === opt.value ? '#2563eb' : '#374151', backgroundColor: catExpType === opt.value ? '#172554' : '#1f2937' }}>
                                                    <Text style={{ color: catExpType === opt.value ? '#fff' : '#9ca3af', fontSize: 13, fontWeight: '600', textAlign: 'center' }}>{opt.label}</Text>
                                                    <Text style={{ color: '#4b5563', fontSize: 10, textAlign: 'center', marginTop: 2 }}>{opt.desc}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </>
                                )}

                                <TouchableOpacity onPress={saveCat} disabled={savingCat || !catName.trim() || (formType === 'expense' && !catExpType)}
                                    style={{ paddingVertical: 16, borderRadius: 20, alignItems: 'center', backgroundColor: savingCat || !catName.trim() || (formType === 'expense' && !catExpType) ? '#374151' : '#2563eb', marginBottom: 8 }}>
                                    {savingCat
                                        ? <ActivityIndicator color="#fff" />
                                        : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Создать категорию</Text>
                                    }
                                </TouchableOpacity>
                            </ScrollView>
                        </>
                    ) : (
                        /* ══ Transaction form ══ */
                        <>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>
                                    {editingTx ? 'Редактировать' : 'Новая транзакция'}
                                </Text>
                                <TouchableOpacity onPress={onClose} hitSlop={10}>
                                    <X color="#6b7280" size={22} />
                                </TouchableOpacity>
                            </View>

                            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                                {/* Type switcher */}
                                <View style={{ flexDirection: 'row', backgroundColor: '#1f2937', borderRadius: 14, padding: 4, marginBottom: 20 }}>
                                    {([
                                        { label: 'Расход',  value: 'expense'  as const, color: '#ef4444' },
                                        { label: 'Доход',   value: 'income'   as const, color: '#22c55e' },
                                        { label: 'Перевод', value: 'transfer' as const, color: '#6b7280' },
                                    ]).map(t => (
                                        <TouchableOpacity key={t.value} onPress={() => onFormTypeChange(t.value)} activeOpacity={0.8}
                                            style={{ flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center', backgroundColor: formType === t.value ? '#0f172a' : 'transparent' }}>
                                            <Text style={{ color: formType === t.value ? t.color : '#6b7280', fontSize: 14, fontWeight: '600' }}>{t.label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                {/* Account */}
                                <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 8 }}>{formType === 'transfer' ? 'ОТКУДА' : 'СЧЁТ'}</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginBottom: 16 }}>
                                    {accounts.map(acc => (
                                        <TouchableOpacity key={acc.id} onPress={() => onAccountChange(acc.id)} activeOpacity={0.8}
                                            style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, marginRight: 8, borderWidth: 1.5, borderColor: formAccountId === acc.id ? (acc.color ?? '#2563eb') : '#374151', backgroundColor: formAccountId === acc.id ? '#1e293b' : '#1f2937' }}>
                                            <Text style={{ color: formAccountId === acc.id ? '#fff' : '#9ca3af', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{acc.name}</Text>
                                            <Text style={{ color: '#4b5563', fontSize: 11, marginTop: 2 }}>{formatAmount(acc.balance, acc.currency)}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>

                                {/* To account (transfer) */}
                                {formType === 'transfer' && (
                                    <>
                                        <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 8 }}>КУДА</Text>
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginBottom: 16 }}>
                                            {accounts.filter(a => a.id !== formAccountId).map(acc => (
                                                <TouchableOpacity key={acc.id} onPress={() => setFormToAccId(acc.id)} activeOpacity={0.8}
                                                    style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, marginRight: 8, borderWidth: 1.5, borderColor: formToAccId === acc.id ? (acc.color ?? '#2563eb') : '#374151', backgroundColor: formToAccId === acc.id ? '#1e293b' : '#1f2937' }}>
                                                    <Text style={{ color: formToAccId === acc.id ? '#fff' : '#9ca3af', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{acc.name}</Text>
                                                    <Text style={{ color: '#4b5563', fontSize: 11, marginTop: 2 }}>{formatAmount(acc.balance, acc.currency)}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </ScrollView>
                                    </>
                                )}

                                {/* Category */}
                                {formType !== 'transfer' && (
                                    <>
                                        <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 8 }}>КАТЕГОРИЯ</Text>
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginBottom: 16 }}>
                                            {formCats.map(cat => {
                                                const active  = formCategoryId === cat.id;
                                                const Ic      = cat.icon ? CAT_ICONS[cat.icon] : null;
                                                const accent  = formType === 'income' ? '#16a34a' : '#dc2626';
                                                const accentBg = formType === 'income' ? '#14532d' : '#450a0a';
                                                return (
                                                    <TouchableOpacity key={cat.id}
                                                        onPress={() => onCatSelect(cat.id)}
                                                        onLongPress={() => !cat.is_system && Alert.alert(cat.name, undefined, [
                                                            { text: 'Удалить', style: 'destructive', onPress: () => deleteCategory(cat) },
                                                            { text: 'Отмена', style: 'cancel' },
                                                        ])}
                                                        delayLongPress={400}
                                                        activeOpacity={0.8}
                                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8, borderWidth: 1.5, borderColor: active ? accent : '#1f2937', backgroundColor: active ? accentBg : '#1f2937' }}>
                                                        {Ic && <Ic color={active ? '#fff' : (cat.color ?? '#6b7280')} size={14} />}
                                                        {!cat.is_system && (
                                                            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: cat.color ?? '#6b7280' }} />
                                                        )}
                                                        <Text style={{ color: active ? '#fff' : '#9ca3af', fontSize: 13 }}>{cat.name}</Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                            <TouchableOpacity onPress={openCatForm} activeOpacity={0.8}
                                                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#374151', borderStyle: 'dashed' }}>
                                                <Plus color="#4b5563" size={13} />
                                                <Text style={{ color: '#6b7280', fontSize: 13 }}>Новая</Text>
                                            </TouchableOpacity>
                                        </ScrollView>
                                    </>
                                )}

                                {/* Tags */}
                                {formCategoryId && formType !== 'transfer' && (
                                    <>
                                        <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 8 }}>ТЕГ</Text>
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginBottom: 16 }}>
                                            {categoryTags.map(tag => (
                                                editingTagId === tag.id ? (
                                                    <TextInput
                                                        key={tag.id}
                                                        value={editingTagText}
                                                        onChangeText={setEditingTagText}
                                                        onSubmitEditing={updateTag}
                                                        onBlur={updateTag}
                                                        autoFocus
                                                        returnKeyType="done"
                                                        style={{ backgroundColor: '#1f2937', color: '#fff', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, fontSize: 13, borderWidth: 1.5, borderColor: '#f59e0b', minWidth: 90, marginRight: 6 }}
                                                    />
                                                ) : (
                                                    <TouchableOpacity key={tag.id}
                                                        onPress={() => setSelectedTagId(tag.id)}
                                                        onLongPress={() => setTagSheet(tag)}
                                                        delayLongPress={400}
                                                        activeOpacity={0.8}
                                                        style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 6, borderWidth: 1.5, borderColor: selectedTagId === tag.id ? '#2563eb' : '#374151', backgroundColor: selectedTagId === tag.id ? '#172554' : '#1f2937' }}>
                                                        <Text style={{ color: selectedTagId === tag.id ? '#60a5fa' : '#9ca3af', fontSize: 13 }}>{tag.name}</Text>
                                                    </TouchableOpacity>
                                                )
                                            ))}
                                            {addingTag ? (
                                                <TextInput
                                                    value={newTagText}
                                                    onChangeText={setNewTagText}
                                                    onSubmitEditing={addTag}
                                                    onBlur={() => { if (!newTagText.trim()) setAddingTag(false); }}
                                                    autoFocus
                                                    placeholder="Новый тег…"
                                                    placeholderTextColor="#4b5563"
                                                    returnKeyType="done"
                                                    style={{ backgroundColor: '#1f2937', color: '#fff', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, fontSize: 13, borderWidth: 1.5, borderColor: '#2563eb', minWidth: 110 }}
                                                />
                                            ) : (
                                                <TouchableOpacity onPress={() => setAddingTag(true)} activeOpacity={0.8}
                                                    style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1.5, borderColor: '#374151', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 }}>
                                                    <Plus color="#4b5563" size={13} />
                                                    <Text style={{ color: '#6b7280', fontSize: 12 }}>Тег</Text>
                                                </TouchableOpacity>
                                            )}
                                        </ScrollView>
                                    </>
                                )}

                                {/* Amount + Currency */}
                                <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 8 }}>СУММА</Text>
                                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
                                    <TextInput value={formAmount} onChangeText={setFormAmount}
                                        keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#4b5563"
                                        style={{ flex: 1, backgroundColor: '#1f2937', color: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 24, fontWeight: '700' }}
                                    />
                                    <TouchableOpacity
                                        onPress={() => setCurrencyOpen(v => !v)}
                                        activeOpacity={0.8}
                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1f2937', borderRadius: 12, paddingHorizontal: 16, borderWidth: 1.5, borderColor: currencyOpen ? '#2563eb' : '#374151', minWidth: 82 }}>
                                        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{formCurrency}</Text>
                                        <ChevronDown color="#6b7280" size={15}
                                            style={{ transform: [{ rotate: currencyOpen ? '180deg' : '0deg' }] }} />
                                    </TouchableOpacity>
                                </View>

                                {/* Currency dropdown */}
                                {currencyOpen && (() => {
                                    const q       = currencySearch.trim().toLowerCase();
                                    const vis = q
                                        ? CURRENCY_LIST.filter(c => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
                                        : CURRENCY_LIST;
                                    return (
                                        <View style={{ backgroundColor: '#1f2937', borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: '#374151', overflow: 'hidden', maxHeight: 320 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#374151' }}>
                                                <Search color="#4b5563" size={15} />
                                                <TextInput
                                                    value={currencySearch}
                                                    onChangeText={setCurrencySearch}
                                                    placeholder="Поиск валюты…"
                                                    placeholderTextColor="#4b5563"
                                                    autoFocus
                                                    style={{ flex: 1, color: '#fff', fontSize: 14, padding: 0 }}
                                                />
                                                {currencySearch.length > 0 && (
                                                    <TouchableOpacity onPress={() => setCurrencySearch('')} hitSlop={8}>
                                                        <X color="#4b5563" size={14} />
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                                                {vis.length === 0 ? (
                                                    <Text style={{ color: '#4b5563', fontSize: 14, textAlign: 'center', paddingVertical: 20 }}>Ничего не найдено</Text>
                                                ) : vis.map((c, i) => (
                                                    <TouchableOpacity key={c.code}
                                                        onPress={() => { setFormCurrency(c.code); setCurrencyOpen(false); setCurrencySearch(''); }}
                                                        activeOpacity={0.7}
                                                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: i < vis.length - 1 ? 1 : 0, borderBottomColor: '#374151', backgroundColor: formCurrency === c.code ? '#172554' : 'transparent' }}>
                                                        <View>
                                                            <Text style={{ color: formCurrency === c.code ? '#fff' : '#e5e7eb', fontSize: 14, fontWeight: formCurrency === c.code ? '700' : '500' }}>{c.code}</Text>
                                                            <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 1 }}>{c.name}</Text>
                                                        </View>
                                                        {formCurrency === c.code && <Check color="#2563eb" size={16} />}
                                                    </TouchableOpacity>
                                                ))}
                                            </ScrollView>
                                        </View>
                                    );
                                })()}
                                <View style={{ marginBottom: showRate ? 4 : 8 }} />

                                {/* Exchange rate */}
                                {showRate && (
                                    <View style={{ marginBottom: 16 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                            <Text style={{ color: '#6b7280', fontSize: 12 }}>КУРС ({formCurrency} → {baseCurrency})</Text>
                                            <TouchableOpacity onPress={fetchRate} disabled={fetchingRate} hitSlop={8}
                                                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                {fetchingRate
                                                    ? <ActivityIndicator size="small" color="#2563eb" />
                                                    : <TrendingUp color="#2563eb" size={14} />
                                                }
                                                <Text style={{ color: '#2563eb', fontSize: 12 }}>
                                                    {fetchingRate ? 'Загрузка…' : 'Актуальный курс'}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                            <TextInput value={formRate} onChangeText={setFormRate}
                                                keyboardType="decimal-pad" placeholder="1.0000" placeholderTextColor="#4b5563"
                                                style={{ flex: 1, backgroundColor: '#1f2937', color: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15 }}
                                            />
                                            {formRate && formAmount && !isNaN(parseFloat(formRate)) && !isNaN(parseFloat(formAmount)) && (
                                                <Text style={{ color: '#9ca3af', fontSize: 13 }}>
                                                    = {formatAmount(parseFloat(formAmount) * parseFloat(formRate), baseCurrency)}
                                                </Text>
                                            )}
                                        </View>
                                    </View>
                                )}

                                {/* Date */}
                                <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 8 }}>ДАТА</Text>
                                <TextInput value={formDate} onChangeText={setFormDate}
                                    keyboardType="numeric" placeholder="ГГГГ-ММ-ДД" placeholderTextColor="#4b5563"
                                    style={{ backgroundColor: '#1f2937', color: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16, fontSize: 15, letterSpacing: 1 }}
                                />

                                {/* Note */}
                                <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 8 }}>ЗАМЕТКА</Text>
                                <TextInput value={formNote} onChangeText={setFormNote}
                                    placeholder="Необязательно…" placeholderTextColor="#4b5563" multiline
                                    style={{ backgroundColor: '#1f2937', color: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16, fontSize: 15, minHeight: 52, textAlignVertical: 'top' }}
                                />

                                {/* Recurring payment */}
                                {formType !== 'transfer' && (
                                    <View style={{ marginBottom: 16 }}>
                                        <TouchableOpacity
                                            onPress={() => !editingTx && setFormIsRecurring(v => !v)}
                                            activeOpacity={0.8}
                                            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#1f2937', borderWidth: 1.5, borderColor: formIsRecurring ? '#2563eb' : '#374151' }}>
                                            <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: formIsRecurring ? '#2563eb' : '#4b5563', backgroundColor: formIsRecurring ? '#2563eb' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                                                {formIsRecurring && <Check color="#fff" size={14} />}
                                            </View>
                                            <Text style={{ color: formIsRecurring ? '#fff' : '#9ca3af', fontSize: 14, fontWeight: '500' }}>
                                                Рекуррентный платёж
                                            </Text>
                                        </TouchableOpacity>

                                        {formIsRecurring && !!editingTx && (
                                            <View style={{ marginTop: 8, backgroundColor: '#111827', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#374151' }}>
                                                <Text style={{ color: '#9ca3af', fontSize: 13 }}>Транзакция уже связана с регулярным платежом</Text>
                                            </View>
                                        )}

                                        {formIsRecurring && !editingTx && (
                                            <View style={{ marginTop: 12, gap: 12 }}>
                                                {/* Frequency */}
                                                <View>
                                                    <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 6 }}>ЧАСТОТА</Text>
                                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                                        {(['daily', 'weekly', 'monthly', 'yearly'] as RecurFreq[]).map(f => (
                                                            <TouchableOpacity key={f} onPress={() => setFormRecurFreq(f)} activeOpacity={0.8}
                                                                style={{ flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: formRecurFreq === f ? '#2563eb' : '#374151', backgroundColor: formRecurFreq === f ? '#172554' : '#111827', alignItems: 'center' }}>
                                                                <Text style={{ color: formRecurFreq === f ? '#fff' : '#6b7280', fontSize: 12 }}>
                                                                    {f === 'daily' ? 'Ежедн.' : f === 'weekly' ? 'Нед.' : f === 'monthly' ? 'Мес.' : 'Год'}
                                                                </Text>
                                                            </TouchableOpacity>
                                                        ))}
                                                    </View>
                                                </View>

                                                {/* Weekly: day of week */}
                                                {formRecurFreq === 'weekly' && (
                                                    <View>
                                                        <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 6 }}>ДЕНЬ НЕДЕЛИ</Text>
                                                        <View style={{ flexDirection: 'row', gap: 5 }}>
                                                            {['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map((d, i) => (
                                                                <TouchableOpacity key={i} onPress={() => setFormRecurWeekday(i)} activeOpacity={0.8}
                                                                    style={{ flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1.5, borderColor: formRecurWeekday === i ? '#2563eb' : '#374151', backgroundColor: formRecurWeekday === i ? '#172554' : '#111827', alignItems: 'center' }}>
                                                                    <Text style={{ color: formRecurWeekday === i ? '#fff' : '#6b7280', fontSize: 11 }}>{d}</Text>
                                                                </TouchableOpacity>
                                                            ))}
                                                        </View>
                                                    </View>
                                                )}

                                                {/* Monthly: day of month */}
                                                {formRecurFreq === 'monthly' && (
                                                    <View>
                                                        <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 6 }}>ЧИСЛО МЕСЯЦА</Text>
                                                        <TextInput
                                                            value={String(formRecurMonthDay)}
                                                            onChangeText={t => {
                                                                if (t === '') { setFormRecurMonthDay(1); return; }
                                                                const n = parseInt(t);
                                                                if (!isNaN(n) && n >= 1 && n <= 31) setFormRecurMonthDay(n);
                                                            }}
                                                            keyboardType="number-pad"
                                                            placeholder="1–31"
                                                            placeholderTextColor="#4b5563"
                                                            style={{ backgroundColor: '#111827', color: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1.5, borderColor: '#2563eb', fontSize: 15, width: 80, textAlign: 'center' }}
                                                        />
                                                    </View>
                                                )}

                                                {/* Yearly: day + month */}
                                                {formRecurFreq === 'yearly' && (
                                                    <View style={{ gap: 10 }}>
                                                        <View>
                                                            <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 6 }}>ДЕНЬ</Text>
                                                            <TextInput
                                                                value={String(formRecurYearDay)}
                                                                onChangeText={t => {
                                                                    if (t === '') { setFormRecurYearDay(1); return; }
                                                                    const n = parseInt(t);
                                                                    if (!isNaN(n) && n >= 1 && n <= 31) setFormRecurYearDay(n);
                                                                }}
                                                                keyboardType="number-pad"
                                                                placeholder="1–31"
                                                                placeholderTextColor="#4b5563"
                                                                style={{ backgroundColor: '#111827', color: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1.5, borderColor: '#2563eb', fontSize: 15, width: 80, textAlign: 'center' }}
                                                            />
                                                        </View>
                                                        <View>
                                                            <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 6 }}>МЕСЯЦ</Text>
                                                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                                                {['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'].map((m, i) => (
                                                                    <TouchableOpacity key={i} onPress={() => setFormRecurYearMonth(i + 1)} activeOpacity={0.8}
                                                                        style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: formRecurYearMonth === i + 1 ? '#2563eb' : '#374151', backgroundColor: formRecurYearMonth === i + 1 ? '#172554' : '#111827' }}>
                                                                        <Text style={{ color: formRecurYearMonth === i + 1 ? '#fff' : '#6b7280', fontSize: 12 }}>{m}</Text>
                                                                    </TouchableOpacity>
                                                                ))}
                                                            </View>
                                                        </View>
                                                    </View>
                                                )}

                                                {/* Notify */}
                                                <View>
                                                    <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 6 }}>НАПОМНИТЬ ЗА</Text>
                                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                                        {[1, 3, 7].map(n => (
                                                            <TouchableOpacity key={n} onPress={() => setFormRecurNotify(n)} activeOpacity={0.8}
                                                                style={{ flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: formRecurNotify === n ? '#2563eb' : '#374151', backgroundColor: formRecurNotify === n ? '#172554' : '#111827', alignItems: 'center' }}>
                                                                <Text style={{ color: formRecurNotify === n ? '#fff' : '#6b7280', fontSize: 13 }}>
                                                                    {n} {n === 1 ? 'день' : 'дня'}
                                                                </Text>
                                                            </TouchableOpacity>
                                                        ))}
                                                    </View>
                                                </View>

                                                {/* Next date preview */}
                                                <TouchableOpacity onPress={() => setShowRecurDatePicker(true)} activeOpacity={0.8}
                                                    style={{ backgroundColor: '#111827', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#374151', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                                    <Text style={{ color: '#9ca3af', fontSize: 13 }}>Следующий платёж</Text>
                                                    <Text style={{ color: '#60a5fa', fontSize: 13, fontWeight: '600' }}>
                                                        {format(
                                                            formRecurOverrideDate ?? new Date(calcNextDate(formRecurFreq, formRecurWeekday, formRecurMonthDay, formRecurYearMonth, formRecurYearDay) + 'T00:00:00'),
                                                            'd MMM yyyy', { locale: ru }
                                                        )}
                                                    </Text>
                                                </TouchableOpacity>

                                                {showRecurDatePicker && (
                                                    <View style={{ backgroundColor: '#1f2937', borderRadius: 14, overflow: 'hidden', marginTop: 4 }}>
                                                        <DateTimePicker
                                                            mode="date"
                                                            display="inline"
                                                            themeVariant="dark"
                                                            value={formRecurOverrideDate ?? new Date(calcNextDate(formRecurFreq, formRecurWeekday, formRecurMonthDay, formRecurYearMonth, formRecurYearDay) + 'T00:00:00')}
                                                            minimumDate={new Date()}
                                                            onChange={(_, date) => {
                                                                setShowRecurDatePicker(false);
                                                                if (date) {
                                                                    setFormRecurOverrideDate(date);
                                                                    if (formRecurFreq === 'monthly') {
                                                                        setFormRecurMonthDay(date.getDate());
                                                                    } else if (formRecurFreq === 'yearly') {
                                                                        setFormRecurYearDay(date.getDate());
                                                                        setFormRecurYearMonth(date.getMonth() + 1);
                                                                    }
                                                                }
                                                            }}
                                                        />
                                                    </View>
                                                )}
                                            </View>
                                        )}
                                    </View>
                                )}

                                {/* Receipt photo */}
                                <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 10 }}>ФОТО ЧЕКА</Text>
                                {receiptUri ? (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#1f2937', borderRadius: 14, padding: 12, marginBottom: 24 }}>
                                        <Image source={{ uri: receiptUri }} style={{ width: 72, height: 72, borderRadius: 10 }} resizeMode="cover" />
                                        <View style={{ flex: 1 }}>
                                            {uploadingReceipt ? (
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                    <ActivityIndicator size="small" color="#2563eb" />
                                                    <Text style={{ color: '#9ca3af', fontSize: 13 }}>Загрузка…</Text>
                                                </View>
                                            ) : receiptUploadUrl ? (
                                                <Text style={{ color: '#22c55e', fontSize: 13, fontWeight: '600' }}>✓ Загружено</Text>
                                            ) : (
                                                <Text style={{ color: '#ef4444', fontSize: 13 }}>Ошибка загрузки</Text>
                                            )}
                                            <TouchableOpacity onPress={() => { setReceiptUri(null); setReceiptUploadUrl(null); }} style={{ marginTop: 10 }} hitSlop={8}>
                                                <Text style={{ color: '#ef4444', fontSize: 13 }}>Удалить фото</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ) : (
                                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
                                        <TouchableOpacity onPress={() => pickReceipt('camera')} activeOpacity={0.8}
                                            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1f2937', borderRadius: 12, paddingVertical: 14, borderWidth: 1, borderColor: '#374151' }}>
                                            <Camera color="#6b7280" size={18} />
                                            <Text style={{ color: '#9ca3af', fontSize: 14 }}>Камера</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => pickReceipt('gallery')} activeOpacity={0.8}
                                            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1f2937', borderRadius: 12, paddingVertical: 14, borderWidth: 1, borderColor: '#374151' }}>
                                            <Images color="#6b7280" size={18} />
                                            <Text style={{ color: '#9ca3af', fontSize: 14 }}>Галерея</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}

                                {/* Save */}
                                <TouchableOpacity onPress={saveForm}
                                    disabled={saving || !formAmount || (formType !== 'transfer' && !formCategoryId) || !formAccountId}
                                    style={{
                                        paddingVertical: 16, borderRadius: 20, alignItems: 'center',
                                        backgroundColor: saving || !formAmount || (formType !== 'transfer' && !formCategoryId) || !formAccountId
                                            ? '#374151'
                                            : formType === 'income' ? '#16a34a' : formType === 'expense' ? '#dc2626' : '#2563eb',
                                    }}>
                                    {saving
                                        ? <ActivityIndicator color="#fff" />
                                        : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                                            {editingTx ? 'Сохранить' : formType === 'income' ? 'Добавить доход' : formType === 'expense' ? 'Добавить расход' : 'Выполнить перевод'}
                                          </Text>
                                    }
                                </TouchableOpacity>

                            </ScrollView>
                        </>
                    )}
                </View>

                {/* ── Tag action overlay ── */}
                {!!tagSheet && (
                    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' }}>
                        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} activeOpacity={1} onPress={() => setTagSheet(null)} />
                        <View style={{ backgroundColor: '#1a2235', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 }}>
                            <View style={{ width: 40, height: 4, backgroundColor: '#374151', borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />
                            <Text style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', marginBottom: 16 }}>{tagSheet.name}</Text>
                            <TouchableOpacity
                                onPress={() => { setEditingTagId(tagSheet.id); setEditingTagText(tagSheet.name); setTagSheet(null); }}
                                activeOpacity={0.8}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#1f2937' }}>
                                <Pencil color="#9ca3af" size={20} />
                                <Text style={{ color: '#f9fafb', fontSize: 16 }}>Редактировать</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => { deleteTag(tagSheet.id); setTagSheet(null); }}
                                activeOpacity={0.8}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16 }}>
                                <X color="#ef4444" size={20} />
                                <Text style={{ color: '#ef4444', fontSize: 16 }}>Удалить тег</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            </View>
        </Modal>
    );
}
