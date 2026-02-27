# Family Finance App — MVP Specification

> Персональное приложение для совместного учёта и управления финансами двух пользователей.  
> Стек: **Expo (React Native)** · **Supabase** · **frankfurter.app**  
> Платформы: **iOS 15+** · **Web (браузер)**

---

## 1. Философия продукта

Это не просто трекер расходов. Это инструмент для построения финансовой структуры, в основе которой лежит одна идея: **чтобы деньги приумножить, их сначала нужно правильно сохранить**.

Хранение без роста — это активный убыток. $100 при инфляции 7% через 5 лет = $71 в реальной покупательной способности. Приложение помогает пользователю видеть не только сколько потрачено, но и в каком из трёх состояний находятся его деньги в каждый момент времени.

### Три состояния денег

| Состояние | Что происходит | Цель приложения |
|---|---|---|
| **Потребляются** | Уходят безвозвратно (расходы) | Осознанность и контроль |
| **Сохраняются** | Остаются, но теряют стоимость из-за инфляции | Показать "цену бездействия" |
| **Работают** | Растут быстрее инфляции (депозиты, инвестиции) | Мотивация и планирование |

Эта модель встроена в онбординг и визуализируется через Icon Arrays на всех экранах приложения.

### Структура расходов

Расходы делятся на три типа — это принципиально для корректной визуализации дневных точек:

| Тип | Примеры | Влияет на дневную точку |
|---|---|---|
| **Инфраструктурные** | Аренда, коммуналка, страховки, кредиты | ❌ Амортизируются по дням |
| **Операционные** | Еда, транспорт, быт | ✅ Да |
| **Дискреционные** | Развлечения, одежда, импульсные покупки | ✅ Да |

Инфраструктурные расходы не делают точку красной в день оплаты — они равномерно распределяются по дням месяца и уже включены в дневной лимит.

---

## 2. Icon Array — визуальный язык приложения

Icon Array (сетка точек) — единственный визуальный язык для всех количественных данных в приложении. Метод основан на исследованиях по снижению "denominator neglect": люди воспринимают соотношения через количество объектов лучше, чем через абстрактные проценты.

**Ключевое правило:** единица в одной сетке должна быть однородной. Смешение разнородных данных в одной сетке разрушает доверие к визуализации.

### Use case 1 — Ежедневные траты (дашборд)

1 точка = 1 день. Масштаб меняется с переключателем периода:

| Период | Точек | 1 точка = |
|---|---|---|
| Неделя | 7 | 1 день |
| Месяц | 28–31 | 1 день |
| Квартал | 13 | 1 неделя |
| Год | 12 | 1 месяц |

**Цветовая логика:**

| Цвет | Состояние | Условие |
|---|---|---|
| 🟢 Зелёный | Хорошо | < 80% дневного лимита потрачено |
| 🟡 Жёлтый | Осторожно | 80–100% дневного лимита |
| 🔴 Красный | Перерасход | > 100% дневного лимита |
| ⬤ Тёмно-серый | Сегодня | День ещё не закончился |
| ○ Светло-серый | Будущее | День ещё не наступил |

Направление заполнения — слева направо, сверху вниз. Пользователь читает сетку как нарратив: видит паттерны ("сложная середина месяца", "хорошая неделя") без необходимости анализировать цифры.

**Дневной лимит:**
```
дневной лимит = (месячный бюджет − сумма амортизированных инфраструктурных) / дней в месяце
```

### Use case 2 — Прогресс накопительных целей

1 точка = 1% от суммы цели. Всего 100 точек.

| Цвет | Значение |
|---|---|
| 🟢 Тёмно-зелёный | Реально внесённые взносы |
| 🌿 Светло-зелёный | Заработанные проценты (сложный %) |
| ⬤ Серый заполненный | Запланированные будущие взносы |
| ○ Серый пустой | Остаток до цели |

### Use case 3 — Аналитика расходов и доходов

1 точка = 1% от общей суммы. 100 точек, цвет = категория.

### Use case 4 — Бюджет: факт vs план

Мини-сетка на каждую категорию. 100 точек = 100% запланированного бюджета.
Закрашенные (цвет категории) = потрачено · Серые = остаток · При 80%+ оранжевые · При 100%+ красные.

---

## 3. Стек технологий

| Слой | Решение | Обоснование |
|---|---|---|
| Frontend | Expo SDK 51+ (React Native + Expo Web) | Один кодбейз для iOS + браузер |
| Min iOS | iOS 15 | Широкая совместимость |
| Backend / DB | Supabase (PostgreSQL) | Auth, Realtime, Storage, RLS из коробки |
| Авторизация | Supabase Auth (email + password) | PostgreSQL-based, встроено в Supabase |
| Хранилище файлов | Supabase Storage | Для фото чеков |
| Курсы валют | frankfurter.app (бесплатный, без ключа) | Надёжный, ECB-данные |
| Уведомления | Expo Notifications | Push для iOS |
| Навигация | Expo Router (file-based) | Современный стандарт для Expo |
| UI-иконки | **Lucide React Native** | Единый набор, масштабируемые SVG |
| UI-компоненты | NativeWind (Tailwind) | Быстрая вёрстка, тёмная тема из коробки |
| Icon Array рендер | React Native SVG (кастомный) | Полный контроль над точками |
| State | Zustand + React Query (TanStack) | Простой стейт + кэш запросов |

### Дизайн-система

- **Тема:** тёмная по умолчанию, светлая опционально
- **Иконки:** Lucide React Native — `ShoppingCart`, `Car`, `Home`, `Heart`, `Shirt`, `Film`, `Smartphone`, `BookOpen`, `Plane`, `Briefcase`, `Laptop`, `TrendingUp`, `Gift` и т.д.
- **Цвет иконки и категории:** выбирается пользователем через color picker (hex)
- **Типографика:** системный шрифт SF Pro (iOS)
- **Сетка точек:** кастомный компонент `<IconArray />` на react-native-svg

---

## 4. Архитектура данных (Supabase / PostgreSQL)

### 4.1 Таблицы

#### `households`
```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
name          text
base_currency text NOT NULL DEFAULT 'EUR'
created_at    timestamptz DEFAULT now()
```

#### `household_members`
```sql
id            uuid PRIMARY KEY
household_id  uuid REFERENCES households(id)
user_id       uuid REFERENCES auth.users(id)
role          text DEFAULT 'member'  -- 'owner' | 'member'
joined_at     timestamptz DEFAULT now()
```

#### `accounts`
```sql
id                     uuid PRIMARY KEY
household_id           uuid REFERENCES households(id)
name                   text NOT NULL
currency               text NOT NULL         -- ISO 4217
balance                numeric(15,2) DEFAULT 0
color                  text                  -- hex
icon                   text                  -- имя иконки Lucide
exclude_from_dashboard boolean DEFAULT false -- скрыт из активного баланса
is_deleted             boolean DEFAULT false
deleted_at             timestamptz
former_name            text                  -- при слиянии счетов
created_at             timestamptz DEFAULT now()
updated_at             timestamptz DEFAULT now()
```

**Логика видимости счетов:**
- `exclude_from_dashboard = false` → участвует в активном балансе и дневных лимитах
- `exclude_from_dashboard = true` → скрыт из расчётов, но виден в общем балансе
- На дашборде: "Активный баланс: **8 000€**" (крупно) + "Всего на счетах: 10 000€" (серым)

#### `categories`
```sql
id             uuid PRIMARY KEY
household_id   uuid REFERENCES households(id)  -- null = системная
name           text NOT NULL
icon           text                             -- имя иконки Lucide
color          text                             -- hex, color picker
type           text NOT NULL                    -- 'income' | 'expense'
expense_type   text                             -- 'infrastructure' | 'operational' | 'discretionary'
is_system      boolean DEFAULT false
is_hidden      boolean DEFAULT false
created_at     timestamptz DEFAULT now()
```

#### `transactions`
```sql
id              uuid PRIMARY KEY
household_id    uuid REFERENCES households(id)
account_id      uuid REFERENCES accounts(id)
category_id     uuid REFERENCES categories(id)
user_id         uuid REFERENCES auth.users(id)
type            text NOT NULL     -- 'income' | 'expense' | 'transfer'
amount          numeric(15,2) NOT NULL
currency        text NOT NULL
amount_base     numeric(15,2)     -- сумма в базовой валюте
exchange_rate   numeric(15,6)
note            text
receipt_url     text              -- Supabase Storage
date            date NOT NULL
recurring_id    uuid REFERENCES recurring_payments(id)
is_deleted      boolean DEFAULT false
created_at      timestamptz DEFAULT now()
```

#### `transfers`
```sql
id                uuid PRIMARY KEY
household_id      uuid REFERENCES households(id)
from_account_id   uuid REFERENCES accounts(id)
to_account_id     uuid REFERENCES accounts(id)
amount_from       numeric(15,2) NOT NULL
amount_to         numeric(15,2) NOT NULL
currency_from     text NOT NULL
currency_to       text NOT NULL
exchange_rate     numeric(15,6)
date              date NOT NULL
note              text
created_at        timestamptz DEFAULT now()
```

#### `recurring_payments`
```sql
id                  uuid PRIMARY KEY
household_id        uuid REFERENCES households(id)
account_id          uuid REFERENCES accounts(id)
category_id         uuid REFERENCES categories(id)
name                text NOT NULL
type                text NOT NULL     -- 'income' | 'expense'
expense_type        text              -- 'infrastructure' | 'operational' | 'discretionary'
amount              numeric(15,2) NOT NULL
currency            text NOT NULL
frequency           text NOT NULL     -- 'daily' | 'weekly' | 'monthly' | 'yearly'
next_date           date NOT NULL
notify_days_before  int DEFAULT 3
is_active           boolean DEFAULT true
created_at          timestamptz DEFAULT now()
```

#### `budgets`
```sql
id              uuid PRIMARY KEY
household_id    uuid REFERENCES households(id)
category_id     uuid REFERENCES categories(id)
amount          numeric(15,2) NOT NULL
currency        text NOT NULL
period          text NOT NULL     -- 'monthly' | 'yearly'
period_start    date NOT NULL
created_at      timestamptz DEFAULT now()
```

#### `savings_goals`
```sql
id              uuid PRIMARY KEY
household_id    uuid REFERENCES households(id)
account_id      uuid REFERENCES accounts(id)  -- привязанный накопительный счёт
name            text NOT NULL
icon            text                           -- Lucide icon name
color           text                           -- hex
target_amount   numeric(15,2) NOT NULL
currency        text NOT NULL
target_date     date
interest_rate   numeric(5,2)                   -- % годовых (ручной ввод)
compounding     text DEFAULT 'monthly'         -- 'monthly' | 'yearly'
is_active       boolean DEFAULT true
is_archived     boolean DEFAULT false
created_at      timestamptz DEFAULT now()
```

#### `currency_rates_cache`
```sql
base_currency   text NOT NULL
target_currency text NOT NULL
rate            numeric(15,6) NOT NULL
fetched_at      timestamptz DEFAULT now()
PRIMARY KEY (base_currency, target_currency)
```

### 4.2 Row Level Security (RLS)

Все таблицы защищены политиками RLS: пользователь видит только данные своего `household_id`. Supabase Auth предоставляет `auth.uid()` для проверки.

---

## 5. Авторизация

- Email + Password через Supabase Auth
- При первой регистрации → создаётся `household`, пользователь становится `owner`
- Приглашение партнёра → по email-ссылке (Supabase Invite)
- После принятия → второй пользователь добавляется в `household_members`
- Realtime Supabase синхронизирует данные между двумя сессиями

---

## 6. Экраны и функционал

### 6.1 Онбординг

**Шаг 1 — Ментальная модель (3 слайда)**

Перед вводом данных пользователь проходит через объяснение трёх состояний денег — визуально, без цифр. Это меняет то, как он воспринимает сетки точек с первого дня.

- Слайд 1: "Деньги потребляются" → анимированные красные точки исчезают
- Слайд 2: "Деньги сохраняются, но теряют силу" → серые точки медленно тускнеют
- Слайд 3: "Деньги работают" → зелёные точки множатся

**Шаг 2 — Регистрация** (email + пароль)

**Шаг 3 — Настройка household:** название · базовая валюта · приглашение партнёра (можно пропустить)

---

### 6.2 Dashboard (главный экран)

Экран строится по принципу иерархии: сначала "как я сейчас?", потом "ради чего я слежу за расходами?"

**Верхняя секция — Баланс**
- Активный баланс (крупно) — сумма счетов с `exclude_from_dashboard = false`
- Общий баланс (серым, меньше) — все счета включая скрытые
- Карточки счетов (горизонтальный скролл): название, баланс, иконка Lucide, цвет

**Центральная секция — Icon Array дневных трат**
- Сетка точек текущего периода (Use case 1)
- Переключатель: Неделя / Месяц / Квартал / Год
- Тап на точку → день, сумма трат, сравнение с лимитом
- Под сеткой: дневной лимит + потрачено сегодня

**Нижняя секция — Цели накопления**
- Горизонтальный скролл карточек целей
- Каждая карточка: название, мини Icon Array прогресса, %, расчётная дата
- Кнопка "+" → создать новую цель

**FAB — добавить транзакцию**
- Фиксированная кнопка поверх контента
- Тап → bottom sheet: Расход / Доход / Перевод

**Knowledge base (контекстные подсказки)**
- Иконка `Info` (Lucide) рядом с ключевыми элементами
- Тап → объяснение на реальных цифрах пользователя
- Включается/выключается в настройках (по умолчанию выключен)

---

### 6.3 Транзакции

**Список:** фильтры (счёт, категория, тип, период) · поиск по заметке · группировка по дням

**Добавление / редактирование:**
- Тип: Расход / Доход / Перевод
- Для расходов → тип расхода: Инфраструктурный / Операционный / Дискреционный (подтягивается из категории, можно переопределить)
- Сумма + валюта (если ≠ базовой → курс и сумма в базовой)
- Счёт · Категория (иконка Lucide + цвет) · Дата · Заметка
- Прикрепить фото чека (камера или галерея → Supabase Storage)
- Связать с рекуррентным платежом (опционально)

**Удаление:** свайп → подтверждение попапом

---

### 6.4 Счета

**Список:** название, иконка Lucide, цвет, валюта, баланс · плашка "Скрыт из расчётов" если исключён

**Создание / редактирование:**
- Название · Валюта · Начальный баланс
- Иконка: поиск по Lucide + Color Picker (hex)
- Тоггл "Скрыть из активного баланса"

**Удаление (двухшаговый попап):**
```
Шаг 1: "Удалить счёт «[Название]»?"
        [Отмена]  [Удалить]

Шаг 2 (если есть транзакции): "Что сделать с историей?"
        ○ Перенести на другой счёт
          (в заметках появляется: "ex [Название счёта]")
        ○ Удалить все транзакции счёта

        [Назад]  [Подтвердить]
```

---

### 6.5 Категории

**Системные (нельзя удалить, можно скрыть):**

| Ключ | Название | Иконка Lucide | Тип расхода |
|---|---|---|---|
| food | Еда и продукты | ShoppingCart | operational |
| cafe | Кафе и рестораны | Coffee | discretionary |
| transport | Транспорт | Car | operational |
| housing | Жильё и ЖКУ | Home | infrastructure |
| health | Здоровье | Heart | operational |
| clothes | Одежда | Shirt | discretionary |
| entertainment | Развлечения | Film | discretionary |
| subscriptions | Подписки | Smartphone | infrastructure |
| education | Образование | BookOpen | discretionary |
| travel | Путешествия | Plane | discretionary |
| other_expense | Другое (расход) | Package | operational |
| salary | Зарплата | Briefcase | — (income) |
| freelance | Фриланс | Laptop | — (income) |
| investments | Инвестиции | TrendingUp | — (income) |
| gifts | Подарки | Gift | — (income) |
| other_income | Другое (доход) | CircleDollarSign | — (income) |

**Кастомные категории:**
- Название
- Иконка: live-поиск по Lucide
- Color Picker (hex + предустановленная палитра)
- Тип: Доход / Расход + тип расхода

---

### 6.6 Бюджеты

- Лимит по категории на месяц или год
- Icon Array (Use case 4) для каждой категории: факт vs план
- Состояния: норма / предупреждение 80%+ / перерасход 100%+
- Сводная строка: суммарный план vs факт
- Переключатель: текущий месяц / квартал / год

---

### 6.7 Рекуррентные платежи

**Список:** название, иконка, сумма, частота, следующая дата, статус

**Добавление:**
- Название · Тип + тип расхода (инфраструктурные → автоматически амортизируются)
- Сумма + валюта · Счёт · Категория
- Частота: ежедневно / еженедельно / ежемесячно / ежегодно
- Следующая дата
- Уведомить за: 1 / 3 / 7 дней

**Поведение:** не создаёт транзакцию автоматически — только уведомляет. Пользователь подтверждает вручную или из уведомления. После подтверждения → `next_date` сдвигается.

---

### 6.8 Мультивалютность

- У каждого счёта — своя валюта
- У каждой транзакции — своя валюта + `amount_base`
- Курсы: frankfurter.app, кэш 24 часа
- Вся аналитика в базовой валюте

**Смена базовой валюты:**
1. Выбор в настройках
2. Попап с предупреждением
3. Background job пересчитывает `amount_base` для всех транзакций

---

### 6.9 Аналитика

**Вкладка 1 — Расходы (Use case 3)**
- 100 точек = 100% расходов, цвет = категория
- Тап на точку → детали категории: название, сумма, %
- Легенда под сеткой

**Вкладка 2 — Доходы (Use case 3)**
- Аналогично, по источникам дохода
- Над сеткой — итоговая сумма доходов

**Вкладка 3 — Бюджет (Use case 4)**
- Мини-сетка на каждую категорию
- Сводная строка внизу

**Дополнительно:** bar chart доходы vs расходы (6 мес) · линейный график баланса счёта

---

### 6.10 Цели накопления

**Список:** карточки с мини Icon Array + название + прогресс + расчётная дата · архив достигнутых

**Экран цели:**

Icon Array (100 точек, Use case 2):
- 🟢 Тёмно-зелёный = реально внесённые взносы
- 🌿 Светло-зелёный = заработанные проценты
- ○ Серый = остаток

Калькулятор под сеткой:
```
Ставка:        [ 5.0 ] % годовых
Капитализация: [ Ежемесячно  ↔  Ежегодно ]  ← тоггл

Текущий баланс:       12 500€
Прогноз к [дата]:     18 340€
  из них % доход:      5 840€
Нужно довнести:       81 660€

При текущем темпе*: достигнешь цели ~ июнь 2031
* темп = среднемесячный взнос за последние 3 мес
```

Тоггл капитализации мгновенно пересчитывает все цифры — позволяет сравнить "ежемесячно vs ежегодно" без лишних действий.

**Калькулятор:**
```typescript
function calcCompoundGrowth(params: {
  currentBalance: number
  targetAmount:   number
  annualRate:     number
  compounding:   'monthly' | 'yearly'
  targetDate:     Date
}) {
  const periodsPerYear = params.compounding === 'monthly' ? 12 : 1
  const ratePerPeriod  = params.annualRate / 100 / periodsPerYear
  const monthsLeft     = differenceInMonths(params.targetDate, new Date())
  const periods        = params.compounding === 'monthly' ? monthsLeft : Math.floor(monthsLeft / 12)

  const fv             = params.currentBalance * Math.pow(1 + ratePerPeriod, periods)
  const interestEarned = fv - params.currentBalance
  const gap            = params.targetAmount - fv

  return { fv, interestEarned, gap }
}

// "При текущем темпе" — итеративный поиск даты
function estimateAchievementDate(
  params: CompoundParams,
  avgMonthlyContribution: number
): Date {
  let balance = params.currentBalance
  let date    = new Date()
  const r     = params.annualRate / 100 / (params.compounding === 'monthly' ? 12 : 1)

  while (balance < params.targetAmount) {
    balance = balance * (1 + r) + avgMonthlyContribution
    date    = addMonths(date, 1)
    if (differenceInYears(date, new Date()) > 100) break
  }
  return date
}
```

---

### 6.11 Уведомления

**Типы:**
1. Остаток на активном счёте ниже порога (настраивается на каждый счёт)
2. Рекуррентный платёж через N дней
3. Бюджет по категории превышен на 80% / 100%
4. Дневная сводка (опционально): потрачено сегодня vs лимит

**Настройки:** вкл/выкл каждый тип · время отправки дневной сводки (дефолт 21:00) · порог для каждого счёта (дефолт 100 в валюте счёта)

---

### 6.12 Импорт / Экспорт

**Экспорт:** диапазон дат · формат CSV или JSON

**CSV-структура:**
```
date,type,expense_type,amount,currency,amount_base,base_currency,account,category,note,recurring
2024-01-15,expense,operational,45.00,EUR,45.00,EUR,Карта,Еда и продукты,Lidl,
2024-01-01,expense,infrastructure,800.00,EUR,800.00,EUR,Карта,Жильё и ЖКУ,Аренда,monthly_rent
```

**Импорт:** загрузка CSV · preview с маппингом колонок · валидация + отчёт об ошибках

---

### 6.13 Настройки

- Профиль (имя, email, смена пароля)
- Базовая валюта (с предупреждением о пересчёте)
- Уведомления
- Управление категориями
- Управление скрытыми счетами
- Режим контекстных подсказок — вкл/выкл
- Тёмная / светлая тема
- Экспорт данных
- Выход из аккаунта

---

## 7. Навигация (Expo Router)

```
app/
├── (auth)/
│   ├── login.tsx
│   ├── register.tsx
│   └── onboarding.tsx         # 3 слайда ментальной модели
├── (app)/
│   ├── _layout.tsx            # Tab Navigator
│   ├── index.tsx              # Dashboard
│   ├── transactions/
│   │   ├── index.tsx
│   │   ├── add.tsx
│   │   └── [id].tsx
│   ├── accounts/
│   │   ├── index.tsx
│   │   ├── add.tsx
│   │   └── [id].tsx
│   ├── analytics/
│   │   ├── _layout.tsx        # Вкладки: Расходы / Доходы / Бюджет
│   │   ├── expenses.tsx
│   │   ├── income.tsx
│   │   └── budget.tsx
│   ├── savings/
│   │   ├── index.tsx          # Список целей
│   │   ├── add.tsx
│   │   └── [id].tsx           # Детали + Icon Array + калькулятор
│   ├── recurring/
│   │   ├── index.tsx
│   │   └── [id].tsx
│   └── settings/
│       ├── index.tsx
│       ├── categories.tsx
│       ├── accounts.tsx       # Скрытые счета
│       └── notifications.tsx
```

---

## 8. MVP Scope

### ✅ MVP включает:
- Онбординг с ментальной моделью (3 состояния денег)
- Авторизация (регистрация, вход, приглашение партнёра)
- Счета: CRUD + скрытие из расчётов + удаление с логикой переноса транзакций
- Транзакции (доход / расход / перевод) с типом расхода
- Категории: системные (Lucide) + кастомные (color picker)
- Dashboard: активный vs полный баланс + Icon Array дневных точек + карточки целей
- Icon Array — расходы по категориям
- Icon Array — доходы по источникам
- Icon Array — бюджет факт vs план
- Цели накопления: Icon Array (взносы + проценты) + калькулятор сложного %
- Мультивалютность (базовая валюта + пересчёт)
- Амортизация инфраструктурных расходов в дневном лимите
- Рекуррентные платежи
- Фото чека (Supabase Storage)
- Push-уведомления (рекуррентный платёж + низкий баланс)
- Экспорт CSV

### 🔜 Post-MVP:
- Импорт CSV
- Расширенная аналитика (bar chart, line chart)
- Экспорт JSON
- Смена базовой валюты с пересчётом истории
- Уведомления о бюджете + дневная сводка
- Архив достигнутых целей
- Knowledge base / контекстные подсказки
- Инфляционный калькулятор ("цена бездействия")

---

## 9. Структура проекта

```
/
├── app/
├── components/
│   ├── ui/                    # Button, Input, Modal, ColorPicker, IconPicker
│   ├── icon-array/
│   │   ├── IconArray.tsx      # Универсальный компонент сетки
│   │   ├── DailyDots.tsx      # Use case 1: дневные точки
│   │   ├── CategoryDots.tsx   # Use case 3: расходы/доходы
│   │   ├── BudgetDots.tsx     # Use case 4: факт vs план
│   │   └── SavingsDots.tsx    # Use case 2: накопления
│   ├── transactions/
│   ├── accounts/
│   └── savings/
├── lib/
│   ├── supabase.ts
│   ├── currencies.ts          # frankfurter.app + кэш
│   ├── amortization.ts        # Амортизация инфраструктурных расходов
│   ├── compound.ts            # Калькулятор сложного %
│   └── notifications.ts
├── stores/
│   ├── authStore.ts
│   ├── accountStore.ts
│   └── transactionStore.ts
├── hooks/
│   ├── useTransactions.ts
│   ├── useAccounts.ts
│   ├── useBudgets.ts
│   ├── useDailyLimit.ts       # Расчёт дневного лимита с амортизацией
│   └── useSavingsGoals.ts
├── types/
│   └── index.ts
└── constants/
    ├── categories.ts
    └── currencies.ts
```

---

## 10. Icon Array — логика реализации

### Компонент `<IconArray />`

```typescript
interface DotData {
  color: string    // hex
  state: 'filled' | 'empty' | 'today' | 'future' | 'warning' | 'overflow'
  meta?: any       // данные для тапа
}

interface IconArrayProps {
  dots:        DotData[]
  columns?:    number    // дефолт 10
  dotSize?:    number    // дефолт 8px
  gap?:        number    // дефолт 4px
  onDotPress?: (dot: DotData, index: number) => void
}
```

### Дневные точки

```typescript
function buildDailyDots(
  transactions: Transaction[],
  period: 'week' | 'month' | 'quarter' | 'year',
  dailyLimit: number
): DotData[] {
  const slots = getPeriodSlots(period)

  return slots.map(slot => {
    if (isToday(slot.date))   return { color: '#555', state: 'today',  meta: slot }
    if (isFuture(slot.date))  return { color: '#333', state: 'future', meta: slot }

    // учитываем только operational + discretionary
    const spent = getOperationalSpentForSlot(transactions, slot)
    const limit = dailyLimit * slot.days
    const ratio = spent / limit

    if (ratio < 0.8) return { color: '#2ECC71', state: 'filled',   meta: { spent, limit } }
    if (ratio <= 1)  return { color: '#F39C12', state: 'warning',  meta: { spent, limit } }
    return             { color: '#E74C3C', state: 'overflow', meta: { spent, limit } }
  })
}
```

### Амортизация инфраструктурных расходов

```typescript
function calcDailyLimit(
  monthlyBudget: number,
  infrastructureRecurring: RecurringPayment[],
  daysInMonth: number
): number {
  const monthlyInfraTotal = infrastructureRecurring
    .filter(r => r.is_active)
    .reduce((sum, r) => sum + convertToBase(r.amount, r.currency), 0)

  return (monthlyBudget - monthlyInfraTotal) / daysInMonth
}
```

---

*Версия спеки: 2.0 — MVP*  
*Дата: февраль 2026*
