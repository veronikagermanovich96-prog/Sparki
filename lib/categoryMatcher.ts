/**
 * Unified category matching engine for voice/text transaction input.
 * Supports 5 languages, contextual rules, fuzzy matching, and user learning.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format, subDays } from 'date-fns';
import type { Category } from '@/types';

// ── Keyword dictionaries (category key → keywords in all languages) ──────────

// Keys are slugs matching seedCategories.ts
const CATEGORY_KEYWORDS: Record<string, string[]> = {
    'food': [
        'еда', 'продукты', 'магазин', 'супермаркет', 'пятёрочка', 'пятерочка', 'перекрёсток', 'перекресток', 'ашан', 'лента', 'дикси', 'молоко', 'хлеб', 'мясо', 'овощи', 'фрукты', 'бакалея',
        'groceries', 'grocery', 'supermarket', 'food', 'market', 'walmart', 'costco', 'aldi', 'lidl',
        'lebensmittel', 'einkauf', 'supermarkt', 'edeka', 'rewe', 'netto',
        'courses', 'supermarché', 'épicerie', 'carrefour', 'leclerc', 'auchan',
        'supermercado', 'compras', 'mercado', 'mercadona', 'alimentos',
    ],
    'cafe': [
        'ресторан', 'кафе', 'кофе', 'обед', 'ужин', 'завтрак', 'бар', 'пицца', 'суши', 'бургер', 'фастфуд', 'макдональдс', 'столовая', 'ланч', 'кофейня', 'доставка еды',
        'restaurant', 'cafe', 'coffee', 'lunch', 'dinner', 'breakfast', 'pizza', 'sushi', 'burger', 'takeout', 'takeaway', 'starbucks', 'mcdonalds',
        'kaffee', 'mittagessen', 'abendessen', 'frühstück', 'imbiss',
        'déjeuner', 'dîner', 'petit-déjeuner', 'brasserie', 'bistro',
        'almuerzo', 'cena', 'desayuno', 'cafetería', 'restaurante',
    ],
    'transport': [
        'транспорт', 'такси', 'метро', 'автобус', 'бензин', 'заправка', 'парковка', 'убер', 'яндекс такси', 'каршеринг', 'электричка', 'поезд', 'трамвай', 'проездной',
        'transport', 'taxi', 'uber', 'lyft', 'gas', 'fuel', 'petrol', 'parking', 'bus', 'metro', 'subway', 'train', 'car',
        'tanken', 'benzin', 'bahn', 'fahrkarte', 'parken',
        'essence', 'métro', 'stationnement', 'péage',
        'gasolina', 'aparcamiento', 'autobús', 'tren',
    ],
    'rent': [
        'жкх', 'жку', 'аренда', 'квартира', 'коммуналка', 'ипотека',
        'rent', 'mortgage', 'apartment',
        'miete', 'wohnung',
        'loyer',
        'alquiler', 'hipoteca',
    ],
    'utilities': [
        'электричество', 'газ', 'вода', 'коммуналка',
        'utilities', 'electricity', 'water', 'heating',
        'strom', 'heizung', 'wasser', 'nebenkosten',
        'électricité', 'chauffage', 'eau', 'charges',
        'electricidad', 'agua', 'calefacción',
    ],
    'internet': [
        'интернет', 'wifi', 'провайдер',
        'internet', 'wifi', 'broadband',
    ],
    'phone': [
        'связь', 'телефон', 'мобильный', 'симка', 'мтс', 'билайн', 'мегафон', 'теле2',
        'phone', 'mobile', 'cellular', 'telecom', 'sim',
        'telefon', 'handy', 'mobilfunk',
        'téléphone', 'forfait',
        'teléfono', 'móvil', 'celular',
    ],
    'insurance': [
        'страховка', 'осаго', 'каско',
        'insurance',
        'versicherung',
        'assurance',
        'seguro',
    ],
    'credit': [
        'кредит', 'ипотека', 'рассрочка', 'платёж по кредиту',
        'credit', 'loan', 'mortgage payment',
        'kredit', 'darlehen',
        'crédit', 'prêt',
        'crédito', 'préstamo',
    ],
    'health': [
        'здоровье', 'аптека', 'лекарства', 'врач', 'доктор', 'стоматолог', 'клиника', 'больница', 'медицина', 'сауна', 'баня', 'спа', 'массаж', 'анализы', 'витамины',
        'health', 'pharmacy', 'medicine', 'doctor', 'dentist', 'hospital', 'clinic', 'spa', 'massage',
        'apotheke', 'arzt', 'zahnarzt', 'krankenhaus', 'medizin',
        'pharmacie', 'médecin', 'dentiste', 'hôpital', 'santé',
        'farmacia', 'médico', 'dentista', 'salud',
    ],
    'education': [
        'образование', 'курсы', 'книги', 'учёба', 'учеба', 'репетитор', 'университет', 'тренинг', 'вебинар',
        'education', 'courses', 'books', 'school', 'university', 'tutor', 'training', 'webinar', 'udemy',
        'bildung', 'kurs', 'bücher', 'schule', 'universität',
        'éducation', 'cours', 'livres', 'école', 'université',
        'educación', 'cursos', 'libros', 'escuela', 'universidad',
    ],
    'entertainment': [
        'развлечения', 'кино', 'театр', 'концерт', 'игры', 'подписка', 'нетфликс', 'ютуб', 'spotify', 'музей', 'клуб', 'парк',
        'entertainment', 'cinema', 'movie', 'theater', 'concert', 'games', 'subscription', 'netflix', 'youtube', 'museum', 'club',
        'unterhaltung', 'kino', 'konzert', 'spiele',
        'divertissement', 'cinéma', 'théâtre', 'spectacle',
        'entretenimiento', 'cine', 'teatro', 'concierto', 'juegos',
    ],
    'clothing': [
        'одежда', 'обувь', 'шмотки', 'зара', 'носки', 'футболка', 'джинсы', 'куртка', 'платье', 'костюм', 'ботинки',
        'clothing', 'clothes', 'shoes', 'zara', 'shirt', 'jeans', 'jacket', 'dress', 'boots',
        'kleidung', 'schuhe', 'hose', 'jacke', 'kleid',
        'vêtements', 'chaussures', 'robe', 'veste', 'pantalon',
        'ropa', 'zapatos', 'vestido', 'chaqueta', 'pantalones',
    ],
    'travel': [
        'путешествие', 'отпуск', 'отель', 'гостиница', 'хостел', 'виза', 'экскурсия', 'тур', 'билеты', 'авиа', 'самолёт', 'самолет', 'перелёт', 'перелет', 'рейс',
        'travel', 'vacation', 'hotel', 'hostel', 'visa', 'trip', 'flight', 'booking', 'airbnb', 'tickets', 'airplane', 'airline',
        'reise', 'urlaub', 'flug', 'buchung', 'flugticket',
        'voyage', 'vacances', 'hôtel', 'vol', 'réservation', 'billet', 'avion',
        'viaje', 'vacaciones', 'vuelo', 'reserva', 'boleto',
    ],
    'gifts': [
        'подарок', 'подарки', 'цветы', 'букет', 'сюрприз',
        'gift', 'gifts', 'flowers', 'bouquet', 'present',
        'geschenk', 'blumen', 'strauß',
        'cadeau', 'fleurs',
        'regalo', 'flores', 'ramo',
    ],
    'hobby': [
        'хобби', 'рукоделие', 'рисование', 'фотография', 'музыка',
        'hobby', 'crafts', 'painting', 'photography', 'music',
    ],
    'beauty': [
        'красота', 'парикмахер', 'стрижка', 'маникюр', 'косметика', 'салон', 'педикюр', 'окрашивание',
        'beauty', 'haircut', 'hairdresser', 'manicure', 'cosmetics', 'salon', 'barber',
        'friseur', 'maniküre', 'kosmetik',
        'coiffeur', 'manucure', 'beauté', 'cosmétiques',
        'peluquería', 'manicura', 'belleza', 'cosmética',
    ],
    'sport': [
        'спорт', 'фитнес', 'спортзал', 'тренировка', 'зал', 'бассейн', 'йога', 'бег', 'абонемент',
        'sport', 'fitness', 'gym', 'workout', 'pool', 'yoga', 'running',
        'fitnessstudio', 'schwimmbad',
        'gymnastique', 'piscine', 'musculation',
        'gimnasio', 'piscina', 'deporte', 'entrenamiento',
    ],
    'pets': [
        'питомец', 'кот', 'кошка', 'собака', 'ветеринар', 'корм', 'вет', 'животные',
        'pet', 'cat', 'dog', 'vet', 'veterinary', 'pet food',
        'haustier', 'katze', 'hund', 'tierarzt', 'futter',
        'animal', 'chat', 'chien', 'vétérinaire',
        'mascota', 'gato', 'perro', 'veterinario',
    ],
    'children': [
        'дети', 'ребёнок', 'ребенок', 'садик', 'детский', 'памперсы', 'игрушки', 'няня',
        'children', 'kids', 'baby', 'diapers', 'toys', 'nanny', 'childcare', 'daycare',
        'kinder', 'windeln', 'spielzeug',
        'enfants', 'bébé', 'couches', 'jouets', 'crèche', 'nounou',
        'niños', 'bebé', 'pañales', 'juguetes', 'guardería',
    ],
    'equipment': [
        'оборудование', 'техника', 'ноутбук', 'компьютер', 'монитор',
        'equipment', 'laptop', 'computer', 'monitor', 'hardware',
    ],
    'software': [
        'программное обеспечение', 'софт', 'лицензия', 'подписка на сервис',
        'software', 'license', 'saas',
    ],
    'unexpected': [
        'непредвиденные', 'штраф', 'комиссия', 'пеня',
        'unexpected', 'fine', 'penalty', 'fee',
        'strafe', 'gebühr',
        'amende',
        'multa',
    ],
    'charity': [
        'благотворительность', 'пожертвование', 'донат',
        'charity', 'donation', 'donate',
    ],
    'salary': [
        'зарплата', 'аванс', 'оклад', 'получка',
        'salary', 'paycheck', 'wages', 'pay',
        'gehalt', 'lohn',
        'salaire', 'paie',
        'salario', 'sueldo', 'nómina',
    ],
    'freelance': [
        'фриланс', 'подработка', 'халтура', 'проект', 'заказ',
        'freelance', 'gig', 'side job', 'project', 'contract',
        'freiberuflich', 'nebenjob', 'projekt',
        'mission', 'projet',
        'proyecto', 'trabajo extra',
    ],
    'investments': [
        'инвестиции', 'дивиденды', 'акции', 'проценты',
        'investments', 'dividends', 'stocks', 'interest',
    ],
};

// ── Contextual keywords (trigger + context → category) ──────────────────────

interface ContextRule {
    triggers: string[];
    context: string[];
    category: string;
    confidence: number;
}

const CONTEXTUAL_KEYWORDS: ContextRule[] = [
    // Insurance
    { triggers: ['страховка', 'insurance', 'versicherung', 'assurance', 'seguro'],
      context: ['авто', 'машина', 'car', 'auto', 'kfz', 'voiture', 'coche'],
      category: 'transport', confidence: 0.95 },
    { triggers: ['страховка', 'insurance', 'versicherung', 'assurance', 'seguro'],
      context: ['медицинская', 'здоровье', 'medical', 'health', 'kranken', 'santé', 'salud'],
      category: 'health', confidence: 0.95 },
    { triggers: ['страховка', 'insurance', 'versicherung', 'assurance', 'seguro'],
      context: ['путешествие', 'поездка', 'travel', 'trip', 'reise', 'voyage', 'viaje'],
      category: 'travel', confidence: 0.95 },
    { triggers: ['страховка', 'insurance', 'versicherung', 'assurance', 'seguro'],
      context: ['квартира', 'дом', 'жильё', 'home', 'house', 'wohnung', 'maison', 'hogar'],
      category: 'rent', confidence: 0.95 },
    // Subscriptions
    { triggers: ['подписка', 'subscription', 'abonnement', 'suscripción'],
      context: ['spotify', 'музыка', 'music', 'musik', 'musique', 'música', 'netflix', 'кино', 'youtube', 'ютуб'],
      category: 'entertainment', confidence: 0.9 },
    { triggers: ['подписка', 'subscription', 'abonnement', 'suscripción'],
      context: ['спорт', 'фитнес', 'sport', 'fitness', 'gym', 'gimnasio'],
      category: 'sport', confidence: 0.9 },
    { triggers: ['подписка', 'subscription', 'abonnement', 'suscripción'],
      context: ['курс', 'учёба', 'course', 'learning', 'udemy', 'coursera'],
      category: 'education', confidence: 0.9 },
    // Delivery
    { triggers: ['доставка', 'delivery', 'lieferung', 'livraison', 'entrega'],
      context: ['еда', 'продукты', 'food', 'essen', 'nourriture', 'comida', 'яндекс еда', 'delivery club'],
      category: 'cafe', confidence: 0.9 },
    { triggers: ['доставка', 'delivery', 'lieferung', 'livraison', 'entrega'],
      context: ['одежда', 'clothing', 'kleidung', 'vêtements', 'ropa', 'посылка', 'parcel'],
      category: 'clothing', confidence: 0.9 },
    // Repair
    { triggers: ['ремонт', 'repair', 'reparatur', 'réparation', 'reparación'],
      context: ['квартира', 'дом', 'home', 'wohnung', 'maison', 'hogar', 'стройматериалы'],
      category: 'home_maintenance', confidence: 0.9 },
    { triggers: ['ремонт', 'repair', 'reparatur', 'réparation', 'reparación'],
      context: ['авто', 'машина', 'car', 'auto', 'voiture', 'coche', 'шиномонтаж', 'то'],
      category: 'transport', confidence: 0.9 },
    { triggers: ['ремонт', 'repair', 'reparatur', 'réparation', 'reparación'],
      context: ['телефон', 'phone', 'ноутбук', 'laptop', 'компьютер', 'computer'],
      category: 'equipment', confidence: 0.85 },
];

// ── Levenshtein distance ────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
        let prev = i;
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            const val = Math.min(dp[j] + 1, prev + 1, dp[j - 1] + cost);
            dp[j - 1] = prev;
            prev = val;
        }
        dp[n] = prev;
    }
    return dp[n];
}

// ── User learning (persisted) ───────────────────────────────────────────────

const LEARNED_KEY = '@voice_category_learned';
let learnedCache: Record<string, string> | null = null;

async function loadLearned(): Promise<Record<string, string>> {
    if (learnedCache) return learnedCache;
    try {
        const raw = await AsyncStorage.getItem(LEARNED_KEY);
        learnedCache = raw ? JSON.parse(raw) : {};
    } catch {
        learnedCache = {};
    }
    return learnedCache!;
}

export async function learnFromCorrection(text: string, categoryId: string): Promise<void> {
    const learned = await loadLearned();
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length >= 3 && !/^\d+$/.test(w));
    for (const word of words) {
        learned[word] = categoryId;
    }
    learnedCache = learned;
    await AsyncStorage.setItem(LEARNED_KEY, JSON.stringify(learned));
}

function getLearnedCategory(text: string, cats: Category[]): Category | null {
    if (!learnedCache) return null;
    const words = text.toLowerCase().split(/\s+/);
    for (const word of words) {
        const catId = learnedCache[word];
        if (catId) {
            const match = cats.find(c => c.id === catId);
            if (match) return match;
        }
    }
    return null;
}

// ── Helper: find category by keyword key ────────────────────────────────────

function findCategoryByKey(key: string, cats: Category[]): Category | null {
    // 1. Match by slug (primary, language-independent)
    const bySlug = cats.find(c => c.slug === key);
    if (bySlug) return bySlug;
    // 2. Exact name match
    const byName = cats.find(c => c.name.toLowerCase() === key);
    if (byName) return byName;
    // 3. Partial name match (fallback for legacy categories without slugs)
    return cats.find(c =>
        c.name.toLowerCase().includes(key) || key.includes(c.name.toLowerCase())
    ) ?? null;
}

// ── Unified category matcher ────────────────────────────────────────────────

export interface MatchResult {
    category: Category | null;
    confidence: number;
}

export function matchCategory(text: string, cats: Category[]): MatchResult {
    const lower = text.toLowerCase();
    console.log('=== matchCategory input:', text);
    console.log('=== categories available:', cats.map(c => c.name));
    const words = lower.split(/\s+/);
    const visible = cats.filter(c => !c.is_hidden);

    // Step 1: Learned corrections (highest priority)
    const learned = getLearnedCategory(lower, visible);
    if (learned) return { category: learned, confidence: 1.0 };

    // Step 2: Exact category name in text
    for (const c of visible) {
        if (lower.includes(c.name.toLowerCase())) {
            return { category: c, confidence: 0.98 };
        }
    }

    // Step 3: Contextual matching (trigger + context → category)
    for (const rule of CONTEXTUAL_KEYWORDS) {
        const hasTrigger = rule.triggers.some(t => lower.includes(t));
        const hasContext = rule.context.some(ctx => lower.includes(ctx));
        if (hasTrigger && hasContext) {
            const cat = findCategoryByKey(rule.category, visible);
            if (cat) return { category: cat, confidence: rule.confidence };
        }
    }

    // Debug: log contextual rule checks
    console.log('=== contextual check for:', lower);
    for (const rule of CONTEXTUAL_KEYWORDS) {
        const hasTrigger2 = rule.triggers.some(t => lower.includes(t));
        const hasContext2 = rule.context.some(ctx => lower.includes(ctx));
        if (hasTrigger2 || hasContext2) {
            console.log(`rule ${rule.category}: trigger=${hasTrigger2} context=${hasContext2}`);
        }
    }

    // Step 4: Keyword scoring with fuzzy matching
    let bestCategory: Category | null = null;
    let bestScore = 0;

    for (const [catKey, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        let score = 0;
        for (const word of words) {
            if (word.length < 2) continue;
            for (const kw of keywords) {
                if (word === kw) { score += 1.0; break; }
                if (word.length >= 3 && (word.includes(kw) || kw.includes(word))) { score += 0.8; break; }
                if (word.length >= 4 && kw.length >= 4 && levenshtein(word, kw) <= 2) { score += 0.6; break; }
            }
        }
        const normalized = score / Math.max(words.length, 1);
        if (normalized > bestScore) {
            bestScore = normalized;
            bestCategory = findCategoryByKey(catKey, visible);
        }
    }

    if (bestScore > 0.1 && bestCategory) {
        return { category: bestCategory, confidence: Math.min(bestScore, 0.95) };
    }

    // Step 5: First word / stem match on category names
    for (const c of visible) {
        const first = c.name.toLowerCase().split(' ')[0];
        if (first.length >= 3 && lower.includes(first)) {
            return { category: c, confidence: 0.5 };
        }
    }
    for (const c of visible) {
        const stem = c.name.toLowerCase().slice(0, Math.min(c.name.length, 4));
        if (stem.length >= 3 && words.some(w => w.startsWith(stem))) {
            return { category: c, confidence: 0.4 };
        }
    }

    // Step 6: "категория X" pattern
    const catPattern = lower.match(/(?:категори[яию]|category|kategorie|catégorie|categoría)\s+(\S+)/i);
    if (catPattern) {
        const hint = catPattern[1];
        for (const c of visible) {
            if (c.name.toLowerCase().startsWith(hint)) {
                return { category: c, confidence: 0.85 };
            }
        }
    }

    // No match
    return { category: null, confidence: 0 };
}

// ── Currency detection ──────────────────────────────────────────────────────

export function detectCurrency(text: string, defaultCurrency: string): string {
    if (/бел\.*\s*руб|byn/i.test(text)) return 'BYN';
    if (/руб|₽|rub/i.test(text)) return 'RUB';
    if (/евро|€|eur/i.test(text)) return 'EUR';
    if (/доллар|\$|usd/i.test(text)) return 'USD';
    if (/фунт|£|gbp/i.test(text)) return 'GBP';
    if (/франк|chf/i.test(text)) return 'CHF';
    if (/лари|gel/i.test(text)) return 'GEL';
    if (/тенге|kzt/i.test(text)) return 'KZT';
    if (/лира|try/i.test(text)) return 'TRY';
    if (/дирхам|дерхам|aed/i.test(text)) return 'AED';
    if (/гривн|uah|₴/i.test(text)) return 'UAH';
    if (/злот|pln|zł/i.test(text)) return 'PLN';
    if (/крон|czk|kč/i.test(text)) return 'CZK';
    if (/шекел|ils|₪/i.test(text)) return 'ILS';
    if (/драм|amd|֏/i.test(text)) return 'AMD';
    if (/сум|сом|uzs/i.test(text)) return 'UZS';
    if (/манат|azn|₼/i.test(text)) return 'AZN';
    return defaultCurrency;
}

// ── Date detection ──────────────────────────────────────────────────────────

export function parseDate(text: string): string {
    const s = text.toLowerCase();
    const today = new Date();

    if (/вчера|yesterday|gestern|hier|ayer/.test(s)) return format(subDays(today, 1), 'yyyy-MM-dd');
    if (/позавчера|day before yesterday|vorgestern|avant-hier|anteayer/.test(s)) return format(subDays(today, 2), 'yyyy-MM-dd');

    const ruDays = ['воскресенье', 'понедельник', 'вторник', 'сред', 'четверг', 'пятниц', 'суббот'];
    for (let i = 0; i < 7; i++) {
        if (s.includes(ruDays[i])) {
            let diff = today.getDay() - i;
            if (diff <= 0) diff += 7;
            return format(subDays(today, diff), 'yyyy-MM-dd');
        }
    }

    const enDays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < 7; i++) {
        if (s.includes(enDays[i])) {
            let diff = today.getDay() - i;
            if (diff <= 0) diff += 7;
            return format(subDays(today, diff), 'yyyy-MM-dd');
        }
    }

    return format(today, 'yyyy-MM-dd');
}

// ── Transaction type detection ──────────────────────────────────────────────

export function detectType(text: string): 'expense' | 'income' | 'transfer' {
    const s = text.toLowerCase();
    if (/получил|зарплата|доход|пришло|заработал|income|salary|received|earned|gehalt|salaire|salario/.test(s)) return 'income';
    if (/перевёл|перевел|отправил|transfer|sent|überweisung|virement|transferencia/.test(s)) return 'transfer';
    return 'expense';
}

// ── Amount extraction ───────────────────────────────────────────────────────

const WORD_NUMS: Record<string, number> = {
    'один': 1, 'одна': 1, 'два': 2, 'две': 2, 'три': 3, 'четыре': 4, 'пять': 5,
    'шесть': 6, 'семь': 7, 'восемь': 8, 'девять': 9, 'десять': 10,
    'двадцать': 20, 'тридцать': 30, 'сорок': 40, 'пятьдесят': 50,
    'сто': 100, 'двести': 200, 'триста': 300, 'пятьсот': 500,
    'тысяча': 1000, 'тысячу': 1000, 'тысячи': 1000,
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'ten': 10, 'twenty': 20, 'fifty': 50, 'hundred': 100, 'thousand': 1000,
};

export function extractAmount(text: string): number {
    const s = text.toLowerCase();
    const match = s.match(/(\d+[\s\d]*[.,]?\d*)/);
    if (match) {
        const val = parseFloat(match[1].replace(/\s/g, '').replace(',', '.'));
        if (val > 0) return val;
    }
    for (const [word, val] of Object.entries(WORD_NUMS)) {
        if (s.includes(word)) return val;
    }
    return 0;
}

// ── Full text parser ────────────────────────────────────────────────────────

export interface ParsedTransaction {
    type: 'expense' | 'income' | 'transfer';
    amount: number;
    currency: string;
    category: Category | null;
    confidence: number;
    accountId: string;
    date: string;
    note: string;
    checked: boolean;
}

function parseBasics(text: string, baseCurrency: string) {
    return {
        amount: extractAmount(text),
        currency: detectCurrency(text, baseCurrency),
        date: parseDate(text),
        type: detectType(text),
    };
}

export function parseVoiceText(
    text: string,
    cats: Category[],
    defaultCurrency: string,
    defaultAccountId: string,
): ParsedTransaction[] {
    const results: ParsedTransaction[] = [];
    const sentences = text.split(/,|и ещё|ещё|также|плюс|and also|plus|und auch|et aussi|y también/i);

    for (const sentence of sentences) {
        const s = sentence.trim();
        if (!s) continue;

        const basics = parseBasics(s, defaultCurrency);
        const { category, confidence } = matchCategory(s, cats.filter(c =>
            !c.is_hidden && (basics.type === 'transfer' || c.type === basics.type || c.type === 'expense')
        ));

        results.push({
            ...basics, category, confidence,
            accountId: defaultAccountId,
            note: s, checked: true,
        });
    }

    return results;
}

// ── Init: load learned data on module import ────────────────────────────────
loadLearned();
