// backend/api/recipes/recipes.ts
import { Router } from "https://deno.land/x/oak@v12.5.0/mod.ts";
import { supabase } from "../dependencies.ts";

const router = new Router();

// Create a recipe
router.post("/", async (ctx) => {
  const { user } = ctx.state;
  const payload = await ctx.request.body({ type: "json" }).value;
  const { data, error } = await supabase.from("recipes").insert({
    ...payload,
    user_id: user.id,
  });
  if (error) {
    ctx.response.status = 400;
    ctx.response.body = { error: error.message };
    return;
  }
  ctx.response.status = 201;
  ctx.response.body = data[0];
});

// Read all recipes for the current user
router.get("/", async (ctx) => {
  const { user } = ctx.state;
  const { data, error } = await supabase.from("recipes").select("*").eq("user_id", user.id);
  if (error) {
    ctx.response.status = 400;
    ctx.response.body = { error: error.message };
    return;
  }
  ctx.response.status = 200;
  ctx.response.body = data;
});

// Update a recipe
router.put("/:id", async (ctx) => {
  const { user } = ctx.state;
  const id = ctx.params.id;
  const payload = await ctx.request.body({ type: "json" }).value;
  const { data, error } = await supabase.from("recipes").update(payload).eq("id", id).eq("user_id", user.id);
  if (error) {
    ctx.response.status = 400;
    ctx.response.body = { error: error.message };
    return;
  }
  ctx.response.status = 200;
  ctx.response.body = data[0];
});

// Delete a recipe
router.delete("/:id", async (ctx) => {
  const { user } = ctx.state;
  const id = ctx.params.id;
  const { error } = await supabase.from("recipes").delete().eq("id", id).eq("user_id", user.id);
  if (error) {
    ctx.response.status = 400;
    ctx.response.body = { error: error.message };
    return;
  }
  ctx.response.status = 204;
});

export default router;
