import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { Transaction } from '@/types';

interface TransactionsState {
    transactions: Transaction[];
    incomeTx: Transaction[];
    loading: boolean;
    fetchTransactions: (householdId: string, dateFrom?: string) => Promise<void>;
    addTransaction: (data: Omit<Transaction, 'id' | 'created_at'>) => Promise<void>;
    deleteTransaction: (id: string) => Promise<void>;
}

export const useTransactionsStore = create<TransactionsState>((set, get) => ({
    transactions: [],
    incomeTx: [],
    loading: false,

    fetchTransactions: async (householdId: string, dateFrom?: string) => {
        set({ loading: true });

        let query = supabase
            .from('transactions')
            .select('*')
            .eq('household_id', householdId)
            .eq('is_deleted', false)
            .order('date', { ascending: false });

        if (dateFrom) {
            query = query.gte('date', dateFrom);
        }

        const { data, error } = await query;

        if (!error && data) {
            set({
                transactions: data.filter((t) => t.type === 'expense'),
                incomeTx: data.filter((t) => t.type === 'income'),
            });
        }
        set({ loading: false });
    },

    addTransaction: async (data) => {
        const { data: created, error } = await supabase
            .from('transactions')
            .insert(data)
            .select()
            .single();

        if (!error && created) {
            if (created.type === 'income') {
                set({ incomeTx: [created, ...get().incomeTx] });
            } else {
                set({ transactions: [created, ...get().transactions] });
            }
        }
    },

    deleteTransaction: async (id: string) => {
        const { error } = await supabase
            .from('transactions')
            .update({ is_deleted: true })
            .eq('id', id);

        if (!error) {
            set({
                transactions: get().transactions.filter((t) => t.id !== id),
                incomeTx: get().incomeTx.filter((t) => t.id !== id),
            });
        }
    },
}));
