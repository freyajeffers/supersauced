import { withSupabase } from 'npm:@supabase/server'

export default {
  fetch: withSupabase({ auth: 'none' }, async (req, ctx) => {
    // 1. Verify Directus Webhook Secret
    const secret = Deno.env.get("DIRECTUS_WEBHOOK_SECRET") ?? "";
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "Invalid token" }, { status: 401 });
    }

    // 2. Parse Payload
    let payload;
    try {
      payload = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { collection, data } = payload;
    if (!collection || !data) {
      return Response.json({ error: "Missing payload" }, { status: 400 });
    }

    const tableMap: Record<string, string> = {
      "recipes": "recipes",
      "products": "products",
      "categories": "categories",
    };
    const table = tableMap[collection];
    if (!table) {
      return Response.json({ error: "Unsupported collection" }, { status: 400 });
    }

    // 3. Upsert using ctx.supabaseAdmin (bypasses RLS since this is CMS sync)
    const { error } = await ctx.supabaseAdmin.from(table).upsert(data, { onConflict: "id" });
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });
  }),
}
