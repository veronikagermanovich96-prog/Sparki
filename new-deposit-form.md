# Форма создания нового депозита — спецификация

> Компонент: `components/savings/NewDepositSheet.tsx`  
> Открывается: bottom sheet снизу вверх  
> Триггер: кнопка "+ Добавить депозит" на вкладке Накопления

---

## Макет формы

```
━━━━━━━━━━━━━━━━━━━━━━━━━━
  Новый депозит

  ┌─────────────────────────────────────┐
  │  [ 🎨 ]  [ Название депозита...  ]  │
  └─────────────────────────────────────┘
  ↑ иконка + цвет    ↑ текстовое поле

  Сумма
  [ 25 000          ] [ 🇺🇸 USD ↓ ]

  Капитализация
  [ Ежемесячно ]  [ Ежегодно ]

  Дата начала
  [ 13.03.2026 ]

  Дата окончания (опц.)
  [ 12.03.2027 ]

  Периоды ставок
  ──────────────────────────────────────
  13.03.2026 — 12.03.2027   [ 4.5 ] %
  ──────────────────────────────────────
  [ + Добавить период ]

  [ Сохранить ]
```

---

## Поля формы

### Иконка и цвет

Тап на `[ 🎨 ]` → bottom sheet поверх с выбором:
- Иконка — сетка Lucide иконок с поиском
- Цвет — color picker (палитра + HEX поле)

Отображается как круглый контейнер с выбранным цветом и иконкой — аналогично другим счетам.

---

### Название

TextInput, обязательное поле. Placeholder: "Пенсионный счёт".

---

### Сумма + валюта

- Числовой ввод, обязательное поле
- Валюта выбирается из дропдауна — список валют household
- По умолчанию — базовая валюта household

---

### Капитализация

Сегментированный контрол: `[ Ежемесячно ]  [ Ежегодно ]`  
По умолчанию — Ежемесячно.

---

### Дата начала

Datepicker, обязательное поле. По умолчанию — сегодня.

---

### Дата окончания (опц.)

Datepicker, необязательное поле.  
Если не указана — депозит считается бессрочным.  
Должна быть позже даты начала — валидация инлайн.

---

### Периоды ставок

Список периодов с процентными ставками. Минимум один период обязателен.

**Один период (по умолчанию):**
```
  Дата начала — Дата окончания   [ 4.5 ] %
```
- Дата начала берётся из поля "Дата начала" автоматически
- Дата окончания берётся из поля "Дата окончания" автоматически
- Если дата окончания не указана → показывается "бессрочно"

**Несколько периодов:**

Тап `[ + Добавить период ]` → добавляется новая строка:

```
  13.03.2026 — 01.09.2026   [ 4.5 ] %
  01.09.2026 — 12.03.2027   [ 5.0 ] %
```

Правила:
- Дата начала нового периода = дата окончания предыдущего (подставляется автоматически)
- Пользователь указывает только дату окончания нового периода и ставку
- Последний период всегда заканчивается датой окончания депозита
- Свайп влево на строку периода → удалить (нельзя удалить единственный период)

**Визуально:**
```
  Периоды ставок
  ──────────────────────────────────────
  13.03.2026 — 01.09.2026   [ 4.5 ] %  ←
  01.09.2026 — 12.03.2027   [ 5.0 ] %  ← свайп влево = удалить
  ──────────────────────────────────────
  [ + Добавить период ]
```

---

## Валидация

| Поле | Правило | Сообщение |
|---|---|---|
| Название | Обязательное | "Введите название" |
| Сумма | > 0 | "Введите сумму" |
| Дата окончания | > Дата начала | "Дата окончания должна быть позже начала" |
| Ставка | > 0 | "Введите ставку" |
| Периоды | Не пересекаются | "Периоды не должны пересекаться" |

Ошибки показываются инлайн под полем.

---

## После сохранения

```
Сохранить нажато
     ↓
Haptic feedback
     ↓
Bottom sheet закрывается
     ↓
Новый депозит появляется в блоке "Депозиты" на вкладке Накопления
     ↓
Прогноз пересчитывается автоматически
```

---

## Схема данных

```sql
-- Депозит
CREATE TABLE deposit_accounts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id     uuid REFERENCES households(id),
  name             text NOT NULL,
  icon             text,                    -- Lucide icon name
  color            text,                    -- HEX color
  amount           numeric(15,2) NOT NULL,
  currency         text NOT NULL,
  capitalization   text NOT NULL CHECK (capitalization IN ('monthly', 'yearly')),
  start_date       date NOT NULL,
  end_date         date,                    -- NULL = бессрочный
  is_active        boolean DEFAULT true,
  created_at       timestamptz DEFAULT now()
);

-- История ставок
CREATE TABLE deposit_rate_periods (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_id       uuid REFERENCES deposit_accounts(id) ON DELETE CASCADE,
  rate             numeric(5,2) NOT NULL,   -- % годовых
  from_date        date NOT NULL,
  to_date          date,                    -- NULL = до конца депозита
  created_at       timestamptz DEFAULT now()
);
```

---

## Расчёт прогноза с переменной ставкой

```typescript
function calcDepositForecast(
  deposit: DepositAccount,
  ratePeriods: DepositRatePeriod[],
  targetDate: Date
): { projectedValue: number; interestEarned: number } {
  let balance = deposit.amount
  const periods = ratePeriods
    .sort((a, b) => a.from_date.getTime() - b.from_date.getTime())

  for (const period of periods) {
    const start = period.from_date
    const end = period.to_date ?? targetDate

    if (start >= targetDate) break

    const periodEnd = end > targetDate ? targetDate : end
    const months = differenceInMonths(periodEnd, start)

    if (deposit.capitalization === 'monthly') {
      const monthlyRate = period.rate / 100 / 12
      balance = balance * Math.pow(1 + monthlyRate, months)
    } else {
      const years = months / 12
      balance = balance * Math.pow(1 + period.rate / 100, years)
    }
  }

  return {
    projectedValue: balance,
    interestEarned: balance - deposit.amount
  }
}
```

---

*Версия: 1.0 · Март 2026 · Family Finance App*
