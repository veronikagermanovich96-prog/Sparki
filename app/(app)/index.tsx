import {
    ArrowRightLeft,
    Banknote, Bitcoin, Briefcase, Building2, Car,
    Check, ChevronDown, CircleDollarSign, Clock, Coins, CreditCard,
    Eye, EyeOff,
    Globe, Home, Landmark, Minus, Pencil, PiggyBank, Plus, Search,
    Smartphone, Trash2, TrendingDown, TrendingUp, Wallet, X,
} from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Circle as SvgCircle, Path as SvgPath, Svg } from 'react-native-svg';
import { useTheme } from '@/context/ThemeContext';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';
import { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator, Alert, ScrollView, Switch,
    Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { BaseBottomSheet } from '@/components/ui/BaseBottomSheet';
import { router, useFocusEffect } from 'expo-router';
import {
    addDays, addMonths, addWeeks, differenceInMonths, format, getDay, getDaysInMonth,
    isFuture, isToday, startOfDay, startOfMonth, startOfWeek, startOfYear, subMonths,
} from 'date-fns';
import { supabase } from '@/lib/supabase';
import { formatAmount, CURRENCIES as CURRENCY_LIST } from '@/constants/currencies';
import { Account, Category, RecurringPayment, Transaction } from '@/types';
import { IconArray, DotData } from '@/components/icon-array/IconArray';
import TransactionForm from '@/components/TransactionForm';
import VoiceInput from '@/components/VoiceInput';

// ─── Account form constants ───────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ color: string; size: number }>> = {
    CreditCard, Wallet, Building2, Banknote, Coins,
    PiggyBank, TrendingUp, Landmark, CircleDollarSign,
    Briefcase, Home, Car, Smartphone, Globe, Bitcoin,
};
const COLORS     = ['#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#f97316', '#eab308', '#14b8a6', '#ec4899'];
const CURRENCIES = ['EUR', 'USD', 'RUB', 'GBP', 'CNY', 'JPY', 'CHF', 'AED'];

// ─── Icon Array helpers ───────────────────────────────────────────────────────

type Period = 'week' | 'month' | 'quarter' | 'year';
type Slot   = { date: Date; days: number; label: string };

const PERIOD_LABELS: Record<Period, string> = { week: i18n.t('dashboard.periodWeek'), month: i18n.t('dashboard.periodMonth'), quarter: i18n.t('dashboard.periodQuarter'), year: i18n.t('dashboard.periodYear') };
const PERIOD_COLS: Record<Period, number>   = { week: 7, month: 7, quarter: 13, year: 12 };
const PERIOD_DOT:  Record<Period, number>   = { week: 24, month: 16, quarter: 18, year: 20 };
const PERIOD_GAP:  Record<Period, number>   = { week: 10, month: 7,  quarter: 6,  year: 8  };

function getPeriodSlots(period: Period): Slot[] {
    const now = new Date();
    if (period === 'week') {
        const start = startOfWeek(now, { weekStartsOn: 1 });
        return Array.from({ length: 7 }, (_, i) => { const d = addDays(start, i); return { date: d, days: 1, label: format(d, 'EEE d') }; });
    }
    if (period === 'month') {
        const start = startOfMonth(now);
        return Array.from({ length: getDaysInMonth(now) }, (_, i) => { const d = addDays(start, i); return { date: d, days: 1, label: format(d, 'd MMM') }; });
    }
    if (period === 'quarter') {
        const monday = startOfWeek(now, { weekStartsOn: 1 });
        return Array.from({ length: 13 }, (_, i) => { const d = addWeeks(monday, i - 12); return { date: d, days: 7, label: format(d, 'd MMM') }; });
    }
    return Array.from({ length: 12 }, (_, i) => { const d = new Date(now.getFullYear(), i, 1); return { date: d, days: getDaysInMonth(d), label: format(d, 'LLL') }; });
}

function slotContainsToday(slot: Slot): boolean {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return today >= slot.date && today < addDays(slot.date, slot.days);
}
function slotIsInFuture(slot: Slot): boolean {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return slot.date > today;
}
function getSpentForSlot(txs: Transaction[], slot: Slot): number {
    const s = format(slot.date, 'yyyy-MM-dd'), e = format(addDays(slot.date, slot.days), 'yyyy-MM-dd');
    return txs.filter(t => t.type === 'expense' && t.date >= s && t.date < e).reduce((a, t) => a + (t.amount_base ?? t.amount), 0);
}
function buildDots(txs: Transaction[], period: Period, dailyLimit: number): { dots: DotData[]; slots: Slot[] } {
    const slots = getPeriodSlots(period);
    const dots: DotData[] = slots.map(slot => {
        const limit = dailyLimit * slot.days;
        if (slotIsInFuture(slot)) return { color: '#374151', state: 'future', meta: { slot, spent: 0, limit } };
        const spent = getSpentForSlot(txs, slot);
        if (slotContainsToday(slot)) return { color: '#4b5563', state: 'today', meta: { slot, spent, limit } };
        const ratio = limit > 0 ? spent / limit : 0;
        if (ratio < 0.8)  return { color: '#22c55e', state: 'filled',   meta: { slot, spent, limit } };
        if (ratio <= 1.0) return { color: '#f97316', state: 'warning',  meta: { slot, spent, limit } };
        return               { color: '#ef4444', state: 'overflow', meta: { slot, spent, limit } };
    });
    return { dots, slots };
}
function normalizeToMonthly(r: RecurringPayment): number {
    const d = getDaysInMonth(new Date());
    switch (r.frequency) { case 'daily': return r.amount * d; case 'weekly': return r.amount * (d / 7); case 'monthly': return r.amount; case 'yearly': return r.amount / 12; default: return 0; }
}

function formatDateInput(raw: string): string {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 4) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type DotMeta      = { slot: Slot; spent: number; limit: number };
type TxWithCat    = Transaction & { categories: { name: string; icon: string | null; color: string | null } | null };
type GoalItem     = { id: string; name: string; icon: string; color: string; target: number; saved: number; currency: string; targetDate: string | null; accountId: string };

// ─── Component ────────────────────────────────────────────────────────────────

export default function Dashboard() {

    const { colors, fonts } = useTheme();
    const { t } = useTranslation();

    // ── Core state ──────────────────────────────────────────────────────────────
    const [accounts,    setAccounts]    = useState<Account[]>([]);
    const [categories,  setCategories]  = useState<Category[]>([]);
    const [loading,     setLoading]     = useState(true);
    const [currency,    setCurrency]    = useState('EUR');
    const [hidden,      setHidden]      = useState(false);
    const [householdId, setHouseholdId] = useState<string | null>(null);
    const [userId,      setUserId]      = useState<string | null>(null);

    // ── Account card edit/delete ─────────────────────────────────────────────
    const [menuAccount,  setMenuAccount]  = useState<Account | null>(null);
    const [formVisible,  setFormVisible]  = useState(false);
    const [editingId,    setEditingId]    = useState<string | null>(null);
    const [formName,     setFormName]     = useState('');
    const [formCurrency, setFormCurrency] = useState('EUR');
    const [formBalance,  setFormBalance]  = useState('0');
    const [formIcon,     setFormIcon]     = useState('CreditCard');
    const [formColor,    setFormColor]    = useState('#3b82f6');
    const [formExclude,  setFormExclude]  = useState(false);
    const [saving,       setSaving]       = useState(false);

    // ── FAB ──────────────────────────────────────────────────────────────────
    const [voiceOpen,    setVoiceOpen]    = useState(false);
    const [addMethodVisible, setAddMethodVisible] = useState(false);

    // ── Account actions (tap) ────────────────────────────────────────────────
    const [actionAccount, setActionAccount] = useState<Account | null>(null);

    // Transaction form (shared component)
    const [txFormVisible,      setTxFormVisible]      = useState(false);
    const [txFormInitialType,  setTxFormInitialType]  = useState<'income' | 'expense' | 'transfer'>('expense');
    const [txFormInitialAccId, setTxFormInitialAccId] = useState<string | undefined>(undefined);


    // History
    const [historyAccount,  setHistoryAccount]  = useState<Account | null>(null);
    const [historyPeriod,   setHistoryPeriod]   = useState<'week' | 'month' | 'year' | 'all' | 'custom'>('month');
    const [historyCustomFrom, setHistoryCustomFrom] = useState<Date | null>(null);
    const [historyCustomTo,   setHistoryCustomTo]   = useState<Date | null>(null);
    const [historyPickerField, setHistoryPickerField] = useState<'from' | 'to' | null>(null);
    const [historyTx,       setHistoryTx]       = useState<TxWithCat[]>([]);
    const [loadingHistory,  setLoadingHistory]  = useState(false);

    // ── Savings goals ────────────────────────────────────────────────────────
    const [goals,           setGoals]           = useState<GoalItem[]>([]);
    const [goalFormVisible, setGoalFormVisible] = useState(false);
    const [editingGoal,     setEditingGoal]     = useState<GoalItem | null>(null);
    const [goalName,        setGoalName]        = useState('');
    const [goalIcon,        setGoalIcon]        = useState('🎯');
    const [goalTarget,      setGoalTarget]      = useState('');
    const [goalDate,        setGoalDate]        = useState('');
    const [goalColor,       setGoalColor]       = useState('#22c55e');
    const [goalAccId,       setGoalAccId]       = useState('');
    const [goalInitialDeposit, setGoalInitialDeposit] = useState('');
    const [goalCurrency, setGoalCurrency] = useState('');
    const [goalCurrencyOpen, setGoalCurrencyOpen] = useState(false);
    const [goalCurrencySearch, setGoalCurrencySearch] = useState('');
    const [savingGoal,      setSavingGoal]      = useState(false);
    // Goal action sheet
    const [goalSheet,       setGoalSheet]       = useState<GoalItem | null>(null);
    // Deposit state
    const [depositGoal,     setDepositGoal]     = useState<GoalItem | null>(null);
    const [depositAmount,   setDepositAmount]   = useState('');
    const [depositNote,     setDepositNote]     = useState('');
    const [depositAccId,    setDepositAccId]    = useState('');
    const [depositing,      setDepositing]      = useState(false);
    const [withdrawGoal,    setWithdrawGoal]    = useState<GoalItem | null>(null);
    const [withdrawAmount,  setWithdrawAmount]  = useState('');
    const [withdrawNote,    setWithdrawNote]    = useState('');
    const [withdrawAccId,   setWithdrawAccId]   = useState('');
    const [withdrawing,     setWithdrawing]     = useState(false);

    // ── Analytics period ────────────────────────────────────────────────────
    type AnalyticsPeriod = 'day' | 'week' | 'month' | 'year';
    const [analyticsPeriod, setAnalyticsPeriod] = useState<AnalyticsPeriod>('month');
    const ANALYTICS_LABELS: Record<AnalyticsPeriod, string> = { day: t('dashboard.periodDay'), week: t('dashboard.periodWeek'), month: t('dashboard.periodMonth'), year: t('dashboard.periodYear') };

    // ── Icon Array ───────────────────────────────────────────────────────────
    const [period,       setPeriod]       = useState<Period>('month');
    const [balanceMonth, setBalanceMonth] = useState(new Date());
    type BalancePeriod = 'day' | 'week' | 'month' | 'year' | 'last7' | 'last30' | 'all' | 'custom';
    const [balancePeriod, setBalancePeriod] = useState<BalancePeriod>('month');
    const [showPeriodPicker, setShowPeriodPicker] = useState(false);
    const [customFrom, setCustomFrom] = useState(startOfMonth(new Date()));
    const [customTo, setCustomTo] = useState(new Date());
    const [showCustomFromPicker, setShowCustomFromPicker] = useState(false);
    const [showCustomToPicker, setShowCustomToPicker] = useState(false);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [incomeTx,     setIncomeTx]     = useState<Transaction[]>([]);
    const [dailyLimit,   setDailyLimit]   = useState(0);
    const [loadingTx,    setLoadingTx]    = useState(true);
    const [selectedDot,  setSelectedDot]  = useState<DotMeta | null>(null);

    // ── Load data ────────────────────────────────────────────────────────────

    useFocusEffect(useCallback(() => { loadData(); }, []));

    async function loadData() {
        setLoading(true); setLoadingTx(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); setLoadingTx(false); return; }
        setUserId(user.id);

        const { data: member } = await supabase
            .from('household_members')
            .select('household_id, households(base_currency)')
            .eq('user_id', user.id).single();

        if (!member) { setLoading(false); setLoadingTx(false); return; }

        const hh = member.households as unknown as { base_currency: string } | null;
        if (hh?.base_currency) setCurrency(hh.base_currency);
        setHouseholdId(member.household_id);

        const [
            { data: accData },
            { data: catData },
            { data: goalData },
        ] = await Promise.all([
            supabase.from('accounts').select('*')
                .eq('household_id', member.household_id).eq('is_deleted', false)
                .order('sort_order', { ascending: true, nullsFirst: true }).order('created_at', { ascending: true }),
            supabase.from('categories').select('*')
                .eq('household_id', member.household_id)
                .eq('is_hidden', false).order('name'),
            supabase.from('savings_goals')
                .select('id, name, icon, color, target_amount, current_amount, currency, target_date, account_id')
                .eq('household_id', member.household_id).eq('is_active', true).eq('is_archived', false),
        ]);
        setAccounts(accData ?? []);
        setCategories(catData ?? []);
        setGoals((goalData ?? []).map((g: any) => ({
            id:         g.id,
            name:       g.name,
            icon:       g.icon ?? '🎯',
            color:      g.color ?? '#22c55e',
            target:     g.target_amount,
            saved:      g.current_amount ?? 0,
            currency:   g.currency,
            targetDate: g.target_date ?? null,
            accountId:  g.account_id,
        })));
        setLoading(false);

        const yearStart = format(startOfYear(new Date()), 'yyyy-MM-dd');
        const [{ data: txData }, { data: incomeTxData }, { data: budgetData }, { data: recurringData }, { data: loansData }] = await Promise.all([
            supabase.from('transactions').select('*')
                .eq('household_id', member.household_id).eq('is_deleted', false)
                .eq('type', 'expense').gte('date', yearStart),
            supabase.from('transactions').select('*')
                .eq('household_id', member.household_id).eq('is_deleted', false)
                .eq('type', 'income').gte('date', yearStart),
            supabase.from('budgets').select('amount').eq('household_id', member.household_id).eq('period', 'monthly'),
            supabase.from('recurring_payments').select('*')
                .eq('household_id', member.household_id).eq('is_active', true).eq('expense_type', 'base'),
            supabase.from('loans').select('*, loan_rate_periods(*)')
                .eq('household_id', member.household_id).eq('is_active', true),
        ]);
        setTransactions(txData ?? []);
        setIncomeTx(incomeTxData ?? []);
        const monthlyBudget = (budgetData ?? []).reduce((s, b) => s + b.amount, 0);
        const infraMonthly  = (recurringData as RecurringPayment[] ?? []).reduce((s, r) => s + normalizeToMonthly(r), 0);

        // Calculate total monthly loan payments
        let loansMonthly = 0;
        for (const loan of (loansData ?? []) as any[]) {
            const totalAmount = parseFloat(loan.total_amount) || 0;
            const startDate = new Date(loan.start_date);
            const endDate = new Date(loan.end_date);
            const totalMonths = differenceInMonths(endDate, startDate) || 1;
            const rates = (loan.loan_rate_periods ?? []) as { rate: string; from_date: string }[];
            const currentRate = rates.length > 0
                ? parseFloat(rates.sort((a: any, b: any) => b.from_date.localeCompare(a.from_date))[0].rate) || 0
                : 0;

            if (loan.payment_type === 'annuity') {
                if (currentRate === 0) { loansMonthly += totalAmount / totalMonths; }
                else {
                    const r = currentRate / 100 / 12;
                    loansMonthly += totalAmount * (r * Math.pow(1 + r, totalMonths)) / (Math.pow(1 + r, totalMonths) - 1);
                }
            } else {
                const monthsPaid = Math.max(0, differenceInMonths(new Date(), startDate));
                const base = totalAmount / totalMonths;
                const remaining = totalAmount - base * monthsPaid;
                loansMonthly += base + (remaining > 0 ? remaining * (currentRate / 100 / 12) : 0);
            }
        }

        // If no category budgets, fall back to account spending_limits (normalized to monthly)
        let totalMonthly = monthlyBudget;
        if (totalMonthly === 0 && (accData ?? []).length > 0) {
            const daysInMonth = getDaysInMonth(new Date());
            for (const acc of (accData ?? []) as Account[]) {
                if (!acc.spending_limit || acc.spending_limit <= 0 || acc.exclude_from_dashboard) continue;
                const p = acc.spending_limit_period ?? 'monthly';
                switch (p) {
                    case 'daily':   totalMonthly += acc.spending_limit * daysInMonth; break;
                    case 'weekly':  totalMonthly += acc.spending_limit * (daysInMonth / 7); break;
                    case 'monthly': totalMonthly += acc.spending_limit; break;
                    case 'yearly':  totalMonthly += acc.spending_limit / 12; break;
                }
            }
        }
        setDailyLimit(totalMonthly > 0 ? (totalMonthly - infraMonthly - loansMonthly) / getDaysInMonth(new Date()) : 0);
        setLoadingTx(false);
    }

    // ── Account management ───────────────────────────────────────────────────

    function openAdd() {
        setEditingId(null); setFormName(''); setFormCurrency(currency);
        setFormBalance('0'); setFormIcon('CreditCard'); setFormColor('#3b82f6'); setFormExclude(false);
        setFormVisible(true);
    }
    function openEdit(account: Account) {
        setMenuAccount(null);
        setEditingId(account.id); setFormName(account.name); setFormCurrency(account.currency);
        setFormBalance(String(account.balance)); setFormIcon(account.icon ?? 'CreditCard');
        setFormColor(account.color ?? '#3b82f6'); setFormExclude(account.exclude_from_dashboard);
        setFormVisible(true);
    }
    async function saveAccount() {
        if (!formName.trim()) return;
        setSaving(true);
        const payload = { name: formName.trim(), currency: formCurrency, balance: parseFloat(formBalance) || 0, icon: formIcon, color: formColor, exclude_from_dashboard: formExclude };
        if (editingId) await supabase.from('accounts').update(payload).eq('id', editingId);
        else await supabase.from('accounts').insert({ ...payload, household_id: householdId });
        setSaving(false); setFormVisible(false); loadData();
    }
    async function toggleExclude(account: Account) {
        const next = !account.exclude_from_dashboard;
        setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, exclude_from_dashboard: next } : a));
        await supabase.from('accounts').update({ exclude_from_dashboard: next }).eq('id', account.id);
    }
    function confirmDelete(account: Account) {
        setMenuAccount(null);
        Alert.alert(t('dashboard.deleteAccount'), t('dashboard.deleteAccountMsg', { name: account.name }), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('common.delete'), style: 'destructive', onPress: async () => {
                await supabase.from('accounts').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', account.id);
                loadData();
            }},
        ]);
    }

    // ── Account actions (transactions) ───────────────────────────────────────

    function openTxForm(type: 'income' | 'expense' | 'transfer', account?: Account) {
        setTxFormInitialType(type);
        setTxFormInitialAccId(account?.id ?? actionAccount?.id ?? accounts[0]?.id);
        setTxFormVisible(true);
    }


    async function openHistory(account: Account, period: 'week' | 'month' | 'year' | 'all' = 'month') {
        setActionAccount(null);
        setHistoryAccount(account);
        setHistoryPeriod(period);
        setLoadingHistory(true);
        let q = supabase
            .from('transactions')
            .select('*, categories(name, icon, color)')
            .eq('account_id', account.id)
            .eq('is_deleted', false)
            .order('date', { ascending: false });
        if (period !== 'all') {
            const now = new Date();
            let from: Date;
            if (period === 'week') from = startOfWeek(now, { weekStartsOn: 1 });
            else if (period === 'month') from = startOfMonth(now);
            else from = startOfYear(now);
            q = q.gte('date', format(from, 'yyyy-MM-dd'));
        }
        const { data } = await q.limit(100);
        setHistoryTx((data ?? []) as TxWithCat[]);
        setLoadingHistory(false);
    }

    async function changeHistoryPeriod(period: 'week' | 'month' | 'year' | 'all' | 'custom', cFrom?: Date | null, cTo?: Date | null) {
        if (!historyAccount) return;
        setHistoryPeriod(period);
        if (period === 'custom' && !cFrom) return; // wait for date picker
        setLoadingHistory(true);
        let q = supabase
            .from('transactions')
            .select('*, categories(name, icon, color)')
            .eq('account_id', historyAccount.id)
            .eq('is_deleted', false)
            .order('date', { ascending: false });
        if (period === 'custom') {
            if (cFrom) q = q.gte('date', format(cFrom, 'yyyy-MM-dd'));
            if (cTo) q = q.lte('date', format(cTo, 'yyyy-MM-dd'));
        } else if (period !== 'all') {
            const now = new Date();
            let from: Date;
            if (period === 'week') from = startOfWeek(now, { weekStartsOn: 1 });
            else if (period === 'month') from = startOfMonth(now);
            else from = startOfYear(now);
            q = q.gte('date', format(from, 'yyyy-MM-dd'));
        }
        const { data } = await q.limit(100);
        setHistoryTx((data ?? []) as TxWithCat[]);
        setLoadingHistory(false);
    }

    // ── Savings goals ────────────────────────────────────────────────────────

    function openGoalForm(goal?: GoalItem) {
        if (goal) {
            setEditingGoal(goal);
            setGoalName(goal.name);
            setGoalIcon(goal.icon);
            setGoalTarget(String(goal.target));
            setGoalDate(goal.targetDate ?? '');
            setGoalColor(goal.color);
            setGoalAccId(goal.accountId);
            setGoalCurrency(goal.currency);
            setGoalInitialDeposit('');
        } else {
            setEditingGoal(null);
            setGoalName(''); setGoalIcon('🎯'); setGoalTarget(''); setGoalDate('');
            setGoalColor('#22c55e'); setGoalAccId(''); setGoalCurrency(accounts[0]?.currency ?? 'USD'); setGoalInitialDeposit('');
        }
        setGoalFormVisible(true);
    }

    async function saveGoal() {
        if (!goalName.trim() || !goalTarget || !goalAccId) return;
        setSavingGoal(true);
        const target = parseFloat(goalTarget);
        if (isNaN(target) || target <= 0) { setSavingGoal(false); return; }

        // Normalize date: accept "2028" → "2028-12-31", "2028-06" → "2028-06-01"
        let targetDate: string | null = null;
        if (goalDate.trim()) {
            const d = goalDate.trim();
            if (/^\d{4}$/.test(d))          targetDate = `${d}-12-31`;
            else if (/^\d{4}-\d{2}$/.test(d)) targetDate = `${d}-01`;
            else if (/^\d{4}-\d{2}-\d{2}$/.test(d)) targetDate = d;
            else {
                setSavingGoal(false);
                Alert.alert(t('quiz.invalidDate'), t('quiz.invalidDateMsg'));
                return;
            }
        }

        const acc = accounts.find(a => a.id === goalAccId);
        let error: any;
        if (editingGoal) {
            const topUpAmt = goalInitialDeposit.trim()
                ? parseFloat(goalInitialDeposit.replace(',', '.'))
                : 0;

            const updatePayload: any = {
                account_id:    goalAccId,
                name:          goalName.trim(),
                icon:          goalIcon,
                color:         goalColor,
                target_amount: target,
                currency:      goalCurrency || acc?.currency || currency,
                target_date:   targetDate,
            };

            // If top-up amount provided, add to current_amount
            if (topUpAmt > 0) {
                updatePayload.current_amount = (editingGoal.saved ?? 0) + topUpAmt;
            }

            ({ error } = await supabase.from('savings_goals').update(updatePayload).eq('id', editingGoal.id));

            // Deduct from account and create transaction
            if (!error && topUpAmt > 0 && acc) {
                await supabase.from('accounts').update({ balance: acc.balance - topUpAmt }).eq('id', goalAccId);
                const uid = (await supabase.auth.getUser()).data.user?.id;
                if (uid) {
                    await supabase.from('transactions').insert({
                        household_id: householdId,
                        account_id: goalAccId,
                        type: 'transfer',
                        amount: topUpAmt,
                        currency: acc.currency ?? currency,
                        date: new Date().toISOString().slice(0, 10),
                        description: `${t('analytics.topUpGoal')} → ${goalName.trim()}`,
                        created_by: uid,
                    });
                }
            }
        } else {
            const initialAmt = goalInitialDeposit.trim()
                ? parseFloat(goalInitialDeposit.replace(',', '.'))
                : 0;

            const { data: goalData, error: insertErr } = await supabase.from('savings_goals').insert({
                household_id:  householdId,
                account_id:    goalAccId,
                name:          goalName.trim(),
                icon:          goalIcon,
                color:         goalColor,
                target_amount: target,
                current_amount: initialAmt > 0 ? initialAmt : 0,
                currency:      goalCurrency || acc?.currency || currency,
                target_date:   targetDate,
                is_active:     true,
                is_archived:   false,
                compounding:   'monthly',
            }).select().single();
            error = insertErr;

            // Handle initial deposit transfer
            if (!error && initialAmt > 0 && goalData && acc) {
                await supabase.from('accounts').update({ balance: acc.balance - initialAmt }).eq('id', goalAccId);
                const uid = (await supabase.auth.getUser()).data.user?.id;
                if (uid) {
                    await supabase.from('transactions').insert({
                        household_id: householdId,
                        account_id: goalAccId,
                        type: 'transfer',
                        amount: initialAmt,
                        currency: acc.currency ?? currency,
                        date: new Date().toISOString().slice(0, 10),
                        description: `${t('analytics.initialDeposit')} → ${goalName.trim()}`,
                        created_by: uid,
                    });
                }
            }
        }
        setSavingGoal(false);
        if (error) { Alert.alert(t('common.error'), error.message); return; }
        setGoalFormVisible(false);
        setEditingGoal(null);
        setGoalInitialDeposit('');
        loadData();
    }

    function confirmDeleteGoal(goal: GoalItem) {
        setGoalSheet(null);
        Alert.alert(t('analytics.deleteGoal'), t('analytics.deleteGoalMsg', { name: goal.name }), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('common.delete'), style: 'destructive', onPress: async () => {
                await supabase.from('savings_goals').update({ is_active: false, is_archived: true }).eq('id', goal.id);
                loadData();
            }},
        ]);
    }

    async function handleDeposit() {
        if (!depositGoal || !depositAmount || !depositAccId) return;
        const amount = parseFloat(depositAmount);
        if (isNaN(amount) || amount <= 0) return;
        const srcAcc = accounts.find(a => a.id === depositAccId);
        if (!srcAcc) return;
        if (srcAcc.balance < amount) { Alert.alert(t('common.error'), t('analytics.insufficientOnAccount', { amount: formatAmount(srcAcc.balance, srcAcc.currency) })); return; }
        setDepositing(true);
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('transactions').insert({
            household_id: householdId,
            account_id:   depositAccId,
            user_id:      user?.id,
            type:         'transfer',
            amount,
            currency:     depositGoal.currency,
            amount_base:  amount,
            note:         depositNote.trim() || `${t('analytics.topUpGoal')} → ${depositGoal.name}`,
            date:         new Date().toISOString().split('T')[0],
        });
        if (error) { Alert.alert(t('common.error'), error.message); setDepositing(false); return; }
        // Update goal's current_amount
        await supabase.from('savings_goals').update({
            current_amount: (depositGoal.saved ?? 0) + amount,
        }).eq('id', depositGoal.id);
        // Debit source account
        await supabase.from('accounts').update({
            balance:    srcAcc.balance - amount,
            updated_at: new Date().toISOString(),
        }).eq('id', depositAccId);
        setDepositing(false);
        setDepositGoal(null);
        setDepositAmount('');
        setDepositNote('');
        loadData();
    }

    async function handleWithdraw() {
        if (!withdrawGoal || !withdrawAmount || !withdrawAccId) return;
        const amount = parseFloat(withdrawAmount);
        if (isNaN(amount) || amount <= 0) return;
        if (amount > withdrawGoal.saved) { Alert.alert(t('common.error'), t('analytics.insufficientFunds', { amount: formatAmount(withdrawGoal.saved, withdrawGoal.currency) })); return; }
        setWithdrawing(true);
        const { data: { user } } = await supabase.auth.getUser();
        const targetAcc = accounts.find(a => a.id === withdrawAccId);

        // Decrease goal's current_amount
        const newSaved = withdrawGoal.saved - amount;
        await supabase.from('savings_goals').update({ current_amount: newSaved }).eq('id', withdrawGoal.id);

        // Increase target account balance
        if (targetAcc) {
            await supabase.from('accounts').update({
                balance: targetAcc.balance + amount,
                updated_at: new Date().toISOString(),
            }).eq('id', withdrawAccId);
        }

        // Create transfer transaction
        await supabase.from('transactions').insert({
            household_id: householdId,
            account_id:   withdrawAccId,
            created_by:   user?.id,
            type:         'transfer',
            amount,
            currency:     withdrawGoal.currency,
            description:  withdrawNote.trim() || `${t('transactions.transfer')} ← ${withdrawGoal.name}`,
            date:         new Date().toISOString().split('T')[0],
        });

        setWithdrawing(false);
        setWithdrawGoal(null);
        setWithdrawAmount('');
        setWithdrawNote('');
        setWithdrawAccId('');
        loadData();
    }

    // ── Derived ──────────────────────────────────────────────────────────────

    const activeBalance = accounts.filter(a => !a.exclude_from_dashboard).reduce((s, a) => s + a.balance, 0);
    const totalBalance  = accounts.reduce((s, a) => s + a.balance, 0);

    const { dots: dotsForPeriod } = useMemo(
        () => buildDots(transactions, period, dailyLimit),
        [transactions, period, dailyLimit],
    );
    const todaySpent = useMemo(() => {
        const today = format(new Date(), 'yyyy-MM-dd');
        return transactions.filter(t => t.date === today).reduce((s, t) => s + (t.amount_base ?? t.amount), 0);
    }, [transactions]);

    // ── Category breakdown for selected analytics period ───────────────────
    const categoryBreakdown = useMemo(() => {
        const now = new Date();
        let periodStart: string;
        switch (analyticsPeriod) {
            case 'day':   periodStart = format(startOfDay(now), 'yyyy-MM-dd'); break;
            case 'week':  periodStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'); break;
            case 'month': periodStart = format(startOfMonth(now), 'yyyy-MM-dd'); break;
            case 'year':  periodStart = format(startOfYear(now), 'yyyy-MM-dd'); break;
        }
        const filtered = transactions.filter(t => t.date >= periodStart);
        const map: Record<string, number> = {};
        for (const t of filtered) {
            map[t.category_id] = (map[t.category_id] ?? 0) + (t.amount_base ?? t.amount);
        }
        const items = Object.entries(map)
            .map(([catId, total]) => {
                const cat = categories.find(c => c.id === catId);
                return { catId, name: cat?.name ?? t('analytics.otherCategory'), color: cat?.color ?? '#6b7280', total };
            })
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);
        const max = items[0]?.total ?? 1;
        const periodTotal = filtered.reduce((s, t) => s + (t.amount_base ?? t.amount), 0);
        const periodLabel = { day: t('analytics.todayPeriod'), week: t('analytics.thisWeek'), month: t('analytics.thisMonth'), year: t('analytics.thisYear') }[analyticsPeriod];
        return { items, max, monthTotal: periodTotal, periodLabel, periodStart };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transactions, categories, analyticsPeriod]);

    // Income/expense summary for the same analytics period
    const periodSummary = useMemo(() => {
        const ps = categoryBreakdown.periodStart;
        const income = incomeTx.filter(t => t.date >= ps).reduce((s, t) => s + (t.amount_base ?? t.amount), 0);
        const expenses = transactions.filter(t => t.date >= ps).reduce((s, t) => s + (t.amount_base ?? t.amount), 0);
        const net = income - expenses;
        return { income, expenses, net };
    }, [transactions, incomeTx, categoryBreakdown.periodStart]);

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <View style={{ flex: 1, backgroundColor: colors.bgPrimary, paddingTop: 64 }}>
            <ScrollView style={{ paddingHorizontal: 24 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                {/* ── Balance ── */}
                <View style={{ marginTop: 16, marginBottom: 32 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <Text style={{ color: colors.textSecondary, fontSize: 14, fontFamily: fonts.body }}>{t('dashboard.activeBalance')}</Text>
                        <TouchableOpacity onPress={() => setHidden(h => !h)} hitSlop={8}>
                            {hidden ? <EyeOff color={colors.textMuted} size={20} /> : <Eye color={colors.textMuted} size={20} />}
                        </TouchableOpacity>
                    </View>
                    {loading ? (
                        <ActivityIndicator color={colors.textPrimary} style={{ alignSelf: 'flex-start', marginVertical: 10 }} />
                    ) : (
                        <>
                            <Text style={{ color: colors.textPrimary, fontSize: 40, fontFamily: fonts.heading, letterSpacing: -1, marginBottom: 6 }}>
                                {hidden ? '••••••' : formatAmount(activeBalance, currency)}
                            </Text>
                            <Text style={{ color: colors.textMuted, fontSize: 14, fontFamily: fonts.body }}>
                                {t('dashboard.totalOnAccounts', { amount: hidden ? '••••' : formatAmount(totalBalance, currency) })}
                            </Text>
                        </>
                    )}

                    {/* Account cards */}
                    <View style={{ marginTop: 20 }}>
                        <Text style={{ color: colors.textPrimary, fontSize: 15, fontFamily: fonts.bodySemiBold, marginBottom: 12 }}>{t('dashboard.accounts')}</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -24, paddingHorizontal: 24 }}>
                            {accounts.map(account => {
                                const IC = ICON_MAP[account.icon ?? 'CreditCard'] ?? CreditCard;
                                const col = account.color ?? '#3b82f6';
                                const excluded = account.exclude_from_dashboard;
                                return (
                                    <TouchableOpacity
                                        key={account.id}
                                        onPress={() => setActionAccount(account)}
                                        onLongPress={() => setMenuAccount(account)}
                                        delayLongPress={400}
                                        activeOpacity={0.85}
                                        style={{
                                            backgroundColor: colors.bgTertiary,
                                            borderRadius: 16, padding: 14, marginRight: 10, width: 155, height: 140,
                                            justifyContent: 'space-between',
                                            opacity: excluded ? 0.5 : 1,
                                        }}
                                    >
                                        {/* Top row: icon + hide toggle */}
                                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: col + '22', alignItems: 'center', justifyContent: 'center' }}>
                                                <IC color={col} size={18} />
                                            </View>
                                            <TouchableOpacity onPress={() => toggleExclude(account)} hitSlop={8}>
                                                {excluded
                                                    ? <EyeOff color={colors.textDisabled} size={16} />
                                                    : <Eye color={colors.textMuted} size={16} />}
                                            </TouchableOpacity>
                                        </View>

                                        {/* Bottom: amount + name */}
                                        <View>
                                            <Text style={{ color: colors.textPrimary, fontSize: 18, fontFamily: fonts.bodySemiBold, marginBottom: 2 }} numberOfLines={1}>
                                                {hidden ? '••••' : formatAmount(account.balance, account.currency)}
                                            </Text>
                                            <Text style={{ color: colors.textMuted, fontSize: 13, fontFamily: fonts.body }} numberOfLines={1}>
                                                {account.name}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}

                            <TouchableOpacity onPress={openAdd} activeOpacity={0.7}
                                style={{ backgroundColor: colors.bgTertiary, borderWidth: 1.5, borderColor: colors.borderLight, borderStyle: 'dashed', borderRadius: 16, width: 155, height: 140, justifyContent: 'center', alignItems: 'center' }}>
                                <Plus color={colors.textDisabled} size={24} />
                                <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: fonts.body, marginTop: 6 }}>{t('dashboard.add')}</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>

                {/* ── Balance + Efficiency ── */}
                {!loadingTx && (() => {
                    const realNow = new Date();
                    const viewMonth = balanceMonth;
                    const mStart = startOfMonth(viewMonth);
                    const daysInMonth = getDaysInMonth(viewMonth);
                    const isCurrentMonth = viewMonth.getMonth() === realNow.getMonth() && viewMonth.getFullYear() === realNow.getFullYear();
                    const todayNum = isCurrentMonth ? realNow.getDate() : daysInMonth;
                    const firstDow = (getDay(mStart) + 6) % 7;
                    const dayNames = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
                    const viewM = viewMonth.getMonth();
                    const viewY = viewMonth.getFullYear();

                    // Period range calculation
                    const periodLabels: Record<BalancePeriod, string> = {
                        day: t('dashboard.periodDay'), week: t('dashboard.periodWeek'),
                        month: t('dashboard.periodMonth'), year: t('dashboard.periodYear'),
                        last7: t('dashboard.last7Days'), last30: t('dashboard.last30Days'),
                        all: t('dashboard.allTime'),
                        custom: `${format(customFrom, 'dd.MM')} – ${format(customTo, 'dd.MM')}`,
                    };
                    function getPeriodRange(p: BalancePeriod): { from: string; to: string } {
                        const today = format(realNow, 'yyyy-MM-dd');
                        switch (p) {
                            case 'day': return { from: today, to: today };
                            case 'week': return { from: format(startOfWeek(realNow, { weekStartsOn: 1 }), 'yyyy-MM-dd'), to: today };
                            case 'month': return { from: format(startOfMonth(viewMonth), 'yyyy-MM-dd'), to: format(new Date(viewY, viewM + 1, 0), 'yyyy-MM-dd') };
                            case 'year': return { from: format(startOfYear(realNow), 'yyyy-MM-dd'), to: today };
                            case 'last7': return { from: format(addDays(realNow, -6), 'yyyy-MM-dd'), to: today };
                            case 'last30': return { from: format(addDays(realNow, -29), 'yyyy-MM-dd'), to: today };
                            case 'all': return { from: '2000-01-01', to: today };
                            case 'custom': return { from: format(customFrom, 'yyyy-MM-dd'), to: format(customTo, 'yyyy-MM-dd') };
                        }
                    }
                    const range = getPeriodRange(balancePeriod);

                    // Build daily spending map (always for viewMonth for calendar)
                    const dailySpend: Record<number, number> = {};
                    transactions.forEach(t => {
                        const d = new Date(t.date);
                        if (d.getMonth() === viewM && d.getFullYear() === viewY) {
                            const day = d.getDate();
                            dailySpend[day] = (dailySpend[day] ?? 0) + (t.amount_base ?? t.amount);
                        }
                    });

                    // Income/expenses for selected period
                    const periodIncome = incomeTx.filter(t => t.date >= range.from && t.date <= range.to)
                        .reduce((s, t) => s + (t.amount_base ?? t.amount), 0);
                    const periodExpenses = transactions.filter(t => t.date >= range.from && t.date <= range.to)
                        .reduce((s, t) => s + (t.amount_base ?? t.amount), 0);
                    const periodNet = periodIncome - periodExpenses;

                    // Color logic for each day
                    function dayColor(day: number): string {
                        if (day > todayNum) return 'transparent'; // future
                        const spent = dailySpend[day] ?? 0;
                        if (dailyLimit <= 0) return spent > 0 ? '#22c55e44' : 'transparent';
                        const ratio = spent / dailyLimit;
                        if (ratio <= 0.7) return '#22c55e'; // saved >30%
                        if (ratio <= 1) return '#4ade8066'; // saved <30%
                        if (ratio <= 1.15) return '#f97316'; // overspent <15%
                        return '#ef4444'; // overspent >15%
                    }

                    function dayBorderColor(day: number): string {
                        if (day > todayNum) return 'transparent';
                        const c = dayColor(day);
                        return c === 'transparent' ? 'transparent' : c;
                    }

                    // Calendar grid: 6 weeks max
                    const cells: (number | null)[] = [];
                    for (let i = 0; i < firstDow; i++) cells.push(null);
                    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
                    while (cells.length % 7 !== 0) cells.push(null);

                    return (
                        <View style={{ backgroundColor: colors.bgSecondary, borderRadius: 20, padding: 16, marginBottom: 24, zIndex: 10 }}>
                            {/* Balance header with period picker */}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                <Text style={{ fontSize: 15, fontFamily: fonts.bodySemiBold, color: colors.textPrimary }}>Balance</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgTertiary, borderRadius: 20, paddingVertical: 6 }}>
                                    <TouchableOpacity onPress={() => {
                                        if (balancePeriod === 'month') setBalanceMonth(prev => subMonths(prev, 1));
                                    }} style={{ paddingHorizontal: 10, opacity: balancePeriod === 'month' ? 1 : 0.3 }}>
                                        <Text style={{ color: colors.textMuted, fontSize: 16 }}>‹</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => setShowPeriodPicker(v => !v)}>
                                        <Text style={{ fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.textPrimary, minWidth: 70, textAlign: 'center' }}>
                                            {balancePeriod === 'month' ? format(viewMonth, 'MMMM') : periodLabels[balancePeriod]}
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => {
                                        if (balancePeriod === 'month') {
                                            const next = addMonths(viewMonth, 1);
                                            if (next <= realNow) setBalanceMonth(next);
                                        }
                                    }} style={{ paddingHorizontal: 10, opacity: balancePeriod === 'month' ? (isCurrentMonth ? 0.3 : 1) : 0.3 }}>
                                        <Text style={{ color: colors.textMuted, fontSize: 16 }}>›</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* Period dropdown overlay */}
                            {showPeriodPicker && (
                                <>
                                    <TouchableOpacity activeOpacity={1} onPress={() => setShowPeriodPicker(false)}
                                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: -500, zIndex: 98 }} />
                                    <View style={{ position: 'absolute', top: 48, left: 16, right: 16, zIndex: 99, backgroundColor: colors.bgTertiary, borderRadius: 14, overflow: 'hidden',
                                        shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 10 }}>
                                        {(['day', 'week', 'month', 'year', 'all'] as BalancePeriod[]).map((p, i) => (
                                            <TouchableOpacity key={p} onPress={() => { setBalancePeriod(p); setShowPeriodPicker(false); if (p === 'month') setBalanceMonth(new Date()); }}
                                                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}>
                                                <Text style={{ fontSize: 15, fontFamily: fonts.body, color: colors.textPrimary }}>{periodLabels[p]}</Text>
                                                {balancePeriod === p && <Check color="#7C6FFF" size={18} />}
                                            </TouchableOpacity>
                                        ))}
                                        {/* Custom period */}
                                        <View style={{ paddingHorizontal: 16, paddingVertical: 13 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: balancePeriod === 'custom' ? 10 : 0 }}>
                                                <Text style={{ fontSize: 15, fontFamily: fonts.body, color: colors.textMuted }}>Custom</Text>
                                                {balancePeriod === 'custom' && <Check color="#7C6FFF" size={18} />}
                                            </View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                <TouchableOpacity onPress={() => { setShowCustomFromPicker(v => !v); setShowCustomToPicker(false); }}
                                                    style={{ flex: 1, backgroundColor: showCustomFromPicker ? 'rgba(124,111,255,0.15)' : 'rgba(255,255,255,0.06)', borderRadius: 8, paddingVertical: 8, alignItems: 'center', borderWidth: showCustomFromPicker ? 1 : 0, borderColor: '#7C6FFF' }}>
                                                    <Text style={{ fontSize: 13, fontFamily: fonts.body, color: colors.textPrimary }}>{format(customFrom, 'dd.MM.yy')}</Text>
                                                </TouchableOpacity>
                                                <Text style={{ color: colors.textDisabled }}>–</Text>
                                                <TouchableOpacity onPress={() => { setShowCustomToPicker(v => !v); setShowCustomFromPicker(false); }}
                                                    style={{ flex: 1, backgroundColor: showCustomToPicker ? 'rgba(124,111,255,0.15)' : 'rgba(255,255,255,0.06)', borderRadius: 8, paddingVertical: 8, alignItems: 'center', borderWidth: showCustomToPicker ? 1 : 0, borderColor: '#7C6FFF' }}>
                                                    <Text style={{ fontSize: 13, fontFamily: fonts.body, color: colors.textPrimary }}>{format(customTo, 'dd.MM.yy')}</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity onPress={() => { setBalancePeriod('custom'); setShowPeriodPicker(false); setShowCustomFromPicker(false); setShowCustomToPicker(false); }}
                                                    style={{ backgroundColor: '#7C6FFF', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
                                                    <Text style={{ fontSize: 12, fontFamily: fonts.bodySemiBold, color: '#fff' }}>OK</Text>
                                                </TouchableOpacity>
                                            </View>
                                            {(showCustomFromPicker || showCustomToPicker) && (
                                                <View style={{ marginTop: 8 }}>
                                                    <DateTimePicker
                                                        mode="date" display="inline" themeVariant="dark"
                                                        value={showCustomFromPicker ? customFrom : customTo}
                                                        maximumDate={new Date()}
                                                        onChange={(_, date) => {
                                                            if (!date) return;
                                                            if (showCustomFromPicker) { setCustomFrom(date); if (date > customTo) setCustomTo(date); }
                                                            else { setCustomTo(date); if (date < customFrom) setCustomFrom(date); }
                                                        }}
                                                    />
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                </>
                            )}

                            {/* Income / Expense / Remaining */}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                                <View>
                                    <Text style={{ fontSize: 20, fontFamily: fonts.bodySemiBold, color: colors.textPrimary }}>
                                        {formatAmount(periodIncome, currency)}
                                    </Text>
                                    <Text style={{ fontSize: 11, fontFamily: fonts.body, color: colors.textMuted }}>{t('dashboard.income')}</Text>
                                </View>
                                <View>
                                    <Text style={{ fontSize: 20, fontFamily: fonts.bodySemiBold, color: colors.textPrimary }}>
                                        {formatAmount(periodExpenses, currency)}
                                    </Text>
                                    <Text style={{ fontSize: 11, fontFamily: fonts.body, color: colors.textMuted }}>{t('dashboard.expenses')}</Text>
                                </View>
                                <View>
                                    <Text style={{ fontSize: 20, fontFamily: fonts.bodySemiBold, color: colors.textPrimary }}>
                                        {formatAmount(Math.abs(periodNet), currency)}
                                    </Text>
                                    <Text style={{ fontSize: 11, fontFamily: fonts.body, color: colors.textMuted }}>{t('dashboard.remaining')}</Text>
                                </View>
                            </View>

                            {/* Divider */}
                            <View style={{ height: 1, backgroundColor: colors.bgTertiary, marginBottom: 16 }} />

                            {/* Efficiency title */}
                            <Text style={{ fontSize: 15, fontFamily: fonts.bodySemiBold, color: colors.textPrimary, marginBottom: 12 }}>Efficiency</Text>

                            {balancePeriod === 'year' || balancePeriod === 'all' ? (
                                /* ── Year view: 12 month pills ── */
                                <>
                                    {[0, 1].map(row => (
                                        <View key={row} style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                                            {Array.from({ length: 6 }, (_, i) => {
                                                const mIdx = row * 6 + i;
                                                const mDate = new Date(realNow.getFullYear(), mIdx, 1);
                                                const mName = format(mDate, 'MMM').toLowerCase();
                                                const isFut = mIdx > realNow.getMonth();
                                                const isCur = mIdx === realNow.getMonth();

                                                // Monthly spending for this month
                                                const mStart2 = format(mDate, 'yyyy-MM-dd');
                                                const mEnd = format(new Date(realNow.getFullYear(), mIdx + 1, 0), 'yyyy-MM-dd');
                                                const mSpent = transactions.filter(t2 => t2.date >= mStart2 && t2.date <= mEnd)
                                                    .reduce((s, t2) => s + (t2.amount_base ?? t2.amount), 0);
                                                const mInc = incomeTx.filter(t2 => t2.date >= mStart2 && t2.date <= mEnd)
                                                    .reduce((s, t2) => s + (t2.amount_base ?? t2.amount), 0);

                                                let borderCol = 'rgba(255,255,255,0.15)';
                                                let textCol = colors.textDisabled;
                                                if (!isFut) {
                                                    textCol = colors.textPrimary;
                                                    if (mInc > 0 || mSpent > 0) {
                                                        const ratio = mInc > 0 ? mSpent / mInc : (mSpent > 0 ? 2 : 0);
                                                        if (ratio <= 0.7) borderCol = '#22c55e';
                                                        else if (ratio <= 1) borderCol = '#4ade80';
                                                        else if (ratio <= 1.15) borderCol = '#f97316';
                                                        else borderCol = '#ef4444';
                                                    }
                                                }

                                                return (
                                                    <TouchableOpacity key={mIdx}
                                                        onPress={() => { setBalancePeriod('month'); setBalanceMonth(mDate); }}
                                                        style={{
                                                            flex: 1, paddingVertical: 10, borderRadius: 20,
                                                            borderWidth: 1.5, borderColor: borderCol,
                                                            backgroundColor: isCur ? colors.bgTertiary : 'transparent',
                                                            alignItems: 'center',
                                                        }}>
                                                        <Text style={{ fontSize: 12, fontFamily: isCur ? fonts.bodySemiBold : fonts.body, color: textCol }}>{mName}</Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    ))}
                                </>
                            ) : (
                                /* ── Month/other view: daily calendar ── */
                                <>
                                    {/* Day headers */}
                                    <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                                        {dayNames.map(d => (
                                            <View key={d} style={{ flex: 1, alignItems: 'center' }}>
                                                <Text style={{ fontSize: 10, fontFamily: fonts.body, color: colors.textDisabled }}>{d}</Text>
                                            </View>
                                        ))}
                                    </View>

                                    {/* Calendar grid */}
                                    {Array.from({ length: cells.length / 7 }, (_, week) => (
                                        <View key={week} style={{ flexDirection: 'row', marginBottom: 8 }}>
                                            {cells.slice(week * 7, week * 7 + 7).map((day, i) => {
                                                if (day === null) return <View key={`e${i}`} style={{ flex: 1, alignItems: 'center' }} />;
                                                const isFut = day > todayNum;
                                                const isT = day === todayNum && isCurrentMonth;
                                                const col = dayColor(day);
                                                const hasBorder = !isFut && col !== 'transparent';
                                                return (
                                                    <View key={day} style={{ flex: 1, alignItems: 'center' }}>
                                                        <View style={{
                                                            width: 34, height: 34, borderRadius: 17,
                                                            borderWidth: hasBorder ? 2 : 0,
                                                            borderColor: hasBorder ? col : 'transparent',
                                                            backgroundColor: isT ? colors.bgTertiary : 'transparent',
                                                            alignItems: 'center', justifyContent: 'center',
                                                        }}>
                                                            <Text style={{
                                                                fontSize: 13, fontFamily: isT ? fonts.bodySemiBold : fonts.body,
                                                                color: isFut ? colors.textDisabled : colors.textPrimary,
                                                            }}>{day}</Text>
                                                        </View>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    ))}
                                </>
                            )}

                            {/* Legend */}
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' }} />
                                    <Text style={{ fontSize: 9, fontFamily: fonts.body, color: colors.textDisabled }}>Saved &gt;30%</Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#4ade80' }} />
                                    <Text style={{ fontSize: 9, fontFamily: fonts.body, color: colors.textDisabled }}>Saved &lt;30%</Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textDisabled }} />
                                    <Text style={{ fontSize: 9, fontFamily: fonts.body, color: colors.textDisabled }}>Upcoming</Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#f97316' }} />
                                    <Text style={{ fontSize: 9, fontFamily: fonts.body, color: colors.textDisabled }}>Overspent &lt;15%</Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#ef4444' }} />
                                    <Text style={{ fontSize: 9, fontFamily: fonts.body, color: colors.textDisabled }}>Overspent &gt;15%</Text>
                                </View>
                            </View>
                        </View>
                    );
                })()}


                {/* ── Summary donut (Сводка) ── */}
                {!loadingTx && (() => {
                    const inc = periodSummary.income;
                    const exp = periodSummary.expenses;
                    const bal = periodSummary.net;
                    const tot = inc + exp || 1;
                    const MIN_FRAC = 0.08;
                    let incFrac = inc / tot, expFrac = exp / tot;
                    if (inc > 0 && exp > 0) {
                        if (incFrac < MIN_FRAC) { incFrac = MIN_FRAC; expFrac = 1 - MIN_FRAC; }
                        if (expFrac < MIN_FRAC) { expFrac = MIN_FRAC; incFrac = 1 - MIN_FRAC; }
                    }
                    const RING = 160, rcx = RING / 2, rcy = RING / 2, rr = 62, rsw = 16;
                    const rC = 2 * Math.PI * rr;
                    const hasTwo = inc > 0 && exp > 0;
                    const gap = hasTwo ? rsw + 4 : 0;
                    const avail = rC - (gap * (hasTwo ? 2 : 0));
                    const incLen = incFrac * avail;
                    const expLen = expFrac * avail;
                    const polXY = (deg: number) => {
                        const rad = (deg - 90) * (Math.PI / 180);
                        return { x: rcx + rr * Math.cos(rad), y: rcy + rr * Math.sin(rad) };
                    };
                    const incSweepDeg = (incLen / rC) * 360;
                    const gapDeg = (gap / rC) * 360;
                    const expStartDeg = incSweepDeg + gapDeg;
                    const expSweepDeg = (expLen / rC) * 360;
                    const makeArc = (sDeg: number, swDeg: number) => {
                        const s = polXY(sDeg), e = polXY(sDeg + swDeg);
                        return `M ${s.x} ${s.y} A ${rr} ${rr} 0 ${swDeg > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
                    };

                    return (
                        <View style={{ backgroundColor: colors.bgSecondary, borderRadius: 20, padding: 16, marginBottom: 24 }}>
                            {/* Header: title + period pills */}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                <Text style={{ fontSize: 15, fontFamily: fonts.bodySemiBold, color: colors.textPrimary }}>{t('analytics.summary')}</Text>
                                <View style={{ flexDirection: 'row', backgroundColor: colors.bgTertiary, borderRadius: 10, padding: 3 }}>
                                    {(['day', 'week', 'month', 'quarter', 'year'] as AnalyticsPeriod[]).map(p => (
                                        <TouchableOpacity key={p} onPress={() => setAnalyticsPeriod(p)}
                                            style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: analyticsPeriod === p ? colors.bgSecondary : 'transparent' }}>
                                            <Text style={{ fontSize: 11, fontFamily: analyticsPeriod === p ? fonts.bodySemiBold : fonts.body, color: analyticsPeriod === p ? colors.textPrimary : colors.textMuted }}>
                                                {ANALYTICS_LABELS[p]}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>

                            {/* Donut + Legend row */}
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                {/* Donut */}
                                <View style={{ width: RING, height: RING }}>
                                    <Svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`}>
                                        <SvgCircle cx={rcx} cy={rcy} r={rr} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={rsw} />
                                        {inc > 0 && <SvgPath d={makeArc(0, incSweepDeg)} fill="none" stroke="#4CAF50" strokeWidth={rsw} strokeLinecap="round" />}
                                        {exp > 0 && <SvgPath d={makeArc(expStartDeg, expSweepDeg)} fill="none" stroke="#7B61FF" strokeWidth={rsw} strokeLinecap="round" />}
                                    </Svg>
                                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                                        <Text style={{ fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.textPrimary }}>
                                            {bal >= 0 ? '+' : '−'}{formatAmount(Math.abs(bal), currency)}
                                        </Text>
                                        <Text style={{ fontSize: 9, fontFamily: fonts.body, color: colors.textMuted, marginTop: 1 }}>{t('analytics.balanceLabel')}</Text>
                                    </View>
                                </View>
                                {/* Legend */}
                                <View style={{ flex: 1, paddingLeft: 14, gap: 14 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#4CAF50' }} />
                                        <View>
                                            <Text style={{ fontSize: 11, fontFamily: fonts.body, color: colors.textMuted }}>{t('dashboard.income')}</Text>
                                            <Text style={{ fontSize: 16, fontFamily: fonts.bodySemiBold, color: colors.textPrimary }}>{formatAmount(inc, currency)}</Text>
                                        </View>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#7B61FF' }} />
                                        <View>
                                            <Text style={{ fontSize: 11, fontFamily: fonts.body, color: colors.textMuted }}>{t('dashboard.expenses')}</Text>
                                            <Text style={{ fontSize: 16, fontFamily: fonts.bodySemiBold, color: colors.textPrimary }}>{formatAmount(exp, currency)}</Text>
                                        </View>
                                    </View>
                                    <View style={{ marginLeft: 16 }}>
                                        <Text style={{ fontSize: 11, fontFamily: fonts.body, color: colors.textMuted }}>{t('dashboard.netBalance')}</Text>
                                        <Text style={{ fontSize: 16, fontFamily: fonts.bodySemiBold, color: colors.textPrimary }}>
                                            {bal >= 0 ? '+' : '−'}{formatAmount(Math.abs(bal), currency)}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </View>
                    );
                })()}


                {/* ── Savings goals ── */}
                <View style={{ marginBottom: 48 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                        <Text style={{ color: colors.textPrimary, fontSize: 16, fontFamily: fonts.bodySemiBold }}>{t('dashboard.savingsGoals')}</Text>
                        <TouchableOpacity onPress={() => openGoalForm()} hitSlop={8}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.bgTertiary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
                            <Plus color={colors.textSecondary} size={14} />
                            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t('dashboard.newGoal')}</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        style={{ marginHorizontal: -24, paddingHorizontal: 24 }}>
                        {goals.map(goal => {
                            const pct = goal.target > 0 ? Math.min(1, goal.saved / goal.target) : 0;
                            const TOTAL_DOTS = 40;
                            const filledCount = Math.round(pct * TOTAL_DOTS);
                            const goalDots: DotData[] = Array.from({ length: TOTAL_DOTS }, (_, i) => ({
                                color: i < filledCount ? goal.color : colors.bgTertiary,
                                state: i < filledCount ? 'filled' : 'empty',
                            }));
                            return (
                                <TouchableOpacity key={goal.id} activeOpacity={0.85}
                                    onPress={() => setGoalSheet(goal)}
                                    style={{ backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.bgTertiary, borderRadius: 16, marginRight: 14, width: 168, padding: 14 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                        <Text style={{ fontSize: 20 }}>{goal.icon}</Text>
                                        <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600', flex: 1 }} numberOfLines={2}>{goal.name}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
                                        {goalDots.map((dot, i) => (
                                            <View key={i} style={{
                                                width: 8, height: 8, borderRadius: 4,
                                                backgroundColor: dot.state === 'filled' ? dot.color : 'transparent',
                                                borderWidth: dot.state === 'filled' ? 0 : 1,
                                                borderColor: dot.color,
                                            }} />
                                        ))}
                                    </View>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10 }}>
                                        <Text style={{ color: goal.color, fontSize: 20, fontWeight: 'bold' }}>{Math.round(pct * 100)}%</Text>
                                        <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={1}>{formatAmount(goal.saved, goal.currency)} / {formatAmount(goal.target, goal.currency)}</Text>
                                    </View>
                                    {goal.targetDate && (
                                        <Text style={{ color: colors.textDisabled, fontSize: 11, marginTop: 4 }}>
                                            {t('dashboard.goalDeadline', { date: format(new Date(goal.targetDate + 'T00:00:00'), 'd MMM yyyy') })}
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            );
                        })}

                        <TouchableOpacity onPress={() => openGoalForm()} activeOpacity={0.7}
                            style={{ backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.borderLight, borderStyle: 'dashed', borderRadius: 16, padding: 16, marginRight: 24, width: 160, height: 180, justifyContent: 'center', alignItems: 'center' }}>
                            <Plus color={colors.textDisabled} size={28} />
                            <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}>{goals.length === 0 ? t('dashboard.addFirstGoal') : t('dashboard.addGoal')}</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>

            </ScrollView>

            {/* FAB */}
            <TouchableOpacity
                onPress={() => setAddMethodVisible(true)}
                style={{ position: 'absolute', bottom: 24, right: 24, backgroundColor: '#2563eb', width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' }}
                activeOpacity={0.8}
            >
                <Plus color="#ffffff" size={32} />
            </TouchableOpacity>

            {/* ════════════════════════════════════════════════════════════════
                MODAL 1 — Account action sheet (tap on card)
            ════════════════════════════════════════════════════════════════ */}
            <BaseBottomSheet visible={!!actionAccount && !txFormVisible} onClose={() => setActionAccount(null)} scrollable={false}>
                {/* Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
                    {(() => { const IC = ICON_MAP[actionAccount?.icon ?? 'CreditCard'] ?? CreditCard; return <IC color={actionAccount?.color ?? '#3b82f6'} size={22} />; })()}
                    <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: 'bold', marginLeft: 10, flex: 1 }} numberOfLines={1}>{actionAccount?.name}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{hidden ? '••••' : formatAmount(actionAccount?.balance ?? 0, actionAccount?.currency ?? currency)}</Text>
                </View>

                {/* 4 action buttons */}
                <View style={{ flexDirection: 'row', gap: 12 }}>
                    {[
                        { label: t('dashboard.incomeLabel'),   icon: <TrendingUp color="#fff" size={22} />,    bg: '#16a34a', action: () => openTxForm('income') },
                        { label: t('dashboard.expenseLabel'),  icon: <TrendingDown color="#fff" size={22} />,  bg: '#dc2626', action: () => openTxForm('expense') },
                        { label: t('dashboard.transferLabel'), icon: <ArrowRightLeft color="#fff" size={22} />, bg: '#2563eb', action: () => openTxForm('transfer') },
                        { label: t('dashboard.history'), icon: <Clock color="#fff" size={22} />,          bg: colors.borderLight, action: () => openHistory(actionAccount!) },
                    ].map(btn => (
                        <TouchableOpacity key={btn.label} onPress={btn.action} activeOpacity={0.8}
                            style={{ flex: 1, backgroundColor: btn.bg, borderRadius: 14, paddingVertical: 14, alignItems: 'center', gap: 6 }}>
                            {btn.icon}
                            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{btn.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </BaseBottomSheet>

            {/* ════════════════════════════════════════════════════════════════
                Unified Transaction Form (income / expense / transfer)
            ════════════════════════════════════════════════════════════════ */}
            <TransactionForm
                visible={txFormVisible}
                onClose={() => { setTxFormVisible(false); setActionAccount(null); }}
                onSaved={() => { setTxFormVisible(false); setActionAccount(null); loadData(); }}
                accounts={accounts}
                categories={categories}
                householdId={householdId!}
                userId={userId!}
                baseCurrency={currency}
                initialType={txFormInitialType}
                initialAccountId={txFormInitialAccId}
                onCategoriesChanged={async (hid) => {
                    const { data } = await supabase.from('categories').select('*')
                        .eq('household_id', hid)
                        .eq('is_hidden', false).order('name');
                    setCategories(data ?? []);
                }}
            />

            {/* ════════════════════════════════════════════════════════════════
                MODAL 4 — Transaction history
            ════════════════════════════════════════════════════════════════ */}
            <BaseBottomSheet visible={!!historyAccount} onClose={() => setHistoryAccount(null)} maxHeight="88%">
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <View>
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{t('dashboard.history')}</Text>
                        <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: 'bold' }}>{historyAccount?.name}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setHistoryAccount(null)} hitSlop={8}><X color={colors.textMuted} size={22} /></TouchableOpacity>
                </View>

                {/* Period filter */}
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: historyPeriod === 'custom' ? 8 : 16, flexWrap: 'wrap' }}>
                    {(['week', 'month', 'year', 'all', 'custom'] as const).map(p => (
                        <TouchableOpacity key={p} onPress={() => {
                            if (p === 'custom') {
                                setHistoryCustomFrom(startOfMonth(new Date()));
                                setHistoryCustomTo(new Date());
                                changeHistoryPeriod('custom', startOfMonth(new Date()), new Date());
                            } else {
                                setHistoryPickerField(null);
                                changeHistoryPeriod(p);
                            }
                        }}
                            style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
                                backgroundColor: historyPeriod === p ? '#7C6FFF' : colors.bgTertiary }}>
                            <Text style={{ color: historyPeriod === p ? '#fff' : colors.textSecondary, fontSize: 12, fontWeight: '600' }}>
                                {p === 'week' ? t('transactions.week') : p === 'month' ? t('transactions.month') : p === 'year' ? t('transactions.year') : p === 'all' ? t('transactions.allTime') : t('transactions.custom')}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
                {historyPeriod === 'custom' && (
                    <View style={{ marginBottom: 16 }}>
                        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                            <TouchableOpacity onPress={() => setHistoryPickerField(historyPickerField === 'from' ? null : 'from')}
                                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.bgTertiary, borderRadius: 10, paddingVertical: 10, borderWidth: 1.5, borderColor: historyPickerField === 'from' ? '#7C6FFF' : colors.borderLight }}>
                                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{t('transactions.from')}:</Text>
                                <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600' }}>{historyCustomFrom ? format(historyCustomFrom, 'd MMM yyyy') : '—'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setHistoryPickerField(historyPickerField === 'to' ? null : 'to')}
                                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.bgTertiary, borderRadius: 10, paddingVertical: 10, borderWidth: 1.5, borderColor: historyPickerField === 'to' ? '#7C6FFF' : colors.borderLight }}>
                                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{t('transactions.to')}:</Text>
                                <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600' }}>{historyCustomTo ? format(historyCustomTo, 'd MMM yyyy') : '—'}</Text>
                            </TouchableOpacity>
                        </View>
                        {historyPickerField && (
                            <View style={{ backgroundColor: colors.bgTertiary, borderRadius: 14, overflow: 'hidden' }}>
                                <DateTimePicker
                                    mode="date" display="inline" themeVariant="dark"
                                    value={historyPickerField === 'from' ? (historyCustomFrom ?? new Date()) : (historyCustomTo ?? new Date())}
                                    onChange={(_, date) => {
                                        if (!date) return;
                                        if (historyPickerField === 'from') {
                                            setHistoryCustomFrom(date);
                                            changeHistoryPeriod('custom', date, historyCustomTo);
                                        } else {
                                            setHistoryCustomTo(date);
                                            changeHistoryPeriod('custom', historyCustomFrom, date);
                                        }
                                        setHistoryPickerField(null);
                                    }}
                                />
                            </View>
                        )}
                    </View>
                )}

                {loadingHistory ? (
                    <ActivityIndicator color={colors.textPrimary} style={{ marginVertical: 40 }} />
                ) : historyTx.length === 0 ? (
                    <Text style={{ color: colors.textDisabled, textAlign: 'center', marginVertical: 40, fontSize: 15 }}>{t('dashboard.noTransactions')}</Text>
                ) : (
                    <>
                        {historyTx.map((tx, idx) => {
                            const isIncome   = tx.type === 'income';
                            const isTransfer = tx.type === 'transfer';
                            const amtColor   = isIncome ? '#22c55e' : isTransfer ? '#60a5fa' : '#f87171';
                            const amtPrefix  = isIncome ? '+' : isTransfer ? '↔' : '−';
                            const catName    = tx.categories?.name ?? (isIncome ? t('dashboard.incomeLabel') : isTransfer ? t('dashboard.transferLabel') : t('dashboard.expenseLabel'));

                            return (
                                <View key={tx.id}
                                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: idx < historyTx.length - 1 ? 1 : 0, borderBottomColor: colors.bgTertiary }}>
                                    <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.bgTertiary, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                        {isIncome
                                            ? <TrendingUp color="#22c55e" size={18} />
                                            : isTransfer
                                                ? <ArrowRightLeft color="#60a5fa" size={18} />
                                                : <Minus color="#f87171" size={18} />}
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '500' }} numberOfLines={1}>{catName}</Text>
                                        {tx.note ? <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }} numberOfLines={1}>{tx.note}</Text> : null}
                                    </View>
                                    <View style={{ alignItems: 'flex-end' }}>
                                        <Text style={{ color: amtColor, fontSize: 14, fontWeight: '600' }}>
                                            {amtPrefix}{formatAmount(tx.amount, tx.currency)}
                                        </Text>
                                        <Text style={{ color: colors.textDisabled, fontSize: 11, marginTop: 2 }}>
                                            {format(new Date(tx.date), 'd MMM')}
                                        </Text>
                                    </View>
                                </View>
                            );
                        })}
                    </>
                )}
            </BaseBottomSheet>

            {/* ════════════════════════════════════════════════════════════════
                MODAL 5 — Edit / Delete (long press)
            ════════════════════════════════════════════════════════════════ */}
            <BaseBottomSheet visible={!!menuAccount} onClose={() => setMenuAccount(null)} animationType="fade" scrollable={false}>
                        <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: 'bold', marginBottom: 20 }} numberOfLines={1}>{menuAccount?.name}</Text>
                        <TouchableOpacity onPress={() => menuAccount && openEdit(menuAccount)}
                            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.bgTertiary }}>
                            <Pencil color={colors.textSecondary} size={20} />
                            <Text style={{ color: colors.textPrimary, fontSize: 16, marginLeft: 16 }}>{t('dashboard.editLabel')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => menuAccount && confirmDelete(menuAccount)}
                            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16 }}>
                            <Trash2 color="#ef4444" size={20} />
                            <Text style={{ color: '#f87171', fontSize: 16, marginLeft: 16 }}>{t('dashboard.deleteAccountLabel')}</Text>
                        </TouchableOpacity>
            </BaseBottomSheet>

            {/* ════════════════════════════════════════════════════════════════
                MODAL 6 — Add / Edit account form
            ════════════════════════════════════════════════════════════════ */}
            <BaseBottomSheet visible={formVisible} onClose={() => setFormVisible(false)} maxHeight="90%">
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                            <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: 'bold' }}>{editingId ? t('dashboard.editAccount') : t('dashboard.newAccount')}</Text>
                            <TouchableOpacity onPress={() => setFormVisible(false)} hitSlop={8}><X color={colors.textMuted} size={22} /></TouchableOpacity>
                        </View>
                            <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 6 }}>{t('dashboard.accountName')}</Text>
                            <TextInput value={formName} onChangeText={setFormName} placeholder={t('dashboard.accountExample')} placeholderTextColor={colors.textDisabled}
                                style={{ backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16, fontSize: 15 }} />

                            <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 8 }}>{t('dashboard.accountCurrency')}</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                                {CURRENCIES.map(c => (
                                    <TouchableOpacity key={c} onPress={() => setFormCurrency(c)}
                                        style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, marginRight: 8, backgroundColor: formCurrency === c ? '#2563eb' : colors.bgTertiary }}>
                                        <Text style={{ color: formCurrency === c ? '#fff' : colors.textSecondary, fontWeight: formCurrency === c ? 'bold' : 'normal' }}>{c}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>

                            <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 6 }}>{editingId ? t('dashboard.accountBalance') : t('dashboard.initialBalance')}</Text>
                            <TextInput value={formBalance} onChangeText={setFormBalance} keyboardType="numeric" placeholderTextColor={colors.textDisabled}
                                style={{ backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16, fontSize: 15 }} />

                            <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 10 }}>{t('dashboard.accountColor')}</Text>
                            <View style={{ flexDirection: 'row', marginBottom: 16 }}>
                                {COLORS.map(c => (
                                    <TouchableOpacity key={c} onPress={() => setFormColor(c)}
                                        style={{ width: 32, height: 32, borderRadius: 16, marginRight: 10, backgroundColor: c, alignItems: 'center', justifyContent: 'center' }}>
                                        {formColor === c && <Check color="#fff" size={16} />}
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 10 }}>{t('dashboard.accountIcon')}</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 }}>
                                {Object.entries(ICON_MAP).map(([name, IC]) => (
                                    <TouchableOpacity key={name} onPress={() => setFormIcon(name)}
                                        style={{ width: 48, height: 48, borderRadius: 12, marginRight: 8, marginBottom: 8, backgroundColor: formIcon === name ? '#2563eb' : colors.bgTertiary, alignItems: 'center', justifyContent: 'center' }}>
                                        <IC color={formIcon === name ? '#fff' : colors.textMuted} size={22} />
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, marginBottom: 20 }}>
                                <Text style={{ color: colors.textPrimary, fontSize: 14 }}>{t('dashboard.hideFromBalance')}</Text>
                                <Switch value={formExclude} onValueChange={setFormExclude} trackColor={{ false: colors.borderLight, true: '#2563eb' }} thumbColor="#fff" />
                            </View>

                            <TouchableOpacity onPress={saveAccount} disabled={saving || !formName.trim()}
                                style={{ paddingVertical: 16, borderRadius: 20, backgroundColor: saving || !formName.trim() ? colors.borderLight : '#2563eb', alignItems: 'center' }}>
                                {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>{editingId ? t('common.save') : t('dashboard.createAccount')}</Text>}
                            </TouchableOpacity>
            </BaseBottomSheet>

            {/* ════════════════════════════════════════════════════════════════
                MODAL 7 — Goal action sheet (tap on card)
            ════════════════════════════════════════════════════════════════ */}
            <BaseBottomSheet visible={!!goalSheet && !goalFormVisible && !depositGoal && !withdrawGoal} onClose={() => setGoalSheet(null)} scrollable={false}>
                        {/* Header */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                            <Text style={{ fontSize: 28, marginRight: 12 }}>{goalSheet?.icon}</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: 'bold' }} numberOfLines={1}>{goalSheet?.name}</Text>
                                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                                    {goalSheet && formatAmount(goalSheet.saved, goalSheet.currency)} / {goalSheet && formatAmount(goalSheet.target, goalSheet.currency)}
                                </Text>
                            </View>
                            <Text style={{ color: goalSheet?.color, fontSize: 22, fontWeight: 'bold' }}>
                                {goalSheet && Math.round(Math.min(1, goalSheet.saved / goalSheet.target) * 100)}%
                            </Text>
                        </View>
                        {/* Progress bar */}
                        {goalSheet && (
                            <View style={{ height: 4, backgroundColor: colors.bgTertiary, borderRadius: 2, marginBottom: 24 }}>
                                <View style={{ width: `${Math.min(100, (goalSheet.saved / goalSheet.target) * 100)}%` as any, height: 4, borderRadius: 2, backgroundColor: goalSheet.color }} />
                            </View>
                        )}
                        {/* Actions */}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                            {[
                                { label: t('dashboard.topUp'), emoji: '💰', color: '#22c55e', bg: '#14532d', action: () => { const g = goalSheet!; setGoalSheet(null); setDepositGoal(g); setDepositAmount(''); setDepositNote(''); setDepositAccId(accounts.length > 0 ? accounts[0].id : ''); } },
                                { label: t('dashboard.transfer'), emoji: '💸', color: '#f59e0b', bg: colors.bgTertiary, action: () => { const g = goalSheet!; setGoalSheet(null); setWithdrawGoal(g); setWithdrawAmount(''); setWithdrawNote(''); setWithdrawAccId(g.accountId || accounts[0]?.id || ''); } },
                                { label: t('dashboard.edit'),  emoji: '✏️',  color: colors.textSecondary, bg: colors.bgTertiary, action: () => { const g = goalSheet!; setGoalSheet(null); openGoalForm(g); } },
                                { label: t('common.delete'),   emoji: '🗑️',  color: '#ef4444', bg: colors.bgTertiary, action: () => goalSheet && confirmDeleteGoal(goalSheet) },
                            ].map(btn => (
                                <TouchableOpacity key={btn.label} onPress={btn.action} activeOpacity={0.8}
                                    style={{ flex: 1, backgroundColor: btn.bg, borderRadius: 14, paddingVertical: 14, alignItems: 'center', gap: 6 }}>
                                    <Text style={{ fontSize: 22 }}>{btn.emoji}</Text>
                                    <Text style={{ color: btn.color, fontSize: 12, fontWeight: '600' }}>{btn.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
            </BaseBottomSheet>

            {/* ════════════════════════════════════════════════════════════════
                MODAL 8 — New / Edit savings goal
            ════════════════════════════════════════════════════════════════ */}
            <BaseBottomSheet visible={goalFormVisible} onClose={() => setGoalFormVisible(false)} maxHeight="90%">
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                            <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: 'bold' }}>{editingGoal ? t('dashboard.editGoal') : t('dashboard.newGoal')}</Text>
                            <TouchableOpacity onPress={() => setGoalFormVisible(false)} hitSlop={8}><X color={colors.textMuted} size={22} /></TouchableOpacity>
                        </View>
                            {/* 1. Название */}
                            <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 6 }}>{t('dashboard.goalName')}</Text>
                            <TextInput value={goalName} onChangeText={setGoalName}
                                placeholder={t('dashboard.goalExample')} placeholderTextColor={colors.textDisabled}
                                style={{ backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16, fontSize: 15 }} />

                            {/* 2. Эмодзи + Цвет в одну строку */}
                            <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16 }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 8 }}>{t('dashboard.emoji')}</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                        {['🎯','✈️','🏠','🚗','💻','📱','🎓','💍','🏝️','🛍️','🎮','🏋️','🌍','🐶','💰'].map(e => (
                                            <TouchableOpacity key={e} onPress={() => setGoalIcon(e)}
                                                style={{ width: 40, height: 40, borderRadius: 12, marginRight: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: goalIcon === e ? '#2563eb' : colors.bgTertiary, borderWidth: goalIcon === e ? 0 : 1, borderColor: colors.borderLight }}>
                                                <Text style={{ fontSize: 20 }}>{e}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                </View>
                                <View>
                                    <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 8 }}>{t('dashboard.goalColor')}</Text>
                                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', maxWidth: 120 }}>
                                        {COLORS.map(c => (
                                            <TouchableOpacity key={c} onPress={() => setGoalColor(c)}
                                                style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c, alignItems: 'center', justifyContent: 'center', borderWidth: goalColor === c ? 3 : 0, borderColor: '#fff' }}>
                                                {goalColor === c && <Check color="#fff" size={12} />}
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                            </View>

                            {/* 3. Целевая сумма + валюта */}
                            <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 6 }}>{t('dashboard.targetAmount')}</Text>
                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: goalCurrencyOpen ? 8 : 16 }}>
                                <TextInput value={goalTarget} onChangeText={setGoalTarget}
                                    keyboardType="numeric" placeholder="0.00" placeholderTextColor={colors.textDisabled}
                                    style={{ flex: 1, backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 22, fontWeight: 'bold' }} />
                                <TouchableOpacity onPress={() => { setGoalCurrencyOpen(v => !v); setGoalCurrencySearch(''); }}
                                    activeOpacity={0.8}
                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, borderRadius: 12, backgroundColor: colors.bgTertiary, borderWidth: 1.5, borderColor: goalCurrencyOpen ? '#2563eb' : colors.borderLight, minWidth: 82 }}>
                                    <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '700' }}>{goalCurrency || 'USD'}</Text>
                                    <ChevronDown color={colors.textMuted} size={15} style={{ transform: [{ rotate: goalCurrencyOpen ? '180deg' : '0deg' }] }} />
                                </TouchableOpacity>
                            </View>
                            {goalCurrencyOpen && (() => {
                                const q = goalCurrencySearch.trim().toLowerCase();
                                const vis = q
                                    ? CURRENCY_LIST.filter(c => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
                                    : CURRENCY_LIST;
                                return (
                                    <View style={{ backgroundColor: colors.bgTertiary, borderRadius: 14, marginBottom: 16, borderWidth: 1, borderColor: colors.borderLight, overflow: 'hidden', maxHeight: 260 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderLight }}>
                                            <Search color={colors.textDisabled} size={15} />
                                            <TextInput
                                                value={goalCurrencySearch} onChangeText={setGoalCurrencySearch}
                                                placeholder={t('transactionForm.searchCurrency')}
                                                placeholderTextColor={colors.textDisabled} autoFocus
                                                style={{ flex: 1, color: colors.textPrimary, fontSize: 14, padding: 0 }}
                                            />
                                            {goalCurrencySearch.length > 0 && (
                                                <TouchableOpacity onPress={() => setGoalCurrencySearch('')} hitSlop={8}>
                                                    <X color={colors.textDisabled} size={14} />
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                                            {vis.length === 0 ? (
                                                <Text style={{ color: colors.textDisabled, fontSize: 14, textAlign: 'center', paddingVertical: 20 }}>{t('common.nothingFound')}</Text>
                                            ) : vis.map((c, i) => (
                                                <TouchableOpacity key={c.code}
                                                    onPress={() => { setGoalCurrency(c.code); setGoalCurrencyOpen(false); setGoalCurrencySearch(''); }}
                                                    activeOpacity={0.7}
                                                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: i < vis.length - 1 ? 1 : 0, borderBottomColor: colors.borderLight, backgroundColor: (goalCurrency || 'USD') === c.code ? '#172554' : 'transparent' }}>
                                                    <View>
                                                        <Text style={{ color: (goalCurrency || 'USD') === c.code ? '#fff' : '#e5e7eb', fontSize: 14, fontWeight: (goalCurrency || 'USD') === c.code ? '700' : '500' }}>{c.code}</Text>
                                                        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>{c.name}</Text>
                                                    </View>
                                                    {(goalCurrency || 'USD') === c.code && <Check color="#2563eb" size={16} />}
                                                </TouchableOpacity>
                                            ))}
                                        </ScrollView>
                                    </View>
                                );
                            })()}

                            {/* 4. Списывать со счёта */}
                            <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 10 }}>{t('dashboard.debitAccount')}</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                                {accounts.map(acc => (
                                    <TouchableOpacity key={acc.id} onPress={() => { setGoalAccId(acc.id); setGoalCurrency(acc.currency); }}
                                        style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, marginRight: 8, borderWidth: 1.5, borderColor: goalAccId === acc.id ? '#2563eb' : colors.borderLight, backgroundColor: goalAccId === acc.id ? '#172554' : colors.bgTertiary }}>
                                        <Text style={{ color: goalAccId === acc.id ? colors.textPrimary : colors.textSecondary, fontSize: 13 }} numberOfLines={1}>{acc.name}</Text>
                                        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{formatAmount(acc.balance, acc.currency)}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>

                            {/* 5. Начальный взнос (создание) / Внести сумму (редактирование) */}
                            {!editingGoal ? (
                                <>
                                    <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 6 }}>{t('dashboard.initialDeposit')} <Text style={{ color: colors.textDisabled }}>({t('dashboard.optional')})</Text></Text>
                                    <TextInput value={goalInitialDeposit} onChangeText={v => setGoalInitialDeposit(v.replace(/[^0-9.,]/g, ''))}
                                        keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textDisabled}
                                        style={{ backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16, fontSize: 15 }} />
                                </>
                            ) : (
                                <>
                                    <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 6 }}>{t('dashboard.depositAmount')} <Text style={{ color: colors.textDisabled }}>({t('dashboard.optional')})</Text></Text>
                                    <TextInput value={goalInitialDeposit} onChangeText={v => setGoalInitialDeposit(v.replace(/[^0-9.,]/g, ''))}
                                        keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textDisabled}
                                        style={{ backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16, fontSize: 15 }} />
                                </>
                            )}

                            {/* 6. Дата достижения */}
                            <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 6 }}>{t('dashboard.targetDate')} <Text style={{ color: colors.textDisabled }}>({t('dashboard.optional')})</Text></Text>
                            <TextInput value={goalDate} onChangeText={v => setGoalDate(formatDateInput(v))}
                                keyboardType="numeric" placeholder={t('dashboard.datePlaceholder')} placeholderTextColor={colors.textDisabled}
                                maxLength={10}
                                style={{ backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 24, fontSize: 15, letterSpacing: 1 }} />

                            <TouchableOpacity onPress={saveGoal} disabled={savingGoal || !goalName.trim() || !goalTarget || !goalAccId}
                                style={{ paddingVertical: 16, borderRadius: 20, alignItems: 'center', backgroundColor: savingGoal || !goalName.trim() || !goalTarget || !goalAccId ? colors.borderLight : '#22c55e' }}>
                                {savingGoal ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>{editingGoal ? t('common.save') : t('dashboard.createGoal')}</Text>}
                            </TouchableOpacity>
            </BaseBottomSheet>

            {/* ════════════════════════════════════════════════════════════════
                MODAL 8 — Deposit to savings goal
            ════════════════════════════════════════════════════════════════ */}
            <BaseBottomSheet visible={!!depositGoal} onClose={() => setDepositGoal(null)} scrollable={false}>
                        {/* Header */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <Text style={{ fontSize: 24 }}>{depositGoal?.icon}</Text>
                                <View>
                                    <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700' }}>{t('dashboard.depositTitle')}</Text>
                                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>{depositGoal?.name}</Text>
                                </View>
                            </View>
                            <TouchableOpacity onPress={() => setDepositGoal(null)} hitSlop={12}>
                                <X color={colors.textMuted} size={22} />
                            </TouchableOpacity>
                        </View>

                        {/* Progress reminder */}
                        {depositGoal && (
                            <View style={{ backgroundColor: '#0f172a', borderRadius: 12, padding: 12, marginBottom: 20, flexDirection: 'row', justifyContent: 'space-between' }}>
                                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t('dashboard.saved')}</Text>
                                <Text style={{ color: depositGoal.color, fontSize: 13, fontWeight: '600' }}>
                                    {formatAmount(depositGoal.saved, depositGoal.currency)} / {formatAmount(depositGoal.target, depositGoal.currency)}
                                </Text>
                            </View>
                        )}

                        {/* Source account */}
                        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 8 }}>{t('dashboard.debitFrom')}</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                            {accounts.map(a => {
                                const Ic = ICON_MAP[a.icon ?? ''] ?? Wallet;
                                const sel = depositAccId === a.id;
                                return (
                                    <TouchableOpacity key={a.id} onPress={() => setDepositAccId(a.id)}
                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, marginRight: 8, backgroundColor: sel ? 'rgba(124,111,255,0.15)' : colors.bgTertiary, borderWidth: sel ? 1 : 0, borderColor: '#7C6FFF' }}>
                                        <Ic color={a.color ?? '#888'} size={18} />
                                        <View>
                                            <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600' }}>{a.name}</Text>
                                            <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{formatAmount(a.balance, a.currency)}</Text>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>

                        {/* Amount */}
                        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 8 }}>{t('dashboard.depositAmountLabel', { currency: depositGoal?.currency })}</Text>
                        <TextInput
                            value={depositAmount}
                            onChangeText={v => setDepositAmount(v.replace(/[^0-9.,]/g, ''))}
                            keyboardType="decimal-pad"
                            placeholder="0"
                            placeholderTextColor={colors.textDisabled}
                            style={{ backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 18, marginBottom: 16, fontSize: 28, fontWeight: '700', textAlign: 'center' }}
                        />

                        {/* Note */}
                        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 8 }}>{t('dashboard.noteOptional')}</Text>
                        <TextInput
                            value={depositNote}
                            onChangeText={setDepositNote}
                            placeholder={t('dashboard.noteFromPlaceholder')}
                            placeholderTextColor={colors.textDisabled}
                            style={{ backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 24, fontSize: 15 }}
                        />

                        {/* Save */}
                        <TouchableOpacity
                            onPress={handleDeposit}
                            disabled={depositing || !depositAmount || parseFloat(depositAmount) <= 0 || !depositAccId}
                            style={{ paddingVertical: 16, borderRadius: 16, alignItems: 'center', backgroundColor: depositing || !depositAmount || parseFloat(depositAmount) <= 0 || !depositAccId ? colors.borderLight : '#16a34a' }}
                        >
                            {depositing
                                ? <ActivityIndicator color="#fff" />
                                : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                                    {t('dashboard.depositTitle')}{depositAmount && parseFloat(depositAmount) > 0 ? ` ${formatAmount(parseFloat(depositAmount), depositGoal?.currency ?? 'EUR')}` : ''}
                                  </Text>
                            }
                        </TouchableOpacity>
            </BaseBottomSheet>

            {/* ════════════════════════════════════════════════════════════════
                MODAL 9 — Transfer from savings goal
            ════════════════════════════════════════════════════════════════ */}
            <BaseBottomSheet visible={!!withdrawGoal} onClose={() => setWithdrawGoal(null)} scrollable={false}>
                        {/* Header */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <Text style={{ fontSize: 24 }}>{withdrawGoal?.icon}</Text>
                                <View>
                                    <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700' }}>{t('dashboard.transferMoney')}</Text>
                                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>{withdrawGoal?.name}</Text>
                                </View>
                            </View>
                            <TouchableOpacity onPress={() => setWithdrawGoal(null)} hitSlop={12}>
                                <X color={colors.textMuted} size={22} />
                            </TouchableOpacity>
                        </View>

                        {/* Balance reminder */}
                        {withdrawGoal && (
                            <View style={{ backgroundColor: '#0f172a', borderRadius: 12, padding: 12, marginBottom: 20, flexDirection: 'row', justifyContent: 'space-between' }}>
                                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t('dashboard.available')}</Text>
                                <Text style={{ color: withdrawGoal.color, fontSize: 13, fontWeight: '600' }}>
                                    {formatAmount(withdrawGoal.saved, withdrawGoal.currency)}
                                </Text>
                            </View>
                        )}

                        {/* Amount */}
                        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 8 }}>{t('dashboard.withdrawAmountLabel', { currency: withdrawGoal?.currency })}</Text>
                        <TextInput
                            value={withdrawAmount}
                            onChangeText={v => setWithdrawAmount(v.replace(/[^0-9.,]/g, ''))}
                            keyboardType="decimal-pad"
                            placeholder="0"
                            placeholderTextColor={colors.textDisabled}
                            autoFocus
                            style={{ backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 18, marginBottom: 16, fontSize: 28, fontWeight: '700', textAlign: 'center' }}
                        />

                        {/* Target account */}
                        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 10 }}>{t('dashboard.toAccount')}</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                            {accounts.map(acc => (
                                <TouchableOpacity key={acc.id} onPress={() => setWithdrawAccId(acc.id)}
                                    style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, marginRight: 8, borderWidth: 1.5, borderColor: withdrawAccId === acc.id ? '#d97706' : colors.borderLight, backgroundColor: withdrawAccId === acc.id ? '#422006' : colors.bgTertiary }}>
                                    <Text style={{ color: withdrawAccId === acc.id ? colors.textPrimary : colors.textSecondary, fontSize: 13 }} numberOfLines={1}>{acc.name}</Text>
                                    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{formatAmount(acc.balance, acc.currency)}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        {/* Note */}
                        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 8 }}>{t('dashboard.noteOptional')}</Text>
                        <TextInput
                            value={withdrawNote}
                            onChangeText={setWithdrawNote}
                            placeholder={t('dashboard.noteToPlaceholder')}
                            placeholderTextColor={colors.textDisabled}
                            style={{ backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 24, fontSize: 15 }}
                        />

                        {/* Confirm */}
                        <TouchableOpacity
                            onPress={handleWithdraw}
                            disabled={withdrawing || !withdrawAmount || parseFloat(withdrawAmount) <= 0 || !withdrawAccId}
                            style={{ paddingVertical: 16, borderRadius: 16, alignItems: 'center', backgroundColor: withdrawing || !withdrawAmount || parseFloat(withdrawAmount) <= 0 || !withdrawAccId ? colors.borderLight : '#d97706' }}
                        >
                            {withdrawing
                                ? <ActivityIndicator color="#fff" />
                                : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                                    {t('dashboard.transfer')}{withdrawAmount && parseFloat(withdrawAmount) > 0 ? ` ${formatAmount(parseFloat(withdrawAmount), withdrawGoal?.currency ?? 'EUR')}` : ''}
                                  </Text>
                            }
                        </TouchableOpacity>
            </BaseBottomSheet>

            {/* ════════════════════════════════════════════════════════════════
                ADD METHOD SELECTOR — FAB tap
            ════════════════════════════════════════════════════════════════ */}
            <BaseBottomSheet visible={addMethodVisible} onClose={() => setAddMethodVisible(false)} scrollable={false}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginBottom: 20 }}>
                    {t('dashboard.add')}
                </Text>

                <TouchableOpacity
                    onPress={() => { setAddMethodVisible(false); setVoiceOpen(true); }}
                    style={{ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: colors.bgTertiary, borderRadius: 14, marginBottom: 10 }}
                >
                    <Text style={{ fontSize: 22, marginRight: 14 }}>🎤</Text>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>{t('dashboard.byVoice')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={() => { setAddMethodVisible(false); openTxForm('transfer'); }}
                    style={{ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: colors.bgTertiary, borderRadius: 14, marginBottom: 10 }}
                >
                    <Text style={{ fontSize: 22, marginRight: 14 }}>↔️</Text>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>{t('dashboard.transfer')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={() => { setAddMethodVisible(false); openTxForm('expense'); }}
                    style={{ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: colors.bgTertiary, borderRadius: 14, marginBottom: 10 }}
                >
                    <Text style={{ fontSize: 22, marginRight: 14 }}>📉</Text>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>{t('dashboard.expense')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={() => { setAddMethodVisible(false); openTxForm('income'); }}
                    style={{ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: colors.bgTertiary, borderRadius: 14 }}
                >
                    <Text style={{ fontSize: 22, marginRight: 14 }}>📈</Text>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>{t('dashboard.income')}</Text>
                </TouchableOpacity>
            </BaseBottomSheet>

            {/* ════════════════════════════════════════════════════════════════
                VOICE INPUT
            ════════════════════════════════════════════════════════════════ */}
            <VoiceInput
                visible={voiceOpen}
                onClose={() => setVoiceOpen(false)}
                onSaved={() => { setVoiceOpen(false); loadData(); }}
                householdId={householdId ?? ''}
                accounts={accounts}
                categories={categories}
                baseCurrency={currency}
            />

        </View>
    );
}
