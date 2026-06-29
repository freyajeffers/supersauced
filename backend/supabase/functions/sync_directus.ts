// sync_directus.ts – Edge Function to sync Directus content via webhook
import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { supabase, getJsonBody } from "./_deps.ts";

serve(async (req: Request) => {
  const secret = Deno.env.get("DIRECTUS_WEBHOOK_SECRET") ?? "";
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { "content-type": "application/json" } });
  }
  const payload = await getJsonBody(req);
  const { collection, data } = payload;
  if (!collection || !data) {
    return new Response(JSON.stringify({ error: "Missing payload" }), { status: 400, headers: { "content-type": "application/json" } });
  }
  const tableMap: Record<string, string> = {
    "recipes": "recipes",
    "products": "products",
    "categories": "categories",
  };
  const table = tableMap[collection];
  if (!table) {
    return new Response(JSON.stringify({ error: "Unsupported collection" }), { status: 400, headers: { "content-type": "application/json" } });
  }
  const { error } = await supabase.from(table).upsert(data, { onConflict: "id" });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "content-type": "application/json" } });
  }
  return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "content-type": "application/json" } });
});
