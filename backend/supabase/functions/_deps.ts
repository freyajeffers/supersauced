// _deps.ts – shared Supabase client for Edge Functions
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "https://your-project.supabase.co";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "YOUR_SERVICE_ROLE_KEY";

export const supabase = createClient(supabaseUrl, serviceRoleKey);

// Helper to safely parse JSON request bodies
export async function getJsonBody(request: Request): Promise<any> {
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) return await request.json();
  const txt = await request.text();
  try { return JSON.parse(txt); } catch { return {}; }
}
