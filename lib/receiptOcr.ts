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

export async function recognizeReceipt(imageUrl: string): Promise<OcrResult> {
    try {
        const params = new URLSearchParams({
            apikey: OCR_API_KEY,
            url: imageUrl,
            language: 'rus',
            isOverlayRequired: 'false',
            detectOrientation: 'true',
            scale: 'true',
            OCREngine: '2',
        });

        const res = await fetch(`${OCR_API_URL}?${params.toString()}`);
        const json = await res.json();

        const text = json?.ParsedResults?.[0]?.ParsedText ?? '';
        if (!text) return { amount: null, currency: null, date: null, merchant: null, categorySlug: null, items: [], rawText: '' };

        const items = parseLineItems(text);
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
            while ((m = amountRegex.exec(line)) !== null) {
                const val = parseAmount(m[1]);
                if (val > best) best = val;
            }
            amountRegex.lastIndex = 0;
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
            while ((m = amountRegex.exec(line)) !== null) {
                const val = parseAmount(m[1]);
                if (val > best) best = val;
            }
            amountRegex.lastIndex = 0;
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
    const match2 = text.match(/(\d{4})-(\d{2})-(\d{2})/);
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
    const lines = text.split('\n');
    const items: ReceiptItem[] = [];

    // Pre-process: merge price-only lines with previous, but stop at НДС/скидка
    const merged: string[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const lower = line.toLowerCase();
        // Skip standalone НДС, скидка, discount lines
        if (/^ндс|^нпс|^pdv|^mwst|^tva|^скидк|^знижк|^discount|^rabatt/.test(lower)) continue;
        // If line is just a price or "=price" or "* qty", attach to previous
        if (/^[*×xх]\s*\d|^=\s*\d|^\d[\d\s]*[.,]\d{2}\s*[А-Яа-яA-Za-z]?\s*$/.test(line) && merged.length > 0) {
            merged[merged.length - 1] += ' ' + line;
        } else {
            merged.push(line);
        }
    }

    for (let i = 0; i < merged.length; i++) {
        const line = merged[i].trim();
        if (!line || line.length < 3) continue;

        // Skip header/footer lines
        const lower = line.toLowerCase();
        if (/итого|итог|total|gesamt|somme|всего|к оплате|ндс|pdv|mwst|tva|iva|готівка|решта|сума|сдача|касс|чек|терминал|оператор|карт|mastercard|visa|безналич|наличн|оплата|одобрено|место расчет|автомат|офд|инн|огрн|фн:|фп:|сайт|www\.|\.ru|\.ua|\.com|\.de|\.fr|\.es|адрес|info|subtotal|zwischensumme|sous-total|change|wechselgeld|monnaie|cambio/.test(lower)) continue;

        // Pattern: price at end of line, or "=price" pattern
        const priceMatch = line.match(/(\d[\d\s]*[.,]\d{2})\s*[А-Яа-яA-Za-z]?\s*$/)
            ?? line.match(/=\s*(\d[\d\s]*[.,]\d{2})/);
        if (!priceMatch) continue;

        const price = parseFloat(priceMatch[1].replace(/\s/g, '').replace(',', '.'));
        if (price <= 0 || price > 500000) continue;

        // Extract name (everything before the price)
        let name = line.slice(0, priceMatch.index).replace(/[.\s]+$/, '').trim();

        // Check for quantity line above: "3.000 X" or "1.312 X"
        let quantity = 1;
        if (i > 0) {
            const prevLine = merged[i - 1]?.trim() ?? '';
            const qtyMatch = prevLine.match(/^(\d+[.,]\d+)\s*[xXхХ*×]/i);
            if (qtyMatch) {
                quantity = parseFloat(qtyMatch[1].replace(',', '.'));
            }
        }
        // Also check inline quantity: "1 x 4 199,00"
        const inlineQty = name.match(/(\d+)\s*[xXхХ*×]\s*[\d\s.,]+$/);
        if (inlineQty) {
            quantity = parseInt(inlineQty[1]);
            name = name.slice(0, inlineQty.index).trim();
        }

        // Clean up name
        name = name.replace(/^\d+\s+/, ''); // Remove leading item number
        name = name.replace(/\s*[*×]\s*\d.*$/, ''); // Remove "* 1 =118.30" suffix
        name = name.replace(/\s*=\s*\d.*$/, ''); // Remove "= 118.30" suffix
        name = name.replace(/\s+\d[\d\s]*[.,]\d{2}\s*$/, ''); // Remove trailing price from name "Coca-Cola 39.99"
        name = name.replace(/\s+\d+\s*$/, ''); // Remove trailing numbers "ананас 1"
        name = name.trim();
        if (name.length < 4) continue;

        // Skip if name is just numbers
        if (/^\d+$/.test(name)) continue;

        // Skip discounts / refunds
        if (/скидк|знижк|discount|rabatt|remise|descuento|бонус|bonus/i.test(name)) continue;

        // Skip junk lines
        if (/^[*_×=\s\d.,]+$/.test(name)) continue; // "* =", "0.786 ="
        if (name.length < 4) continue; // "Ко", "средн"
        if (/^[A-Z]+\/[A-Z]+$/.test(name)) continue; // HARTIKAINEN/JARI
        if (/безналич|наличн|банковск|visa|mastercard|карта|клиент|терминал|мерчант|одобрен|пин-код|авториз|ссылк|рекоменд|recommend/i.test(name)) continue;
        // Skip if price is unreasonably high (likely concatenated numbers)
        if (price > 100000) continue;

        const categorySlug = detectItemCategory(name);
        items.push({ name, quantity, price, categorySlug });
    }

    // Deduplicate by name (keep first occurrence)
    const seen = new Set<string>();
    const unique = items.filter(item => {
        const key = item.name.toLowerCase().slice(0, 20);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    return unique;
}

function detectItemCategory(itemName: string): string | null {
    const t = itemName.toLowerCase();

    // ── Meat / Fish (ru/uk/en/de/fr/es) ──
    if (/курят|куряч|м'яс|мясо|свинин|говядин|фарш|колбас|сосиск|ветчин|бекон|шинк/.test(t)) return 'food';
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
    if (/вода\b|сік|сок|напій|напиток|чай\b|кава|кофе|какао|компот|лимонад/.test(t)) return 'food';
    if (/печиво|печенье|шоколад|цукерк|конфет|торт|тістечк|пирожн|морозив|мороженое/.test(t)) return 'food';
    if (/water|juice|tea\b|coffee|cocoa|soda|cola|chocolate|candy|ice cream|cookie/.test(t)) return 'food';
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
    if (/руб|rub|₽/.test(t)) return 'RUB';
    if (/euro|eur|€/.test(t)) return 'EUR';
    if (/usd|\$|dollar/.test(t)) return 'USD';
    if (/gbp|£|pound/.test(t)) return 'GBP';
    if (/gel|лари/.test(t)) return 'GEL';
    if (/kzt|тенге/.test(t)) return 'KZT';
    if (/try|лира/.test(t)) return 'TRY';
    if (/byn|бел.*руб/.test(t)) return 'BYN';
    if (/uah|грн|₴/.test(t)) return 'UAH';
    return null;
}
