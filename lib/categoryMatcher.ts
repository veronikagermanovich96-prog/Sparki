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
        'осаго', 'каско', 'техосмотр', 'шиномонтаж', 'автомобиль', 'тачка', 'автосервис',
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
    { triggers: ['страховка', 'страхование', 'застраховал', 'застраховала', 'полис', 'insurance', 'versicherung', 'assurance', 'seguro'],
      context: ['авто', 'машина', 'машины', 'автомобиль', 'автомобиля', 'тачка', 'тачки', 'car', 'auto', 'kfz', 'voiture', 'coche'],
      category: 'transport', confidence: 0.95 },
    { triggers: ['страховка', 'страхование', 'застраховал', 'застраховала', 'полис', 'insurance', 'versicherung', 'assurance', 'seguro'],
      context: ['медицинская', 'здоровье', 'medical', 'health', 'kranken', 'santé', 'salud'],
      category: 'health', confidence: 0.95 },
    { triggers: ['страховка', 'страхование', 'застраховал', 'застраховала', 'полис', 'insurance', 'versicherung', 'assurance', 'seguro'],
      context: ['путешествие', 'поездка', 'поездки', 'travel', 'trip', 'reise', 'voyage', 'viaje'],
      category: 'travel', confidence: 0.95 },
    { triggers: ['страховка', 'страхование', 'застраховал', 'застраховала', 'полис', 'insurance', 'versicherung', 'assurance', 'seguro'],
      context: ['квартира', 'квартиры', 'дом', 'дома', 'жильё', 'жилья', 'home', 'house', 'wohnung', 'maison', 'hogar'],
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

// ── Multilingual stemming ────────────────────────────────────────────────────

function stemRu(word: string): string {
    return word
        .replace(/ование$|ание$|ение$/, '')
        .replace(/ого$|ему$|ому$/, '')
        .replace(/ой$|ий$|ый$|ая$|яя$/, '')
        .replace(/ами$|ями$|ах$|ях$/, '')
        .replace(/ов$|ев$|ей$/, '')
        .replace(/ку$|ки$|ке$|ка$/, '')
        .replace(/ть$|ться$|тся$/, '')
        .replace(/ла$|ло$|ли$|лся$/, '')
        .replace(/ны$|на$|но$/, '')
        .replace(/у$|ю$|е$|и$|ы$|а$/, '');
}

function stemEn(word: string): string {
    return word
        .replace(/ing$/, '')
        .replace(/tion$|sion$/, '')
        .replace(/ness$|ment$|ful$|less$/, '')
        .replace(/er$|or$|ist$/, '')
        .replace(/ies$/, 'y')
        .replace(/es$|s$/, '')
        .replace(/ed$/, '');
}

function stemDe(word: string): string {
    return word
        .replace(/ung$|heit$|keit$|schaft$/, '')
        .replace(/ieren$/, '')
        .replace(/en$|er$|em$|es$|e$/, '')
        .replace(/lich$|ig$/, '');
}

function stemFr(word: string): string {
    return word
        .replace(/ation$|tion$|sion$/, '')
        .replace(/ment$|eur$|euse$/, '')
        .replace(/er$|ir$|re$/, '')
        .replace(/aux$/, 'al')
        .replace(/ux$|es$|s$/, '')
        .replace(/é$|è$|ê$/, 'e');
}

function stemEs(word: string): string {
    return word
        .replace(/ación$|ción$|sión$/, '')
        .replace(/mente$|miento$|idad$/, '')
        .replace(/ando$|iendo$/, '')
        .replace(/ado$|ido$/, '')
        .replace(/ar$|er$|ir$/, '')
        .replace(/es$|s$/, '')
        .replace(/ó/, 'o').replace(/é/, 'e').replace(/á/, 'a').replace(/í/, 'i').replace(/ú/, 'u');
}

function detectLanguage(text: string): 'ru' | 'en' | 'de' | 'fr' | 'es' {
    if (/[а-яё]/i.test(text)) return 'ru';
    if (/\b(der|die|das|und|ist|ich|mit)\b/i.test(text)) return 'de';
    if (/\b(le|la|les|des|une|est|avec)\b/i.test(text)) return 'fr';
    if (/\b(el|los|las|una|con|por)\b/i.test(text)) return 'es';
    return 'en';
}

function stem(word: string, lang: string): string {
    switch (lang) {
        case 'ru': return stemRu(word);
        case 'de': return stemDe(word);
        case 'fr': return stemFr(word);
        case 'es': return stemEs(word);
        default: return stemEn(word);
    }
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
    const lang = detectLanguage(text);
    const words = lower.split(/\s+/);
    const stemmed = words.map(w => stem(w, lang));
    const allWords = [...new Set([...words, ...stemmed.filter(s => s.length >= 2)])];
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
        const hasTrigger = rule.triggers.some(t => lower.includes(t) || allWords.some(w => w === stem(t, lang)));
        const hasContext = rule.context.some(ctx => lower.includes(ctx) || allWords.some(w => w === stem(ctx, lang)));
        if (hasTrigger && hasContext) {
            const cat = findCategoryByKey(rule.category, visible);
            if (cat) return { category: cat, confidence: rule.confidence };
        }
    }

    // Debug: log contextual rule checks
    for (const rule of CONTEXTUAL_KEYWORDS) {
        const hasTrigger2 = rule.triggers.some(t => lower.includes(t));
        const hasContext2 = rule.context.some(ctx => lower.includes(ctx));
        if (hasTrigger2 || hasContext2) {
        }
    }

    // Step 4: Keyword scoring with fuzzy matching
    let bestCategory: Category | null = null;
    let bestScore = 0;

    const kwStems = new Map<string, string[]>();
    for (const [catKey, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        kwStems.set(catKey, keywords.map(kw => stem(kw, lang)));
    }

    for (const [catKey, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        let score = 0;
        const stems = kwStems.get(catKey)!;
        for (const word of allWords) {
            if (word.length < 2) continue;
            for (let ki = 0; ki < keywords.length; ki++) {
                const kw = keywords[ki];
                const ks = stems[ki];
                if (word === kw) { score += 1.0; break; }
                if (word === ks && ks.length >= 3) { score += 0.95; break; }
                if (word.length >= 3 && (word.includes(kw) || kw.includes(word))) { score += 0.8; break; }
                if (word.length >= 3 && ks.length >= 3 && (word.includes(ks) || ks.includes(word))) { score += 0.7; break; }
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
        if (first.length >= 3 && allWords.some(w => w.includes(first) || first.includes(w))) {
            return { category: c, confidence: 0.5 };
        }
    }
    for (const c of visible) {
        const nameStem = c.name.toLowerCase().slice(0, Math.min(c.name.length, 4));
        if (nameStem.length >= 3 && allWords.some(w => w.startsWith(nameStem))) {
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
    // Transfer requires BOTH "from" and "to" markers, or explicit "перевод/transfer" word
    if (/перевёл|перевел|перевод|transfer|sent|überweisung|virement|transferencia/.test(s)) return 'transfer';
    if (/(со? счёта?|со? счета?|from ).*(на счёт|на счет| to | auf | à )/i.test(s)) return 'transfer';
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

// ── Recurring detection ──────────────────────────────────────────────────────

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export function detectRecurring(text: string): {
    isRecurring: boolean;
    frequency: RecurringFrequency | null;
} {
    const t = text.toLowerCase();
    if (/каждый месяц|ежемесячно|раз в месяц|monthly|every month|monatlich|mensuel|mensual/.test(t))
        return { isRecurring: true, frequency: 'monthly' };
    if (/каждую неделю|еженедельно|раз в неделю|weekly|every week|wöchentlich|hebdomadaire|semanal/.test(t))
        return { isRecurring: true, frequency: 'weekly' };
    if (/каждый день|ежедневно|раз в день|daily|every day|täglich|quotidien|diario/.test(t))
        return { isRecurring: true, frequency: 'daily' };
    if (/каждый год|ежегодно|раз в год|yearly|annually|jährlich|annuel|anual/.test(t))
        return { isRecurring: true, frequency: 'yearly' };
    return { isRecurring: false, frequency: null };
}

// ── Full text parser ────────────────────────────────────────────────────────

export interface ParsedTransaction {
    type: 'expense' | 'income' | 'transfer';
    amount: number;
    currency: string;
    category: Category | null;
    confidence: number;
    accountId: string;
    toAccountId?: string;
    date: string;
    note: string;
    checked: boolean;
    isRecurring: boolean;
    recurringFrequency: RecurringFrequency | null;
}

function parseBasics(text: string, baseCurrency: string) {
    return {
        amount: extractAmount(text),
        currency: detectCurrency(text, baseCurrency),
        date: parseDate(text),
        type: detectType(text),
    };
}

// ── Account matching for transfers ─────────────────────────────────────────

interface AccountLight { id: string; name: string; }

function matchAccountByName(text: string, accounts: AccountLight[]): { fromId: string | null; toId: string | null } {
    const s = text.toLowerCase();
    let fromId: string | null = null;
    let toId: string | null = null;

    // Sort accounts by name length descending to match longest first
    const sorted = [...accounts].sort((a, b) => b.name.length - a.name.length);

    // Pattern: "со счёта X ... на счёт Y" / "с X на Y" / "from X to Y"
    const fromPatterns = [/(?:со? счёта?|с |from |von |de |desde )\s*(.+?)(?:\s+(?:на счёт|на |to |auf |à |a )|$)/i];
    const toPatterns = [/(?:на счёт|на |to |auf |à |a )\s*(.+?)(?:\s+\d|$)/i];

    for (const acc of sorted) {
        const name = acc.name.toLowerCase();
        if (!name) continue;

        // Check if account name appears after "from" markers
        const fromMarkers = ['со счёта', 'со счета', 'с счёта', 'с счета', 'с ', 'from ', 'von ', 'de ', 'desde '];
        const toMarkers = ['на счёт', 'на счет', 'на ', 'to ', 'auf ', 'à ', 'a '];

        for (const marker of fromMarkers) {
            const idx = s.indexOf(marker);
            if (idx !== -1) {
                const after = s.substring(idx + marker.length).trim();
                if (after.startsWith(name) || after.includes(name)) {
                    fromId = acc.id;
                    break;
                }
            }
        }

        for (const marker of toMarkers) {
            // Find "to" marker that comes AFTER "from" content
            const fromEnd = fromId ? s.indexOf(sorted.find(a => a.id === fromId)?.name.toLowerCase() ?? '') + 1 : 0;
            const searchFrom = Math.max(fromEnd, 0);
            const idx = s.indexOf(marker, searchFrom);
            if (idx !== -1 && idx >= searchFrom) {
                const after = s.substring(idx + marker.length).trim();
                if ((after.startsWith(name) || after.includes(name)) && acc.id !== fromId) {
                    toId = acc.id;
                    break;
                }
            }
        }
    }

    // Fallback: just find any two account names mentioned
    if (!fromId || !toId) {
        const found: string[] = [];
        for (const acc of sorted) {
            if (s.includes(acc.name.toLowerCase()) && !found.includes(acc.id)) {
                found.push(acc.id);
                if (found.length >= 2) break;
            }
        }
        if (found.length >= 2) {
            fromId = fromId ?? found[0];
            toId = toId ?? found[1];
        } else if (found.length === 1) {
            // One account found — use as "to", keep default as "from"
            toId = toId ?? found[0];
        }
    }

    return { fromId, toId };
}

export function parseVoiceText(
    text: string,
    cats: Category[],
    defaultCurrency: string,
    defaultAccountId: string,
    accounts?: AccountLight[],
): ParsedTransaction[] {
    const results: ParsedTransaction[] = [];

    // Pre-scan: check the FULL text for "со счёта X" to set global account for all items
    let globalAccountId = defaultAccountId;
    if (accounts && accounts.length > 0) {
        const fullLower = text.toLowerCase();
        const fromMarkers = ['со счёта ', 'со счета ', 'с счёта ', 'с счета ', 'from '];
        const sortedAccs = [...accounts].sort((a, b) => b.name.length - a.name.length);
        for (const marker of fromMarkers) {
            const mIdx = fullLower.indexOf(marker);
            if (mIdx !== -1) {
                const after = fullLower.substring(mIdx + marker.length).trim();
                for (const acc of sortedAccs) {
                    if (after.startsWith(acc.name.toLowerCase()) || after.includes(acc.name.toLowerCase())) {
                        globalAccountId = acc.id;
                        break;
                    }
                }
                if (globalAccountId !== defaultAccountId) break;
            }
        }
    }

    // Normalize: remove dots after abbreviations so they don't act as sentence separators
    const cleaned = text.replace(/(\b(?:руб|тыс|шт|коп|EUR|USD|RUB|GBP|CHF))\./gi, '$1');
    // Split by: comma, period+space+letter, or keywords
    // Then further split by pattern: "number [currency] word" boundaries (e.g., "100 руб кофе" → ["100 руб", "кофе"])
    const rawSentences = cleaned.split(/,|\.\s+(?=[а-яa-z])/i)
        .flatMap(s => s.split(/\bи ещё\b|\bещё\b|\bтакже\b|\bплюс\b|\band also\b|\bplus\b|\bund auch\b|\bet aussi\b|\by también\b/i));
    // Further split: if a sentence contains multiple "word number" patterns, split between them
    const sentences: string[] = [];
    for (const raw of rawSentences) {
        const trimmed = raw.trim();
        if (!trimmed) continue;
        // Match pattern: split before a new word that is followed by a number (new transaction)
        const parts = trimmed.split(/\s+(?=[а-яa-z]+\s+\d)/i);
        if (parts.length > 1) {
            sentences.push(...parts);
        } else {
            sentences.push(trimmed);
        }
    }

    for (const sentence of sentences) {
        const s = sentence.trim();
        if (!s) continue;

        const basics = parseBasics(s, defaultCurrency);
        const { category, confidence } = matchCategory(s, cats.filter(c =>
            !c.is_hidden && (basics.type === 'transfer' || c.type === basics.type || c.type === 'expense')
        ));
        const { isRecurring, frequency } = detectRecurring(s);

        let accountId = globalAccountId;
        let toAccountId: string | undefined;

        // Try to match account names from this specific sentence (overrides global)
        if (accounts && accounts.length > 0) {
            const sLower = s.toLowerCase();
            // Check for "со счёта X" / "с X" pattern to set source account
            const fromMarkers = ['со счёта ', 'со счета ', 'с счёта ', 'с счета ', 'from '];
            const sortedAccs = [...accounts].sort((a, b) => b.name.length - a.name.length);
            for (const marker of fromMarkers) {
                const mIdx = sLower.indexOf(marker);
                if (mIdx !== -1) {
                    const after = sLower.substring(mIdx + marker.length).trim();
                    for (const acc of sortedAccs) {
                        if (after.startsWith(acc.name.toLowerCase()) || after.includes(acc.name.toLowerCase())) {
                            accountId = acc.id;
                            break;
                        }
                    }
                    break;
                }
            }
        }

        if (basics.type === 'transfer' && accounts && accounts.length > 0) {
            const { fromId, toId } = matchAccountByName(s, accounts);
            if (fromId) accountId = fromId;
            if (toId) toAccountId = toId;
        }

        // If no explicit currency detected, inherit from previous result
        let currency = basics.currency;
        if (currency === defaultCurrency && results.length > 0) {
            // Check if this sentence has an explicit currency marker
            const hasExplicit = /руб|₽|rub|евро|€|eur|доллар|\$|usd|фунт|£|gbp|франк|chf|лари|gel|тенге|kzt|лира|try|дирхам|aed|гривн|uah|злот|pln|крон|czk|шекел|ils|драм|amd|сум|uzs|манат|azn|бел/i.test(s);
            if (!hasExplicit) {
                currency = results[results.length - 1].currency;
            }
        }

        results.push({
            ...basics, category, confidence, currency,
            accountId, toAccountId,
            note: s, checked: true,
            isRecurring, recurringFrequency: frequency,
        });
    }

    return results;
}

// ── Init: load learned data on module import ────────────────────────────────
if (typeof window !== 'undefined') loadLearned();
