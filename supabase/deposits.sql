-- Deposits: separate deposit accounts with variable rate history
-- Run in Supabase SQL Editor

-- Drop old tables if they exist (from previous implementation)
DROP TABLE IF EXISTS deposit_rate_history;

-- Deposit accounts (separate from regular accounts)
CREATE TABLE IF NOT EXISTS deposit_accounts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id     uuid REFERENCES households(id),
  name             text NOT NULL,
  icon             text DEFAULT 'Landmark',
  color            text DEFAULT '#7C6FFF',
  amount           numeric(15,2) NOT NULL,
  currency         text NOT NULL,
  capitalization   text NOT NULL DEFAULT 'monthly' CHECK (capitalization IN ('monthly', 'yearly')),
  start_date       date NOT NULL,
  end_date         date,
  is_active        boolean DEFAULT true,
  created_at       timestamptz DEFAULT now()
);

-- Rate periods (variable rates over time)
CREATE TABLE IF NOT EXISTS deposit_rate_periods (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_id       uuid REFERENCES deposit_accounts(id) ON DELETE CASCADE,
  rate             numeric(5,2) NOT NULL,
  from_date        date NOT NULL,
  to_date          date,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_periods_deposit
  ON deposit_rate_periods (deposit_id, from_date);
