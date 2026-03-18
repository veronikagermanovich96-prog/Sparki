-- Update expense_type for all categories
-- Run in Supabase SQL Editor

-- 1. Базовые (base) — обязательные фиксированные расходы
UPDATE categories SET expense_type = 'base'
WHERE name IN ('Жильё', 'Аренда', 'Коммуналка', 'ЖКУ', 'Интернет', 'Телефон', 'Страховка', 'Связь', 'Кредит', 'Ипотека')
  AND type = 'expense';

-- 2. Повседневные (everyday) — ежедневные бытовые расходы
UPDATE categories SET expense_type = 'everyday'
WHERE name IN ('Еда', 'Еда и продукты', 'Продукты', 'Транспорт', 'Кафе', 'Кафе и рестораны', 'Гигиена', 'Бытовая химия', 'Дом', 'Такси', 'Бензин')
  AND type = 'expense';

-- 3. Развитие (development) — инвестиции в себя
UPDATE categories SET expense_type = 'development'
WHERE name IN ('Здоровье', 'Образование', 'Спорт', 'Медицина', 'Фитнес', 'Курсы', 'Книги')
  AND type = 'expense';

-- 4. Для себя (forself) — досуг и удовольствия
UPDATE categories SET expense_type = 'forself'
WHERE name IN ('Развлечения', 'Одежда', 'Путешествия', 'Подарки', 'Хобби', 'Шоппинг', 'Досуг', 'Красота', 'Игры', 'Подписки')
  AND type = 'expense';

-- 5. Рабочие (work) — расходы связанные с работой
UPDATE categories SET expense_type = 'work'
WHERE name IN ('Работа', 'Офис', 'Командировки', 'Инструменты', 'Оборудование')
  AND type = 'expense';

-- 6. Прочее (other) — всё остальное
UPDATE categories SET expense_type = 'other'
WHERE name IN ('Штрафы', 'Налоги', 'Благотворительность', 'Комиссии', 'Прочее')
  AND type = 'expense';

-- Все оставшиеся expense-категории без типа → everyday
UPDATE categories SET expense_type = 'everyday'
WHERE type = 'expense' AND expense_type IS NULL;

-- Также обновим старые значения если остались
UPDATE categories SET expense_type = 'base' WHERE expense_type = 'infrastructure';
UPDATE categories SET expense_type = 'everyday' WHERE expense_type = 'operational';
UPDATE categories SET expense_type = 'development' WHERE expense_type = 'investment';
UPDATE categories SET expense_type = 'forself' WHERE expense_type = 'discretionary';
