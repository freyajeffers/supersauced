# Super Sauced Database Schema Analysis Summary

TL;DR: The schema provides fast, relational, and secure storage for users, recipes, ingredients, and steps, with GIN indexing, RLS, and cascade deletes.
This document summarizes the final backend architecture and database schema design for the Super Sauced MVP.

## Core Database Schema Design

The Super Sauced database schema is designed for speed, precision, and relational integrity. It consists of four main tables in the `public` schema, integrated with Supabase's `auth` schema:

1. **`user_profiles`**: Linked to `auth.users` via a foreign key `ON DELETE CASCADE`. It acts as the CRM engine tracking dietary preferences (`onboarding_survey` JSONB) and recipe cube inventory (`sauce_log` JSONB).
2. **`recipes`**: Stores the primary recipe library metadata, including arrays of `cube_tags` and `dietary_tags` for fast searching.
3. **`recipe_ingredients`**: Uses strict `NUMERIC(10,1)` for quantities to ensure exact scaling when serving sizes are adjusted.
4. **`recipe_steps`**: Defines the guided cooking process, supporting Cloudinary video streaming and deferred uniqueness on the step numbers.

---

## Architectural Mechanisms & Optimization

### 1. Speed to Meal Array Indexing

Generalized Inverted Indexes (GIN) are applied to `recipes.cube_tags` and `recipes.dietary_tags`. This supports rapid set intersection queries when filtering recipes by multiple dietary tags or product SKUs (e.g. finding recipes matching both "Vegan" and "Spicy Cube" in under 100ms).

### 2. Relational Integrity & Automatic Cascades

Foreign key constraints with `ON DELETE CASCADE` prevent orphaned records:

- Deleting a user in `auth.users` automatically deletes their `public.user_profiles` entry.
- Deleting a recipe in `public.recipes` automatically cascades to delete all ingredients in `public.recipe_ingredients` and steps in `public.recipe_steps`.

### 3. Deferrable Step Swapping

The unique constraint on `(recipe_id, step_number)` is configured as `DEFERRABLE INITIALLY DEFERRED`. This allows step numbers to be rearranged dynamically (e.g. swapping steps 1 and 2 in a transaction) without trigger or unique constraint violations.

---

## Security Verification (Row Level Security)

RLS policies are enforced on all tables:

- **`user_profiles`**: Restricted such that users can only select, insert, and update their own profile records.
- **`recipes`**, **`recipe_ingredients`**, **`recipe_steps`**: Standard users and anonymous traffic can only select records if `is_published` is true. Users with the `cms_editor` role claims in their JWT bypass this restriction to view draft content.

All functions and triggers are verified to run within expected performance thresholds and handle missing or null input gracefully.
