// backend/api/analytics.ts
import { Router } from "https://deno.land/x/oak@v12.5.0/mod.ts";

const router = new Router();

// Simple endpoint to receive analytics events and forward to Firebase Analytics (stub)
router.post("/event", async (ctx) => {
  const payload = await ctx.request.body({ type: "json" }).value;
  // In a real implementation, you would call Firebase Analytics REST API or use the SDK.
  console.log("Received analytics event:", JSON.stringify(payload));
  ctx.response.status = 200;
  ctx.response.body = { received: true };
});

export default router;
