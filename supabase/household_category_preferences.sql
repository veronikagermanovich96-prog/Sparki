-- Create household_category_preferences table
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS household_category_preferences (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid REFERENCES households(id) ON DELETE CASCADE,
  category_slug   text NOT NULL,
  expense_type    text NOT NULL CHECK (
    expense_type IN ('base','everyday','development','forself','work','other')
  ),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(household_id, category_slug)
);

-- Add onboarding_completed column to households
ALTER TABLE households ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;

-- Enable RLS (but allow all for now — dev mode)
ALTER TABLE household_category_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated users"
  ON household_category_preferences
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
