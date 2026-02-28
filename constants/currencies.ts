export interface CurrencyInfo {
    code: string;
    name: string;
    symbol: string;
    flag: string;
}

// All currencies supported by frankfurter.app (ECB) + common extras
export const CURRENCIES: CurrencyInfo[] = [
    { code: 'EUR', name: 'Euro',                   symbol: '€',   flag: '🇪🇺' },
    { code: 'USD', name: 'US Dollar',              symbol: '$',   flag: '🇺🇸' },
    { code: 'GBP', name: 'British Pound',          symbol: '£',   flag: '🇬🇧' },
    { code: 'CHF', name: 'Swiss Franc',            symbol: 'Fr',  flag: '🇨🇭' },
    { code: 'RUB', name: 'Russian Ruble',          symbol: '₽',   flag: '🇷🇺' },
    { code: 'JPY', name: 'Japanese Yen',           symbol: '¥',   flag: '🇯🇵' },
    { code: 'CNY', name: 'Chinese Yuan',           symbol: '¥',   flag: '🇨🇳' },
    { code: 'CZK', name: 'Czech Koruna',           symbol: 'Kč',  flag: '🇨🇿' },
    { code: 'PLN', name: 'Polish Zloty',           symbol: 'zł',  flag: '🇵🇱' },
    { code: 'SEK', name: 'Swedish Krona',          symbol: 'kr',  flag: '🇸🇪' },
    { code: 'NOK', name: 'Norwegian Krone',        symbol: 'kr',  flag: '🇳🇴' },
    { code: 'DKK', name: 'Danish Krone',           symbol: 'kr',  flag: '🇩🇰' },
    { code: 'CAD', name: 'Canadian Dollar',        symbol: 'C$',  flag: '🇨🇦' },
    { code: 'AUD', name: 'Australian Dollar',      symbol: 'A$',  flag: '🇦🇺' },
    { code: 'NZD', name: 'New Zealand Dollar',     symbol: 'NZ$', flag: '🇳🇿' },
    { code: 'HKD', name: 'Hong Kong Dollar',       symbol: 'HK$', flag: '🇭🇰' },
    { code: 'SGD', name: 'Singapore Dollar',       symbol: 'S$',  flag: '🇸🇬' },
    { code: 'HUF', name: 'Hungarian Forint',       symbol: 'Ft',  flag: '🇭🇺' },
    { code: 'RON', name: 'Romanian Leu',           symbol: 'lei', flag: '🇷🇴' },
    { code: 'BGN', name: 'Bulgarian Lev',          symbol: 'лв',  flag: '🇧🇬' },
    { code: 'TRY', name: 'Turkish Lira',           symbol: '₺',   flag: '🇹🇷' },
    { code: 'BRL', name: 'Brazilian Real',         symbol: 'R$',  flag: '🇧🇷' },
    { code: 'MXN', name: 'Mexican Peso',           symbol: '$',   flag: '🇲🇽' },
    { code: 'ZAR', name: 'South African Rand',     symbol: 'R',   flag: '🇿🇦' },
    { code: 'INR', name: 'Indian Rupee',           symbol: '₹',   flag: '🇮🇳' },
    { code: 'KRW', name: 'South Korean Won',       symbol: '₩',   flag: '🇰🇷' },
    { code: 'IDR', name: 'Indonesian Rupiah',      symbol: 'Rp',  flag: '🇮🇩' },
    { code: 'MYR', name: 'Malaysian Ringgit',      symbol: 'RM',  flag: '🇲🇾' },
    { code: 'THB', name: 'Thai Baht',              symbol: '฿',   flag: '🇹🇭' },
    { code: 'PHP', name: 'Philippine Peso',        symbol: '₱',   flag: '🇵🇭' },
    { code: 'ILS', name: 'Israeli Shekel',         symbol: '₪',   flag: '🇮🇱' },
    { code: 'ISK', name: 'Icelandic Króna',        symbol: 'kr',  flag: '🇮🇸' },
    { code: 'GEL', name: 'Georgian Lari',          symbol: '₾',   flag: '🇬🇪' },
    { code: 'AMD', name: 'Armenian Dram',          symbol: '֏',   flag: '🇦🇲' },
    { code: 'AZN', name: 'Azerbaijani Manat',      symbol: '₼',   flag: '🇦🇿' },
    { code: 'KZT', name: 'Kazakhstani Tenge',      symbol: '₸',   flag: '🇰🇿' },
    { code: 'UAH', name: 'Ukrainian Hryvnia',      symbol: '₴',   flag: '🇺🇦' },
    { code: 'BYN', name: 'Belarusian Ruble',       symbol: 'Br',  flag: '🇧🇾' },
    { code: 'MDL', name: 'Moldovan Leu',           symbol: 'L',   flag: '🇲🇩' },
    { code: 'UZS', name: 'Uzbekistani Som',        symbol: 'сўм', flag: '🇺🇿' },
];

export const CURRENCY_MAP = Object.fromEntries(
    CURRENCIES.map(c => [c.code, c]),
) as Record<string, CurrencyInfo>;

export function getCurrencySymbol(code: string): string {
    return CURRENCY_MAP[code]?.symbol ?? code;
}

export function formatAmount(amount: number, currencyCode: string): string {
    const sym = getCurrencySymbol(currencyCode);
    const abs = Math.abs(amount).toLocaleString('ru-RU', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });
    return amount < 0 ? `−${sym} ${abs}` : `${sym} ${abs}`;
}
