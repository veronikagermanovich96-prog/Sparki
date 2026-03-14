-- Add spending_limit_period column to accounts table
-- Values: 'daily', 'weekly', 'monthly', 'yearly'
-- Default 'monthly' for backward compatibility with existing limits
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS spending_limit_period text DEFAULT 'monthly';
