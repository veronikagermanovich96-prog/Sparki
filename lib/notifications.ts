import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotifSettings {
    lowBalance: {
        enabled: boolean;
        thresholds: Record<string, number>; // accountId → threshold
    };
    recurringPayment: {
        enabled: boolean;
        daysBefore: number; // 1 | 3 | 7
    };
    budget: {
        enabled: boolean;
        at80: boolean;
        at100: boolean;
    };
    dailySummary: {
        enabled: boolean;
        hour: number;
        minute: number;
    };
    loanPayment: {
        enabled: boolean;
        daysBefore: 1 | 3 | 7;
        onDueDay: boolean;
        onOverdue: boolean;
    };
}

export const DEFAULT_NOTIF_SETTINGS: NotifSettings = {
    lowBalance:       { enabled: false, thresholds: {} },
    recurringPayment: { enabled: true,  daysBefore: 3 },
    budget:           { enabled: true,  at80: true, at100: true },
    dailySummary:     { enabled: false, hour: 21, minute: 0 },
    loanPayment:      { enabled: true,  daysBefore: 3, onDueDay: true, onOverdue: true },
};

const STORAGE_KEY = 'notif_settings_v1';

// ─── Storage ──────────────────────────────────────────────────────────────────

export async function loadNotifSettings(): Promise<NotifSettings> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_NOTIF_SETTINGS;
        return { ...DEFAULT_NOTIF_SETTINGS, ...JSON.parse(raw) };
    } catch {
        return DEFAULT_NOTIF_SETTINGS;
    }
}

export async function saveNotifSettings(settings: NotifSettings): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    await applySchedules(settings);
}

// ─── Permissions ──────────────────────────────────────────────────────────────

export async function requestPermissions(): Promise<boolean> {
    if (!Device.isDevice) return false;
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
}

// ─── Configure handler ────────────────────────────────────────────────────────

export function configureNotifications() {
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: false,
            shouldSetBadge: false,
        }),
    });
    if (Platform.OS === 'android') {
        Notifications.setNotificationChannelAsync('default', {
            name: 'Default',
            importance: Notifications.AndroidImportance.HIGH,
        });
    }
}

// ─── Scheduling ───────────────────────────────────────────────────────────────

const DAILY_SUMMARY_ID = 'daily_summary';

export async function applySchedules(settings: NotifSettings) {
    // Daily summary
    await Notifications.cancelScheduledNotificationAsync(DAILY_SUMMARY_ID).catch(() => {});
    if (settings.dailySummary.enabled) {
        await Notifications.scheduleNotificationAsync({
            identifier: DAILY_SUMMARY_ID,
            content: {
                title: 'Дневная сводка',
                body: 'Откройте приложение, чтобы увидеть статистику за сегодня',
                data: { type: 'daily_summary' },
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DAILY,
                hour: settings.dailySummary.hour,
                minute: settings.dailySummary.minute,
            },
        });
    }
}

// ─── On-demand checks (called on app focus) ───────────────────────────────────

export async function checkAndNotify(householdId: string, settings: NotifSettings) {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const now = new Date();

    // ── Low balance
    if (settings.lowBalance.enabled && Object.keys(settings.lowBalance.thresholds).length > 0) {
        const { data: accounts } = await supabase
            .from('accounts')
            .select('id, name, balance, currency')
            .eq('household_id', householdId)
            .eq('is_deleted', false);

        for (const acc of accounts ?? []) {
            const threshold = settings.lowBalance.thresholds[acc.id];
            if (threshold == null) continue;
            if (acc.balance < threshold) {
                await Notifications.scheduleNotificationAsync({
                    identifier: `low_balance_${acc.id}`,
                    content: {
                        title: `Низкий баланс: ${acc.name}`,
                        body: `Баланс ${acc.balance} ${acc.currency} ниже порога ${threshold} ${acc.currency}`,
                        data: { type: 'low_balance', accountId: acc.id },
                    },
                    trigger: null,
                });
            }
        }
    }

    // ── Recurring payments
    if (settings.recurringPayment.enabled) {
        const targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + settings.recurringPayment.daysBefore);
        const targetStr = targetDate.toISOString().slice(0, 10);

        const { data: payments } = await supabase
            .from('recurring_payments')
            .select('id, name, amount, currency, next_date')
            .eq('household_id', householdId)
            .eq('is_active', true)
            .eq('next_date', targetStr);

        for (const p of payments ?? []) {
            await Notifications.scheduleNotificationAsync({
                identifier: `recurring_${p.id}_${targetStr}`,
                content: {
                    title: 'Предстоящий платёж',
                    body: `${p.name}: ${p.amount} ${p.currency} через ${settings.recurringPayment.daysBefore} дн.`,
                    data: { type: 'recurring', paymentId: p.id },
                },
                trigger: null,
            });
        }
    }

    // ── Loan payments
    if (settings.loanPayment.enabled) {
        const todayStr = now.toISOString().slice(0, 10);
        const futureDate = new Date(now);
        futureDate.setDate(futureDate.getDate() + settings.loanPayment.daysBefore);
        const futureStr = futureDate.toISOString().slice(0, 10);

        const { data: loans } = await supabase
            .from('loan_accounts')
            .select('id, name, monthly_payment, currency, next_payment_date')
            .eq('household_id', householdId)
            .eq('is_active', true);

        for (const loan of loans ?? []) {
            const nextDate = loan.next_payment_date;
            if (!nextDate) continue;

            // Reminder N days before
            if (nextDate === futureStr) {
                await Notifications.scheduleNotificationAsync({
                    identifier: `loan_before_${loan.id}_${futureStr}`,
                    content: {
                        title: 'Предстоящий платёж по кредиту',
                        body: `Платёж по кредиту «${loan.name}» через ${settings.loanPayment.daysBefore} дн. — ${loan.monthly_payment} ${loan.currency}`,
                        data: { type: 'loan_payment', loanId: loan.id },
                    },
                    trigger: null,
                });
            }

            // On due day
            if (settings.loanPayment.onDueDay && nextDate === todayStr) {
                await Notifications.scheduleNotificationAsync({
                    identifier: `loan_due_${loan.id}_${todayStr}`,
                    content: {
                        title: 'Платёж по кредиту сегодня',
                        body: `Сегодня платёж по кредиту «${loan.name}» — ${loan.monthly_payment} ${loan.currency}`,
                        data: { type: 'loan_payment', loanId: loan.id },
                    },
                    trigger: null,
                });
            }

            // Overdue
            if (settings.loanPayment.onOverdue && nextDate < todayStr) {
                await Notifications.scheduleNotificationAsync({
                    identifier: `loan_overdue_${loan.id}_${nextDate}`,
                    content: {
                        title: 'Просроченный платёж по кредиту',
                        body: `Просроченный платёж по кредиту «${loan.name}» — ${loan.monthly_payment} ${loan.currency}`,
                        data: { type: 'loan_payment', loanId: loan.id },
                    },
                    trigger: null,
                });
            }
        }
    }

    // ── Budget exceeded
    if (settings.budget.enabled) {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        const { data: budgets } = await supabase
            .from('budgets')
            .select('id, category_id, amount, categories(name)')
            .eq('household_id', householdId);

        if (budgets?.length) {
            const { data: txs } = await supabase
                .from('transactions')
                .select('category_id, amount_base')
                .eq('household_id', householdId)
                .eq('type', 'expense')
                .gte('date', monthStart);

            const spent: Record<string, number> = {};
            for (const t of txs ?? []) {
                if (t.category_id) spent[t.category_id] = (spent[t.category_id] ?? 0) + (t.amount_base ?? 0);
            }

            for (const b of budgets) {
                const s = spent[b.category_id] ?? 0;
                const pct = b.amount > 0 ? s / b.amount : 0;
                const catName = (b.categories as any)?.name ?? 'Категория';

                if (settings.budget.at100 && pct >= 1) {
                    await Notifications.scheduleNotificationAsync({
                        identifier: `budget_100_${b.id}_${monthStart}`,
                        content: {
                            title: `Бюджет превышен: ${catName}`,
                            body: `Вы потратили 100% бюджета на ${catName}`,
                            data: { type: 'budget', budgetId: b.id },
                        },
                        trigger: null,
                    });
                } else if (settings.budget.at80 && pct >= 0.8) {
                    await Notifications.scheduleNotificationAsync({
                        identifier: `budget_80_${b.id}_${monthStart}`,
                        content: {
                            title: `Бюджет на 80%: ${catName}`,
                            body: `Вы потратили 80% бюджета на ${catName}`,
                            data: { type: 'budget', budgetId: b.id },
                        },
                        trigger: null,
                    });
                }
            }
        }
    }
}
