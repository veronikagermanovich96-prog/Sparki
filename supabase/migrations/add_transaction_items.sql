-- Migration: Add split transaction support
-- Run this in Supabase Dashboard → SQL Editor

-- 1. Add is_split flag to transactions
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS is_split boolean DEFAULT false;

-- 2. Create transaction_items table for split line items
CREATE TABLE IF NOT EXISTS public.transaction_items (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    transaction_id  uuid REFERENCES public.transactions(id) ON DELETE CASCADE NOT NULL,
    category_id     uuid REFERENCES public.categories(id) ON DELETE SET NULL,
    tag_id          uuid,
    amount          numeric(12,2) NOT NULL,
    amount_base     numeric(12,2),
    note            text,
    sort_order      int DEFAULT 0,
    created_at      timestamptz DEFAULT now()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_transaction_items_tx ON public.transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_cat ON public.transaction_items(category_id);

-- 4. RLS (disabled for dev, same as other tables)
ALTER TABLE public.transaction_items DISABLE ROW LEVEL SECURITY;
