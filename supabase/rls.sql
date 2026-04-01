-- ============================================================
-- RLS Setup for Finance App
-- Run this in Supabase SQL Editor
-- ============================================================

-- Helper: get current user's household_id (bypasses RLS via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_my_household_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT household_id
  FROM public.household_members
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- Fix handle_new_user search_path warning
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_household_id uuid;
BEGIN
  INSERT INTO public.households (name, base_currency)
  VALUES ('Мой бюджет', 'EUR')
  RETURNING id INTO new_household_id;

  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (new_household_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;

-- ── households ──────────────────────────────────────────────
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "households_select" ON public.households;
DROP POLICY IF EXISTS "households_update" ON public.households;
CREATE POLICY "households_select" ON public.households
  FOR SELECT USING (id = get_my_household_id());
CREATE POLICY "households_update" ON public.households
  FOR UPDATE USING (id = get_my_household_id());

-- ── household_members ────────────────────────────────────────
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "household_members_select" ON public.household_members;
DROP POLICY IF EXISTS "household_members_insert" ON public.household_members;
CREATE POLICY "household_members_select" ON public.household_members
  FOR SELECT USING (household_id = get_my_household_id());
CREATE POLICY "household_members_insert" ON public.household_members
  FOR INSERT WITH CHECK (true);

-- ── accounts ─────────────────────────────────────────────────
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "accounts_all" ON public.accounts;
CREATE POLICY "accounts_all" ON public.accounts
  FOR ALL USING (household_id = get_my_household_id());

-- ── categories ───────────────────────────────────────────────
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories_select" ON public.categories;
DROP POLICY IF EXISTS "categories_insert" ON public.categories;
DROP POLICY IF EXISTS "categories_update" ON public.categories;
DROP POLICY IF EXISTS "categories_delete" ON public.categories;
CREATE POLICY "categories_select" ON public.categories
  FOR SELECT USING (household_id IS NULL OR household_id = get_my_household_id());
CREATE POLICY "categories_insert" ON public.categories
  FOR INSERT WITH CHECK (household_id = get_my_household_id());
CREATE POLICY "categories_update" ON public.categories
  FOR UPDATE USING (household_id = get_my_household_id());
CREATE POLICY "categories_delete" ON public.categories
  FOR DELETE USING (household_id = get_my_household_id());

-- ── transactions ─────────────────────────────────────────────
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transactions_all" ON public.transactions;
CREATE POLICY "transactions_all" ON public.transactions
  FOR ALL USING (household_id = get_my_household_id());

-- ── transfers ────────────────────────────────────────────────
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transfers_all" ON public.transfers;
CREATE POLICY "transfers_all" ON public.transfers
  FOR ALL USING (household_id = get_my_household_id());

-- ── recurring_payments ───────────────────────────────────────
ALTER TABLE public.recurring_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recurring_payments_all" ON public.recurring_payments;
CREATE POLICY "recurring_payments_all" ON public.recurring_payments
  FOR ALL USING (household_id = get_my_household_id());

-- ── budgets ──────────────────────────────────────────────────
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "budgets_all" ON public.budgets;
CREATE POLICY "budgets_all" ON public.budgets
  FOR ALL USING (household_id = get_my_household_id());

-- ── savings_goals ────────────────────────────────────────────
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "savings_goals_all" ON public.savings_goals;
CREATE POLICY "savings_goals_all" ON public.savings_goals
  FOR ALL USING (household_id = get_my_household_id());

-- ── currency_rates_cache ─────────────────────────────────────
ALTER TABLE public.currency_rates_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "currency_rates_select" ON public.currency_rates_cache;
DROP POLICY IF EXISTS "currency_rates_insert" ON public.currency_rates_cache;
DROP POLICY IF EXISTS "currency_rates_update" ON public.currency_rates_cache;
CREATE POLICY "currency_rates_select" ON public.currency_rates_cache
  FOR SELECT USING (true);
CREATE POLICY "currency_rates_insert" ON public.currency_rates_cache
  FOR INSERT WITH CHECK (true);
CREATE POLICY "currency_rates_update" ON public.currency_rates_cache
  FOR UPDATE USING (true);

-- ── transaction_items ───────────────────────────────────────
ALTER TABLE public.transaction_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transaction_items_all" ON public.transaction_items;
CREATE POLICY "transaction_items_all" ON public.transaction_items
  FOR ALL USING (
    transaction_id IN (
      SELECT id FROM public.transactions
      WHERE household_id = get_my_household_id()
    )
  );

-- ── category_tags ───────────────────────────────────────────
ALTER TABLE public.category_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "category_tags_all" ON public.category_tags;
CREATE POLICY "category_tags_all" ON public.category_tags
  FOR ALL USING (
    category_id IN (
      SELECT id FROM public.categories
      WHERE household_id = get_my_household_id() OR household_id IS NULL
    )
  );

-- ── category_extras ─────────────────────────────────────────
ALTER TABLE public.category_extras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "category_extras_all" ON public.category_extras;
CREATE POLICY "category_extras_all" ON public.category_extras
  FOR ALL USING (household_id = get_my_household_id());

-- ── household_category_preferences ──────────────────────────
ALTER TABLE public.household_category_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "household_category_preferences_all" ON public.household_category_preferences;
CREATE POLICY "household_category_preferences_all" ON public.household_category_preferences
  FOR ALL USING (household_id = get_my_household_id());

-- ── loyalty_cards ───────────────────────────────────────────
ALTER TABLE public.loyalty_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loyalty_cards_all" ON public.loyalty_cards;
CREATE POLICY "loyalty_cards_all" ON public.loyalty_cards
  FOR ALL USING (household_id = get_my_household_id());

-- ── deposit_accounts ────────────────────────────────────────
ALTER TABLE public.deposit_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deposit_accounts_all" ON public.deposit_accounts;
CREATE POLICY "deposit_accounts_all" ON public.deposit_accounts
  FOR ALL USING (household_id = get_my_household_id());

-- ── deposit_transactions ────────────────────────────────────
ALTER TABLE public.deposit_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deposit_transactions_all" ON public.deposit_transactions;
CREATE POLICY "deposit_transactions_all" ON public.deposit_transactions
  FOR ALL USING (
    deposit_id IN (
      SELECT id FROM public.deposit_accounts
      WHERE household_id = get_my_household_id()
    )
  );

-- ── loans ───────────────────────────────────────────────────
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loans_all" ON public.loans;
CREATE POLICY "loans_all" ON public.loans
  FOR ALL USING (household_id = get_my_household_id());
