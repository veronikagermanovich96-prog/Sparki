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
    { name: 'Аренда / Ипотека', slug: 'rent', expense_type: 'base', icon: 'Home', color: '#3b82f6', type: 'expense' },
    { name: 'Коммуналка', slug: 'utilities', expense_type: 'base', icon: 'Zap', color: '#3b82f6', type: 'expense' },
    { name: 'Интернет', slug: 'internet', expense_type: 'base', icon: 'Wifi', color: '#3b82f6', type: 'expense' },
    { name: 'Телефон', slug: 'phone', expense_type: 'base', icon: 'Phone', color: '#3b82f6', type: 'expense' },
    { name: 'Страховка', slug: 'insurance', expense_type: 'base', icon: 'Shield', color: '#3b82f6', type: 'expense' },
    { name: 'Кредит', slug: 'credit', expense_type: 'base', icon: 'CreditCard', color: '#ef4444', type: 'expense' },
    { name: 'Обслуживание жилья', slug: 'home_maintenance', expense_type: 'base', icon: 'Wrench', color: '#3b82f6', type: 'expense' },

    // 🛒 Повседневные
    { name: 'Еда и продукты', slug: 'food', expense_type: 'everyday', icon: 'ShoppingCart', color: '#22c55e', type: 'expense' },
    { name: 'Транспорт', slug: 'transport', expense_type: 'everyday', icon: 'Car', color: '#22c55e', type: 'expense' },
    { name: 'Кафе и рестораны', slug: 'cafe', expense_type: 'everyday', icon: 'Coffee', color: '#22c55e', type: 'expense' },
    { name: 'Гигиена и уход', slug: 'hygiene', expense_type: 'everyday', icon: 'Smile', color: '#22c55e', type: 'expense' },
    { name: 'Бытовая химия', slug: 'household', expense_type: 'everyday', icon: 'Package', color: '#22c55e', type: 'expense' },
    { name: 'Дети', slug: 'children', expense_type: 'everyday', icon: 'Baby', color: '#22c55e', type: 'expense' },
    { name: 'Животные', slug: 'pets', expense_type: 'everyday', icon: 'PawPrint', color: '#22c55e', type: 'expense' },

    // 📈 Развитие
    { name: 'Здоровье', slug: 'health', expense_type: 'development', icon: 'Heart', color: '#a855f7', type: 'expense' },
    { name: 'Образование', slug: 'education', expense_type: 'development', icon: 'BookOpen', color: '#a855f7', type: 'expense' },
    { name: 'Саморазвитие', slug: 'selfdev', expense_type: 'development', icon: 'TrendingUp', color: '#a855f7', type: 'expense' },
    { name: 'Медицинская страховка', slug: 'health_insurance', expense_type: 'development', icon: 'Shield', color: '#a855f7', type: 'expense' },

    // 🎉 Для себя
    { name: 'Развлечения', slug: 'entertainment', expense_type: 'forself', icon: 'Film', color: '#f97316', type: 'expense' },
    { name: 'Одежда и обувь', slug: 'clothing', expense_type: 'forself', icon: 'Shirt', color: '#f97316', type: 'expense' },
    { name: 'Путешествия', slug: 'travel', expense_type: 'forself', icon: 'Plane', color: '#f97316', type: 'expense' },
    { name: 'Подарки', slug: 'gifts', expense_type: 'forself', icon: 'Gift', color: '#f97316', type: 'expense' },
    { name: 'Хобби', slug: 'hobby', expense_type: 'forself', icon: 'Star', color: '#f97316', type: 'expense' },
    { name: 'Красота', slug: 'beauty', expense_type: 'forself', icon: 'Sparkles', color: '#f97316', type: 'expense' },
    { name: 'Спорт', slug: 'sport', expense_type: 'forself', icon: 'Dumbbell', color: '#f97316', type: 'expense' },
    { name: 'Ужин с друзьями', slug: 'dining_out', expense_type: 'forself', icon: 'Users', color: '#f97316', type: 'expense' },

    // 💼 Работа
    { name: 'Оборудование', slug: 'equipment', expense_type: 'work', icon: 'Monitor', color: '#6b7280', type: 'expense' },
    { name: 'Программное обеспечение', slug: 'software', expense_type: 'work', icon: 'Code', color: '#6b7280', type: 'expense' },
    { name: 'Коворкинг', slug: 'coworking', expense_type: 'work', icon: 'Building', color: '#6b7280', type: 'expense' },

    // 🎁 Разное
    { name: 'Благотворительность', slug: 'charity', expense_type: 'other', icon: 'Heart', color: '#6b7280', type: 'expense' },
    { name: 'Штрафы', slug: 'fines', expense_type: 'other', icon: 'AlertTriangle', color: '#ef4444', type: 'expense' },
    { name: 'Непредвиденные расходы', slug: 'unexpected', expense_type: 'other', icon: 'HelpCircle', color: '#6b7280', type: 'expense' },

    // 💰 Доходы
    { name: 'Зарплата', slug: 'salary', expense_type: null, icon: 'Briefcase', color: '#22c55e', type: 'income' },
    { name: 'Фриланс', slug: 'freelance', expense_type: null, icon: 'Laptop', color: '#22c55e', type: 'income' },
    { name: 'Подработка', slug: 'side_income', expense_type: null, icon: 'DollarSign', color: '#22c55e', type: 'income' },
    { name: 'Инвестиции', slug: 'investments', expense_type: null, icon: 'TrendingUp', color: '#22c55e', type: 'income' },
    { name: 'Подарок', slug: 'gift_income', expense_type: null, icon: 'Gift', color: '#22c55e', type: 'income' },
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
