// user_onboarding.ts – Edge Function to initialize profile & settings on new user signup
import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { supabase, getJsonBody } from "./_deps.ts";

serve(async (req: Request) => {
  const secret = Deno.env.get("SUPABASE_AUTH_WEBHOOK_SECRET") ?? "";
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { "content-type": "application/json" } });
  }

  const payload = await getJsonBody(req);
  const user = payload.user;
  if (!user || !user.id) {
    return new Response(JSON.stringify({ error: "Missing user data" }), { status: 400, headers: { "content-type": "application/json" } });
  }

  const userId = user.id;
  const email = user.email || "";
  const profileInsert = supabase.from("user_profiles").upsert({ id: userId, email }, { onConflict: "id" });
  const settingsInsert = supabase.from("user_settings").upsert({ id: userId }, { onConflict: "id" });

  const [{ error: profileErr }, { error: settingsErr }] = await Promise.all([profileInsert, settingsInsert]);
  if (profileErr || settingsErr) {
    const msg = (profileErr?.message || "") + " " + (settingsErr?.message || "");
    return new Response(JSON.stringify({ error: msg.trim() }), { status: 500, headers: { "content-type": "application/json" } });
  }

  return new Response(JSON.stringify({ success: true, user_id: userId }), { status: 200, headers: { "content-type": "application/json" } });
});
