# Super Sauced Database Architecture

@agent You are an expert full-stack developer. Below is the PostgreSQL schema for "Super Sauced", a recipe and meal-prep platform. 

## Your Tasks:
1. If the Supabase MCP is connected, execute the attached `schema.sql` to provision the database.
2. Generate the TypeScript interfaces/types for all of these tables.
3. Set up the ORM models (or Supabase client types) based on this schema.
4. Create the Row Level Security (RLS) policies for the `user_profiles` and `saved_recipes` tables so users can only access their own data.

## Context Notes:
- The `users` table references Supabase's native `auth.users`.
- Media assets are stored in Cloudinary; the database only stores the reference URLs/IDs.
- All IDs should be UUIDs.
