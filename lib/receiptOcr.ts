/**
 * Receipt OCR — extract amount, date, and merchant from receipt photo.
 * Uses free OCR.space API (25k requests/month free tier).
 */

interface OcrResult {
    amount: number | null;
    date: string | null;
    merchant: string | null;
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
        if (!text) return { amount: null, date: null, merchant: null, rawText: '' };

        return {
            amount: extractAmount(text),
            date: extractDate(text),
            merchant: extractMerchant(text),
            rawText: text,
        };
    } catch (e) {
        console.warn('OCR error:', e);
        return { amount: null, date: null, merchant: null, rawText: '' };
    }
}

// ── Amount extraction ───────────────────────────────────────────────────────

function extractAmount(text: string): number | null {
    const lines = text.split('\n');

    // Look for total/итого lines first (most reliable)
    for (const line of lines) {
        const lower = line.toLowerCase();
        if (/итого|итог|total|всего|к оплате|сумма|amount|subtotal/.test(lower)) {
            const match = line.match(/(\d[\d\s]*[.,]\d{2})/);
            if (match) {
                const val = parseFloat(match[1].replace(/\s/g, '').replace(',', '.'));
                if (val > 0) return val;
            }
        }
    }

    // Fallback: find the largest number with 2 decimal places
    const amounts: number[] = [];
    const regex = /(\d[\d\s]*[.,]\d{2})/g;
    let m;
    while ((m = regex.exec(text)) !== null) {
        const val = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
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
