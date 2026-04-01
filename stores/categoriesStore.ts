import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { Category } from '@/types';

interface CategoriesState {
    categories: Category[];
    loading: boolean;
    fetchCategories: (householdId: string) => Promise<void>;
    addCategory: (data: Omit<Category, 'id' | 'created_at'>) => Promise<void>;
    deleteCategory: (id: string) => Promise<void>;
}

export const useCategoriesStore = create<CategoriesState>((set, get) => ({
    categories: [],
    loading: false,

    fetchCategories: async (householdId: string) => {
        set({ loading: true });
        const { data, error } = await supabase
            .from('categories')
            .select('*')
            .or(`household_id.eq.${householdId},is_system.eq.true`)
            .eq('is_hidden', false)
            .order('name', { ascending: true });

        if (!error && data) {
            set({ categories: data });
        }
        set({ loading: false });
    },

    addCategory: async (data) => {
        const { data: created, error } = await supabase
            .from('categories')
            .insert(data)
            .select()
            .single();

        if (!error && created) {
            set({ categories: [...get().categories, created] });
        }
    },

    deleteCategory: async (id: string) => {
        const { error } = await supabase
            .from('categories')
            .update({ is_hidden: true })
            .eq('id', id);

        if (!error) {
            set({ categories: get().categories.filter((c) => c.id !== id) });
        }
    },
}));
