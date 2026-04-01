import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { Account } from '@/types';

interface AccountsState {
    accounts: Account[];
    loading: boolean;
    fetchAccounts: (householdId: string) => Promise<void>;
    updateAccount: (id: string, data: Partial<Account>) => Promise<void>;
    deleteAccount: (id: string) => Promise<void>;
    toggleExclude: (account: Account) => Promise<void>;
}

export const useAccountsStore = create<AccountsState>((set, get) => ({
    accounts: [],
    loading: false,

    fetchAccounts: async (householdId: string) => {
        set({ loading: true });
        const { data, error } = await supabase
            .from('accounts')
            .select('*')
            .eq('household_id', householdId)
            .eq('is_deleted', false)
            .order('sort_order', { ascending: true });

        if (!error && data) {
            set({ accounts: data });
        }
        set({ loading: false });
    },

    updateAccount: async (id: string, data: Partial<Account>) => {
        const { error } = await supabase
            .from('accounts')
            .update({ ...data, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (!error) {
            set({
                accounts: get().accounts.map((a) =>
                    a.id === id ? { ...a, ...data } : a
                ),
            });
        }
    },

    deleteAccount: async (id: string) => {
        const { error } = await supabase
            .from('accounts')
            .update({ is_deleted: true, deleted_at: new Date().toISOString() })
            .eq('id', id);

        if (!error) {
            set({ accounts: get().accounts.filter((a) => a.id !== id) });
        }
    },

    toggleExclude: async (account: Account) => {
        const newValue = !account.exclude_from_dashboard;
        const { error } = await supabase
            .from('accounts')
            .update({ exclude_from_dashboard: newValue })
            .eq('id', account.id);

        if (!error) {
            set({
                accounts: get().accounts.map((a) =>
                    a.id === account.id
                        ? { ...a, exclude_from_dashboard: newValue }
                        : a
                ),
            });
        }
    },
}));
