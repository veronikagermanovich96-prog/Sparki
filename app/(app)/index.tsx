import {
    ArrowRightLeft,
    Banknote, Bitcoin, Briefcase, Building2, Car,
    Check, CircleDollarSign, Clock, Coins, CreditCard,
    Eye, EyeOff,
    Globe, Home, Landmark, Minus, Pencil, PiggyBank, Plus,
    Smartphone, Trash2, TrendingDown, TrendingUp, Wallet, X,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator, Alert, ScrollView, Switch,
    Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { BaseBottomSheet } from '@/components/ui/BaseBottomSheet';
import { router, useFocusEffect } from 'expo-router';
import {
    addDays, addWeeks, differenceInMonths, format, getDaysInMonth,
    startOfDay, startOfMonth, startOfWeek, startOfYear, subDays, subWeeks,
} from 'date-fns';
import { supabase } from '@/lib/supabase';
import { formatAmount } from '@/constants/currencies';
import { Account, Category, RecurringPayment, Transaction } from '@/types';
import { IconArray, DotData } from '@/components/icon-array/IconArray';
import TransactionForm from '@/components/TransactionForm';

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

const PERIOD_LABELS: Record<Period, string> = { week: 'Неделя', month: 'Месяц', quarter: 'Квартал', year: 'Год' };
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
    const [fabOpen,    setFabOpen]    = useState(false);

    // ── Account actions (tap) ────────────────────────────────────────────────
    const [actionAccount, setActionAccount] = useState<Account | null>(null);

    // Transaction form (shared component)
    const [txFormVisible,      setTxFormVisible]      = useState(false);
    const [txFormInitialType,  setTxFormInitialType]  = useState<'income' | 'expense' | 'transfer'>('expense');
    const [txFormInitialAccId, setTxFormInitialAccId] = useState<string | undefined>(undefined);


    // History
    const [historyAccount,  setHistoryAccount]  = useState<Account | null>(null);
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
    const ANALYTICS_LABELS: Record<AnalyticsPeriod, string> = { day: 'День', week: 'Неделя', month: 'Месяц', year: 'Год' };

    // ── Icon Array ───────────────────────────────────────────────────────────
    const [period,       setPeriod]       = useState<Period>('month');
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
                .or(`household_id.eq.${member.household_id},is_system.eq.true`)
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
        Alert.alert('Удалить счёт', `Удалить «${account.name}»? Это действие нельзя отменить.`, [
            { text: 'Отмена', style: 'cancel' },
            { text: 'Удалить', style: 'destructive', onPress: async () => {
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


    async function openHistory(account: Account) {
        setActionAccount(null);
        setHistoryAccount(account);
        setLoadingHistory(true);
        const { data } = await supabase
            .from('transactions')
            .select('*, categories(name, icon, color)')
            .eq('account_id', account.id)
            .eq('is_deleted', false)
            .order('date', { ascending: false })
            .limit(60);
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
            setGoalInitialDeposit('');
        } else {
            setEditingGoal(null);
            setGoalName(''); setGoalIcon('🎯'); setGoalTarget(''); setGoalDate('');
            setGoalColor('#22c55e'); setGoalAccId(''); setGoalInitialDeposit('');
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
                Alert.alert('Неверная дата', 'Введите дату в формате ГГГГ-ММ-ДД, ГГГГ-ММ или просто ГГГГ');
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
                currency:      acc?.currency ?? currency,
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
                        description: `Пополнение → ${goalName.trim()}`,
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
                currency:      acc?.currency ?? currency,
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
                        description: `Начальный взнос → ${goalName.trim()}`,
                        created_by: uid,
                    });
                }
            }
        }
        setSavingGoal(false);
        if (error) { Alert.alert('Ошибка', error.message); return; }
        setGoalFormVisible(false);
        setEditingGoal(null);
        setGoalInitialDeposit('');
        loadData();
    }

    function confirmDeleteGoal(goal: GoalItem) {
        setGoalSheet(null);
        Alert.alert('Удалить цель', `Удалить «${goal.name}»?`, [
            { text: 'Отмена', style: 'cancel' },
            { text: 'Удалить', style: 'destructive', onPress: async () => {
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
        if (srcAcc.balance < amount) { Alert.alert('Ошибка', 'Недостаточно средств на счёте'); return; }
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
            note:         depositNote.trim() || `Взнос в цель «${depositGoal.name}»`,
            date:         new Date().toISOString().split('T')[0],
        });
        if (error) { Alert.alert('Ошибка', error.message); setDepositing(false); return; }
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
        if (amount > withdrawGoal.saved) { Alert.alert('Ошибка', 'Сумма превышает накопленное'); return; }
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
            description:  withdrawNote.trim() || `Перевод с цели «${withdrawGoal.name}»`,
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
                return { catId, name: cat?.name ?? 'Другое', color: cat?.color ?? '#6b7280', total };
            })
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);
        const max = items[0]?.total ?? 1;
        const periodTotal = filtered.reduce((s, t) => s + (t.amount_base ?? t.amount), 0);
        const periodLabel = { day: 'за день', week: 'за неделю', month: 'за месяц', year: 'за год' }[analyticsPeriod];
        return { items, max, monthTotal: periodTotal, periodLabel, periodStart };
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
        <View style={{ flex: 1, backgroundColor: '#030712', paddingTop: 64 }}>
            <ScrollView style={{ paddingHorizontal: 24 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                {/* ── Balance ── */}
                <View style={{ marginTop: 16, marginBottom: 32 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ color: '#9ca3af', fontSize: 13 }}>Активный баланс</Text>
                        <TouchableOpacity onPress={() => setHidden(h => !h)} hitSlop={8}>
                            {hidden ? <EyeOff color="#6b7280" size={18} /> : <Eye color="#6b7280" size={18} />}
                        </TouchableOpacity>
                    </View>
                    {loading ? (
                        <ActivityIndicator color="#fff" style={{ alignSelf: 'flex-start', marginVertical: 10 }} />
                    ) : (
                        <>
                            <Text style={{ color: '#fff', fontSize: 44, fontWeight: 'bold', marginBottom: 4 }}>
                                {hidden ? '••••••' : formatAmount(activeBalance, currency)}
                            </Text>
                            <Text style={{ color: '#6b7280', fontSize: 13 }}>
                                Всего на счетах: {hidden ? '••••' : formatAmount(totalBalance, currency)}
                            </Text>
                        </>
                    )}

                    {/* Account cards */}
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 20, marginBottom: 12 }}>Счета</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        style={{ marginHorizontal: -24, paddingHorizontal: 24 }}>
                        {accounts.map(account => {
                            const IC = ICON_MAP[account.icon ?? 'CreditCard'] ?? CreditCard;
                            const col = account.color ?? '#3b82f6';
                            return (
                                <TouchableOpacity
                                    key={account.id}
                                    onPress={() => setActionAccount(account)}
                                    onLongPress={() => setMenuAccount(account)}
                                    delayLongPress={400}
                                    activeOpacity={0.85}
                                    style={{
                                        backgroundColor: '#111827', borderWidth: 1,
                                        borderColor: account.exclude_from_dashboard ? '#374151' : '#1f2937',
                                        borderRadius: 16, padding: 16, marginRight: 16, width: 160,
                                        opacity: account.exclude_from_dashboard ? 0.55 : 1,
                                    }}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <IC color={col} size={24} />
                                        <TouchableOpacity onPress={() => toggleExclude(account)} hitSlop={8}>
                                            {account.exclude_from_dashboard
                                                ? <EyeOff color="#4b5563" size={16} />
                                                : <Eye color="#6b7280" size={16} />}
                                        </TouchableOpacity>
                                    </View>
                                    <Text style={{ color: '#fff', fontWeight: 'bold', marginTop: 16, marginBottom: 4 }} numberOfLines={1}>
                                        {account.name}
                                    </Text>
                                    <Text style={{ color: '#9ca3af', fontSize: 13 }}>
                                        {hidden ? '••••' : formatAmount(account.balance, account.currency)}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}

                        <TouchableOpacity onPress={openAdd} activeOpacity={0.7}
                            style={{ backgroundColor: '#111827', borderWidth: 1, borderColor: '#374151', borderStyle: 'dashed', borderRadius: 16, padding: 16, marginRight: 24, width: 160, height: 120, justifyContent: 'center', alignItems: 'center' }}>
                            <Plus color="#4b5563" size={28} />
                            <Text style={{ color: '#6b7280', fontSize: 13, marginTop: 8 }}>Добавить</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>

                {/* ── Category breakdown (Аналитика) ── */}
                {!loadingTx && (() => {
                    return (
                        <View style={{ marginBottom: 40 }}>
                            <TouchableOpacity
                                onPress={() => router.push('/analytics')}
                                activeOpacity={0.7}
                                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}
                            >
                                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Аналитика</Text>
                                <Text style={{ color: '#3b82f6', fontSize: 13 }}>Подробнее →</Text>
                            </TouchableOpacity>

                            {/* Period tabs */}
                            <View style={{ flexDirection: 'row', backgroundColor: '#111827', borderRadius: 12, padding: 4, marginBottom: 12 }}>
                                {(['day', 'week', 'month', 'year'] as AnalyticsPeriod[]).map(p => (
                                    <TouchableOpacity key={p} onPress={() => setAnalyticsPeriod(p)}
                                        style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: analyticsPeriod === p ? '#1f2937' : 'transparent', alignItems: 'center' }}>
                                        <Text style={{ color: analyticsPeriod === p ? '#fff' : '#6b7280', fontSize: 12, fontWeight: analyticsPeriod === p ? '700' : '400' }}>
                                            {ANALYTICS_LABELS[p]}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Summary card */}
                            <View style={{ backgroundColor: '#111827', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#1f2937', marginBottom: 12 }}>
                                <View style={{ flexDirection: 'row', gap: 16, marginBottom: 12 }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Доходы</Text>
                                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#4FFFB0' }}>
                                            +{formatAmount(periodSummary.income, currency)}
                                        </Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Расходы</Text>
                                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#FF6B6B' }}>
                                            −{formatAmount(periodSummary.expenses, currency)}
                                        </Text>
                                    </View>
                                </View>
                                <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', paddingTop: 10 }}>
                                    <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Чистый баланс</Text>
                                    <Text style={{ fontSize: 20, fontWeight: '800', color: periodSummary.net >= 0 ? '#4FFFB0' : '#FF6B6B' }}>
                                        {periodSummary.net >= 0 ? '+' : '−'}{formatAmount(Math.abs(periodSummary.net), currency)}
                                    </Text>
                                </View>
                            </View>

                        </View>
                    );
                })()}

                {/* ── Icon Array (Расходы) ── */}
                <View style={{ marginBottom: 40 }}>
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 14 }}>Расходы</Text>

                    <View style={{ flexDirection: 'row', backgroundColor: '#111827', borderRadius: 12, padding: 4, marginBottom: 24 }}>
                        {(['week', 'month', 'quarter', 'year'] as Period[]).map(p => (
                            <TouchableOpacity key={p} onPress={() => { setPeriod(p); setSelectedDot(null); }}
                                style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: period === p ? '#1f2937' : 'transparent', alignItems: 'center' }}>
                                <Text style={{ color: period === p ? '#fff' : '#6b7280', fontSize: 12, fontWeight: period === p ? '700' : '400' }}>
                                    {PERIOD_LABELS[p]}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {loadingTx ? (
                        <ActivityIndicator color="#fff" style={{ marginVertical: 24 }} />
                    ) : (
                        <>
                            <View style={{ alignItems: 'center' }}>
                                <IconArray dots={dotsForPeriod} columns={PERIOD_COLS[period]} dotSize={PERIOD_DOT[period]} gap={PERIOD_GAP[period]}
                                    onDotPress={(dot) => {
                                        if (dot.state !== 'future') setSelectedDot(prev => prev === dot.meta ? null : dot.meta as DotMeta);
                                    }} />
                            </View>

                            {selectedDot ? (
                                <View style={{ marginTop: 20, backgroundColor: '#111827', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#1f2937' }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                        <Text style={{ color: '#9ca3af', fontSize: 13 }}>{selectedDot.slot.label}</Text>
                                        <TouchableOpacity onPress={() => setSelectedDot(null)} hitSlop={8}><X color="#4b5563" size={16} /></TouchableOpacity>
                                    </View>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                        <View>
                                            <Text style={{ color: '#6b7280', fontSize: 11, marginBottom: 2 }}>Потрачено</Text>
                                            <Text style={{ color: selectedDot.limit > 0 && selectedDot.spent > selectedDot.limit ? '#ef4444' : '#fff', fontSize: 15, fontWeight: '600' }}>
                                                {formatAmount(selectedDot.spent, currency)}
                                            </Text>
                                        </View>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <Text style={{ color: '#6b7280', fontSize: 11, marginBottom: 2 }}>Лимит</Text>
                                            <Text style={{ color: '#9ca3af', fontSize: 15, fontWeight: '600' }}>
                                                {selectedDot.limit > 0 ? formatAmount(selectedDot.limit, currency) : '—'}
                                            </Text>
                                        </View>
                                    </View>
                                    {selectedDot.limit > 0 && (
                                        <View style={{ marginTop: 10, height: 4, backgroundColor: '#1f2937', borderRadius: 2 }}>
                                            <View style={{ width: `${Math.min(100, (selectedDot.spent / selectedDot.limit) * 100)}%` as any, height: 4, borderRadius: 2, backgroundColor: selectedDot.spent > selectedDot.limit ? '#ef4444' : selectedDot.spent > selectedDot.limit * 0.8 ? '#f97316' : '#22c55e' }} />
                                        </View>
                                    )}
                                </View>
                            ) : (
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 }}>
                                    <View>
                                        <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 4 }}>Дневной лимит</Text>
                                        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>{dailyLimit > 0 ? formatAmount(dailyLimit, currency) : '—'}</Text>
                                    </View>
                                    <View style={{ alignItems: 'flex-end' }}>
                                        <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 4 }}>Потрачено сегодня</Text>
                                        <Text style={{ color: dailyLimit > 0 && todaySpent > dailyLimit ? '#ef4444' : '#fff', fontSize: 15, fontWeight: '600' }}>{formatAmount(todaySpent, currency)}</Text>
                                    </View>
                                </View>
                            )}

                            <View style={{ flexDirection: 'row', gap: 16, marginTop: 16, justifyContent: 'center' }}>
                                {[{ color: '#22c55e', label: 'В норме' }, { color: '#f97316', label: 'Почти лимит' }, { color: '#ef4444', label: 'Перерасход' }, { color: '#4b5563', label: period === 'quarter' ? 'Эта неделя' : period === 'year' ? 'Этот месяц' : 'Сегодня' }].map(({ color, label }) => (
                                    <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
                                        <Text style={{ color: '#6b7280', fontSize: 11 }}>{label}</Text>
                                    </View>
                                ))}
                            </View>
                        </>
                    )}
                </View>

                {/* ── Savings goals ── */}
                <View style={{ marginBottom: 48 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Цели накопления</Text>
                        <TouchableOpacity onPress={() => openGoalForm()} hitSlop={8}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#1f2937', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
                            <Plus color="#9ca3af" size={14} />
                            <Text style={{ color: '#9ca3af', fontSize: 13 }}>Новая цель</Text>
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
                                color: i < filledCount ? goal.color : '#1f2937',
                                state: i < filledCount ? 'filled' : 'empty',
                            }));
                            return (
                                <TouchableOpacity key={goal.id} activeOpacity={0.85}
                                    onPress={() => setGoalSheet(goal)}
                                    style={{ backgroundColor: '#111827', borderWidth: 1, borderColor: '#1f2937', borderRadius: 16, marginRight: 14, width: 168, padding: 14 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                        <Text style={{ fontSize: 20 }}>{goal.icon}</Text>
                                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', flex: 1 }} numberOfLines={2}>{goal.name}</Text>
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
                                        <Text style={{ color: '#6b7280', fontSize: 11 }} numberOfLines={1}>{formatAmount(goal.saved, goal.currency)} / {formatAmount(goal.target, goal.currency)}</Text>
                                    </View>
                                    {goal.targetDate && (
                                        <Text style={{ color: '#4b5563', fontSize: 11, marginTop: 4 }}>
                                            до {format(new Date(goal.targetDate + 'T00:00:00'), 'd MMM yyyy')}
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            );
                        })}

                        <TouchableOpacity onPress={() => openGoalForm()} activeOpacity={0.7}
                            style={{ backgroundColor: '#111827', borderWidth: 1, borderColor: '#374151', borderStyle: 'dashed', borderRadius: 16, padding: 16, marginRight: 24, width: 160, height: 180, justifyContent: 'center', alignItems: 'center' }}>
                            <Plus color="#4b5563" size={28} />
                            <Text style={{ color: '#6b7280', fontSize: 13, marginTop: 8 }}>{goals.length === 0 ? 'Добавить первую цель' : 'Добавить цель'}</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>

            </ScrollView>

            {/* FAB */}
            <TouchableOpacity
                onPress={() => setFabOpen(true)}
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
                    <Text style={{ color: '#fff', fontSize: 17, fontWeight: 'bold', marginLeft: 10, flex: 1 }} numberOfLines={1}>{actionAccount?.name}</Text>
                    <Text style={{ color: '#9ca3af', fontSize: 14 }}>{hidden ? '••••' : formatAmount(actionAccount?.balance ?? 0, actionAccount?.currency ?? currency)}</Text>
                </View>

                {/* 4 action buttons */}
                <View style={{ flexDirection: 'row', gap: 12 }}>
                    {[
                        { label: 'Доход',   icon: <TrendingUp color="#fff" size={22} />,    bg: '#16a34a', action: () => openTxForm('income') },
                        { label: 'Расход',  icon: <TrendingDown color="#fff" size={22} />,  bg: '#dc2626', action: () => openTxForm('expense') },
                        { label: 'Перевод', icon: <ArrowRightLeft color="#fff" size={22} />, bg: '#2563eb', action: () => openTxForm('transfer') },
                        { label: 'История', icon: <Clock color="#fff" size={22} />,          bg: '#374151', action: () => openHistory(actionAccount!) },
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
                        .or(`household_id.eq.${hid},is_system.eq.true`)
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
                        <Text style={{ color: '#9ca3af', fontSize: 12 }}>История</Text>
                        <Text style={{ color: '#fff', fontSize: 17, fontWeight: 'bold' }}>{historyAccount?.name}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setHistoryAccount(null)} hitSlop={8}><X color="#6b7280" size={22} /></TouchableOpacity>
                </View>

                {loadingHistory ? (
                    <ActivityIndicator color="#fff" style={{ marginVertical: 40 }} />
                ) : historyTx.length === 0 ? (
                    <Text style={{ color: '#4b5563', textAlign: 'center', marginVertical: 40, fontSize: 15 }}>Транзакций нет</Text>
                ) : (
                    <>
                        {historyTx.map((tx, idx) => {
                            const isIncome   = tx.type === 'income';
                            const isTransfer = tx.type === 'transfer';
                            const amtColor   = isIncome ? '#22c55e' : isTransfer ? '#60a5fa' : '#f87171';
                            const amtPrefix  = isIncome ? '+' : isTransfer ? '↔' : '−';
                            const catName    = tx.categories?.name ?? (isIncome ? 'Доход' : isTransfer ? 'Перевод' : 'Расход');

                            return (
                                <View key={tx.id}
                                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: idx < historyTx.length - 1 ? 1 : 0, borderBottomColor: '#1f2937' }}>
                                    <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                        {isIncome
                                            ? <TrendingUp color="#22c55e" size={18} />
                                            : isTransfer
                                                ? <ArrowRightLeft color="#60a5fa" size={18} />
                                                : <Minus color="#f87171" size={18} />}
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '500' }} numberOfLines={1}>{catName}</Text>
                                        {tx.note ? <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 1 }} numberOfLines={1}>{tx.note}</Text> : null}
                                    </View>
                                    <View style={{ alignItems: 'flex-end' }}>
                                        <Text style={{ color: amtColor, fontSize: 14, fontWeight: '600' }}>
                                            {amtPrefix}{formatAmount(tx.amount, tx.currency)}
                                        </Text>
                                        <Text style={{ color: '#4b5563', fontSize: 11, marginTop: 2 }}>
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
                        <Text style={{ color: '#fff', fontSize: 17, fontWeight: 'bold', marginBottom: 20 }} numberOfLines={1}>{menuAccount?.name}</Text>
                        <TouchableOpacity onPress={() => menuAccount && openEdit(menuAccount)}
                            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#1f2937' }}>
                            <Pencil color="#9ca3af" size={20} />
                            <Text style={{ color: '#fff', fontSize: 16, marginLeft: 16 }}>Редактировать</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => menuAccount && confirmDelete(menuAccount)}
                            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16 }}>
                            <Trash2 color="#ef4444" size={20} />
                            <Text style={{ color: '#f87171', fontSize: 16, marginLeft: 16 }}>Удалить счёт</Text>
                        </TouchableOpacity>
            </BaseBottomSheet>

            {/* ════════════════════════════════════════════════════════════════
                MODAL 6 — Add / Edit account form
            ════════════════════════════════════════════════════════════════ */}
            <BaseBottomSheet visible={formVisible} onClose={() => setFormVisible(false)} maxHeight="90%">
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>{editingId ? 'Редактировать счёт' : 'Новый счёт'}</Text>
                            <TouchableOpacity onPress={() => setFormVisible(false)} hitSlop={8}><X color="#6b7280" size={22} /></TouchableOpacity>
                        </View>
                            <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 6 }}>Название</Text>
                            <TextInput value={formName} onChangeText={setFormName} placeholder="Например, Основной" placeholderTextColor="#4b5563"
                                style={{ backgroundColor: '#1f2937', color: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16, fontSize: 15 }} />

                            <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 8 }}>Валюта</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                                {CURRENCIES.map(c => (
                                    <TouchableOpacity key={c} onPress={() => setFormCurrency(c)}
                                        style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, marginRight: 8, backgroundColor: formCurrency === c ? '#2563eb' : '#1f2937' }}>
                                        <Text style={{ color: formCurrency === c ? '#fff' : '#9ca3af', fontWeight: formCurrency === c ? 'bold' : 'normal' }}>{c}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>

                            <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 6 }}>{editingId ? 'Баланс' : 'Начальный баланс'}</Text>
                            <TextInput value={formBalance} onChangeText={setFormBalance} keyboardType="numeric" placeholderTextColor="#4b5563"
                                style={{ backgroundColor: '#1f2937', color: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16, fontSize: 15 }} />

                            <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 10 }}>Цвет</Text>
                            <View style={{ flexDirection: 'row', marginBottom: 16 }}>
                                {COLORS.map(c => (
                                    <TouchableOpacity key={c} onPress={() => setFormColor(c)}
                                        style={{ width: 32, height: 32, borderRadius: 16, marginRight: 10, backgroundColor: c, alignItems: 'center', justifyContent: 'center' }}>
                                        {formColor === c && <Check color="#fff" size={16} />}
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 10 }}>Иконка</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 }}>
                                {Object.entries(ICON_MAP).map(([name, IC]) => (
                                    <TouchableOpacity key={name} onPress={() => setFormIcon(name)}
                                        style={{ width: 48, height: 48, borderRadius: 12, marginRight: 8, marginBottom: 8, backgroundColor: formIcon === name ? '#2563eb' : '#1f2937', alignItems: 'center', justifyContent: 'center' }}>
                                        <IC color={formIcon === name ? '#fff' : '#6b7280'} size={22} />
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, marginBottom: 20 }}>
                                <Text style={{ color: '#fff', fontSize: 14 }}>Скрыть из активного баланса</Text>
                                <Switch value={formExclude} onValueChange={setFormExclude} trackColor={{ false: '#374151', true: '#2563eb' }} thumbColor="#fff" />
                            </View>

                            <TouchableOpacity onPress={saveAccount} disabled={saving || !formName.trim()}
                                style={{ paddingVertical: 16, borderRadius: 20, backgroundColor: saving || !formName.trim() ? '#374151' : '#2563eb', alignItems: 'center' }}>
                                {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>{editingId ? 'Сохранить' : 'Создать счёт'}</Text>}
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
                                <Text style={{ color: '#fff', fontSize: 17, fontWeight: 'bold' }} numberOfLines={1}>{goalSheet?.name}</Text>
                                <Text style={{ color: '#6b7280', fontSize: 13 }}>
                                    {goalSheet && formatAmount(goalSheet.saved, goalSheet.currency)} / {goalSheet && formatAmount(goalSheet.target, goalSheet.currency)}
                                </Text>
                            </View>
                            <Text style={{ color: goalSheet?.color, fontSize: 22, fontWeight: 'bold' }}>
                                {goalSheet && Math.round(Math.min(1, goalSheet.saved / goalSheet.target) * 100)}%
                            </Text>
                        </View>
                        {/* Progress bar */}
                        {goalSheet && (
                            <View style={{ height: 4, backgroundColor: '#1f2937', borderRadius: 2, marginBottom: 24 }}>
                                <View style={{ width: `${Math.min(100, (goalSheet.saved / goalSheet.target) * 100)}%` as any, height: 4, borderRadius: 2, backgroundColor: goalSheet.color }} />
                            </View>
                        )}
                        {/* Actions */}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                            {[
                                { label: 'Пополнить', emoji: '💰', color: '#22c55e', bg: '#14532d', action: () => { const g = goalSheet!; setGoalSheet(null); setDepositGoal(g); setDepositAmount(''); setDepositNote(''); setDepositAccId(accounts.length > 0 ? accounts[0].id : ''); } },
                                { label: 'Перевести', emoji: '💸', color: '#f59e0b', bg: '#1f2937', action: () => { const g = goalSheet!; setGoalSheet(null); setWithdrawGoal(g); setWithdrawAmount(''); setWithdrawNote(''); setWithdrawAccId(g.accountId || accounts[0]?.id || ''); } },
                                { label: 'Изменить',  emoji: '✏️',  color: '#9ca3af', bg: '#1f2937', action: () => { const g = goalSheet!; setGoalSheet(null); openGoalForm(g); } },
                                { label: 'Удалить',   emoji: '🗑️',  color: '#ef4444', bg: '#1f2937', action: () => goalSheet && confirmDeleteGoal(goalSheet) },
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
                            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>{editingGoal ? 'Редактировать цель' : 'Новая цель'}</Text>
                            <TouchableOpacity onPress={() => setGoalFormVisible(false)} hitSlop={8}><X color="#6b7280" size={22} /></TouchableOpacity>
                        </View>
                            {/* 1. Название */}
                            <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 6 }}>Название цели</Text>
                            <TextInput value={goalName} onChangeText={setGoalName}
                                placeholder="Например, Отпуск на море" placeholderTextColor="#4b5563"
                                style={{ backgroundColor: '#1f2937', color: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16, fontSize: 15 }} />

                            {/* 2. Эмодзи + Цвет в одну строку */}
                            <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16 }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 8 }}>Эмодзи</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                        {['🎯','✈️','🏠','🚗','💻','📱','🎓','💍','🏝️','🛍️','🎮','🏋️','🌍','🐶','💰'].map(e => (
                                            <TouchableOpacity key={e} onPress={() => setGoalIcon(e)}
                                                style={{ width: 40, height: 40, borderRadius: 12, marginRight: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: goalIcon === e ? '#2563eb' : '#1f2937', borderWidth: goalIcon === e ? 0 : 1, borderColor: '#374151' }}>
                                                <Text style={{ fontSize: 20 }}>{e}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                </View>
                                <View>
                                    <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 8 }}>Цвет</Text>
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

                            {/* 3. Целевая сумма */}
                            <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 6 }}>Целевая сумма</Text>
                            <TextInput value={goalTarget} onChangeText={setGoalTarget}
                                keyboardType="numeric" placeholder="0.00" placeholderTextColor="#4b5563"
                                style={{ backgroundColor: '#1f2937', color: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 16, fontSize: 22, fontWeight: 'bold' }} />

                            {/* 4. Списывать со счёта */}
                            <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 10 }}>Списывать со счёта</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                                {accounts.map(acc => (
                                    <TouchableOpacity key={acc.id} onPress={() => setGoalAccId(acc.id)}
                                        style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, marginRight: 8, borderWidth: 1.5, borderColor: goalAccId === acc.id ? '#2563eb' : '#374151', backgroundColor: goalAccId === acc.id ? '#172554' : '#1f2937' }}>
                                        <Text style={{ color: goalAccId === acc.id ? '#fff' : '#9ca3af', fontSize: 13 }} numberOfLines={1}>{acc.name}</Text>
                                        <Text style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>{formatAmount(acc.balance, acc.currency)}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>

                            {/* 5. Начальный взнос (создание) / Внести сумму (редактирование) */}
                            {!editingGoal ? (
                                <>
                                    <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 6 }}>Начальный взнос <Text style={{ color: '#4b5563' }}>(необязательно)</Text></Text>
                                    <TextInput value={goalInitialDeposit} onChangeText={v => setGoalInitialDeposit(v.replace(/[^0-9.,]/g, ''))}
                                        keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#4b5563"
                                        style={{ backgroundColor: '#1f2937', color: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16, fontSize: 15 }} />
                                </>
                            ) : (
                                <>
                                    <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 6 }}>Внести сумму <Text style={{ color: '#4b5563' }}>(необязательно)</Text></Text>
                                    <TextInput value={goalInitialDeposit} onChangeText={v => setGoalInitialDeposit(v.replace(/[^0-9.,]/g, ''))}
                                        keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#4b5563"
                                        style={{ backgroundColor: '#1f2937', color: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16, fontSize: 15 }} />
                                </>
                            )}

                            {/* 6. Дата достижения */}
                            <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 6 }}>Дата достижения <Text style={{ color: '#4b5563' }}>(необязательно)</Text></Text>
                            <TextInput value={goalDate} onChangeText={v => setGoalDate(formatDateInput(v))}
                                keyboardType="numeric" placeholder="ГГГГ-ММ-ДД" placeholderTextColor="#4b5563"
                                maxLength={10}
                                style={{ backgroundColor: '#1f2937', color: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 24, fontSize: 15, letterSpacing: 1 }} />

                            <TouchableOpacity onPress={saveGoal} disabled={savingGoal || !goalName.trim() || !goalTarget || !goalAccId}
                                style={{ paddingVertical: 16, borderRadius: 20, alignItems: 'center', backgroundColor: savingGoal || !goalName.trim() || !goalTarget || !goalAccId ? '#374151' : '#22c55e' }}>
                                {savingGoal ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>{editingGoal ? 'Сохранить' : 'Создать цель'}</Text>}
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
                                    <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>Пополнить</Text>
                                    <Text style={{ color: '#6b7280', fontSize: 13 }}>{depositGoal?.name}</Text>
                                </View>
                            </View>
                            <TouchableOpacity onPress={() => setDepositGoal(null)} hitSlop={12}>
                                <X color="#6b7280" size={22} />
                            </TouchableOpacity>
                        </View>

                        {/* Progress reminder */}
                        {depositGoal && (
                            <View style={{ backgroundColor: '#0f172a', borderRadius: 12, padding: 12, marginBottom: 20, flexDirection: 'row', justifyContent: 'space-between' }}>
                                <Text style={{ color: '#9ca3af', fontSize: 13 }}>Накоплено</Text>
                                <Text style={{ color: depositGoal.color, fontSize: 13, fontWeight: '600' }}>
                                    {formatAmount(depositGoal.saved, depositGoal.currency)} / {formatAmount(depositGoal.target, depositGoal.currency)}
                                </Text>
                            </View>
                        )}

                        {/* Source account */}
                        <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 8 }}>Списать со счёта</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                            {accounts.map(a => {
                                const Ic = ICON_MAP[a.icon ?? ''] ?? Wallet;
                                const sel = depositAccId === a.id;
                                return (
                                    <TouchableOpacity key={a.id} onPress={() => setDepositAccId(a.id)}
                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, marginRight: 8, backgroundColor: sel ? 'rgba(124,111,255,0.15)' : '#1f2937', borderWidth: sel ? 1 : 0, borderColor: '#7C6FFF' }}>
                                        <Ic color={a.color ?? '#888'} size={18} />
                                        <View>
                                            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>{a.name}</Text>
                                            <Text style={{ color: '#9ca3af', fontSize: 11 }}>{formatAmount(a.balance, a.currency)}</Text>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>

                        {/* Amount */}
                        <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 8 }}>Сумма ({depositGoal?.currency})</Text>
                        <TextInput
                            value={depositAmount}
                            onChangeText={v => setDepositAmount(v.replace(/[^0-9.,]/g, ''))}
                            keyboardType="decimal-pad"
                            placeholder="0"
                            placeholderTextColor="#4b5563"
                            style={{ backgroundColor: '#1f2937', color: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 18, marginBottom: 16, fontSize: 28, fontWeight: '700', textAlign: 'center' }}
                        />

                        {/* Note */}
                        <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 8 }}>Заметка (необязательно)</Text>
                        <TextInput
                            value={depositNote}
                            onChangeText={setDepositNote}
                            placeholder="Откуда деньги…"
                            placeholderTextColor="#4b5563"
                            style={{ backgroundColor: '#1f2937', color: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 24, fontSize: 15 }}
                        />

                        {/* Save */}
                        <TouchableOpacity
                            onPress={handleDeposit}
                            disabled={depositing || !depositAmount || parseFloat(depositAmount) <= 0 || !depositAccId}
                            style={{ paddingVertical: 16, borderRadius: 16, alignItems: 'center', backgroundColor: depositing || !depositAmount || parseFloat(depositAmount) <= 0 || !depositAccId ? '#374151' : '#16a34a' }}
                        >
                            {depositing
                                ? <ActivityIndicator color="#fff" />
                                : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                                    Пополнить{depositAmount && parseFloat(depositAmount) > 0 ? ` ${formatAmount(parseFloat(depositAmount), depositGoal?.currency ?? 'EUR')}` : ''}
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
                                    <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>Перевести деньги</Text>
                                    <Text style={{ color: '#6b7280', fontSize: 13 }}>{withdrawGoal?.name}</Text>
                                </View>
                            </View>
                            <TouchableOpacity onPress={() => setWithdrawGoal(null)} hitSlop={12}>
                                <X color="#6b7280" size={22} />
                            </TouchableOpacity>
                        </View>

                        {/* Balance reminder */}
                        {withdrawGoal && (
                            <View style={{ backgroundColor: '#0f172a', borderRadius: 12, padding: 12, marginBottom: 20, flexDirection: 'row', justifyContent: 'space-between' }}>
                                <Text style={{ color: '#9ca3af', fontSize: 13 }}>Доступно</Text>
                                <Text style={{ color: withdrawGoal.color, fontSize: 13, fontWeight: '600' }}>
                                    {formatAmount(withdrawGoal.saved, withdrawGoal.currency)}
                                </Text>
                            </View>
                        )}

                        {/* Amount */}
                        <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 8 }}>Сумма ({withdrawGoal?.currency})</Text>
                        <TextInput
                            value={withdrawAmount}
                            onChangeText={v => setWithdrawAmount(v.replace(/[^0-9.,]/g, ''))}
                            keyboardType="decimal-pad"
                            placeholder="0"
                            placeholderTextColor="#4b5563"
                            autoFocus
                            style={{ backgroundColor: '#1f2937', color: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 18, marginBottom: 16, fontSize: 28, fontWeight: '700', textAlign: 'center' }}
                        />

                        {/* Target account */}
                        <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 10 }}>На счёт</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                            {accounts.map(acc => (
                                <TouchableOpacity key={acc.id} onPress={() => setWithdrawAccId(acc.id)}
                                    style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, marginRight: 8, borderWidth: 1.5, borderColor: withdrawAccId === acc.id ? '#d97706' : '#374151', backgroundColor: withdrawAccId === acc.id ? '#422006' : '#1f2937' }}>
                                    <Text style={{ color: withdrawAccId === acc.id ? '#fff' : '#9ca3af', fontSize: 13 }} numberOfLines={1}>{acc.name}</Text>
                                    <Text style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>{formatAmount(acc.balance, acc.currency)}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        {/* Note */}
                        <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 8 }}>Заметка (необязательно)</Text>
                        <TextInput
                            value={withdrawNote}
                            onChangeText={setWithdrawNote}
                            placeholder="На что тратите…"
                            placeholderTextColor="#4b5563"
                            style={{ backgroundColor: '#1f2937', color: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 24, fontSize: 15 }}
                        />

                        {/* Confirm */}
                        <TouchableOpacity
                            onPress={handleWithdraw}
                            disabled={withdrawing || !withdrawAmount || parseFloat(withdrawAmount) <= 0 || !withdrawAccId}
                            style={{ paddingVertical: 16, borderRadius: 16, alignItems: 'center', backgroundColor: withdrawing || !withdrawAmount || parseFloat(withdrawAmount) <= 0 || !withdrawAccId ? '#374151' : '#d97706' }}
                        >
                            {withdrawing
                                ? <ActivityIndicator color="#fff" />
                                : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                                    Перевести{withdrawAmount && parseFloat(withdrawAmount) > 0 ? ` ${formatAmount(parseFloat(withdrawAmount), withdrawGoal?.currency ?? 'EUR')}` : ''}
                                  </Text>
                            }
                        </TouchableOpacity>
            </BaseBottomSheet>

            {/* ════════════════════════════════════════════════════════════════
                FAB MODAL — Новая операция
            ════════════════════════════════════════════════════════════════ */}
            <BaseBottomSheet visible={fabOpen} onClose={() => setFabOpen(false)} scrollable={false}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>Новая операция</Text>
                            <TouchableOpacity onPress={() => setFabOpen(false)} hitSlop={12}><X color="#6b7280" size={22} /></TouchableOpacity>
                        </View>

                        {/* Action buttons */}
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                            {[
                                { label: 'Расход',  icon: <TrendingDown color="#fff" size={24} />, bg: '#dc2626', action: () => { setFabOpen(false); openTxForm('expense'); } },
                                { label: 'Доход',   icon: <TrendingUp color="#fff" size={24} />,   bg: '#16a34a', action: () => { setFabOpen(false); openTxForm('income'); } },
                                { label: 'Перевод', icon: <ArrowRightLeft color="#fff" size={24} />, bg: '#2563eb', action: () => { setFabOpen(false); openTxForm('transfer'); } },
                            ].map(btn => (
                                <TouchableOpacity key={btn.label} onPress={btn.action} activeOpacity={0.8}
                                    style={{ flex: 1, backgroundColor: btn.bg, borderRadius: 16, paddingVertical: 18, alignItems: 'center', gap: 8 }}>
                                    {btn.icon}
                                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{btn.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
            </BaseBottomSheet>

        </View>
    );
}
