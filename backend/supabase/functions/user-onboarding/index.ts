import { withSupabase } from 'npm:@supabase/server'

export default {
  fetch: withSupabase({ auth: 'none' }, async (req, ctx) => {
    // 1. Verify Supabase Auth Webhook Secret
    const secret = Deno.env.get("SUPABASE_AUTH_WEBHOOK_SECRET") ?? "";
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

    const user = payload.user;
    if (!user || !user.id) {
      return Response.json({ error: "Missing user data" }, { status: 400 });
    }

    const userId = user.id;
    const email = user.email || "";

    // 3. Initialize user profile & default settings using ctx.supabaseAdmin (bypasses RLS)
    const profileInsert = ctx.supabaseAdmin.from("user_profiles").upsert({ user_id: userId, email }, { onConflict: "user_id" });
    const settingsInsert = ctx.supabaseAdmin.from("user_settings").upsert({ user_id: userId }, { onConflict: "user_id" });

    const [{ error: profileErr }, { error: settingsErr }] = await Promise.all([profileInsert, settingsInsert]);
    if (profileErr || settingsErr) {
      const msg = (profileErr?.message || "") + " " + (settingsErr?.message || "");
      return Response.json({ error: msg.trim() }, { status: 500 });
    }

    return Response.json({ success: true, user_id: userId });
  }),
}
