# Скидочные карты — архитектура и спецификация

> Файл: `app/(app)/cards/`  
> Стек: Expo Router · React Native · Supabase · expo-camera · react-native-barcode-svg

---

## 1. Место в навигации

Новая вкладка в таб-баре между Счетами и Аналитикой.

```
[ Главная ]  [ Счета ]  [ Карты ]  [ Аналитика ]  [ Настройки ]
                           Tag ←── иконка Lucide
```

### Обновлённый `_layout.tsx`

```typescript
// app/(app)/_layout.tsx
<Tabs.Screen
  name="cards"
  options={{
    title: 'Карты',
    tabBarIcon: ({ color }) => <Tag color={color} size={24} />,
  }}
/>
```

---

## 2. Схема данных (Supabase)

```sql
CREATE TABLE loyalty_cards (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid REFERENCES households(id) NOT NULL,
  name         text NOT NULL,          -- "Lidl", "H&M"
  color        text NOT NULL,          -- hex фона карточки, напр. "#E63946"
  barcode      text,                   -- номер / строка кода
  barcode_type text,                   -- 'ean13' | 'qr' | 'code128' | 'manual'
  discount     numeric(5,2),           -- % скидки, опционально
  sort_order   int DEFAULT 0,          -- порядок в сетке (drag-to-reorder, post-MVP)
  created_at   timestamptz DEFAULT now()
);

-- RLS: пользователь видит только карты своего household
ALTER TABLE loyalty_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household members only" ON loyalty_cards
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );
```

### TypeScript-тип

```typescript
type BarcodeType = 'ean13' | 'qr' | 'code128' | 'manual'

interface LoyaltyCard {
  id:           string
  household_id: string
  name:         string
  color:        string        // hex
  barcode:      string | null
  barcode_type: BarcodeType | null
  discount:     number | null // процент
  sort_order:   number
  created_at:   string
}
```

---

## 3. Структура файлов

```
app/(app)/cards/
├── index.tsx          # сетка карт
├── add.tsx            # добавление новой карты
├── [id].tsx           # штрихкод на весь экран
└── edit/
    └── [id].tsx       # редактирование карты

components/cards/
├── CardGrid.tsx       # сетка 2 колонки
├── CardThumbnail.tsx  # карточка в сетке
├── BarcodeDisplay.tsx # штрихкод / QR на весь экран
├── BarcodeScanner.tsx # сканер через камеру
└── CardForm.tsx       # форма добавления / редактирования

hooks/
└── useLoyaltyCards.ts # React Query хуки
```

---

## 4. Экран списка карт (`index.tsx`)

### Макет

```
Карты                                           [+]

┌──────────────────┐   ┌──────────────────┐
│                  │   │                  │
│  Lidl            │   │  H&M             │
│  −10%            │   │  −15%            │
└──────────────────┘   └──────────────────┘

┌──────────────────┐   ┌──────────────────┐
│                  │   │                  │
│  Rimi            │   │  Decathlon       │
│                  │   │  −5%             │
└──────────────────┘   └──────────────────┘
```

### Карточка `CardThumbnail`

- Фон: `card.color` (hex)
- Название: белый текст, крупно
- Скидка: белый текст, серый если не указана — скрыта
- **Тап** → `cards/[id].tsx` (штрихкод на весь экран)
- **Long press** → action sheet: "Редактировать" / "Удалить"

### Удаление

```
"Удалить карту «Lidl»?"
Действие нельзя отменить.

[ Отмена ]   [ Удалить ]
```

### Пустое состояние

```
🏷️
Карт пока нет
Добавьте первую скидочную карту

[ + Добавить карту ]
```

---

## 5. Экран штрихкода (`[id].tsx`)

Открывается по тапу на карточку. Показывает штрихкод / QR на весь экран.

### Макет

```
×  (закрыть)

        Lidl
        −10%


┌──────────────────────────────┐
│  ▌▌▌▌▌ ▌▌▌ ▌▌▌▌▌ ▌▌▌▌▌▌▌▌  │
│  ▌▌▌▌▌ ▌▌▌ ▌▌▌▌▌ ▌▌▌▌▌▌▌▌  │
│  ▌▌▌▌▌ ▌▌▌ ▌▌▌▌▌ ▌▌▌▌▌▌▌▌  │
└──────────────────────────────┘

       1234 5678 9012 3

     [ Скопировать номер ]
```

### Поведение

```typescript
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'
import * as Brightness from 'expo-brightness'

useEffect(() => {
  let previousBrightness: number

  const setup = async () => {
    // максимальная яркость при открытии
    previousBrightness = await Brightness.getBrightnessAsync()
    await Brightness.setBrightnessAsync(1.0)
    await activateKeepAwakeAsync()
  }

  setup()

  return () => {
    // восстановить яркость при закрытии
    Brightness.setBrightnessAsync(previousBrightness)
    deactivateKeepAwake()
  }
}, [])
```

- Экран не гаснет пока открыт (`keepAwake`)
- Яркость → максимум при открытии, возвращается при закрытии
- Закрытие: крестик (верхний левый угол) или свайп вниз
- Фон экрана белый для лучшего сканирования сканером магазина

### Компонент `BarcodeDisplay`

```typescript
import Barcode from 'react-native-barcode-svg'
import QRCode from 'react-native-qrcode-svg'

function BarcodeDisplay({ barcode, type }: { barcode: string; type: BarcodeType }) {
  if (type === 'qr') {
    return <QRCode value={barcode} size={220} />
  }
  const format = type === 'ean13' ? 'EAN13' : 'CODE128'
  return <Barcode value={barcode} format={format} width={280} height={100} />
}
```

---

## 6. Форма добавления / редактирования (`add.tsx`, `edit/[id].tsx`)

### Поля формы

```
Название магазина *
[ Lidl                          ]

Скидка                           (опционально)
[ 10 ] %

Цвет карточки
[ 🔴 ] [ 🔵 ] [ 🟢 ] [ 🟡 ] [ 🟣 ] [ ⚫ ]
  + произвольный hex через color picker

Штрихкод                         (опционально)
┌─────────────────────────────────────────┐
│  [ 📷 Сканировать ]  [ Ввести вручную ] │
└─────────────────────────────────────────┘

  Если "Ввести вручную":
  Номер карты
  [ 1234567890123                ]
  Тип кода: [ EAN-13 ↓ ]  ← EAN-13 | QR | Code128
```

### Предустановленная палитра цветов

```typescript
const CARD_COLORS = [
  '#E63946', // красный
  '#2196F3', // синий
  '#2ECC71', // зелёный
  '#F39C12', // оранжевый
  '#9B59B6', // фиолетовый
  '#1ABC9C', // бирюзовый
  '#E91E63', // розовый
  '#607D8B', // серо-синий
]
```

---

## 7. Сканер штрихкода (`BarcodeScanner.tsx`)

```typescript
import { CameraView, useCameraPermissions } from 'expo-camera'

function BarcodeScanner({ onScanned }: { onScanned: (data: string, type: BarcodeType) => void }) {
  const [permission, requestPermission] = useCameraPermissions()

  if (!permission?.granted) {
    return (
      <View>
        <Text>Нужен доступ к камере</Text>
        <Button onPress={requestPermission} title="Разрешить" />
      </View>
    )
  }

  return (
    <CameraView
      style={StyleSheet.absoluteFill}
      onBarcodeScanned={({ data, type }) => {
        const mappedType = mapExpoTypeToInternal(type) // → BarcodeType
        onScanned(data, mappedType)
      }}
      barcodeScannerSettings={{
        barcodeTypes: ['ean13', 'qr', 'code128'],
      }}
    />
  )
}
```

После успешного сканирования: поле номера заполняется автоматически, тип определяется, сканер закрывается.

---

## 8. React Query хуки

```typescript
// hooks/useLoyaltyCards.ts

export function useLoyaltyCards() {
  return useQuery({
    queryKey: ['loyalty_cards'],
    queryFn:  () =>
      supabase
        .from('loyalty_cards')
        .select('*')
        .order('sort_order', { ascending: true }),
  })
}

export function useCreateCard() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (card: Omit<LoyaltyCard, 'id' | 'created_at'>) =>
      supabase.from('loyalty_cards').insert(card),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['loyalty_cards'] }),
  })
}

export function useDeleteCard() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      supabase.from('loyalty_cards').delete().eq('id', id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['loyalty_cards'] }),
  })
}
```

---

## 9. Зависимости (добавить в проект)

```bash
npx expo install expo-camera expo-brightness expo-keep-awake
npm install react-native-barcode-svg react-native-qrcode-svg
```

| Библиотека | Назначение |
|---|---|
| `expo-camera` | Сканирование штрихкода через камеру |
| `expo-brightness` | Максимальная яркость при показе кода |
| `expo-keep-awake` | Экран не гаснет при показе кода |
| `react-native-barcode-svg` | Рендер EAN-13 / Code128 |
| `react-native-qrcode-svg` | Рендер QR-кода |

---

## 10. MVP scope фичи

### ✅ Входит в MVP
- CRUD карт (название, цвет, штрихкод, скидка)
- Сканирование через камеру
- Ввод номера вручную
- Отображение штрихкода / QR на весь экран
- Яркость + keepAwake при показе кода
- Отдельная вкладка в таб-баре

### 🔜 Post-MVP
- Drag-to-reorder карт в сетке
- Поиск по названию
- Логотип бренда (автоподбор по названию)
- Напоминание использовать карту при добавлении транзакции в нужном магазине

---

*Версия: 1.0 · Март 2026 · Family Finance App*
