-- Add tag_id support to budgets table for subcategory limits
-- Run in Supabase SQL Editor

ALTER TABLE public.budgets
    ADD COLUMN IF NOT EXISTS tag_id uuid REFERENCES public.category_tags(id) ON DELETE CASCADE;

-- Allow one budget per category+tag combination
CREATE UNIQUE INDEX IF NOT EXISTS budgets_cat_tag_idx
    ON public.budgets (household_id, category_id, tag_id)
    WHERE tag_id IS NOT NULL;
