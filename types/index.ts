export type ExpenseType = 'base' | 'everyday' | 'development' | 'forself' | 'work' | 'other';
export type TransactionType = 'income' | 'expense' | 'transfer';
export type CategoryType = 'income' | 'expense';
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type CompoundingPeriod = 'monthly' | 'yearly';

export interface Household {
    id: string;
    name: string;
    base_currency: string;
    created_at: string;
}

export interface Account {
    id: string;
    household_id: string;
    name: string;
    currency: string;
    balance: number;
    color: string | null;
    icon: string | null;
    sort_order: number | null;
    spending_limit: number | null;
    spending_limit_period: Frequency | null;
    exclude_from_dashboard: boolean;
    is_deleted: boolean;
    deleted_at: string | null;
    former_name: string | null;
    created_at: string;
    updated_at: string;
}

export interface Category {
    id: string;
    household_id: string | null;
    name: string;
    icon: string | null;
    color: string | null;
    type: CategoryType;
    expense_type: ExpenseType | null;
    is_system: boolean;
    is_hidden: boolean;
    created_at: string;
}

export interface Transaction {
    id: string;
    household_id: string;
    account_id: string;
    category_id: string;
    user_id: string;
    type: TransactionType;
    amount: number;
    currency: string;
    amount_base: number | null;
    exchange_rate: number | null;
    note: string | null;
    receipt_url: string | null;
    date: string;
    recurring_id: string | null;
    is_deleted: boolean;
    created_at: string;
}

export interface RecurringPayment {
    id: string;
    household_id: string;
    account_id: string;
    category_id: string;
    name: string;
    type: TransactionType;
    expense_type: ExpenseType | null;
    amount: number;
    currency: string;
    frequency: Frequency;
    next_date: string;
    notify_days_before: number;
    is_active: boolean;
    created_at: string;
}

export interface Budget {
    id: string;
    household_id: string;
    category_id: string;
    tag_id: string | null;
    amount: number;
    currency: string;
    period: 'monthly' | 'yearly';
    period_start: string;
    created_at: string;
}

export interface SavingsGoal {
    id: string;
    household_id: string;
    account_id: string;
    name: string;
    icon: string | null;
    color: string | null;
    target_amount: number;
    currency: string;
    target_date: string | null;
    interest_rate: number | null;
    compounding: CompoundingPeriod;
    is_active: boolean;
    is_archived: boolean;
    created_at: string;
}
