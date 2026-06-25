CREATE SCHEMA IF NOT EXISTS auth;

-- Minimal auth.users table for validation purposes
CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL,
    raw_user_meta_data JSONB
);

-- Include the actual project schema
\i /home/freya/supersauced/docs/schema.sql
