# Экран Транзакции — архитектура и спецификация

> Файл: `app/(app)/transactions/index.tsx`  
> Стек: Expo Router · React Native · Zustand · React Query · NativeWind

---

## 1. Структура компонентов

```
app/(app)/transactions/index.tsx
│
├── TransactionsHeader
│   ├── title "Транзакции"
│   ├── IconButton 🔍 → разворачивает SearchBar
│   └── IconButton ⚙️ → открывает FilterSheet
│       └── синяя точка если активен хотя бы один доп. фильтр
│
├── SearchBar (показывается по тапу на 🔍)
│   ├── TextInput — поиск по полю note
│   ├── debounce 300ms, минимум 2 символа
│   └── крестик → скрыть + сбросить поиск
│
├── FilterBar (2 строки горизонтального скролла)
│   ├── Row 1 — TypeFilter
│   │   └── Все / Расход / Доход / Перевод
│   └── Row 2 — AccountFilter + PeriodChip
│       ├── Все счета / [счёт 1] / [счёт 2] ...
│       └── PeriodChip [ Неделя ↓ ] → PeriodSheet
│
├── TransactionList (SectionList)
│   ├── SectionHeader — дата + итог дня
│   └── TransactionRow (свайп влево → удалить)
│
├── PeriodSheet (bottom sheet)
│   └── варианты периода + datepicker для произвольного
│
├── FilterSheet (bottom sheet ⚙️)
│   ├── фильтр по категории
│   └── фильтр по типу расхода
│
└── FAB (+) → bottom sheet добавления транзакции
```

---

## 2. Состояние экрана

Все фильтры — локальный `useState`. При изменении любого параметра React Query автоматически перезапрашивает данные.

```typescript
interface TransactionFilters {
  type:        'all' | 'expense' | 'income' | 'transfer'
  period:      'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom'
  customFrom:  Date | null   // только при period === 'custom'
  customTo:    Date | null   // только при period === 'custom'
  accountId:   string | null // null = все счета
  categoryId:  string | null // null = все категории
  expenseType: 'all' | 'infrastructure' | 'operational' | 'discretionary'
  search:      string
}

const defaultFilters: TransactionFilters = {
  type:        'all',
  period:      'month',
  customFrom:  null,
  customTo:    null,
  accountId:   null,
  categoryId:  null,
  expenseType: 'all',
  search:      '',
}
```

### Признак активных доп. фильтров (точка на ⚙️)

```typescript
const hasExtraFilters = filters.categoryId !== null || filters.expenseType !== 'all'
```

---

## 3. Верхняя панель

```
Транзакции                         🔍  ⚙️·
```

- **🔍** — разворачивает `SearchBar` над `FilterBar`
- **⚙️** — открывает `FilterSheet`
- **·** (синяя точка) — рендерится поверх ⚙️ когда `hasExtraFilters === true`

---

## 4. FilterBar

### Строка 1 — тип транзакции (TypeFilter)

Горизонтальный скролл чипсетов. Один активный — выделен синим фоном.

```
[ Все ]  [ Расход ]  [ Доход ]  [ Перевод ]
```

### Строка 2 — счета + период

```
[ Все счета ]  [ Дом ]  [ Машина ]  [ Отдых ]  ...  |  [ Месяц ↓ ]
```

- Счета берутся из `accounts` где `is_deleted = false`
- Разделитель `|` отделяет фильтр счетов от PeriodChip
- PeriodChip всегда виден (не уходит за скролл) — прилеплен к правому краю

---

## 5. PeriodSheet — выбор периода

Открывается по тапу на PeriodChip. Bottom sheet.

```
Период

●  Сегодня
○  Вчера
○  Неделя
○  Месяц
○  Год
──────────────────────────
○  Произвольный период
   Если выбран → появляется datepicker:
   [ 1 апр 2026 ]  →  [ 30 апр 2026 ]
```

### Надпись PeriodChip после выбора

| Выбор | Надпись чипа |
|---|---|
| Сегодня | `Сегодня` |
| Вчера | `Вчера` |
| Неделя | `Неделя` |
| Месяц | `Месяц` |
| Год | `Год` |
| Произвольный (один день) | `15 апр` |
| Произвольный (диапазон) | `1–15 апр` |
| Произвольный (разные месяцы) | `1 апр – 15 мая` |

### Логика дат периодов

```typescript
function getPeriodRange(
  period: TransactionFilters['period'],
  customFrom?: Date | null,
  customTo?: Date | null
): { from: Date; to: Date } {
  const today = new Date()
  switch (period) {
    case 'today':
      return { from: startOfDay(today), to: endOfDay(today) }
    case 'yesterday':
      const yesterday = subDays(today, 1)
      return { from: startOfDay(yesterday), to: endOfDay(yesterday) }
    case 'week':
      return { from: startOfWeek(today, { weekStartsOn: 1 }), to: endOfWeek(today, { weekStartsOn: 1 }) }
    case 'month':
      return { from: startOfMonth(today), to: endOfMonth(today) }
    case 'year':
      return { from: startOfYear(today), to: endOfYear(today) }
    case 'custom':
      return {
        from: customFrom ? startOfDay(customFrom) : startOfMonth(today),
        to:   customTo   ? endOfDay(customTo)     : endOfMonth(today),
      }
  }
}
```

---

## 6. FilterSheet — дополнительные фильтры (⚙️)

```
Фильтры

Категория
[ Все ]  [ 🛒 Еда ]  [ 🚗 Транспорт ]  [ 🏠 Жильё ]  ...
(горизонтальный скролл, иконка + цвет категории)

Тип расхода
[ Все ]  [ Инфраструктурные ]  [ Операционные ]  [ Дискреционные ]
(показывается только если type === 'expense' или 'all')

──────────────────────────────────
[ Сбросить ]          [ Применить ]
```

- **Сбросить** → `categoryId = null`, `expenseType = 'all'`, закрыть sheet
- **Применить** → применить выбранные фильтры, закрыть sheet

---

## 7. SearchBar

Появляется над FilterBar при тапе на 🔍. Анимированное появление (slide down).

```typescript
// поиск с debounce
const [searchInput, setSearchInput] = useState('')
const debouncedSearch = useDebounce(searchInput, 300)

useEffect(() => {
  if (debouncedSearch.length >= 2 || debouncedSearch.length === 0) {
    setFilters(f => ({ ...f, search: debouncedSearch }))
  }
}, [debouncedSearch])
```

Закрытие: крестик или свайп SearchBar вниз → `search = ''`, скрыть поле.

---

## 8. SectionList — группировка по дням

### Section Header

```
15 апреля, вторник                 −120€  +500€
```

Итог адаптируется под активный TypeFilter:

| Фильтр | Итог в заголовке |
|---|---|
| Все | `−120€  +500€` (расходы и доходы отдельно) |
| Расход | `−120€` |
| Доход | `+500€` |
| Перевод | `2 перевода` |

### TransactionRow

```
┌────────────────────────────────────────────────┐
│  [🛒]  Еда и продукты               −45.00€   │
│        Lidl · Карта                            │
├────────────────────────────────────────────────┤
│  [📱]  Netflix                      −15.00€   │
│        Подписки · Карта          🔁            │
├────────────────────────────────────────────────┤
│  [💼]  Зарплата                    +500.00€   │
│        Апрель · Карта                          │
└────────────────────────────────────────────────┘
```

**Анатомия строки:**

| Элемент | Описание |
|---|---|
| Иконка слева | Lucide-иконка категории с цветом категории |
| Название | `category.name` |
| Подстрока | `note` (если есть) · `account.name` |
| Плашка 🔁 | Только если `recurring_id != null` |
| Сумма | Красная (расход) / Зелёная (доход) / Серая (перевод) |

**Свайп влево** → кнопка "Удалить" (красная) → попап подтверждения:

```
"Удалить транзакцию?"
Действие нельзя отменить.

[ Отмена ]   [ Удалить ]
```

**Тап на строку** → экран детали/редактирования `transactions/[id].tsx`

---

## 9. Запрос данных

```typescript
// hooks/useTransactions.ts
function useTransactions(filters: TransactionFilters) {
  const { from, to } = getPeriodRange(filters.period, filters.customFrom, filters.customTo)

  return useQuery({
    queryKey: ['transactions', filters],
    queryFn:  () => fetchTransactions({
      householdId: currentHouseholdId,
      from,
      to,
      type:        filters.type !== 'all'        ? filters.type        : undefined,
      accountId:   filters.accountId             ?? undefined,
      categoryId:  filters.categoryId            ?? undefined,
      expenseType: filters.expenseType !== 'all' ? filters.expenseType : undefined,
      search:      filters.search || undefined,
    }),
    select: groupTransactionsByDay,  // → SectionListData[]
  })
}

// группировка для SectionList
function groupTransactionsByDay(transactions: Transaction[]): SectionListData[] {
  return Object.entries(
    groupBy(transactions, t => format(t.date, 'yyyy-MM-dd'))
  ).map(([date, items]) => ({
    date,
    title:        format(parseISO(date), 'd MMMM, EEEE', { locale: ru }),
    data:         items,
    totalExpense: items.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount_base, 0),
    totalIncome:  items.filter(t => t.type === 'income').reduce((s, t) => s + t.amount_base, 0),
    transferCount: items.filter(t => t.type === 'transfer').length,
  }))
}
```

---

## 10. Пустые состояния

| Ситуация | Заголовок | Подзаголовок |
|---|---|---|
| Нет транзакций вообще | "Транзакций нет" | "Нажмите + чтобы добавить" |
| Фильтры дают 0 результатов | "Ничего не найдено" | "Попробуйте изменить фильтры" |
| Поиск без результата | "Не найдено" | "По запросу «{search}»" |

---

## 11. Навигация

```typescript
// тап на строку → детали
router.push(`/transactions/${transaction.id}`)

// FAB → добавление
// открывает bottom sheet прямо на этом экране (не новый роут)
```

---

*Версия: 1.0 · Март 2026 · Family Finance App*
