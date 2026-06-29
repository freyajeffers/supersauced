// backend/api/auth.ts
import { Router } from "https://deno.land/x/oak@v12.5.0/mod.ts";
import { supabase } from "./dependencies.ts";

const router = new Router();

// Sign‑up endpoint
router.post("/signup", async (ctx) => {
  const { email, password } = await ctx.request.body({ type: "json" }).value;
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    ctx.response.status = 400;
    ctx.response.body = { error: error.message };
    return;
  }
  ctx.response.status = 200;
  ctx.response.body = { user: data.user };
});

// Login endpoint
router.post("/login", async (ctx) => {
  const { email, password } = await ctx.request.body({ type: "json" }).value;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    ctx.response.status = 400;
    ctx.response.body = { error: error.message };
    return;
  }
  ctx.response.status = 200;
  ctx.response.body = { access_token: data.session?.access_token };
});

// Password reset request (sends email)
router.post("/reset-password", async (ctx) => {
  const { email } = await ctx.request.body({ type: "json" }).value;
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: Deno.env.get("RESET_PASSWORD_REDIRECT_URL") ?? "http://localhost:3000/reset",
  });
  if (error) {
    ctx.response.status = 400;
    ctx.response.body = { error: error.message };
    return;
  }
  ctx.response.status = 200;
  ctx.response.body = { message: "Password reset email sent" };
});

export default router;
