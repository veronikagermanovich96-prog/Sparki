import {
    ArrowDownToLine, ArrowUpFromLine,
    BarChart2, Bell, BellOff, Check, ChevronDown, ChevronRight, Clock, Database,
    Eye, EyeOff, Globe, HelpCircle, Key, LogOut,
    Moon, Pencil, Plus, Sun, Trash2, User, Wallet, X,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadNotifSettings, saveNotifSettings, requestPermissions, configureNotifications, DEFAULT_NOTIF_SETTINGS, type NotifSettings } from '@/lib/notifications';
import { exportTransactions, pickCSVFile, autoDetectMapping, validateRows, importRows, type ColumnKey, CSV_COLUMNS } from '@/lib/importExport';
import { useCallback, useEffect, useState } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
    ActivityIndicator, Alert, ScrollView, Switch,
    Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { BaseBottomSheet } from '@/components/ui/BaseBottomSheet';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { CURRENCIES } from '@/constants/currencies';
import { Account, Budget, Category } from '@/types';

const COLORS = ['#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#f97316', '#eab308', '#14b8a6', '#ec4899'];
const EXPENSE_TYPES = [
    { value: 'infrastructure', label: '🏠 Базовые',      desc: 'Жильё, ЖКУ, связь' },
    { value: 'operational',    label: '🛒 Повседневные',  desc: 'Еда, транспорт' },
    { value: 'investment',     label: '📈 Развитие',      desc: 'Здоровье, образование' },
    { value: 'discretionary',  label: '🎉 Для себя',     desc: 'Развлечения, хобби' },
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initials(name: string) {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function SectionHeader({ label }: { label: string }) {
    return <Text style={{ color: '#6b7280', fontSize: 11, fontWeight: '600', letterSpacing: 0.6, marginTop: 28, marginBottom: 6, paddingHorizontal: 20 }}>{label}</Text>;
}

function SettingRow({
    icon, label, value, onPress, right, danger = false,
}: {
    icon?: React.ReactNode;
    label: string;
    value?: string;
    onPress?: () => void;
    right?: React.ReactNode;
    danger?: boolean;
}) {
    return (
        <TouchableOpacity onPress={onPress} activeOpacity={onPress ? 0.7 : 1}
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#111827' }}>
            {icon && (
                <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                    {icon}
                </View>
            )}
            <Text style={{ flex: 1, color: danger ? '#ef4444' : '#e5e7eb', fontSize: 16 }}>{label}</Text>
            {right !== undefined ? right : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {value && <Text style={{ color: '#6b7280', fontSize: 14 }}>{value}</Text>}
                    {onPress && <ChevronRight color="#4b5563" size={16} />}
                </View>
            )}
        </TouchableOpacity>
    );
}

function Divider() {
    return <View style={{ height: 1, backgroundColor: '#1f2937', marginLeft: 66 }} />;
}

function SectionCard({ children }: { children: React.ReactNode }) {
    return (
        <View style={{ backgroundColor: '#111827', borderRadius: 16, marginHorizontal: 16, overflow: 'hidden' }}>
            {children}
        </View>
    );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function SettingsScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ openExtras?: string }>();

    // ── User & household
    const [userId,       setUserId]       = useState('');
    const [householdId,  setHouseholdId]  = useState('');
    const [displayName,  setDisplayName]  = useState('');
    const [email,        setEmail]        = useState('');
    const [baseCurrency, setBaseCurrency] = useState('EUR');
    const [loading,      setLoading]      = useState(true);

    // ── Data
    const [categories, setCategories] = useState<Category[]>([]);
    const [accounts,   setAccounts]   = useState<Account[]>([]);

    // ── Local preferences
    const [darkMode,  setDarkMode] = useState(true);
    const [hints,     setHints]    = useState(true);

    // ── Notification settings
    const [notifSettings,  setNotifSettings]  = useState<NotifSettings>(DEFAULT_NOTIF_SETTINGS);
    const [notifVisible,   setNotifVisible]   = useState(false);
    const [notifSection,   setNotifSection]   = useState<'lowBalance' | 'recurring' | 'budget' | 'daily' | null>(null);

    // ── Profile modal
    const [editNameVisible,  setEditNameVisible]  = useState(false);
    const [nameInput,        setNameInput]        = useState('');
    const [savingName,       setSavingName]       = useState(false);

    // ── Password modal
    const [pwVisible,     setPwVisible]     = useState(false);
    const [pwStep,        setPwStep]        = useState<1 | 2>(1);
    const [pwCurrent,     setPwCurrent]     = useState('');
    const [pwNew,         setPwNew]         = useState('');
    const [pwConfirm,     setPwConfirm]     = useState('');
    const [savingPw,      setSavingPw]      = useState(false);
    const [pwError,       setPwError]       = useState('');
    const [showCurrent,   setShowCurrent]   = useState(false);
    const [showNew,       setShowNew]       = useState(false);
    const [showConfirm,   setShowConfirm]   = useState(false);

    // ── Currency modal
    const [currencyVisible, setCurrencyVisible] = useState(false);
    const [currencySearch,  setCurrencySearch]  = useState('');
    const [savingCurrency,  setSavingCurrency]  = useState(false);

    // ── Categories modal
    const [catsVisible,  setCatsVisible]  = useState(false);
    const [catsTab,      setCatsTab]      = useState<'expense' | 'income'>('expense');

    // ── Edit category modal
    const [editCat,          setEditCat]          = useState<Category | null>(null);
    const [editCatName,      setEditCatName]      = useState('');
    const [editCatColor,     setEditCatColor]     = useState('#3b82f6');
    const [editCatExpType,   setEditCatExpType]   = useState<string | null>(null);
    const [savingCat,        setSavingCat]        = useState(false);
    const [creatingCat,      setCreatingCat]      = useState(false);

    // ── Category limits modal
    const [budgetsVisible,  setBudgetsVisible]  = useState(false);
    const [budgets,         setBudgets]         = useState<Budget[]>([]);
    const [catLimits,       setCatLimits]       = useState<Record<string, string>>({});   // catId → amount string
    const [tagLimits,       setTagLimits]       = useState<Record<string, string>>({});   // tagId → amount string
    const [limitPeriod,     setLimitPeriod]     = useState<'monthly' | 'yearly'>('monthly');
    const [catSpend,        setCatSpend]        = useState<Record<string, number>>({});
    const [tagSpend,        setTagSpend]        = useState<Record<string, number>>({});
    const [loadingSpend,    setLoadingSpend]    = useState(false);
    const [savingBudget,    setSavingBudget]    = useState(false);
    const [catTags,         setCatTags]         = useState<Record<string, Array<{ id: string; name: string }>>>({});
    const [expandedCats,    setExpandedCats]    = useState<Set<string>>(new Set());
    const [budgetTab,       setBudgetTab]       = useState<'limits' | 'extras'>('limits');

    // ── Extras state
    type DraftEntry = { active: boolean; amount: string };
    const [extraDraft,      setExtraDraft]      = useState<Record<string, DraftEntry>>({});
    const [extraExpandedCats, setExtraExpandedCats] = useState<Set<string>>(new Set());
    const [savingExtras,    setSavingExtras]    = useState(false);

    // ── Hidden accounts modal
    const [hiddenVisible, setHiddenVisible] = useState(false);

    // ── Import / Export modal
    const [ioVisible,        setIoVisible]        = useState(false);
    const [ioTab,            setIoTab]            = useState<'export' | 'import'>('export');
    // export state
    const [exportFrom,       setExportFrom]       = useState<Date | null>(null);
    const [exportTo,         setExportTo]         = useState<Date | null>(null);
    const [exportFormat,     setExportFormat]     = useState<'csv' | 'json'>('csv');
    const [showExpFrom,      setShowExpFrom]       = useState(false);
    const [showExpTo,        setShowExpTo]         = useState(false);
    const [exporting,        setExporting]        = useState(false);
    // import state
    const [importHeaders,    setImportHeaders]    = useState<string[]>([]);
    const [importDataRows,   setImportDataRows]   = useState<string[][]>([]);
    const [importMapping,    setImportMapping]    = useState<ColumnKey[]>([]);
    const [importStep,       setImportStep]       = useState<'idle' | 'mapping' | 'preview' | 'done'>('idle');
    const [importValid,      setImportValid]      = useState<ReturnType<typeof validateRows>['valid']>([]);
    const [importErrors,     setImportErrors]     = useState<ReturnType<typeof validateRows>['errors']>([]);
    const [importing,        setImporting]        = useState(false);
    const [importResult,     setImportResult]     = useState<{ inserted: number; failed: number } | null>(null);

    // ─────────────────────────────────────────────────────────────────────────

    useFocusEffect(useCallback(() => { loadData(); }, []));

    // Handle deep link to extras tab
    useEffect(() => {
        if (params.openExtras === '1' && householdId && categories.length > 0) {
            openBudgetsModal('extras');
            // Clear the param so it doesn't re-trigger
            router.setParams({ openExtras: undefined } as any);
        }
    }, [params.openExtras, householdId, categories.length]);

    useEffect(() => {
        configureNotifications();
        AsyncStorage.multiGet(['darkMode', 'hints']).then(pairs => {
            const map = Object.fromEntries(pairs.map(([k, v]) => [k, v]));
            if (map.darkMode !== null) setDarkMode(map.darkMode === 'true');
            if (map.hints    !== null) setHints(map.hints === 'true');
        });
        loadNotifSettings().then(setNotifSettings);
    }, []);

    async function loadData() {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }

        setUserId(user.id);
        setEmail(user.email ?? '');
        setDisplayName(user.user_metadata?.display_name ?? user.email?.split('@')[0] ?? 'Пользователь');

        const { data: member } = await supabase.from('household_members').select('household_id').eq('user_id', user.id).single();
        if (!member) { setLoading(false); return; }
        setHouseholdId(member.household_id);

        const [{ data: hh }, { data: cats }, { data: accs }, { data: buds }] = await Promise.all([
            supabase.from('households').select('base_currency').eq('id', member.household_id).single(),
            supabase.from('categories').select('*').or(`household_id.eq.${member.household_id},is_system.eq.true`).order('name'),
            supabase.from('accounts').select('*').eq('household_id', member.household_id).eq('is_deleted', false).order('sort_order').order('name'),
            supabase.from('budgets').select('*').eq('household_id', member.household_id),
        ]);

        if (hh)   setBaseCurrency(hh.base_currency);
        if (cats) setCategories(cats as Category[]);
        if (accs) setAccounts(accs as Account[]);
        if (buds) setBudgets(buds as Budget[]);
        setLoading(false);
    }

    // ── Save name ─────────────────────────────────────────────────────────────

    async function saveName() {
        const name = nameInput.trim();
        if (!name) return;
        setSavingName(true);
        await supabase.auth.updateUser({ data: { display_name: name } });
        setDisplayName(name);
        setSavingName(false);
        setEditNameVisible(false);
    }

    // ── Change password ───────────────────────────────────────────────────────

    async function verifyCurrentPassword() {
        if (!pwCurrent.trim()) { setPwError('Введите текущий пароль'); return; }
        setPwError('');
        setSavingPw(true);
        const { data: { user: u } } = await supabase.auth.getUser();
        if (!u?.email) { setSavingPw(false); setPwError('Не удалось получить email'); return; }
        const { error } = await supabase.auth.signInWithPassword({ email: u.email, password: pwCurrent });
        setSavingPw(false);
        if (error) { setPwError('Неверный пароль'); return; }
        setPwStep(2);
    }

    async function saveNewPassword() {
        if (pwNew !== pwConfirm) { setPwError('Пароли не совпадают'); return; }
        if (pwNew.length < 6)   { setPwError('Минимум 6 символов'); return; }
        setPwError('');
        setSavingPw(true);
        const { error } = await supabase.auth.updateUser({ password: pwNew });
        setSavingPw(false);
        if (error) { setPwError(error.message); return; }
        Alert.alert('Готово', 'Пароль изменён');
        closePwModal();
    }

    function closePwModal() {
        setPwVisible(false);
        setPwStep(1);
        setPwCurrent(''); setPwNew(''); setPwConfirm('');
        setPwError('');
        setShowCurrent(false); setShowNew(false); setShowConfirm(false);
    }

    // ── Save currency ─────────────────────────────────────────────────────────

    function confirmCurrency(code: string) {
        if (code === baseCurrency) { setCurrencyVisible(false); return; }
        Alert.alert(
            'Изменить базовую валюту?',
            `Все суммы будут пересчитаны по текущему курсу в ${code}. Это действие нельзя отменить.`,
            [
                { text: 'Отмена', style: 'cancel' },
                { text: 'Изменить', style: 'destructive', onPress: () => saveCurrency(code) },
            ],
        );
    }

    async function saveCurrency(code: string) {
        setSavingCurrency(true);
        await supabase.from('households').update({ base_currency: code }).eq('id', householdId);
        setBaseCurrency(code);
        setSavingCurrency(false);
        setCurrencyVisible(false);
        setCurrencySearch('');
    }

    // ── Categories ────────────────────────────────────────────────────────────

    async function toggleCategoryHidden(cat: Category) {
        const newVal = !cat.is_hidden;
        await supabase.from('categories').update({ is_hidden: newVal }).eq('id', cat.id);
        setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, is_hidden: newVal } : c));
    }

    function openEditCat(cat: Category) {
        setCatsVisible(false);
        setEditCat(cat);
        setEditCatName(cat.name);
        setEditCatColor(cat.color ?? '#6b7280');
        setEditCatExpType(cat.expense_type ?? null);
    }

    async function saveCategory() {
        if (!editCat || !editCatName.trim()) return;
        setSavingCat(true);
        await supabase.from('categories').update({
            name: editCatName.trim(),
            color: editCatColor,
            expense_type: editCatExpType,
        }).eq('id', editCat.id);
        setCategories(prev => prev.map(c => c.id === editCat.id
            ? { ...c, name: editCatName.trim(), color: editCatColor, expense_type: editCatExpType as any }
            : c));
        setSavingCat(false);
        setEditCat(null);
        setCatsVisible(true);
    }

    function confirmDeleteCategory() {
        if (!editCat) return;
        Alert.alert(
            'Удалить категорию?',
            `Категория «${editCat.name}» будет удалена. Транзакции с этой категорией останутся без категории.`,
            [
                { text: 'Отмена', style: 'cancel' },
                { text: 'Удалить', style: 'destructive', onPress: deleteCategory },
            ],
        );
    }

    async function deleteCategory() {
        if (!editCat) return;
        setSavingCat(true);
        await supabase.from('categories').delete().eq('id', editCat.id);
        setCategories(prev => prev.filter(c => c.id !== editCat.id));
        setSavingCat(false);
        setEditCat(null);
        setCatsVisible(true);
    }

    function openCreateCat() {
        setCatsVisible(false);
        setEditCat(null);
        setEditCatName('');
        setEditCatColor('#3b82f6');
        setEditCatExpType(catsTab === 'expense' ? 'operational' : null);
        setCreatingCat(true);
    }

    async function createCategory() {
        if (!editCatName.trim() || !householdId) return;
        setSavingCat(true);
        const { data, error } = await supabase.from('categories').insert({
            household_id: householdId,
            name: editCatName.trim(),
            color: editCatColor,
            type: catsTab,
            expense_type: catsTab === 'expense' ? editCatExpType : null,
            is_system: false,
            is_hidden: false,
        }).select().single();
        if (data) {
            setCategories(prev => [...prev, data as Category]);
        }
        setSavingCat(false);
        setCreatingCat(false);
        setCatsVisible(true);
    }

    // ── Category limits ───────────────────────────────────────────────────────

    async function openBudgetsModal(tab?: 'limits' | 'extras') {
        if (tab) setBudgetTab(tab);
        // Populate inline inputs from existing budgets
        const catMap: Record<string, string> = {};
        const tagMap: Record<string, string> = {};
        budgets.forEach(b => {
            if (b.tag_id) tagMap[b.tag_id] = String(b.amount);
            else catMap[b.category_id] = String(b.amount);
        });
        setCatLimits(catMap);
        setTagLimits(tagMap);
        if (budgets.length > 0) setLimitPeriod(budgets[0].period);
        setBudgetsVisible(true);
        setExpandedCats(new Set());

        if (!householdId) return;
        setLoadingSpend(true);

        // Load tags for expense categories
        const { data: tagsData } = await supabase
            .from('category_tags')
            .select('id, category_id, name, sort_order')
            .eq('household_id', householdId)
            .order('sort_order', { ascending: true });

        const tagsMap: Record<string, Array<{ id: string; name: string }>> = {};
        (tagsData ?? []).forEach((t: any) => {
            const cid = t.category_id as string;
            if (!tagsMap[cid]) tagsMap[cid] = [];
            tagsMap[cid].push({ id: t.id, name: t.name });
        });
        setCatTags(tagsMap);

        // Load current-month spending per category and tag
        const now = new Date();
        const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        const { data } = await supabase
            .from('transactions')
            .select('category_id, tag_id, amount_base, amount')
            .eq('household_id', householdId)
            .eq('type', 'expense')
            .eq('is_deleted', false)
            .gte('date', from);
        const spend: Record<string, number> = {};
        const tSpend: Record<string, number> = {};
        (data ?? []).forEach((t: any) => {
            const amt = t.amount_base ?? t.amount;
            if (t.category_id) spend[t.category_id] = (spend[t.category_id] || 0) + amt;
            if (t.tag_id) tSpend[t.tag_id] = (tSpend[t.tag_id] || 0) + amt;
        });
        setCatSpend(spend);
        setTagSpend(tSpend);
        setLoadingSpend(false);

        // Load extras data
        const { data: extrasData } = await supabase
            .from('category_extras')
            .select('category_id, tag_id, comfortable_amount, is_active')
            .eq('household_id', householdId);

        const draft: Record<string, DraftEntry> = {};
        const expenseCats = categories.filter(c => c.type === 'expense');
        expenseCats.forEach(c => {
            draft[`cat:${c.id}`] = { active: false, amount: '' };
            (tagsMap[c.id] ?? []).forEach(t => { draft[`tag:${t.id}`] = { active: false, amount: '' }; });
        });
        (extrasData ?? []).forEach((e: any) => {
            const tagId = e.tag_id as string | null;
            const key = tagId ? `tag:${tagId}` : `cat:${e.category_id}`;
            draft[key] = { active: e.is_active as boolean, amount: String(e.comfortable_amount as number) };
        });
        setExtraDraft(draft);

        // Auto-expand cats that have active extras
        const extExp = new Set<string>();
        expenseCats.forEach(c => {
            const catActive = draft[`cat:${c.id}`]?.active;
            const anyTagActive = (tagsMap[c.id] ?? []).some(t => draft[`tag:${t.id}`]?.active);
            if (catActive || anyTagActive) extExp.add(c.id);
        });
        setExtraExpandedCats(extExp);
    }

    function openBudgetsModalExtras() {
        setBudgetTab('extras');
        openBudgetsModal();
    }

    async function saveExtras() {
        if (!householdId) return;
        setSavingExtras(true);

        const active: { category_id: string; tag_id: string | null; amount: number }[] = [];
        for (const [key, val] of Object.entries(extraDraft)) {
            if (!val.active || !(parseFloat(val.amount) > 0)) continue;
            if (key.startsWith('cat:')) {
                active.push({ category_id: key.slice(4), tag_id: null, amount: parseFloat(val.amount) });
            } else if (key.startsWith('tag:')) {
                const tagId = key.slice(4);
                // Find parent category for this tag
                const parentCatId = Object.entries(catTags).find(([, tags]) => tags.some(t => t.id === tagId))?.[0];
                if (parentCatId) active.push({ category_id: parentCatId, tag_id: tagId, amount: parseFloat(val.amount) });
            }
        }

        await supabase.from('category_extras').delete().eq('household_id', householdId);

        if (active.length > 0) {
            await supabase.from('category_extras').insert(
                active.map(e => ({
                    household_id: householdId,
                    category_id: e.category_id,
                    tag_id: e.tag_id,
                    comfortable_amount: e.amount,
                    currency: baseCurrency,
                    is_active: true,
                }))
            );
        }

        setSavingExtras(false);
        setBudgetsVisible(false);
    }

    async function saveAllBudgets() {
        if (!householdId) return;
        setSavingBudget(true);
        const now = new Date();
        const periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

        const newBudgets: Budget[] = [];

        // Save category-level budgets
        for (const cat of categories.filter(c => c.type === 'expense')) {
            const raw = catLimits[cat.id]?.replace(',', '.').trim();
            const amount = raw ? parseFloat(raw) : NaN;
            const existing = budgets.find(b => b.category_id === cat.id && !b.tag_id);

            if (!isNaN(amount) && amount > 0) {
                if (existing) {
                    await supabase.from('budgets').update({ amount, period: limitPeriod, period_start: periodStart }).eq('id', existing.id);
                    newBudgets.push({ ...existing, amount, period: limitPeriod });
                } else {
                    const { data } = await supabase.from('budgets').insert({
                        household_id: householdId,
                        category_id: cat.id,
                        tag_id: null,
                        amount,
                        currency: baseCurrency,
                        period: limitPeriod,
                        period_start: periodStart,
                    }).select().single();
                    if (data) newBudgets.push(data as Budget);
                }
            } else if (existing) {
                await supabase.from('budgets').delete().eq('id', existing.id);
            }

            // Save tag-level budgets for this category
            const tags = catTags[cat.id] ?? [];
            for (const tag of tags) {
                const tagRaw = tagLimits[tag.id]?.replace(',', '.').trim();
                const tagAmount = tagRaw ? parseFloat(tagRaw) : NaN;
                const tagExisting = budgets.find(b => b.tag_id === tag.id);

                if (!isNaN(tagAmount) && tagAmount > 0) {
                    if (tagExisting) {
                        await supabase.from('budgets').update({ amount: tagAmount, period: limitPeriod, period_start: periodStart }).eq('id', tagExisting.id);
                        newBudgets.push({ ...tagExisting, amount: tagAmount, period: limitPeriod });
                    } else {
                        const { data } = await supabase.from('budgets').insert({
                            household_id: householdId,
                            category_id: cat.id,
                            tag_id: tag.id,
                            amount: tagAmount,
                            currency: baseCurrency,
                            period: limitPeriod,
                            period_start: periodStart,
                        }).select().single();
                        if (data) newBudgets.push(data as Budget);
                    }
                } else if (tagExisting) {
                    await supabase.from('budgets').delete().eq('id', tagExisting.id);
                }
            }
        }
        // Preserve budgets for categories not shown (income etc.)
        const shownIds = new Set(categories.filter(c => c.type === 'expense').map(c => c.id));
        const unchanged = budgets.filter(b => !shownIds.has(b.category_id));
        setBudgets([...unchanged, ...newBudgets]);
        setSavingBudget(false);
        setBudgetsVisible(false);
    }

    // ── Hidden accounts ───────────────────────────────────────────────────────

    async function toggleAccountDashboard(acc: Account) {
        const newVal = !acc.exclude_from_dashboard;
        await supabase.from('accounts').update({ exclude_from_dashboard: newVal }).eq('id', acc.id);
        setAccounts(prev => prev.map(a => a.id === acc.id ? { ...a, exclude_from_dashboard: newVal } : a));
    }

    // ── Export / Import ───────────────────────────────────────────────────────

    async function runExport() {
        if (!householdId) return;
        setExporting(true);
        try {
            await exportTransactions({
                householdId,
                baseCurrency,
                from: exportFrom ? exportFrom.toISOString().slice(0, 10) : null,
                to:   exportTo   ? exportTo.toISOString().slice(0, 10)   : null,
                format: exportFormat,
            });
        } catch (e: any) {
            Alert.alert('Ошибка экспорта', e.message);
        } finally {
            setExporting(false);
        }
    }

    async function pickImportFile() {
        try {
            const result = await pickCSVFile();
            if (!result) return;
            const { headers, rows } = result;
            setImportHeaders(headers);
            setImportDataRows(rows);
            setImportMapping(autoDetectMapping(headers));
            setImportStep('mapping');
        } catch (e: any) {
            Alert.alert('Ошибка', e.message);
        }
    }

    function runValidation() {
        const result = validateRows(importDataRows, importMapping, accounts, categories);
        setImportValid(result.valid);
        setImportErrors(result.errors);
        setImportStep('preview');
    }

    async function runImport() {
        setImporting(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setImporting(false); return; }
        const result = await importRows(importValid, importMapping, householdId, user.id, accounts, categories);
        setImportResult(result);
        setImporting(false);
        setImportStep('done');
    }

    function resetImport() {
        setImportHeaders([]);
        setImportDataRows([]);
        setImportMapping([]);
        setImportStep('idle');
        setImportValid([]);
        setImportErrors([]);
        setImportResult(null);
    }

    // ── Sign out ──────────────────────────────────────────────────────────────

    function signOut() {
        Alert.alert('Выйти из аккаунта?', 'Вы будете перенаправлены на экран входа.', [
            { text: 'Отмена', style: 'cancel' },
            {
                text: 'Выйти', style: 'destructive',
                onPress: async () => { await supabase.auth.signOut(); router.replace('/(auth)/login' as any); },
            },
        ]);
    }

    // ── Preference helpers ────────────────────────────────────────────────────

    function setPref(key: string, value: boolean, setter: (v: boolean) => void) {
        setter(value);
        AsyncStorage.setItem(key, String(value));
    }

    async function updateNotif(patch: Partial<NotifSettings>) {
        const hasPermission = await requestPermissions();
        const updated = { ...notifSettings, ...patch };
        setNotifSettings(updated);
        if (hasPermission) await saveNotifSettings(updated);
        else await AsyncStorage.setItem('notif_settings_v1', JSON.stringify(updated));
    }

    function patchLowBalance(patch: Partial<NotifSettings['lowBalance']>) {
        updateNotif({ lowBalance: { ...notifSettings.lowBalance, ...patch } });
    }
    function patchRecurring(patch: Partial<NotifSettings['recurringPayment']>) {
        updateNotif({ recurringPayment: { ...notifSettings.recurringPayment, ...patch } });
    }
    function patchBudget(patch: Partial<NotifSettings['budget']>) {
        updateNotif({ budget: { ...notifSettings.budget, ...patch } });
    }
    function patchDaily(patch: Partial<NotifSettings['dailySummary']>) {
        updateNotif({ dailySummary: { ...notifSettings.dailySummary, ...patch } });
    }

    // ─────────────────────────────────────────────────────────────────────────

    const currencyInfo = CURRENCIES.find(c => c.code === baseCurrency);
    const filteredCurrencies = CURRENCIES.filter(c =>
        c.code.toLowerCase().includes(currencySearch.toLowerCase()) ||
        c.name.toLowerCase().includes(currencySearch.toLowerCase())
    );
    const hiddenAccounts = accounts.filter(a => a.exclude_from_dashboard);
    const visibleAccounts = accounts.filter(a => !a.exclude_from_dashboard);

    // ─────────────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <View style={{ flex: 1, backgroundColor: '#030712', alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color="#3b82f6" size="large" />
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: '#030712' }}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>

                {/* Header */}
                <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 8 }}>
                    <Text style={{ color: '#fff', fontSize: 28, fontWeight: '700' }}>Настройки</Text>
                </View>

                {/* Profile card */}
                <View style={{ margin: 16, backgroundColor: '#111827', borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                    <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#1d4ed8', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>{initials(displayName)}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }} numberOfLines={1}>{displayName}</Text>
                        <Text style={{ color: '#6b7280', fontSize: 13, marginTop: 2 }} numberOfLines={1}>{email}</Text>
                    </View>
                    <TouchableOpacity onPress={() => { setNameInput(displayName); setEditNameVisible(true); }}
                        style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center' }}>
                        <Pencil color="#9ca3af" size={16} />
                    </TouchableOpacity>
                </View>

                {/* Финансы */}
                <SectionHeader label="ФИНАНСЫ" />
                <SectionCard>
                    <SettingRow
                        icon={<Globe color="#60a5fa" size={17} />}
                        label="Базовая валюта"
                        value={currencyInfo ? `${currencyInfo.flag} ${currencyInfo.code}` : baseCurrency}
                        onPress={() => setCurrencyVisible(true)}
                    />
                    <Divider />
                    <SettingRow
                        icon={<BarChart2 color="#34d399" size={17} />}
                        label="Категории и лимиты"
                        onPress={openBudgetsModal}
                    />
                    <Divider />
                    <SettingRow
                        icon={<Clock color="#f59e0b" size={17} />}
                        label="Платежи"
                        onPress={() => router.push('/(app)/settings/payments')}
                    />
                </SectionCard>

                {/* Отображение */}
                <SectionHeader label="ОТОБРАЖЕНИЕ" />
                <SectionCard>
                    <SettingRow
                        icon={darkMode ? <Moon color="#a78bfa" size={17} /> : <Sun color="#fbbf24" size={17} />}
                        label="Тёмная тема"
                        right={
                            <Switch value={darkMode} onValueChange={v => setPref('darkMode', v, setDarkMode)}
                                trackColor={{ false: '#374151', true: '#2563eb' }} thumbColor="#fff" />
                        }
                    />
                    <Divider />
                    <SettingRow
                        icon={<HelpCircle color="#34d399" size={17} />}
                        label="Контекстные подсказки"
                        right={
                            <Switch value={hints} onValueChange={v => setPref('hints', v, setHints)}
                                trackColor={{ false: '#374151', true: '#2563eb' }} thumbColor="#fff" />
                        }
                    />
                </SectionCard>

                {/* Уведомления */}
                <SectionHeader label="УВЕДОМЛЕНИЯ" />
                <SectionCard>
                    <SettingRow
                        icon={<Bell color="#f59e0b" size={17} />}
                        label="Уведомления"
                        onPress={() => setNotifVisible(true)}
                    />
                </SectionCard>

                {/* Данные */}
                <SectionHeader label="ДАННЫЕ" />
                <SectionCard>
                    <SettingRow
                        icon={<User color="#a78bfa" size={17} />}
                        label="Управление категориями"
                        onPress={() => setCatsVisible(true)}
                    />
                    <Divider />
                    <SettingRow
                        icon={<EyeOff color="#6b7280" size={17} />}
                        label="Скрытые счета"
                        onPress={() => setHiddenVisible(true)}
                    />
                    <Divider />
                    <SettingRow
                        icon={<Database color="#34d399" size={17} />}
                        label="Импорт / Экспорт"
                        onPress={() => { setIoTab('export'); setIoVisible(true); }}
                    />
                </SectionCard>

                {/* Безопасность */}
                <SectionHeader label="БЕЗОПАСНОСТЬ" />
                <SectionCard>
                    <SettingRow
                        icon={<Key color="#f97316" size={17} />}
                        label="Изменить пароль"
                        onPress={() => setPwVisible(true)}
                    />
                </SectionCard>

                {/* Выйти */}
                <View style={{ marginTop: 28, marginHorizontal: 16 }}>
                    <TouchableOpacity onPress={signOut}
                        style={{ backgroundColor: '#111827', borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1.5, borderColor: '#ef444433' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <LogOut color="#ef4444" size={18} />
                            <Text style={{ color: '#ef4444', fontSize: 16, fontWeight: '600' }}>Выйти из аккаунта</Text>
                        </View>
                    </TouchableOpacity>
                </View>

            </ScrollView>

            {/* ════ Modal: Edit Name ════ */}
            <BaseBottomSheet visible={editNameVisible} onClose={() => setEditNameVisible(false)} scrollable={false}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>Имя профиля</Text>
                            <TouchableOpacity onPress={() => setEditNameVisible(false)} hitSlop={8}><X color="#6b7280" size={20} /></TouchableOpacity>
                        </View>
                        <TextInput
                            value={nameInput} onChangeText={setNameInput}
                            placeholder="Ваше имя" placeholderTextColor="#4b5563" autoFocus
                            style={{ backgroundColor: '#1f2937', color: '#fff', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, marginBottom: 16 }}
                        />
                        <TouchableOpacity onPress={saveName} disabled={savingName}
                            style={{ backgroundColor: '#2563eb', borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}>
                            {savingName ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Сохранить</Text>}
                        </TouchableOpacity>
            </BaseBottomSheet>

            {/* ════ Modal: Change Password ════ */}
            <BaseBottomSheet visible={pwVisible} onClose={closePwModal} scrollable={false}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>
                                {pwStep === 1 ? 'Введите текущий пароль' : 'Новый пароль'}
                            </Text>
                            <TouchableOpacity onPress={closePwModal} hitSlop={8}><X color="#6b7280" size={20} /></TouchableOpacity>
                        </View>

                        {pwStep === 1 ? (
                            <>
                                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1f2937', borderRadius: 14, marginBottom: 4 }}>
                                    <TextInput
                                        value={pwCurrent}
                                        onChangeText={v => { setPwCurrent(v); setPwError(''); }}
                                        placeholder="Текущий пароль" placeholderTextColor="#4b5563"
                                        secureTextEntry={!showCurrent} autoFocus
                                        style={{ flex: 1, color: '#fff', paddingHorizontal: 16, paddingVertical: 14, fontSize: 16 }}
                                    />
                                    <TouchableOpacity onPress={() => setShowCurrent(!showCurrent)} hitSlop={8} style={{ paddingRight: 14 }}>
                                        {showCurrent ? <EyeOff color="#6b7280" size={20} /> : <Eye color="#6b7280" size={20} />}
                                    </TouchableOpacity>
                                </View>
                                {pwError !== '' && (
                                    <Text style={{ color: '#ef4444', fontSize: 13, marginTop: 6, marginBottom: 4, marginLeft: 4 }}>{pwError}</Text>
                                )}
                                <TouchableOpacity onPress={verifyCurrentPassword} disabled={savingPw}
                                    style={{ backgroundColor: '#2563eb', borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 16 }}>
                                    {savingPw ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Далее</Text>}
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1f2937', borderRadius: 14, marginBottom: 12 }}>
                                    <TextInput
                                        value={pwNew}
                                        onChangeText={v => { setPwNew(v); setPwError(''); }}
                                        placeholder="Новый пароль" placeholderTextColor="#4b5563"
                                        secureTextEntry={!showNew} autoFocus
                                        style={{ flex: 1, color: '#fff', paddingHorizontal: 16, paddingVertical: 14, fontSize: 16 }}
                                    />
                                    <TouchableOpacity onPress={() => setShowNew(!showNew)} hitSlop={8} style={{ paddingRight: 14 }}>
                                        {showNew ? <EyeOff color="#6b7280" size={20} /> : <Eye color="#6b7280" size={20} />}
                                    </TouchableOpacity>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1f2937', borderRadius: 14, marginBottom: 4 }}>
                                    <TextInput
                                        value={pwConfirm}
                                        onChangeText={v => { setPwConfirm(v); setPwError(''); }}
                                        placeholder="Подтвердите пароль" placeholderTextColor="#4b5563"
                                        secureTextEntry={!showConfirm}
                                        style={{ flex: 1, color: '#fff', paddingHorizontal: 16, paddingVertical: 14, fontSize: 16 }}
                                    />
                                    <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} hitSlop={8} style={{ paddingRight: 14 }}>
                                        {showConfirm ? <EyeOff color="#6b7280" size={20} /> : <Eye color="#6b7280" size={20} />}
                                    </TouchableOpacity>
                                </View>
                                {pwError !== '' && (
                                    <Text style={{ color: '#ef4444', fontSize: 13, marginTop: 6, marginBottom: 4, marginLeft: 4 }}>{pwError}</Text>
                                )}
                                <TouchableOpacity onPress={saveNewPassword} disabled={savingPw}
                                    style={{ backgroundColor: '#2563eb', borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 16 }}>
                                    {savingPw ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Сохранить</Text>}
                                </TouchableOpacity>
                            </>
                        )}
            </BaseBottomSheet>

            {/* ════ Modal: Base Currency ════ */}
            <BaseBottomSheet visible={currencyVisible} onClose={() => setCurrencyVisible(false)} maxHeight="80%">
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>Базовая валюта</Text>
                            <TouchableOpacity onPress={() => setCurrencyVisible(false)} hitSlop={8}><X color="#6b7280" size={20} /></TouchableOpacity>
                        </View>
                        <View style={{ backgroundColor: '#1f2937', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <TextInput
                                value={currencySearch} onChangeText={setCurrencySearch}
                                placeholder="Поиск…" placeholderTextColor="#4b5563"
                                style={{ flex: 1, color: '#fff', fontSize: 15 }}
                            />
                            {currencySearch !== '' && (
                                <TouchableOpacity onPress={() => setCurrencySearch('')}><X color="#6b7280" size={16} /></TouchableOpacity>
                            )}
                        </View>
                        {savingCurrency && <ActivityIndicator color="#3b82f6" style={{ marginBottom: 12 }} />}
                            {filteredCurrencies.map(c => {
                                const active = c.code === baseCurrency;
                                return (
                                    <TouchableOpacity key={c.code} onPress={() => confirmCurrency(c.code)}
                                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1f2937' }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                            <Text style={{ fontSize: 22 }}>{c.flag}</Text>
                                            <View>
                                                <Text style={{ color: active ? '#60a5fa' : '#e5e7eb', fontSize: 16, fontWeight: active ? '600' : '400' }}>{c.code}</Text>
                                                <Text style={{ color: '#6b7280', fontSize: 12 }}>{c.name}</Text>
                                            </View>
                                        </View>
                                        {active && <Check color="#3b82f6" size={18} />}
                                    </TouchableOpacity>
                                );
                            })}
            </BaseBottomSheet>

            {/* ════ Modal: Categories ════ */}
            <BaseBottomSheet visible={catsVisible} onClose={() => setCatsVisible(false)} maxHeight="90%">
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>Категории</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                                <TouchableOpacity onPress={openCreateCat} hitSlop={8}>
                                    <Plus color="#3b82f6" size={22} />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setCatsVisible(false)} hitSlop={8}><X color="#6b7280" size={20} /></TouchableOpacity>
                            </View>
                        </View>

                        {/* Tab */}
                        <View style={{ flexDirection: 'row', backgroundColor: '#1f2937', borderRadius: 12, padding: 3, marginBottom: 16 }}>
                            {(['expense', 'income'] as const).map(tab => (
                                <TouchableOpacity key={tab} onPress={() => setCatsTab(tab)}
                                    style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: catsTab === tab ? '#374151' : 'transparent' }}>
                                    <Text style={{ color: catsTab === tab ? '#fff' : '#6b7280', fontSize: 14, fontWeight: catsTab === tab ? '600' : '400' }}>
                                        {tab === 'expense' ? 'Расходы' : 'Доходы'}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                            {categories.filter(c => c.type === catsTab).map(cat => (
                                <View key={cat.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1f2937' }}>
                                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: cat.color ?? '#6b7280', marginRight: 12 }} />
                                    <Text style={{ flex: 1, color: cat.is_hidden ? '#4b5563' : '#e5e7eb', fontSize: 15 }}>{cat.name}</Text>
                                    <TouchableOpacity onPress={() => openEditCat(cat)} hitSlop={8} style={{ marginRight: 12 }}>
                                        <Pencil color="#6b7280" size={15} />
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => toggleCategoryHidden(cat)} hitSlop={8}>
                                        {cat.is_hidden
                                            ? <EyeOff color="#4b5563" size={18} />
                                            : <Eye color="#9ca3af" size={18} />}
                                    </TouchableOpacity>
                                </View>
                            ))}
            </BaseBottomSheet>

            {/* ════ Modal: Edit Category ════ */}
            <BaseBottomSheet visible={editCat !== null} onClose={() => { setEditCat(null); setCatsVisible(true); }} scrollable={false}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>Редактировать категорию</Text>
                            <TouchableOpacity onPress={() => { setEditCat(null); setCatsVisible(true); }} hitSlop={8}><X color="#6b7280" size={20} /></TouchableOpacity>
                        </View>

                        <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 8 }}>НАЗВАНИЕ</Text>
                        <TextInput
                            value={editCatName} onChangeText={setEditCatName}
                            placeholder="Название категории" placeholderTextColor="#4b5563" autoFocus
                            style={{ backgroundColor: '#1f2937', color: '#fff', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, marginBottom: 20 }}
                        />

                        <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 10 }}>ЦВЕТ</Text>
                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                            {COLORS.map(c => (
                                <TouchableOpacity key={c} onPress={() => setEditCatColor(c)}
                                    style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c, alignItems: 'center', justifyContent: 'center', borderWidth: editCatColor === c ? 3 : 0, borderColor: '#fff' }}>
                                    {editCatColor === c && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' }} />}
                                </TouchableOpacity>
                            ))}
                        </View>

                        {editCat?.type === 'expense' && (
                            <>
                                <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 10 }}>ТИП РАСХОДА</Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                                    {EXPENSE_TYPES.map(et => (
                                        <TouchableOpacity key={et.value} onPress={() => setEditCatExpType(editCatExpType === et.value ? null : et.value)}
                                            style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: editCatExpType === et.value ? '#3b82f6' : '#374151', backgroundColor: editCatExpType === et.value ? '#172554' : '#1f2937' }}>
                                            <Text style={{ color: editCatExpType === et.value ? '#60a5fa' : '#9ca3af', fontSize: 13 }}>{et.label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </>
                        )}

                        <TouchableOpacity onPress={saveCategory} disabled={savingCat}
                            style={{ backgroundColor: '#2563eb', borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}>
                            {savingCat ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Сохранить</Text>}
                        </TouchableOpacity>

                        <TouchableOpacity onPress={confirmDeleteCategory} disabled={savingCat}
                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, paddingVertical: 12 }}>
                            <Trash2 color="#ef4444" size={16} />
                            <Text style={{ color: '#ef4444', fontSize: 14, fontWeight: '500' }}>Удалить категорию</Text>
                        </TouchableOpacity>
            </BaseBottomSheet>

            {/* ════ Modal: Create Category ════ */}
            <BaseBottomSheet visible={creatingCat} onClose={() => { setCreatingCat(false); setCatsVisible(true); }} scrollable={false}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>Новая категория</Text>
                            <TouchableOpacity onPress={() => { setCreatingCat(false); setCatsVisible(true); }} hitSlop={8}><X color="#6b7280" size={20} /></TouchableOpacity>
                        </View>

                        <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 8 }}>НАЗВАНИЕ</Text>
                        <TextInput
                            value={editCatName} onChangeText={setEditCatName}
                            placeholder="Название категории" placeholderTextColor="#4b5563" autoFocus
                            style={{ backgroundColor: '#1f2937', color: '#fff', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, marginBottom: 20 }}
                        />

                        <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 10 }}>ЦВЕТ</Text>
                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                            {COLORS.map(c => (
                                <TouchableOpacity key={c} onPress={() => setEditCatColor(c)}
                                    style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c, alignItems: 'center', justifyContent: 'center', borderWidth: editCatColor === c ? 3 : 0, borderColor: '#fff' }}>
                                    {editCatColor === c && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' }} />}
                                </TouchableOpacity>
                            ))}
                        </View>

                        {catsTab === 'expense' && (
                            <>
                                <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 10 }}>ТИП РАСХОДА</Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                                    {EXPENSE_TYPES.map(et => (
                                        <TouchableOpacity key={et.value} onPress={() => setEditCatExpType(editCatExpType === et.value ? null : et.value)}
                                            style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: editCatExpType === et.value ? '#3b82f6' : '#374151', backgroundColor: editCatExpType === et.value ? '#172554' : '#1f2937' }}>
                                            <Text style={{ color: editCatExpType === et.value ? '#60a5fa' : '#9ca3af', fontSize: 13 }}>{et.label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </>
                        )}

                        <TouchableOpacity onPress={createCategory} disabled={savingCat || !editCatName.trim()}
                            style={{ backgroundColor: editCatName.trim() ? '#2563eb' : '#1e3a5f', borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}>
                            {savingCat ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Создать</Text>}
                        </TouchableOpacity>
            </BaseBottomSheet>

            {/* ════ Modal: Category Limits ════ */}
            <BaseBottomSheet visible={budgetsVisible} onClose={() => setBudgetsVisible(false)} maxHeight="90%" scrollable={false} style={{ paddingHorizontal: 0 }}>

                        {/* Header */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, marginBottom: 12 }}>
                            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>Категории и лимиты</Text>
                            <TouchableOpacity onPress={() => setBudgetsVisible(false)} hitSlop={8}><X color="#6b7280" size={20} /></TouchableOpacity>
                        </View>

                        {/* Main tabs: Лимиты / Экстра */}
                        <View style={{ flexDirection: 'row', marginHorizontal: 24, backgroundColor: '#1f2937', borderRadius: 12, padding: 3, marginBottom: 12 }}>
                            {([{ id: 'limits' as const, label: 'Лимиты' }, { id: 'extras' as const, label: 'Экстра' }]).map(t => (
                                <TouchableOpacity key={t.id} onPress={() => setBudgetTab(t.id)}
                                    style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: budgetTab === t.id ? '#374151' : 'transparent' }}>
                                    <Text style={{ color: budgetTab === t.id ? '#fff' : '#6b7280', fontSize: 14, fontWeight: budgetTab === t.id ? '600' : '400' }}>
                                        {t.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Period toggle (limits tab only) */}
                        {budgetTab === 'limits' && (
                            <View style={{ flexDirection: 'row', marginHorizontal: 24, backgroundColor: '#1f2937', borderRadius: 12, padding: 3, marginBottom: 16 }}>
                                {(['monthly', 'yearly'] as const).map(p => (
                                    <TouchableOpacity key={p} onPress={() => setLimitPeriod(p)}
                                        style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: limitPeriod === p ? '#374151' : 'transparent' }}>
                                        <Text style={{ color: limitPeriod === p ? '#fff' : '#6b7280', fontSize: 14, fontWeight: limitPeriod === p ? '600' : '400' }}>
                                            {p === 'monthly' ? 'В месяц' : 'В год'}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}

                        {/* ── Limits tab ── */}
                        {budgetTab === 'limits' && (
                        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                            {categories.filter(c => c.type === 'expense').length === 0 && (
                                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                                    <Text style={{ color: '#6b7280', fontSize: 15 }}>Нет категорий расходов</Text>
                                    <Text style={{ color: '#4b5563', fontSize: 13, marginTop: 6 }}>Создайте категории в разделе «Данные»</Text>
                                </View>
                            )}
                            {categories.filter(c => c.type === 'expense').map(cat => {
                                const spent = catSpend[cat.id] ?? 0;
                                const limitVal = parseFloat((catLimits[cat.id] ?? '').replace(',', '.'));
                                const hasLimit = !isNaN(limitVal) && limitVal > 0;
                                const ratio = hasLimit ? spent / limitVal : 0;
                                const overBudget = ratio > 1;
                                const barColor = overBudget ? '#ef4444' : ratio > 0.75 ? '#f59e0b' : '#34d399';
                                const tags = catTags[cat.id] ?? [];
                                const hasTags = tags.length > 0;
                                const isExpanded = expandedCats.has(cat.id);

                                return (
                                    <View key={cat.id} style={{ borderBottomWidth: 1, borderBottomColor: '#1f2937' }}>
                                        {/* Category row */}
                                        <View style={{ paddingHorizontal: 24, paddingVertical: 14 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: cat.color ?? '#6b7280', marginRight: 10 }} />
                                                <Text style={{ flex: 1, color: '#e5e7eb', fontSize: 15, fontWeight: '500' }}>{cat.name}</Text>
                                                {!loadingSpend && hasLimit && (
                                                    <Text style={{ color: overBudget ? '#ef4444' : '#6b7280', fontSize: 12, fontWeight: overBudget ? '700' : '400' }}>
                                                        {spent.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} / {limitVal.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}
                                                    </Text>
                                                )}
                                                {hasTags && (
                                                    <TouchableOpacity
                                                        onPress={() => setExpandedCats(prev => {
                                                            const next = new Set(prev);
                                                            next.has(cat.id) ? next.delete(cat.id) : next.add(cat.id);
                                                            return next;
                                                        })}
                                                        style={{ marginLeft: 8, padding: 4 }}
                                                    >
                                                        <ChevronDown color="#6b7280" size={16} style={{ transform: [{ rotate: isExpanded ? '180deg' : '0deg' }] }} />
                                                    </TouchableOpacity>
                                                )}
                                            </View>

                                            {/* Limit input */}
                                            <TextInput
                                                value={catLimits[cat.id] ?? ''}
                                                onChangeText={v => setCatLimits(prev => ({ ...prev, [cat.id]: v }))}
                                                placeholder={`Лимит в ${baseCurrency}`}
                                                placeholderTextColor="#4b5563"
                                                keyboardType="numeric"
                                                style={{
                                                    backgroundColor: '#1f2937',
                                                    color: '#fff',
                                                    borderRadius: 12,
                                                    paddingHorizontal: 14,
                                                    paddingVertical: 10,
                                                    fontSize: 16,
                                                    fontWeight: '600',
                                                    borderWidth: 1.5,
                                                    borderColor: hasLimit ? (overBudget ? '#ef4444' : '#2563eb') : '#374151',
                                                }}
                                            />

                                            {/* Thin progress bar */}
                                            {hasLimit && (
                                                <View style={{ height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.06)', marginTop: 8, overflow: 'hidden' }}>
                                                    <View style={{ height: 3, borderRadius: 1.5, width: `${Math.min(ratio * 100, 100)}%`, backgroundColor: barColor }} />
                                                </View>
                                            )}
                                        </View>

                                        {/* Subcategory tags (accordion) */}
                                        {hasTags && isExpanded && (
                                            <View style={{ paddingLeft: 44, paddingRight: 24, paddingBottom: 14 }}>
                                                {tags.map(tag => {
                                                    const tSpent = tagSpend[tag.id] ?? 0;
                                                    const tLimitVal = parseFloat((tagLimits[tag.id] ?? '').replace(',', '.'));
                                                    const tHasLimit = !isNaN(tLimitVal) && tLimitVal > 0;
                                                    const tRatio = tHasLimit ? tSpent / tLimitVal : 0;
                                                    const tOver = tRatio > 1;
                                                    const tBarColor = tOver ? '#ef4444' : tRatio > 0.75 ? '#f59e0b' : '#34d399';

                                                    return (
                                                        <View key={tag.id} style={{ marginBottom: 10 }}>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                                                                <Text style={{ color: '#4b5563', fontSize: 12, marginRight: 6 }}>└</Text>
                                                                <Text style={{ flex: 1, color: '#9ca3af', fontSize: 13 }}>{tag.name}</Text>
                                                                {!loadingSpend && tHasLimit && (
                                                                    <Text style={{ color: tOver ? '#ef4444' : '#6b7280', fontSize: 11, fontWeight: tOver ? '700' : '400' }}>
                                                                        {tSpent.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} / {tLimitVal.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}
                                                                    </Text>
                                                                )}
                                                            </View>
                                                            <TextInput
                                                                value={tagLimits[tag.id] ?? ''}
                                                                onChangeText={v => setTagLimits(prev => ({ ...prev, [tag.id]: v }))}
                                                                placeholder={`Лимит в ${baseCurrency}`}
                                                                placeholderTextColor="#4b5563"
                                                                keyboardType="numeric"
                                                                style={{
                                                                    backgroundColor: '#1a2235',
                                                                    color: '#fff',
                                                                    borderRadius: 10,
                                                                    paddingHorizontal: 12,
                                                                    paddingVertical: 8,
                                                                    fontSize: 14,
                                                                    fontWeight: '600',
                                                                    borderWidth: 1,
                                                                    borderColor: tHasLimit ? (tOver ? '#ef4444' : '#2563eb55') : '#374151',
                                                                }}
                                                            />
                                                            {tHasLimit && (
                                                                <View style={{ height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.04)', marginTop: 6, overflow: 'hidden' }}>
                                                                    <View style={{ height: 2, borderRadius: 1, width: `${Math.min(tRatio * 100, 100)}%`, backgroundColor: tBarColor }} />
                                                                </View>
                                                            )}
                                                        </View>
                                                    );
                                                })}
                                            </View>
                                        )}
                                    </View>
                                );
                            })}
                            <View style={{ height: 16 }} />
                        </ScrollView>
                        )}

                        {/* ── Extras tab ── */}
                        {budgetTab === 'extras' && (
                        <>
                            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', paddingHorizontal: 24, marginBottom: 12 }}>
                                Отметь категории где есть{'\n'}пространство для экономии
                            </Text>
                            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                                {categories.filter(c => c.type === 'expense').map(cat => {
                                    const catDraft = extraDraft[`cat:${cat.id}`];
                                    const tags = catTags[cat.id] ?? [];
                                    const hasTags = tags.length > 0;
                                    const isExpanded = extraExpandedCats.has(cat.id);
                                    const anyActive = catDraft?.active || tags.some(t => extraDraft[`tag:${t.id}`]?.active);

                                    return (
                                        <View key={cat.id} style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}>
                                            {/* Category row */}
                                            <TouchableOpacity
                                                activeOpacity={0.7}
                                                onPress={() => {
                                                    if (hasTags) {
                                                        setExtraExpandedCats(prev => {
                                                            const next = new Set(prev);
                                                            next.has(cat.id) ? next.delete(cat.id) : next.add(cat.id);
                                                            return next;
                                                        });
                                                    }
                                                }}
                                                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 24 }}
                                            >
                                                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: (cat.color ?? '#6b7280') + '22', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                                                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: cat.color ?? '#6b7280' }} />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ fontSize: 14, color: '#fff' }}>{cat.name}</Text>
                                                    {hasTags && (
                                                        <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>
                                                            {isExpanded ? '▼' : '▶'} {tags.length} подкатегори{tags.length === 1 ? 'я' : tags.length < 5 ? 'и' : 'й'}
                                                        </Text>
                                                    )}
                                                </View>
                                                {/* Category-level toggle (only if no tags) */}
                                                {!hasTags && catDraft && (
                                                    <>
                                                        {catDraft.active && (
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 10 }}>
                                                                <TextInput
                                                                    style={{ width: 70, height: 32, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, color: '#fff', fontSize: 13, textAlign: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}
                                                                    keyboardType="numeric"
                                                                    placeholder="0"
                                                                    placeholderTextColor="rgba(255,255,255,0.2)"
                                                                    value={catDraft.amount}
                                                                    onChangeText={v => setExtraDraft(prev => ({ ...prev, [`cat:${cat.id}`]: { ...prev[`cat:${cat.id}`], amount: v } }))}
                                                                />
                                                                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 4 }}>/мес</Text>
                                                            </View>
                                                        )}
                                                        <Switch
                                                            value={catDraft.active}
                                                            onValueChange={v => setExtraDraft(prev => ({ ...prev, [`cat:${cat.id}`]: { ...prev[`cat:${cat.id}`], active: v } }))}
                                                            trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(124,111,255,0.4)' }}
                                                            thumbColor={catDraft.active ? '#7C6FFF' : '#555'}
                                                        />
                                                    </>
                                                )}
                                                {hasTags && anyActive && (
                                                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#7C6FFF', marginLeft: 8 }} />
                                                )}
                                            </TouchableOpacity>

                                            {/* Expanded tags */}
                                            {hasTags && isExpanded && (
                                                <View style={{ paddingLeft: 48, paddingRight: 24, paddingBottom: 8 }}>
                                                    {/* Whole-category toggle */}
                                                    {catDraft && (
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
                                                            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginRight: 4 }}>└</Text>
                                                            <Text style={{ flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Вся категория</Text>
                                                            {catDraft.active && (
                                                                <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 10 }}>
                                                                    <TextInput
                                                                        style={{ width: 60, height: 28, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6, color: '#fff', fontSize: 12, textAlign: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}
                                                                        keyboardType="numeric" placeholder="0" placeholderTextColor="rgba(255,255,255,0.2)"
                                                                        value={catDraft.amount}
                                                                        onChangeText={v => setExtraDraft(prev => ({ ...prev, [`cat:${cat.id}`]: { ...prev[`cat:${cat.id}`], amount: v } }))}
                                                                    />
                                                                    <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginLeft: 3 }}>/мес</Text>
                                                                </View>
                                                            )}
                                                            <Switch
                                                                value={catDraft.active}
                                                                onValueChange={v => setExtraDraft(prev => ({ ...prev, [`cat:${cat.id}`]: { ...prev[`cat:${cat.id}`], active: v } }))}
                                                                trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(124,111,255,0.4)' }}
                                                                thumbColor={catDraft.active ? '#7C6FFF' : '#555'}
                                                                style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                                                            />
                                                        </View>
                                                    )}
                                                    {/* Individual tags */}
                                                    {tags.map(tag => {
                                                        const tagDraft = extraDraft[`tag:${tag.id}`];
                                                        if (!tagDraft) return null;
                                                        return (
                                                            <View key={tag.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
                                                                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginRight: 4 }}>└</Text>
                                                                <Text style={{ flex: 1, fontSize: 13, color: '#fff' }}>{tag.name}</Text>
                                                                {tagDraft.active && (
                                                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 10 }}>
                                                                        <TextInput
                                                                            style={{ width: 60, height: 28, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6, color: '#fff', fontSize: 12, textAlign: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}
                                                                            keyboardType="numeric" placeholder="0" placeholderTextColor="rgba(255,255,255,0.2)"
                                                                            value={tagDraft.amount}
                                                                            onChangeText={v => setExtraDraft(prev => ({ ...prev, [`tag:${tag.id}`]: { ...prev[`tag:${tag.id}`], amount: v } }))}
                                                                        />
                                                                        <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginLeft: 3 }}>/мес</Text>
                                                                    </View>
                                                                )}
                                                                <Switch
                                                                    value={tagDraft.active}
                                                                    onValueChange={v => setExtraDraft(prev => ({ ...prev, [`tag:${tag.id}`]: { ...prev[`tag:${tag.id}`], active: v } }))}
                                                                    trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(124,111,255,0.4)' }}
                                                                    thumbColor={tagDraft.active ? '#7C6FFF' : '#555'}
                                                                    style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                                                                />
                                                            </View>
                                                        );
                                                    })}
                                                </View>
                                            )}
                                        </View>
                                    );
                                })}
                                <View style={{ height: 16 }} />
                            </ScrollView>
                        </>
                        )}

                        {/* Save button */}
                        <View style={{ paddingHorizontal: 24, paddingTop: 12 }}>
                            <TouchableOpacity
                                onPress={budgetTab === 'limits' ? saveAllBudgets : saveExtras}
                                disabled={budgetTab === 'limits' ? savingBudget : savingExtras}
                                style={{ backgroundColor: budgetTab === 'limits' ? '#2563eb' : '#7C6FFF', borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}>
                                {(budgetTab === 'limits' ? savingBudget : savingExtras)
                                    ? <ActivityIndicator color="#fff" />
                                    : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Сохранить</Text>}
                            </TouchableOpacity>
                        </View>
            </BaseBottomSheet>

            {/* ════ Modal: Hidden Accounts ════ */}
            <BaseBottomSheet visible={hiddenVisible} onClose={() => setHiddenVisible(false)} maxHeight="75%" style={{ paddingHorizontal: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, marginBottom: 8 }}>
                            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>Скрытые счета</Text>
                            <TouchableOpacity onPress={() => setHiddenVisible(false)} hitSlop={8}><X color="#6b7280" size={20} /></TouchableOpacity>
                        </View>
                        <Text style={{ color: '#6b7280', fontSize: 13, paddingHorizontal: 24, marginBottom: 16 }}>Скрытые счета не отображаются на главном экране</Text>
                            {accounts.length === 0 && (
                                <Text style={{ color: '#4b5563', fontSize: 15, textAlign: 'center', marginTop: 20 }}>Нет счетов</Text>
                            )}
                            {[...visibleAccounts, ...hiddenAccounts].map(acc => (
                                <View key={acc.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1f2937' }}>
                                    {acc.color && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: acc.color, marginRight: 12 }} />}
                                    <Text style={{ flex: 1, color: acc.exclude_from_dashboard ? '#4b5563' : '#e5e7eb', fontSize: 15 }}>{acc.name}</Text>
                                    <Text style={{ color: '#6b7280', fontSize: 13, marginRight: 12 }}>{acc.currency}</Text>
                                    <TouchableOpacity onPress={() => toggleAccountDashboard(acc)} hitSlop={8}>
                                        {acc.exclude_from_dashboard
                                            ? <EyeOff color="#4b5563" size={18} />
                                            : <Eye color="#9ca3af" size={18} />}
                                    </TouchableOpacity>
                                </View>
                            ))}
            </BaseBottomSheet>

            {/* ════ Modal: Import / Export ════ */}
            <BaseBottomSheet visible={ioVisible} onClose={() => { setIoVisible(false); resetImport(); }} maxHeight="92%" scrollable={false} style={{ paddingHorizontal: 0 }}>

                        {/* Header */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, marginBottom: 16 }}>
                            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>Импорт / Экспорт</Text>
                            <TouchableOpacity onPress={() => { setIoVisible(false); resetImport(); }} hitSlop={8}><X color="#6b7280" size={20} /></TouchableOpacity>
                        </View>

                        {/* Tabs */}
                        <View style={{ flexDirection: 'row', marginHorizontal: 24, backgroundColor: '#1f2937', borderRadius: 12, padding: 3, marginBottom: 20 }}>
                            {(['export', 'import'] as const).map(tab => (
                                <TouchableOpacity key={tab} onPress={() => { setIoTab(tab); resetImport(); }}
                                    style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: ioTab === tab ? '#374151' : 'transparent' }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        {tab === 'export' ? <ArrowUpFromLine color={ioTab === tab ? '#fff' : '#6b7280'} size={14} /> : <ArrowDownToLine color={ioTab === tab ? '#fff' : '#6b7280'} size={14} />}
                                        <Text style={{ color: ioTab === tab ? '#fff' : '#6b7280', fontSize: 14, fontWeight: ioTab === tab ? '600' : '400' }}>
                                            {tab === 'export' ? 'Экспорт' : 'Импорт'}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 8 }}>

                            {/* ══ EXPORT tab ══ */}
                            {ioTab === 'export' && (
                                <View>
                                    {/* Date range */}
                                    <Text style={{ color: '#6b7280', fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 10 }}>ДИАПАЗОН ДАТ</Text>
                                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                                        <TouchableOpacity onPress={() => setShowExpFrom(true)}
                                            style={{ flex: 1, backgroundColor: '#1f2937', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <Text style={{ color: exportFrom ? '#e5e7eb' : '#4b5563', fontSize: 14 }}>
                                                {exportFrom ? exportFrom.toISOString().slice(0, 10) : 'С начала'}
                                            </Text>
                                            <ChevronDown color="#4b5563" size={14} />
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => setShowExpTo(true)}
                                            style={{ flex: 1, backgroundColor: '#1f2937', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <Text style={{ color: exportTo ? '#e5e7eb' : '#4b5563', fontSize: 14 }}>
                                                {exportTo ? exportTo.toISOString().slice(0, 10) : 'По сегодня'}
                                            </Text>
                                            <ChevronDown color="#4b5563" size={14} />
                                        </TouchableOpacity>
                                    </View>
                                    {showExpFrom && (
                                        <DateTimePicker mode="date" display="inline" themeVariant="dark"
                                            value={exportFrom ?? new Date()}
                                            onChange={(_, d) => { setShowExpFrom(false); if (d) setExportFrom(d); }} />
                                    )}
                                    {showExpTo && (
                                        <DateTimePicker mode="date" display="inline" themeVariant="dark"
                                            value={exportTo ?? new Date()}
                                            onChange={(_, d) => { setShowExpTo(false); if (d) setExportTo(d); }} />
                                    )}

                                    {/* Format */}
                                    <Text style={{ color: '#6b7280', fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 10 }}>ФОРМАТ</Text>
                                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
                                        {(['csv', 'json'] as const).map(fmt => (
                                            <TouchableOpacity key={fmt} onPress={() => setExportFormat(fmt)}
                                                style={{ flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1.5, borderColor: exportFormat === fmt ? '#3b82f6' : '#374151', backgroundColor: exportFormat === fmt ? '#172554' : '#1f2937' }}>
                                                <Text style={{ color: exportFormat === fmt ? '#60a5fa' : '#9ca3af', fontSize: 14, fontWeight: '600' }}>{fmt.toUpperCase()}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    {/* CSV preview */}
                                    {exportFormat === 'csv' && (
                                        <View style={{ backgroundColor: '#0f172a', borderRadius: 12, padding: 12, marginBottom: 20 }}>
                                            <Text style={{ color: '#4b5563', fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 6 }}>СТРУКТУРА CSV</Text>
                                            <Text style={{ color: '#374151', fontSize: 10, fontFamily: 'monospace' }}>
                                                {'date,type,expense_type,amount,currency,\namount_base,base_currency,account,\ncategory,note,recurring'}
                                            </Text>
                                        </View>
                                    )}

                                    <TouchableOpacity onPress={runExport} disabled={exporting}
                                        style={{ backgroundColor: '#2563eb', borderRadius: 16, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                                        {exporting
                                            ? <ActivityIndicator color="#fff" />
                                            : <>
                                                <ArrowUpFromLine color="#fff" size={16} />
                                                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Экспортировать</Text>
                                              </>
                                        }
                                    </TouchableOpacity>
                                </View>
                            )}

                            {/* ══ IMPORT tab ══ */}
                            {ioTab === 'import' && (
                                <View>
                                    {/* Step: idle */}
                                    {importStep === 'idle' && (
                                        <View>
                                            <View style={{ backgroundColor: '#0f172a', borderRadius: 12, padding: 16, marginBottom: 20 }}>
                                                <Text style={{ color: '#6b7280', fontSize: 13, lineHeight: 20 }}>
                                                    {'Поддерживается CSV-файл.\nОбязательные колонки: date, type, amount, currency, account.\n\nФормат даты: YYYY-MM-DD\nТип: income / expense / transfer'}
                                                </Text>
                                            </View>
                                            <TouchableOpacity onPress={pickImportFile}
                                                style={{ backgroundColor: '#1f2937', borderRadius: 16, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#374151', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                                                <ArrowDownToLine color="#9ca3af" size={16} />
                                                <Text style={{ color: '#e5e7eb', fontWeight: '600', fontSize: 15 }}>Выбрать CSV-файл</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}

                                    {/* Step: mapping */}
                                    {importStep === 'mapping' && (
                                        <View>
                                            <Text style={{ color: '#6b7280', fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 12 }}>МАППИНГ КОЛОНОК ({importHeaders.length} обнаружено)</Text>
                                            {importHeaders.map((header, i) => (
                                                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                                                    <View style={{ flex: 1, backgroundColor: '#0f172a', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}>
                                                        <Text style={{ color: '#9ca3af', fontSize: 12 }} numberOfLines={1}>{header || `(колонка ${i + 1})`}</Text>
                                                        <Text style={{ color: '#4b5563', fontSize: 10, marginTop: 2 }} numberOfLines={1}>
                                                            {importDataRows[0]?.[i] ?? ''}
                                                        </Text>
                                                    </View>
                                                    <Text style={{ color: '#374151', marginHorizontal: 8 }}>→</Text>
                                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxWidth: 160 }}>
                                                        <View style={{ flexDirection: 'row', gap: 6 }}>
                                                            {CSV_COLUMNS.map(col => (
                                                                <TouchableOpacity key={col.key}
                                                                    onPress={() => {
                                                                        const m = [...importMapping];
                                                                        m[i] = col.key;
                                                                        setImportMapping(m);
                                                                    }}
                                                                    style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: importMapping[i] === col.key ? '#172554' : '#1f2937', borderWidth: 1, borderColor: importMapping[i] === col.key ? '#3b82f6' : '#374151' }}>
                                                                    <Text style={{ color: importMapping[i] === col.key ? '#60a5fa' : '#6b7280', fontSize: 11 }}>{col.label}</Text>
                                                                </TouchableOpacity>
                                                            ))}
                                                        </View>
                                                    </ScrollView>
                                                </View>
                                            ))}
                                            <TouchableOpacity onPress={runValidation}
                                                style={{ backgroundColor: '#2563eb', borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 8 }}>
                                                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Проверить данные</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}

                                    {/* Step: preview */}
                                    {importStep === 'preview' && (
                                        <View>
                                            {/* Summary */}
                                            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                                                <View style={{ flex: 1, backgroundColor: '#052e16', borderRadius: 12, padding: 14, alignItems: 'center' }}>
                                                    <Text style={{ color: '#22c55e', fontSize: 22, fontWeight: '700' }}>{importValid.length}</Text>
                                                    <Text style={{ color: '#4ade80', fontSize: 12, marginTop: 2 }}>Готово к импорту</Text>
                                                </View>
                                                <View style={{ flex: 1, backgroundColor: '#450a0a', borderRadius: 12, padding: 14, alignItems: 'center' }}>
                                                    <Text style={{ color: '#ef4444', fontSize: 22, fontWeight: '700' }}>{importErrors.length}</Text>
                                                    <Text style={{ color: '#f87171', fontSize: 12, marginTop: 2 }}>Ошибок</Text>
                                                </View>
                                            </View>

                                            {/* Error list */}
                                            {importErrors.length > 0 && (
                                                <View style={{ marginBottom: 16 }}>
                                                    <Text style={{ color: '#6b7280', fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8 }}>СТРОКИ С ОШИБКАМИ</Text>
                                                    {importErrors.slice(0, 5).map((r, i) => (
                                                        <View key={i} style={{ backgroundColor: '#450a0a', borderRadius: 10, padding: 10, marginBottom: 6 }}>
                                                            <Text style={{ color: '#fca5a5', fontSize: 12 }}>{r.error}</Text>
                                                            <Text style={{ color: '#7f1d1d', fontSize: 11, marginTop: 3 }} numberOfLines={1}>{r.raw.join(', ')}</Text>
                                                        </View>
                                                    ))}
                                                    {importErrors.length > 5 && (
                                                        <Text style={{ color: '#6b7280', fontSize: 12 }}>…и ещё {importErrors.length - 5} ошибок</Text>
                                                    )}
                                                </View>
                                            )}

                                            <View style={{ flexDirection: 'row', gap: 10 }}>
                                                <TouchableOpacity onPress={resetImport}
                                                    style={{ flex: 1, borderRadius: 16, paddingVertical: 13, alignItems: 'center', borderWidth: 1.5, borderColor: '#374151' }}>
                                                    <Text style={{ color: '#9ca3af', fontWeight: '600' }}>Назад</Text>
                                                </TouchableOpacity>
                                                {importValid.length > 0 && (
                                                    <TouchableOpacity onPress={runImport} disabled={importing}
                                                        style={{ flex: 2, borderRadius: 16, paddingVertical: 13, alignItems: 'center', backgroundColor: '#2563eb' }}>
                                                        {importing
                                                            ? <ActivityIndicator color="#fff" />
                                                            : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Импортировать {importValid.length}</Text>
                                                        }
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        </View>
                                    )}

                                    {/* Step: done */}
                                    {importStep === 'done' && importResult && (
                                        <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                                            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#052e16', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                                                <Check color="#22c55e" size={30} />
                                            </View>
                                            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Импорт завершён</Text>
                                            <Text style={{ color: '#22c55e', fontSize: 15 }}>Добавлено: {importResult.inserted}</Text>
                                            {importResult.failed > 0 && (
                                                <Text style={{ color: '#ef4444', fontSize: 15, marginTop: 4 }}>Не удалось: {importResult.failed}</Text>
                                            )}
                                            <TouchableOpacity onPress={() => { setIoVisible(false); resetImport(); }}
                                                style={{ marginTop: 24, backgroundColor: '#2563eb', borderRadius: 16, paddingHorizontal: 32, paddingVertical: 13 }}>
                                                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Готово</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}

                                </View>
                            )}

                        </ScrollView>
            </BaseBottomSheet>

            {/* ════ Modal: Notification Settings ════ */}
            <BaseBottomSheet visible={notifVisible} onClose={() => { setNotifVisible(false); setNotifSection(null); }} maxHeight="92%" style={{ paddingHorizontal: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, marginBottom: 4 }}>
                            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>Уведомления</Text>
                            <TouchableOpacity onPress={() => { setNotifVisible(false); setNotifSection(null); }} hitSlop={8}><X color="#6b7280" size={20} /></TouchableOpacity>
                        </View>

                            {/* ── 1. Низкий баланс ── */}
                            <TouchableOpacity onPress={() => setNotifSection(notifSection === 'lowBalance' ? null : 'lowBalance')}
                                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#1f2937' }}>
                                <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                                    <Wallet color="#60a5fa" size={16} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: '#e5e7eb', fontSize: 15, fontWeight: '500' }}>Остаток на счёте</Text>
                                    <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>Оповещение при низком балансе</Text>
                                </View>
                                <Switch value={notifSettings.lowBalance.enabled} onValueChange={v => patchLowBalance({ enabled: v })}
                                    trackColor={{ false: '#374151', true: '#2563eb' }} thumbColor="#fff" />
                            </TouchableOpacity>
                            {notifSection === 'lowBalance' && (
                                <View style={{ backgroundColor: '#0f172a', paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1f2937' }}>
                                    <Text style={{ color: '#6b7280', fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 12 }}>ПОРОГ ПО КАЖДОМУ СЧЁТУ</Text>
                                    {accounts.filter(a => !a.exclude_from_dashboard).map(acc => (
                                        <View key={acc.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                                            {acc.color && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: acc.color, marginRight: 10 }} />}
                                            <Text style={{ flex: 1, color: '#e5e7eb', fontSize: 14 }}>{acc.name}</Text>
                                            <TextInput
                                                value={String(notifSettings.lowBalance.thresholds[acc.id] ?? '')}
                                                onChangeText={v => {
                                                    const num = parseFloat(v);
                                                    patchLowBalance({ thresholds: { ...notifSettings.lowBalance.thresholds, [acc.id]: isNaN(num) ? 0 : num } });
                                                }}
                                                placeholder={`100 ${acc.currency}`} placeholderTextColor="#4b5563"
                                                keyboardType="decimal-pad"
                                                style={{ backgroundColor: '#1f2937', color: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, minWidth: 100, textAlign: 'right' }}
                                            />
                                        </View>
                                    ))}
                                </View>
                            )}

                            {/* ── 2. Рекуррентные платежи ── */}
                            <TouchableOpacity onPress={() => setNotifSection(notifSection === 'recurring' ? null : 'recurring')}
                                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#1f2937' }}>
                                <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                                    <Bell color="#a78bfa" size={16} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: '#e5e7eb', fontSize: 15, fontWeight: '500' }}>Рекуррентные платежи</Text>
                                    <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>
                                        {notifSettings.recurringPayment.enabled ? `За ${notifSettings.recurringPayment.daysBefore} дн. до платежа` : 'Выкл'}
                                    </Text>
                                </View>
                                <Switch value={notifSettings.recurringPayment.enabled} onValueChange={v => patchRecurring({ enabled: v })}
                                    trackColor={{ false: '#374151', true: '#2563eb' }} thumbColor="#fff" />
                            </TouchableOpacity>
                            {notifSection === 'recurring' && (
                                <View style={{ backgroundColor: '#0f172a', paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1f2937' }}>
                                    <Text style={{ color: '#6b7280', fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 12 }}>НАПОМНИТЬ ЗА</Text>
                                    <View style={{ flexDirection: 'row', gap: 10 }}>
                                        {[1, 3, 7].map(d => (
                                            <TouchableOpacity key={d} onPress={() => patchRecurring({ daysBefore: d })}
                                                style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', borderWidth: 1.5, borderColor: notifSettings.recurringPayment.daysBefore === d ? '#3b82f6' : '#374151', backgroundColor: notifSettings.recurringPayment.daysBefore === d ? '#172554' : '#1f2937' }}>
                                                <Text style={{ color: notifSettings.recurringPayment.daysBefore === d ? '#60a5fa' : '#9ca3af', fontSize: 14, fontWeight: '600' }}>{d} дн.</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                            )}

                            {/* ── 3. Бюджет ── */}
                            <TouchableOpacity onPress={() => setNotifSection(notifSection === 'budget' ? null : 'budget')}
                                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#1f2937' }}>
                                <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                                    <BellOff color="#f97316" size={16} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: '#e5e7eb', fontSize: 15, fontWeight: '500' }}>Превышение бюджета</Text>
                                    <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>
                                        {notifSettings.budget.enabled
                                            ? [notifSettings.budget.at80 && 'при 80%', notifSettings.budget.at100 && 'при 100%'].filter(Boolean).join(' и ')
                                            : 'Выкл'}
                                    </Text>
                                </View>
                                <Switch value={notifSettings.budget.enabled} onValueChange={v => patchBudget({ enabled: v })}
                                    trackColor={{ false: '#374151', true: '#2563eb' }} thumbColor="#fff" />
                            </TouchableOpacity>
                            {notifSection === 'budget' && (
                                <View style={{ backgroundColor: '#0f172a', paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1f2937' }}>
                                    <Text style={{ color: '#6b7280', fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 12 }}>УВЕДОМЛЯТЬ КОГДА</Text>
                                    {[{ key: 'at80' as const, label: 'Достигнуто 80% бюджета' }, { key: 'at100' as const, label: 'Бюджет исчерпан (100%)' }].map(opt => (
                                        <TouchableOpacity key={opt.key} onPress={() => patchBudget({ [opt.key]: !notifSettings.budget[opt.key] })}
                                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1f2937' }}>
                                            <Text style={{ color: '#e5e7eb', fontSize: 14 }}>{opt.label}</Text>
                                            <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: notifSettings.budget[opt.key] ? '#2563eb' : '#1f2937', borderWidth: 1.5, borderColor: notifSettings.budget[opt.key] ? '#3b82f6' : '#374151', alignItems: 'center', justifyContent: 'center' }}>
                                                {notifSettings.budget[opt.key] && <Check color="#fff" size={13} />}
                                            </View>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}

                            {/* ── 4. Дневная сводка ── */}
                            <TouchableOpacity onPress={() => setNotifSection(notifSection === 'daily' ? null : 'daily')}
                                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16 }}>
                                <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                                    <Clock color="#34d399" size={16} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: '#e5e7eb', fontSize: 15, fontWeight: '500' }}>Дневная сводка</Text>
                                    <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>
                                        {notifSettings.dailySummary.enabled
                                            ? `Каждый день в ${String(notifSettings.dailySummary.hour).padStart(2, '0')}:${String(notifSettings.dailySummary.minute).padStart(2, '0')}`
                                            : 'Выкл'}
                                    </Text>
                                </View>
                                <Switch value={notifSettings.dailySummary.enabled} onValueChange={v => patchDaily({ enabled: v })}
                                    trackColor={{ false: '#374151', true: '#2563eb' }} thumbColor="#fff" />
                            </TouchableOpacity>
                            {notifSection === 'daily' && (
                                <View style={{ backgroundColor: '#0f172a', paddingHorizontal: 24, paddingVertical: 14 }}>
                                    <Text style={{ color: '#6b7280', fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 12 }}>ВРЕМЯ ОТПРАВКИ</Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: '#6b7280', fontSize: 11, marginBottom: 6 }}>ЧАС (0–23)</Text>
                                            <TextInput
                                                value={String(notifSettings.dailySummary.hour)}
                                                onChangeText={v => { const n = parseInt(v); if (!isNaN(n) && n >= 0 && n <= 23) patchDaily({ hour: n }); }}
                                                keyboardType="number-pad" maxLength={2}
                                                style={{ backgroundColor: '#1f2937', color: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 22, fontWeight: '700', textAlign: 'center' }}
                                            />
                                        </View>
                                        <Text style={{ color: '#4b5563', fontSize: 28, fontWeight: '700', marginTop: 18 }}>:</Text>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: '#6b7280', fontSize: 11, marginBottom: 6 }}>МИНУТЫ (0–59)</Text>
                                            <TextInput
                                                value={String(notifSettings.dailySummary.minute).padStart(2, '0')}
                                                onChangeText={v => { const n = parseInt(v); if (!isNaN(n) && n >= 0 && n <= 59) patchDaily({ minute: n }); }}
                                                keyboardType="number-pad" maxLength={2}
                                                style={{ backgroundColor: '#1f2937', color: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 22, fontWeight: '700', textAlign: 'center' }}
                                            />
                                        </View>
                                    </View>
                                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                                        {([[9, 0, '09:00'], [18, 0, '18:00'], [21, 0, '21:00']] as [number, number, string][]).map(([h, m, label]) => (
                                            <TouchableOpacity key={label} onPress={() => patchDaily({ hour: h, minute: m })}
                                                style={{ flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center', borderWidth: 1.5, borderColor: notifSettings.dailySummary.hour === h && notifSettings.dailySummary.minute === m ? '#3b82f6' : '#374151', backgroundColor: notifSettings.dailySummary.hour === h && notifSettings.dailySummary.minute === m ? '#172554' : '#1f2937' }}>
                                                <Text style={{ color: notifSettings.dailySummary.hour === h && notifSettings.dailySummary.minute === m ? '#60a5fa' : '#9ca3af', fontSize: 13, fontWeight: '600' }}>{label}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                            )}

            </BaseBottomSheet>

        </View>
    );
}
