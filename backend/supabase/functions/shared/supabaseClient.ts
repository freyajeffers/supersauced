import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8'
import { Database } from './database.types.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
