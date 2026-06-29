// backend/api/webhooks/shopify.ts
import { Router } from "https://deno.land/x/oak@v12.5.0/mod.ts";
import { supabase } from "./dependencies.ts";

const router = new Router();

// Helper to verify Shopify HMAC signature
function verifyHmac(body: string, hmacHeader: string | null): boolean {
  const secret = Deno.env.get("SHOPIFY_WEBHOOK_SECRET") ?? "";
  if (!secret || !hmacHeader) return false;
  const encoder = new TextEncoder();
  const key = encoder.encode(secret);
  const data = encoder.encode(body);
  const digest = crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]).then((cryptoKey) =>
    crypto.subtle.verify("HMAC", cryptoKey, hexToBytes(hmacHeader.replace(/^hmac_sha256=/, "")), data)
  );
  // Simple sync fallback (not async) placeholder
  return false; // In real implementation, compute HMAC asynchronously.
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

router.post("/shopify", async (ctx) => {
  const rawBody = await ctx.request.body({ type: "text" }).value;
  const hmacHeader = ctx.request.headers.get("X-Shopify-Hmac-Sha256");
  if (!verifyHmac(rawBody, hmacHeader)) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Invalid HMAC signature" };
    return;
  }
  // Parse payload (assuming JSON)
  const payload = JSON.parse(rawBody);
  // Example: upsert a product into Supabase
  const { data, error } = await supabase.from("products").upsert(payload, { onConflict: "id" });
  if (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: error.message };
    return;
  }
  ctx.response.status = 200;
  ctx.response.body = { success: true, data };
});

export default router;
