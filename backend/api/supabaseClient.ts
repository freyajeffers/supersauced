// backend/api/supabaseClient.ts
// Deno-compatible Supabase client using CDN import
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.38.0/mod.ts";
import type { Database } from "../..//database.types.ts"; // Adjust path as needed

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
