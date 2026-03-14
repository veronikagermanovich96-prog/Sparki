-- Loans/Credits table
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS loans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id     uuid REFERENCES households(id),
  name             text NOT NULL,
  icon             text DEFAULT 'Home',
  color            text DEFAULT '#FF6B6B',
  loan_type        text NOT NULL DEFAULT 'other' CHECK (loan_type IN ('mortgage', 'auto', 'consumer', 'other')),
  custom_type_name text,
  total_amount     numeric(15,2) NOT NULL,
  paid_amount      numeric(15,2) NOT NULL DEFAULT 0,
  currency         text NOT NULL,
  payment_type     text NOT NULL DEFAULT 'annuity' CHECK (payment_type IN ('annuity', 'differentiated')),
  start_date       date NOT NULL,
  end_date         date NOT NULL,
  payment_account_id uuid REFERENCES accounts(id),
  source_account_id  uuid REFERENCES accounts(id),
  recurring_id     uuid REFERENCES recurring_payments(id),
  is_active        boolean DEFAULT true,
  created_at       timestamptz DEFAULT now()
);

-- Loan rate periods (variable rates over time)
CREATE TABLE IF NOT EXISTS loan_rate_periods (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id          uuid REFERENCES loans(id) ON DELETE CASCADE,
  rate             numeric(5,2) NOT NULL,
  from_date        date NOT NULL,
  to_date          date,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loan_rate_periods_loan
  ON loan_rate_periods (loan_id, from_date);
