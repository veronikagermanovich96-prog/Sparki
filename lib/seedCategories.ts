/**
 * Default categories seeder for new households.
 */
import { supabase } from '@/lib/supabase';

interface DefaultCategory {
    name: string;
    slug: string;
    expense_type: string | null;
    icon: string;
    color: string;
    type: 'expense' | 'income';
}

const DEFAULT_CATEGORIES: DefaultCategory[] = [
    // 🏠 Базовые
    { name: 'Жильё и ЖКУ', slug: 'housing', expense_type: 'base', icon: 'Home', color: '#3b82f6', type: 'expense' },

    // 🛒 Повседневные
    { name: 'Еда и продукты', slug: 'food', expense_type: 'everyday', icon: 'ShoppingCart', color: '#22c55e', type: 'expense' },
    { name: 'Транспорт', slug: 'transport', expense_type: 'everyday', icon: 'Car', color: '#22c55e', type: 'expense' },
    { name: 'Кафе и рестораны', slug: 'cafe', expense_type: 'everyday', icon: 'Coffee', color: '#22c55e', type: 'expense' },

    // 📈 Развитие
    { name: 'Здоровье', slug: 'health', expense_type: 'development', icon: 'Heart', color: '#a855f7', type: 'expense' },

    // 🎉 Для себя
    { name: 'Развлечения', slug: 'entertainment', expense_type: 'forself', icon: 'Film', color: '#f97316', type: 'expense' },
    { name: 'Одежда и обувь', slug: 'clothing', expense_type: 'forself', icon: 'Shirt', color: '#f97316', type: 'expense' },
    { name: 'Путешествия', slug: 'travel', expense_type: 'forself', icon: 'Plane', color: '#f97316', type: 'expense' },
    { name: 'Спорт', slug: 'sport', expense_type: 'forself', icon: 'Dumbbell', color: '#f97316', type: 'expense' },
    { name: 'Красота', slug: 'beauty', expense_type: 'forself', icon: 'Sparkles', color: '#f97316', type: 'expense' },

    // 💼 Работа
    { name: 'Работа', slug: 'work', expense_type: 'work', icon: 'Briefcase', color: '#6b7280', type: 'expense' },

    // 📋 Другое
    { name: 'Другое', slug: 'other', expense_type: 'other', icon: 'HelpCircle', color: '#6b7280', type: 'expense' },

    // 💰 Доходы
    { name: 'Зарплата', slug: 'salary', expense_type: null, icon: 'Briefcase', color: '#22c55e', type: 'income' },
    { name: 'Фриланс', slug: 'freelance', expense_type: null, icon: 'Laptop', color: '#22c55e', type: 'income' },
    { name: 'Инвестиции', slug: 'investments', expense_type: null, icon: 'TrendingUp', color: '#22c55e', type: 'income' },
    { name: 'Прочее', slug: 'other_income', expense_type: null, icon: 'Plus', color: '#22c55e', type: 'income' },
];

export async function seedDefaultCategories(householdId: string): Promise<void> {
    // Check if categories already exist
    const { data: existing } = await supabase
        .from('categories')
        .select('id')
        .eq('household_id', householdId)
        .limit(1);

    if (existing && existing.length > 0) return;

    const rows = DEFAULT_CATEGORIES.map((cat) => ({
        household_id: householdId,
        name: cat.name,
        slug: cat.slug,
        expense_type: cat.expense_type,
        icon: cat.icon,
        color: cat.color,
        type: cat.type,
        is_system: true,
        is_hidden: false,
    }));

    await supabase.from('categories').insert(rows);
}
