# Database Migrations

This directory contains SQL migrations for the Indecisive Eater database.

## Running Migrations on Railway

### Option 1: Using Railway CLI
```bash
railway run mysql -h <host> -u <user> -p<password> <database> < migrations/001_add_price_level.sql
```

### Option 2: Using Railway Dashboard
1. Go to your Railway project
2. Click on your MySQL database
3. Click "Connect" and copy connection details
4. Use a MySQL client to connect
5. Run the SQL files in order

### Option 3: Direct SQL Execution
Connect to Railway MySQL and run:
```sql
ALTER TABLE places ADD COLUMN IF NOT EXISTS price_level INT NULL AFTER rating;
```

## Migration Order

Run migrations in numeric order:
1. `001_add_price_level.sql` - Adds price_level column to places table

## After Running Migration

Restart your Railway app service so the backend picks up the schema changes.
