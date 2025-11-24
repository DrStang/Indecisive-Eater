-- Migration: Add price_level column to places table
-- Run this on Railway database to fix the schema

ALTER TABLE places
ADD COLUMN IF NOT EXISTS price_level INT NULL
AFTER rating;

-- Note: price_level values from Google Places API:
-- 0 = Free
-- 1 = Inexpensive ($)
-- 2 = Moderate ($$)
-- 3 = Expensive ($$$)
-- 4 = Very Expensive ($$$$)
