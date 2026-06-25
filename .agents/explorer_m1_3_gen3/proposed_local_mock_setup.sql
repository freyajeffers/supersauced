-- =========================================================================
-- LOCAL DEVELOPMENT MOCK SETUP (DO NOT RUN IN PRODUCTION)
-- =========================================================================

-- Create auth schema
CREATE SCHEMA IF NOT EXISTS auth;

-- Create auth.users table mock
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  raw_user_meta_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Mock the auth.uid() function for RLS policy compilation
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT null::UUID;
$$;
