export type AccountLight = { id: string; name: string; color: string | null; currency: string; balance: number };
export type CategoryLight = { id: string; name: string; slug: string | null; icon: string | null; color: string | null; type: 'income' | 'expense'; expense_type: string | null; is_system: boolean };
export type TagLight = { id: string; name: string };
export type RecurFreq = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type ActivePanel = 'numpad' | 'calendar' | 'note' | 'recurring' | 'receipt' | 'tag';

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

export type ReceiptItem = {
    name: string;
    quantity: number;
    price: number;
    categorySlug: string | null;
    checked: boolean;
    categoryId: string | null;
};
