import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExportRow {
    date: string;
    type: string;
    expense_type: string;
    amount: string;
    currency: string;
    amount_base: string;
    base_currency: string;
    account: string;
    category: string;
    note: string;
    recurring: string;
}

export interface ImportRow {
    raw: string[];           // original parsed cells
    mapped: Partial<ExportRow>; // after column mapping
    error?: string;          // validation error
}

export type ColumnKey = keyof ExportRow | '__skip__';

export const CSV_COLUMNS: { key: ColumnKey; label: string; required: boolean }[] = [
    { key: 'date',          label: 'Дата',             required: true  },
    { key: 'type',          label: 'Тип',              required: true  },
    { key: 'expense_type',  label: 'Тип расхода',      required: false },
    { key: 'amount',        label: 'Сумма',            required: true  },
    { key: 'currency',      label: 'Валюта',           required: true  },
    { key: 'amount_base',   label: 'Сумма (база)',     required: false },
    { key: 'base_currency', label: 'Базовая валюта',   required: false },
    { key: 'account',       label: 'Счёт',             required: true  },
    { key: 'category',      label: 'Категория',        required: false },
    { key: 'note',          label: 'Заметка',          required: false },
    { key: 'recurring',     label: 'Рекуррентный',     required: false },
    { key: '__skip__',      label: 'Пропустить',       required: false },
];

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function escapeCell(v: string): string {
    if (v.includes(',') || v.includes('"') || v.includes('\n')) {
        return '"' + v.replace(/"/g, '""') + '"';
    }
    return v;
}

export function parseCSV(text: string): string[][] {
    const rows: string[][] = [];
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    for (const line of lines) {
        if (!line.trim()) continue;
        const cells: string[] = [];
        let i = 0;
        while (i < line.length) {
            if (line[i] === '"') {
                let val = '';
                i++;
                while (i < line.length) {
                    if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2; }
                    else if (line[i] === '"') { i++; break; }
                    else { val += line[i++]; }
                }
                cells.push(val);
                if (line[i] === ',') i++;
            } else {
                const end = line.indexOf(',', i);
                if (end === -1) { cells.push(line.slice(i)); break; }
                cells.push(line.slice(i, end));
                i = end + 1;
            }
        }
        rows.push(cells);
    }
    return rows;
}

// auto-detect column mapping from header row
export function autoDetectMapping(headers: string[]): ColumnKey[] {
    const aliases: Record<string, ColumnKey> = {
        'date': 'date', 'дата': 'date',
        'type': 'type', 'тип': 'type',
        'expense_type': 'expense_type', 'тип расхода': 'expense_type', 'тип расходов': 'expense_type',
        'amount': 'amount', 'сумма': 'amount',
        'currency': 'currency', 'валюта': 'currency',
        'amount_base': 'amount_base', 'сумма (база)': 'amount_base', 'сумма база': 'amount_base',
        'base_currency': 'base_currency', 'базовая валюта': 'base_currency',
        'account': 'account', 'счёт': 'account', 'счет': 'account',
        'category': 'category', 'категория': 'category',
        'note': 'note', 'заметка': 'note', 'примечание': 'note',
        'recurring': 'recurring', 'рекуррентный': 'recurring',
    };
    return headers.map(h => aliases[h.trim().toLowerCase()] ?? '__skip__');
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function exportTransactions(opts: {
    householdId: string;
    baseCurrency: string;
    from: string | null;
    to: string | null;
    format: 'csv' | 'json';
}): Promise<void> {
    let q = supabase
        .from('transactions')
        .select('date, type, expense_type, amount, currency, amount_base, note, recurring_id, accounts(name), categories(name)')
        .eq('household_id', opts.householdId)
        .eq('is_deleted', false)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(10000);

    if (opts.from) q = q.gte('date', opts.from);
    if (opts.to)   q = q.lte('date', opts.to);

    const { data, error } = await q;
    if (error || !data) throw new Error(error?.message ?? 'Ошибка загрузки данных');

    const rows = data.map((t: any): ExportRow => ({
        date:          t.date,
        type:          t.type,
        expense_type:  t.expense_type ?? '',
        amount:        String(t.amount),
        currency:      t.currency,
        amount_base:   String(t.amount_base ?? t.amount),
        base_currency: opts.baseCurrency,
        account:       t.accounts?.name ?? '',
        category:      t.categories?.name ?? '',
        note:          t.note ?? '',
        recurring:     t.recurring_id ? 'yes' : '',
    }));

    const fileName = `transactions_${new Date().toISOString().slice(0, 10)}`;

    if (opts.format === 'json') {
        const content = JSON.stringify(rows, null, 2);
        const path = `${FileSystem.cacheDirectory}${fileName}.json`;
        await FileSystem.writeAsStringAsync(path, content, { encoding: FileSystem.EncodingType.UTF8 });
        await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: 'Экспорт транзакций' });
    } else {
        const header = Object.keys(rows[0] ?? {}) as (keyof ExportRow)[];
        const csvLines = [
            header.join(','),
            ...rows.map(r => header.map(k => escapeCell(String(r[k]))).join(',')),
        ];
        const content = csvLines.join('\n');
        const path = `${FileSystem.cacheDirectory}${fileName}.csv`;
        await FileSystem.writeAsStringAsync(path, content, { encoding: FileSystem.EncodingType.UTF8 });
        await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Экспорт транзакций' });
    }
}

// ─── Import ───────────────────────────────────────────────────────────────────

export async function pickCSVFile(): Promise<{ headers: string[]; rows: string[][] } | null> {
    const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.[0]) return null;
    const uri = result.assets[0].uri;
    const text = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
    const parsed = parseCSV(text);
    if (parsed.length < 2) throw new Error('Файл пустой или содержит только заголовок');

    return { headers: parsed[0], rows: parsed.slice(1) };
}

export interface ValidationResult {
    valid: ImportRow[];
    errors: ImportRow[];
}

export function validateRows(
    rows: string[][],
    mapping: ColumnKey[],
    accounts: { id: string; name: string }[],
    categories: { id: string; name: string }[],
): ValidationResult {
    const valid: ImportRow[] = [];
    const errors: ImportRow[] = [];

    const accountMap: Record<string, string> = {};
    for (const a of accounts) accountMap[a.name.toLowerCase()] = a.id;
    const categoryMap: Record<string, string> = {};
    for (const c of categories) categoryMap[c.name.toLowerCase()] = c.id;

    for (const raw of rows) {
        const mapped: Partial<ExportRow> = {};
        for (let i = 0; i < mapping.length; i++) {
            const key = mapping[i];
            if (key !== '__skip__') mapped[key] = (raw[i] ?? '').trim();
        }

        const row: ImportRow = { raw, mapped };

        // Validate required fields
        if (!mapped.date || !/^\d{4}-\d{2}-\d{2}$/.test(mapped.date)) {
            errors.push({ ...row, error: `Некорректная дата: "${mapped.date}"` }); continue;
        }
        if (!['income', 'expense', 'transfer'].includes(mapped.type ?? '')) {
            errors.push({ ...row, error: `Неверный тип: "${mapped.type}" (income/expense/transfer)` }); continue;
        }
        const amt = parseFloat(mapped.amount ?? '');
        if (isNaN(amt) || amt <= 0) {
            errors.push({ ...row, error: `Некорректная сумма: "${mapped.amount}"` }); continue;
        }
        if (!mapped.currency || mapped.currency.length !== 3) {
            errors.push({ ...row, error: `Некорректная валюта: "${mapped.currency}"` }); continue;
        }
        if (mapped.account && !accountMap[mapped.account.toLowerCase()]) {
            errors.push({ ...row, error: `Счёт не найден: "${mapped.account}"` }); continue;
        }

        valid.push(row);
    }

    return { valid, errors };
}

export async function importRows(
    rows: ImportRow[],
    mapping: ColumnKey[],
    householdId: string,
    userId: string,
    accounts: { id: string; name: string }[],
    categories: { id: string; name: string }[],
): Promise<{ inserted: number; failed: number }> {
    const accountMap: Record<string, string> = {};
    for (const a of accounts) accountMap[a.name.toLowerCase()] = a.id;
    const categoryMap: Record<string, string> = {};
    for (const c of categories) categoryMap[c.name.toLowerCase()] = c.id;

    const toInsert = rows.map(r => {
        const m = r.mapped;
        return {
            household_id: householdId,
            user_id:      userId,
            account_id:   accountMap[m.account?.toLowerCase() ?? ''] ?? null,
            category_id:  categoryMap[m.category?.toLowerCase() ?? ''] ?? null,
            type:         m.type,
            expense_type: m.expense_type || null,
            amount:       parseFloat(m.amount ?? '0'),
            currency:     m.currency ?? 'EUR',
            amount_base:  parseFloat(m.amount_base ?? m.amount ?? '0') || null,
            exchange_rate: null,
            note:         m.note || null,
            date:         m.date,
            is_deleted:   false,
        };
    }).filter(r => r.account_id);

    if (!toInsert.length) return { inserted: 0, failed: rows.length };

    // batch insert in chunks of 100
    let inserted = 0;
    let failed = 0;
    for (let i = 0; i < toInsert.length; i += 100) {
        const chunk = toInsert.slice(i, i + 100);
        const { error } = await supabase.from('transactions').insert(chunk);
        if (error) failed += chunk.length;
        else inserted += chunk.length;
    }
    return { inserted, failed };
}
