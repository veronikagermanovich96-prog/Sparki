/**
 * Receipt OCR — extract amount, date, and merchant from receipt photo.
 * Uses free OCR.space API (25k requests/month free tier).
 */

export interface ReceiptItem {
    name: string;
    quantity: number;
    price: number;
    categorySlug: string | null;
}

export interface OcrResult {
    amount: number | null;
    currency: string | null;
    date: string | null;
    merchant: string | null;
    categorySlug: string | null;
    items: ReceiptItem[];
    rawText: string;
}

const OCR_API_URL = 'https://api.ocr.space/parse/imageurl';
const OCR_API_KEY = 'K85403682388957'; // Free tier key

async function callOcrApi(imageUrl: string, language: string, engine: string): Promise<string> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        const params = new URLSearchParams({
            apikey: OCR_API_KEY, url: imageUrl, language,
            isOverlayRequired: 'false', detectOrientation: 'true', scale: 'true', OCREngine: engine,
        });
        const res = await fetch(`${OCR_API_URL}?${params.toString()}`, { signal: controller.signal });
        clearTimeout(timeout);
        const json = await res.json();
        return json?.ParsedResults?.[0]?.ParsedText ?? '';
    } catch { return ''; }
}

export async function recognizeReceipt(imageUrl: string): Promise<OcrResult> {
    try {
        // Try Engine 2 (better for Russian) first
        let text = await callOcrApi(imageUrl, 'rus', '2');

        let items = text ? parseLineItems(text) : [];

        // If no items found, retry with Engine 1 + English (better for UK/US tabular receipts)
        if (items.length <= 1 && text) {
            const text2 = await callOcrApi(imageUrl, 'eng', '1');
            if (text2) {
                const items2 = parseLineItems(text2);
                if (items2.length > items.length) {
                    items = items2;
                    text = text2;
                }
            }
        }

        if (!text) return { amount: null, currency: null, date: null, merchant: null, categorySlug: null, items: [], rawText: '' };

        return {
            amount: extractAmount(text),
            currency: extractCurrency(text),
            date: extractDate(text),
            merchant: extractMerchant(text),
            categorySlug: detectCategory(text),
            items,
            rawText: text,
        };
    } catch (e) {
        console.warn('OCR error:', e);
        return { amount: null, currency: null, date: null, merchant: null, categorySlug: null, items: [], rawText: '' };
    }
}

// ── Amount extraction ───────────────────────────────────────────────────────

function extractAmount(text: string): number | null {
    const lines = text.split('\n');
    const amountRegex = /(\d[\d\s.,]*\d)/g;

    function parseAmount(str: string): number {
        // "4 199,00" or "4199.00" or "4,199.00"
        const cleaned = str.replace(/\s/g, '');
        // If has comma before dot or as last separator → treat comma as decimal
        if (/,\d{2}$/.test(cleaned)) {
            return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
        }
        return parseFloat(cleaned.replace(/,/g, ''));
    }

    // Priority 1: "ИТОГО К ОПЛАТЕ" / "ИТОГ" lines (highest confidence)
    for (const line of lines) {
        const lower = line.toLowerCase();
        if (/итого к оплате|итог\b|total\b|к оплате/.test(lower)) {
            let m;
            let best = 0;
            amountRegex.lastIndex = 0;
            while ((m = amountRegex.exec(line)) !== null) {
                const val = parseAmount(m[1]);
                if (val > best) best = val;
            }
            if (best > 0) return best;
        }
    }

    // Priority 2: "ВСЕГО" / "СУММА" / "AMOUNT" (but not "НДС" / "TAX")
    for (const line of lines) {
        const lower = line.toLowerCase();
        if (/ндс|tax|vat|скидка|discount/.test(lower)) continue;
        if (/всего|сумма|amount|subtotal/.test(lower)) {
            let m;
            let best = 0;
            amountRegex.lastIndex = 0;
            while ((m = amountRegex.exec(line)) !== null) {
                const val = parseAmount(m[1]);
                if (val > best) best = val;
            }
            if (best > 0) return best;
        }
    }

    // Fallback: largest number with decimal part (not INN/phone/document numbers)
    const amounts: number[] = [];
    const decimalRegex = /(\d[\d\s]*[.,]\d{2})\b/g;
    let m;
    while ((m = decimalRegex.exec(text)) !== null) {
        const val = parseAmount(m[1]);
        if (val > 0 && val < 1_000_000) amounts.push(val);
    }
    if (amounts.length === 0) return null;
    return Math.max(...amounts);
}

// ── Date extraction ─────────────────────────────────────────────────────────

function extractDate(text: string): string | null {
    // DD.MM.YYYY or DD/MM/YYYY
    const match1 = text.match(/(\d{2})[./](\d{2})[./](\d{4})/);
    if (match1) return `${match1[3]}-${match1[2]}-${match1[1]}`;

    // YYYY-MM-DD
    const match2 = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (match2) return match2[0];

    // DD.MM.YY
    const match3 = text.match(/(\d{2})[./](\d{2})[./](\d{2})\b/);
    if (match3) {
        const year = parseInt(match3[3]) + 2000;
        return `${year}-${match3[2]}-${match3[1]}`;
    }

    return null;
}

// ── Merchant extraction ─────────────────────────────────────────────────────

function extractMerchant(text: string): string | null {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    if (lines.length === 0) return null;

    // Skip lines that look like addresses, dates, or numbers
    for (const line of lines.slice(0, 5)) {
        const lower = line.toLowerCase();
        if (/^\d|итого|total|дата|date|касс|чек|инн|огрн/.test(lower)) continue;
        if (line.length > 3 && line.length < 50) return line;
    }

    return lines[0]?.slice(0, 50) ?? null;
}

// ── Line item parsing ────────────────────────────────────────────────────────

function parseLineItems(text: string): ReceiptItem[] {
    // Pre-process: merge broken lines ("=49.\n99" → "=49.99")
    const rawLines = text.split('\n').map(l => l.trim());
    const lines: string[] = [];
    for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i];
        if (/=\s*\d+[.,]\s*$/.test(line) && i + 1 < rawLines.length && /^\d{2}\s*$/.test(rawLines[i + 1])) {
            lines.push(line + rawLines[i + 1].trim());
            i++;
        } else {
            lines.push(line);
        }
    }

    const totalAmount = extractAmount(text);

    // Detect if receipt uses "=price" format (Russian) or "Name  Price" format (Western)
    const hasEqPrices = lines.some(l => /=\s*\d+[.,]\d{2}/.test(l) && !/скидк|discount/i.test(l));

    // ── Junk line filter (shared) ──
    function isJunkLine(line: string): boolean {
        if (!line || line.length < 4) return true;
        if (!/[A-Za-zА-Яа-яЁё]{2,}/.test(line)) return true;
        if (/^[*×=_]|^ндс|^нпс|^скидк|^знижк|^discount|^: \d/i.test(line)) return true;
        if (/итого|итог|total|subtotal|всего|к оплате|gesamt|summe|somme/i.test(line)) return true;
        if (/безналич|наличн|банковск|visa|mastercard|карта|клиент|терминал|мерчант|одобрен|авториз|ссылк|рекоменд|recommend/i.test(line)) return true;
        if (/^ООО|^ОАО|^ЗАО|^ИП\s|^ТОО|^ул\.|^пр\.|^дом\s|^литера|^город|^г\.\s/i.test(line)) return true;
        if (/Санкт-Петербург|Москва|Андреева|КАССА|London|Paris|Berlin/i.test(line)) return true;
        if (/^«|^»|^"|О'КЕЙ|ОКЕЙ|ВНИМАНИЕ|КОПИЯ|НА ПРОДАЖУ|В КАТЕГОРИИ|ЛУЧШАЯ ЦЕНА|БАНКОВСКИЕ/i.test(line)) return true;
        if (/средн|пакет майка|скилка|скідка|Tahti|HARTIKAINEN|Оплата|Комиссия|Введен ПИН/i.test(line)) return true;
        if (/^[0-9A-Fa-f]{20,}$/.test(line)) return true;
        if (/^изана|Сумма \(Руб\)/i.test(line)) return true;
        if (/^\d+$/.test(line) || /^\d[\d\s]*[.,]\d{2}\s*$/.test(line)) return true;
        if (/tax\b|vat\b|ндс\b|mwst|tva\b|iva\b|change\b|cash\b|card\b|payment|balance|saving|clubcard|bonus/i.test(line)) return true;
        if (/tel\b|phone|www\.|\.com|\.co\.|\.ru|\.de|\.fr|\.es|fax|email/i.test(line)) return true;
        if (/ФН:|ФД:|ФП:|ИНН|ОГРН|БИН|ЄДРПОУ/i.test(line)) return true;
        return false;
    }

    interface ParsedItem { name: string; price: number; }
    const parsed: ParsedItem[] = [];

    if (hasEqPrices) {
        // ── Russian "=price" format ──
        const itemNameLines: number[] = [];
        for (let i = 0; i < lines.length; i++) {
            if (isJunkLine(lines[i])) continue;
            const hasPrice = /\d+[.,]\d{2}/.test(lines[i]);
            const hasItemNumber = /^\d+\s+[A-Za-zА-Яа-яЁё]/.test(lines[i]);
            if (!hasPrice && !hasItemNumber) {
                const wordCount = lines[i].replace(/^\d+\s+/, '').split(/\s+/).length;
                if (wordCount <= 1) continue;
            }
            itemNameLines.push(i);
        }

        interface EqPrice { lineIdx: number; price: number; }
        const eqPrices: EqPrice[] = [];
        for (let i = 0; i < lines.length; i++) {
            const eqMatch = lines[i].match(/=\s*(\d[\d\s]*[.,]\d{2})/);
            if (!eqMatch) continue;
            if (/скидк|знижк|discount/i.test(lines[i])) continue;
            const p = parseFloat(eqMatch[1].replace(/\s/g, '').replace(',', '.'));
            if (p <= 0 || p > 50000) continue;
            if (totalAmount && Math.abs(p - totalAmount) < 1) continue;
            eqPrices.push({ lineIdx: i, price: p });
        }

        const usedEq = new Set<number>();
        for (const nameLineIdx of itemNameLines) {
            const eq = eqPrices.find(e => !usedEq.has(e.lineIdx) && e.lineIdx > nameLineIdx && e.lineIdx <= nameLineIdx + 10);
            if (!eq) continue;
            usedEq.add(eq.lineIdx);
            let name = lines[nameLineIdx]
                .replace(/^\d+\s+/, '')
                .replace(/\s+\d[\d\s]*[.,]\d{2}\s*$/, '')
                .replace(/\s+\d+\s*$/, '')
                .replace(/\s+[A-ZА-ЯЁa-zа-яё]{1,2}\s*$/, '')
                .trim();
            if (name.length < 3) continue;
            parsed.push({ name, price: eq.price });
        }
    }

    // ── Universal format: try multiple strategies ──
    if (parsed.length === 0) {
        // Strategy A: "Name  Price" on same line (US/some EU receipts)
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (isJunkLine(line)) continue;

            let m = line.match(/^(.+?)\s{2,}[£$€]?(\d{1,6}[.,]\d{2})\s*[A-Z]?\s*$/);
            if (!m) m = line.match(/^(.{3,}?)\s+(\d{1,6}[.,]\d{2})\s*$/);
            if (!m) continue;

            const price = parseFloat(m[2].replace(',', '.'));
            if (price <= 0 || price > 50000) continue;
            if (totalAmount && price > totalAmount * 1.05) continue;

            let name = m[1].replace(/^\d+\s+/, '').replace(/\s+\d+\s*$/, '').replace(/^[A-Z]\s+/, '').trim();
            if (name.length < 3 || !/[A-Za-zА-Яа-яЁё]{2,}/.test(name)) continue;
            if (/^-/.test(m[2]) || /-\s*\d/.test(line)) continue;

            parsed.push({ name, price });
        }
    }

    // Strategy B: Names and prices in separate columns/blocks (UK receipts via OCR)
    // OCR often splits 2-column receipts into name block + price block
    if (parsed.length === 0) {
        // Collect item-name lines (have 3+ letters, not junk, no price)
        const nameLines: string[] = [];
        // Collect standalone price lines
        const priceLines: number[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue;

            // Is this a standalone price? Must have decimal point (1.68, 0.58, .58)
            const priceClean = line.replace(/^[oO]\s*/, '').replace(/^[£$€E]\s*/, '').replace(/\s+/g, '');
            const pm = priceClean.match(/^(\d{0,4}\.\d{2})$/);
            if (pm) {
                const p = parseFloat(pm[1]);
                if (p > 0 && p < 10000 && (!totalAmount || p <= totalAmount * 1.05)) {
                    priceLines.push(p);
                    continue;
                }
            }

            // Is this an item name?
            if (isJunkLine(line)) continue;
            if (/^\d+[.,]\d{2}$/.test(line)) continue; // bare price
            if (/^V\s/.test(line) || /^[A-Z&/]{2,}/.test(line) || /[A-Za-z]{3,}/.test(line)) {
                let name = line
                    .replace(/^V\s+/, '')       // remove "V " prefix (VAT indicator)
                    .replace(/^\d+\s+/, '')
                    .trim();
                if (name.length >= 3 && /[A-Za-zА-Яа-яЁё]{2,}/.test(name)) {
                    // Skip footer/header lines
                    if (/items\b|balance|visa|debit|change|cardholder|copy|contactless|sale|please|amount|total|gbp|eur|usd|verification|receipt|records|auth|code|ref|aid|app seq|account|registration|result|token|guaranteed|committed|quality|thank|shopping/i.test(name)) continue;
                    if (/waitrose|tesco|sainsbury|lidl|aldi|rewe|carrefour|walmart/i.test(name)) continue;
                    if (/www\.|\.com|\.co\./i.test(name)) continue;
                    if (/^\*+/.test(name) || /^\d{2}\/\d{2}\/\d{4}/.test(name)) continue;
                    if (/^mywaitrose|^mycard|^clubcard/i.test(name)) continue;
                    if (/tower|bank\s|street|road|avenue|south\sbank|north|east|west/i.test(name) && /\d{3,}/.test(name)) continue;
                    if (/detai|commi\s*tted|qual\s*i\s*ty|istration/i.test(name)) continue;
                    nameLines.push(name);
                }
            }
        }

        // Pair names with prices (by order)
        const pairCount = Math.min(nameLines.length, priceLines.length);
        if (pairCount >= 2) {
            for (let i = 0; i < pairCount; i++) {
                parsed.push({ name: nameLines[i], price: priceLines[i] });
            }
        }
    }

    // Assign categories
    const items: ReceiptItem[] = parsed.map(p => ({
        name: p.name,
        quantity: 1,
        price: p.price,
        categorySlug: detectItemCategory(p.name),
    }));

    // Merge duplicates: same name → sum prices, increase quantity
    const seen = new Map<string, number>();
    const unique: ReceiptItem[] = [];
    for (const item of items) {
        const normalized = item.name.toLowerCase()
            .replace(/^напиток\s+/i, '')
            .replace(/^шок\.\s*/i, 'шоколадный ')
            .replace(/\s+/g, ' ')
            .slice(0, 18);
        if (seen.has(normalized)) {
            const idx = seen.get(normalized)!;
            unique[idx].price += item.price;
            unique[idx].quantity += 1;
        } else {
            seen.set(normalized, unique.length);
            unique.push({ ...item });
        }
    }

    return unique;
}

function detectItemCategory(itemName: string): string | null {
    const t = itemName.toLowerCase();

    // ── Meat / Fish (ru/uk/en/de/fr/es) ──
    if (/курят|куряч|м'яс|мясо|свинин|говядин|фарш|колбас|сосиск|ветчин|бекон|шинк|ребрышк|свиные|свиных/.test(t)) return 'food';
    if (/chicken|beef|pork|sausage|bacon|ham|meat|turkey|lamb/.test(t)) return 'food';
    if (/hähnchen|rind|schwein|wurst|schinken|fleisch|lamm/.test(t)) return 'food';
    if (/poulet|boeuf|porc|saucisse|jambon|viande|agneau/.test(t)) return 'food';
    if (/pollo|cerdo|res|salchicha|jamón|carne|cordero/.test(t)) return 'food';
    if (/риб|рыб|лосось|тунец|форель|сельд|оселед|fish|salmon|tuna|trout|lachs|thunfisch|saumon|thon|pescado|atún/.test(t)) return 'food';

    // ── Dairy (ru/uk/en/de/fr/es) ──
    if (/молок|сир|сыр|масл|сметан|кефір|кефир|йогурт|творог|вершк|сливк/.test(t)) return 'food';
    if (/milk|cheese|butter|cream|yogurt|cottage/.test(t)) return 'food';
    if (/milch|käse|butter|sahne|joghurt|quark/.test(t)) return 'food';
    if (/lait|fromage|beurre|crème|yaourt/.test(t)) return 'food';
    if (/leche|queso|mantequilla|crema|yogur/.test(t)) return 'food';

    // ── Bread / Bakery ──
    if (/хліб|хлеб|батон|булк|випічк|выпечк/.test(t)) return 'food';
    if (/bread|baguette|croissant|roll|pastry|cake|muffin|cookie/.test(t)) return 'food';
    if (/brot|brötchen|kuchen|gebäck|torte/.test(t)) return 'food';
    if (/pain|gâteau|pâtisserie|tarte/.test(t)) return 'food';
    if (/pan|pastel|galleta|torta/.test(t)) return 'food';

    // ── Vegetables / Fruits ──
    if (/овоч|овощ|картопл|картофел|помідор|помидор|огірок|огурц|цибул|лук\b|морков|капуст/.test(t)) return 'food';
    if (/фрукт|яблук|яблок|банан|апельсин|лимон|ананас|виноград|груш/.test(t)) return 'food';
    if (/potato|tomato|cucumber|onion|carrot|cabbage|apple|banana|orange|lemon|grape|pear|berry|strawberry|avocado/.test(t)) return 'food';
    if (/kartoffel|tomate|gurke|zwiebel|möhre|apfel|birne|traube|erdbeere/.test(t)) return 'food';
    if (/pomme|tomate|concombre|oignon|carotte|banane|citron|raisin|fraise/.test(t)) return 'food';
    if (/patata|tomate|pepino|cebolla|zanahoria|manzana|plátano|naranja|limón|uva|fresa/.test(t)) return 'food';

    // ── Grains / Pasta / Cereals ──
    if (/крупа|рис\b|гречк|макарон|спагет|вермішел|лапш|мука/.test(t)) return 'food';
    if (/rice|pasta|spaghetti|noodle|flour|cereal|oat/.test(t)) return 'food';
    if (/reis|nudel|mehl|müsli|hafer/.test(t)) return 'food';
    if (/riz|pâte|farine|céréale/.test(t)) return 'food';
    if (/arroz|pasta|harina|cereal|avena/.test(t)) return 'food';

    // ── Condiments / Spices ──
    if (/кетчуп|соус|майонез|гірчиц|горчиц|оцет|уксус|спец|приправ|припр|сіль|соль|цукор|сахар|перец/.test(t)) return 'food';
    if (/ketchup|sauce|mustard|vinegar|salt|sugar|pepper|spice|mayo/.test(t)) return 'food';
    if (/senf|essig|salz|zucker|pfeffer|gewürz/.test(t)) return 'food';
    if (/moutarde|vinaigre|sel|sucre|poivre|épice/.test(t)) return 'food';
    if (/mostaza|vinagre|sal|azúcar|pimienta|especia/.test(t)) return 'food';

    // ── Eggs / Canned / Other food ──
    if (/яйц|яєц|egg|eier|oeuf|huevo/.test(t)) return 'food';
    if (/консерв|тушонк|тушёнк|горох|квасол|фасол|кукурудз|кукуруз|шампін|шампиньон|гриб/.test(t)) return 'food';
    if (/canned|beans|corn|mushroom|peas/.test(t)) return 'food';
    if (/dose|bohne|mais|pilz|erbse/.test(t)) return 'food';
    if (/conserve|haricot|maïs|champignon|petit pois/.test(t)) return 'food';
    if (/conserva|frijol|maíz|champiñón|guisante/.test(t)) return 'food';

    // ── Drinks / Sweets ──
    if (/вода\b|сік|сок|напій|напиток|пивн|пиво|чай\b|кава|кофе|какао|компот|лимонад|смесь/.test(t)) return 'food';
    if (/печиво|печенье|шоколад|цукерк|конфет|торт|тістечк|пирожн|морозив|мороженое/.test(t)) return 'food';
    if (/water|juice|tea\b|coffee|cocoa|soda|cola|chocolate|candy|ice cream|cookie|nutberry|mix|nut/.test(t)) return 'food';
    if (/wasser|saft|tee\b|kaffee|kakao|schokolade|bonbon|eis/.test(t)) return 'food';
    if (/eau|jus|thé\b|café|cacao|chocolat|bonbon|glace/.test(t)) return 'food';
    if (/agua|zumo|té\b|café|cacao|chocolate|caramelo|helado/.test(t)) return 'food';

    // ── Household / Hygiene (ru/uk/en/de/fr/es) ──
    if (/мило|мыло|шампунь|гель|крем|зубн|паст|щітк|щётк|дезодорант|туалет|серветк|салфетк|памперс|підгуз|подгуз/.test(t)) return 'food';
    if (/порош|пральн|стиральн|засіб|средств|відбіл|отбелив|губк|ганчірк|тряпк/.test(t)) return 'food';
    if (/soap|shampoo|toothpaste|toothbrush|deodorant|toilet|tissue|napkin|diaper|detergent|sponge/.test(t)) return 'food';
    if (/seife|zahnpasta|zahnbürste|waschmittel|windel|schwamm|toilettenpapier/.test(t)) return 'food';
    if (/savon|dentifrice|brosse à dent|lessive|couche|éponge|papier toilette/.test(t)) return 'food';
    if (/jabón|pasta de dientes|cepillo|detergente|pañal|esponja|papel higiénico/.test(t)) return 'food';

    // ── Books / Education ──
    if (/книг|book|buch|bücher|livre|libro/.test(t)) return 'entertainment';

    // ── Electronics ──
    if (/смартфон|телефон|ноутбук|планшет|навушник|наушник|кабель|зарядк|акумулятор|аккумулятор|чохол|чехол/.test(t)) return 'entertainment';
    if (/smartphone|phone|laptop|tablet|headphone|earphone|charger|cable|battery|case/.test(t)) return 'entertainment';
    if (/handy|kopfhörer|ladegerät|kabel|akku|hülle/.test(t)) return 'entertainment';
    if (/téléphone|ordinateur|tablette|écouteur|chargeur|câble|batterie|coque/.test(t)) return 'entertainment';
    if (/teléfono|portátil|tableta|auricular|cargador|cable|batería|funda/.test(t)) return 'entertainment';

    // ── Clothing ──
    if (/футболк|джинс|штан|куртк|светр|свитер|пальто|плащ|шапк|рукавиц|перчатк|шкарпетк|носк|білизн|бельё|сукн|платье/.test(t)) return 'clothing';
    if (/shirt|jeans|pants|jacket|sweater|coat|hat|gloves|socks|underwear|dress|skirt|shorts/.test(t)) return 'clothing';
    if (/hemd|hose|jacke|pullover|mantel|mütze|handschuh|socken|unterwäsche|kleid|rock/.test(t)) return 'clothing';
    if (/chemise|jean|pantalon|veste|pull|manteau|chapeau|gants|chaussettes|sous-vêtement|robe|jupe/.test(t)) return 'clothing';
    if (/camisa|vaquero|pantalón|chaqueta|suéter|abrigo|gorro|guantes|calcetines|ropa interior|vestido|falda/.test(t)) return 'clothing';

    // ── Medicine / Health ──
    if (/таблетк|таблет|мазь|крапл|капл|сироп|бинт|пластир|пластыр|вітамін|витамин/.test(t)) return 'health';
    if (/tablet|pill|ointment|drops|syrup|bandage|plaster|vitamin|medicine|painkiller|aspirin|ibuprofen/.test(t)) return 'health';
    if (/tablette|salbe|tropfen|sirup|verband|pflaster|vitamin|medikament|schmerzmittel/.test(t)) return 'health';
    if (/comprimé|pommade|gouttes|sirop|pansement|vitamine|médicament|antidouleur/.test(t)) return 'health';
    if (/pastilla|pomada|gotas|jarabe|venda|tirita|vitamina|medicamento|analgésico/.test(t)) return 'health';

    return null;
}

// ── Category detection from receipt content ──────────────────────────────────

function detectCategory(text: string): string | null {
    const t = text.toLowerCase();

    // Food / groceries keywords
    if (/магазин|продукт|супермаркет|гастроном|бакалея|молоко|хлеб|мясо|сыр|сир|овощ|фрукт|курятин|куряч|кетчуп|масло|крупа|мука|яйц|рыб|колбас|grocery|supermarket|lebensmittel|épicerie|supermercado/.test(t))
        return 'food';

    // Restaurant / cafe
    if (/ресторан|кафе|кофейня|бар\b|пицца|суши|бургер|столовая|restaurant|cafe|coffee|kaffee|bistro|cafetería/.test(t))
        return 'cafe';

    // Transport / gas
    if (/бензин|заправк|азс|парковк|такси|метро|проезд|fuel|gas station|tankstelle|gasolina/.test(t))
        return 'transport';

    // Pharmacy / health
    if (/аптек|фармац|лекарств|таблет|витамин|медицин|pharmacy|apotheke|pharmacie|farmacia/.test(t))
        return 'health';

    // Clothing
    if (/одежд|обувь|zara|h&m|uniqlo|шмотк|футболк|джинс|clothing|kleidung|vêtements|ropa/.test(t))
        return 'clothing';

    // Electronics
    if (/dns|электрон|техник|смартфон|ноутбук|компьютер|телефон|electronics|elektronik/.test(t))
        return 'entertainment';

    // Beauty
    if (/парикмахер|салон красот|маникюр|косметик|beauty|salon|friseur|coiffeur|peluquería/.test(t))
        return 'beauty';

    // Sport
    if (/спортмастер|декатлон|фитнес|спортзал|тренажер|decathlon|sport|fitness|gym/.test(t))
        return 'sport';

    return null;
}

// ── Currency detection ──────────────────────────────────────────────────────

function extractCurrency(text: string): string | null {
    const t = text.toLowerCase();
    // Check explicit currency codes first (most reliable)
    if (/gbp\d|£\d/.test(t)) return 'GBP';
    if (/rub\b|руб|₽/.test(t)) return 'RUB';
    if (/usd\d|\$\d|dollar/.test(t)) return 'USD';
    if (/eur\d|€\d|euro\b/.test(t)) return 'EUR';
    if (/gbp|£|pound/.test(t)) return 'GBP';
    if (/eur|€/.test(t)) return 'EUR';
    if (/usd|\$/.test(t)) return 'USD';
    if (/gel|лари/.test(t)) return 'GEL';
    if (/kzt|тенге/.test(t)) return 'KZT';
    if (/try\b|лира/.test(t)) return 'TRY';
    if (/byn|бел.*руб/.test(t)) return 'BYN';
    if (/uah|грн|₴/.test(t)) return 'UAH';
    if (/chf|франк/.test(t)) return 'CHF';
    if (/pln|злот|zł/.test(t)) return 'PLN';
    if (/czk|крон|kč/.test(t)) return 'CZK';
    if (/sek|крон/.test(t)) return 'SEK';
    return null;
}
