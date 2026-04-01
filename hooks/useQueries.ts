import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Account, Category, Transaction } from '@/types';

// ── Query Keys ──────────────────────────────────────────────────────────────

export const queryKeys = {
  accounts: (householdId: string) => ['accounts', householdId] as const,
  transactions: (householdId: string, dateFrom?: string) =>
    ['transactions', householdId, dateFrom] as const,
  categories: (householdId: string) => ['categories', householdId] as const,
};

// ── Accounts ────────────────────────────────────────────────────────────────

export function useAccountsQuery(householdId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.accounts(householdId ?? ''),
    queryFn: async (): Promise<Account[]> => {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('household_id', householdId!)
        .eq('is_deleted', false)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!householdId,
  });
}

// ── Transactions ────────────────────────────────────────────────────────────

export function useTransactionsQuery(
  householdId: string | undefined,
  dateFrom?: string,
) {
  return useQuery({
    queryKey: queryKeys.transactions(householdId ?? '', dateFrom),
    queryFn: async (): Promise<Transaction[]> => {
      let query = supabase
        .from('transactions')
        .select('*')
        .eq('household_id', householdId!)
        .eq('is_deleted', false)
        .order('date', { ascending: false });

      if (dateFrom) {
        query = query.gte('date', dateFrom);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!householdId,
  });
}

// ── Categories ──────────────────────────────────────────────────────────────

export function useCategoriesQuery(householdId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.categories(householdId ?? ''),
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .or(`household_id.eq.${householdId!},is_system.eq.true`)
        .eq('is_hidden', false)
        .order('name', { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!householdId,
  });
}

// ── Mutations ───────────────────────────────────────────────────────────────

export function useAddTransactionMutation(householdId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Omit<Transaction, 'id' | 'created_at'>) => {
      const { data: created, error } = await supabase
        .from('transactions')
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return created as Transaction;
    },
    onSuccess: () => {
      if (householdId) {
        queryClient.invalidateQueries({
          queryKey: ['transactions', householdId],
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.accounts(householdId),
        });
      }
    },
  });
}

export function useDeleteTransactionMutation(householdId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('transactions')
        .update({ is_deleted: true })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      if (householdId) {
        queryClient.invalidateQueries({
          queryKey: ['transactions', householdId],
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.accounts(householdId),
        });
      }
    },
  });
}
