-- supabase/migrations/fuel_enhancements.sql
-- Fuel module schema additions.
-- Run in Supabase SQL editor.

-- Add delivery_note column to fuel_deliveries (stores delivery note / invoice reference)
ALTER TABLE fuel_deliveries
  ADD COLUMN IF NOT EXISTS delivery_note TEXT;
