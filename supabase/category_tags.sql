-- ============================================================
-- Category Tags
-- Run in Supabase SQL Editor
-- ============================================================

-- Tags table (sub-labels per category)
CREATE TABLE public.category_tags (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    household_id uuid REFERENCES public.households(id) ON DELETE CASCADE,
    category_id  uuid REFERENCES public.categories(id)  ON DELETE CASCADE NOT NULL,
    name         text NOT NULL,
    sort_order   int  DEFAULT 0,
    created_at   timestamptz DEFAULT now()
);

-- Link from transaction to a tag (optional)
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS tag_id uuid REFERENCES public.category_tags(id) ON DELETE SET NULL;

-- RLS (if you already ran rls.sql)
ALTER TABLE public.category_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "category_tags_all" ON public.category_tags
    FOR ALL USING (
        household_id = get_my_household_id()
        OR household_id IS NULL
    );

-- Seed some default tags for common system categories
-- (replace UUIDs with real category IDs from your DB)
-- INSERT INTO public.category_tags (category_id, name) VALUES (...);
