-- Set expense_type for system/common categories
-- Run in Supabase SQL Editor

-- Базовые (infrastructure)
UPDATE categories SET expense_type = 'infrastructure'
WHERE name IN ('Жильё', 'Аренда', 'Коммуналка', 'ЖКУ', 'Интернет', 'Телефон', 'Страховка', 'Связь')
  AND (expense_type IS NULL OR expense_type != 'infrastructure');

-- Повседневные (operational)
UPDATE categories SET expense_type = 'operational'
WHERE name IN ('Еда', 'Еда и продукты', 'Продукты', 'Транспорт', 'Кафе', 'Кафе и рестораны', 'Гигиена', 'Бытовая химия')
  AND (expense_type IS NULL OR expense_type != 'operational');

-- Развитие (investment)
UPDATE categories SET expense_type = 'investment'
WHERE name IN ('Здоровье', 'Образование', 'Спорт', 'Медицина', 'Фитнес')
  AND (expense_type IS NULL OR expense_type != 'investment');

-- Для себя (discretionary)
UPDATE categories SET expense_type = 'discretionary'
WHERE name IN ('Развлечения', 'Одежда', 'Путешествия', 'Подарки', 'Хобби', 'Шоппинг', 'Досуг')
  AND (expense_type IS NULL OR expense_type != 'discretionary');
