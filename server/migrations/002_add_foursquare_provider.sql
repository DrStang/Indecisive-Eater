-- Migration: Add foursquare to provider columns
-- Run this on Railway database to fix the schema

-- Update places table provider column to support foursquare
-- First check if it's an ENUM and modify it, or if VARCHAR ensure it's large enough

-- Option 1: If provider is ENUM type, modify it
ALTER TABLE places
MODIFY COLUMN provider ENUM('google', 'yelp', 'osm', 'foursquare') NOT NULL;

-- Option 2: If provider is VARCHAR, ensure it's at least 20 chars (uncomment if needed)
-- ALTER TABLE places MODIFY COLUMN provider VARCHAR(20) NOT NULL;

-- Also update decision_history_v2 if it has a provider column with same issue
ALTER TABLE decision_history_v2
MODIFY COLUMN provider ENUM('google', 'yelp', 'osm', 'foursquare') NOT NULL;

-- Alternative for VARCHAR (uncomment if needed):
-- ALTER TABLE decision_history_v2 MODIFY COLUMN provider VARCHAR(20) NOT NULL;
