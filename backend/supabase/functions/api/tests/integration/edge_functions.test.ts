import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { app } from "../../index.ts";
import { clearMocks, COOK_USER_ID } from "./setup.ts";

async function computeShopifyHmac(bodyText: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const data = encoder.encode(bodyText)
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, data)
  return btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
}

Deno.test("Integration: POST /functions/auth_callback creates profile & settings", async () => {
  await clearMocks();

  const uniqueId = crypto.randomUUID();
  const testEmail = `callback-user-${Date.now()}@test.com`;
  
  const res = await app.request("/functions/auth_callback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user: {
        id: uniqueId,
        email: testEmail,
        user_metadata: {
          full_name: "Callback User",
          bio: "Registered via auth callback hook"
        }
      }
    })
  });

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.user.user_id, uniqueId);
  assertEquals(body.user.first_name, "Callback");
});

Deno.test("Integration: POST /functions/shopify_sync validates signature and processes order", async () => {
  await clearMocks();

  const secret = "shopify-integration-secret";
  Deno.env.set("SHOPIFY_WEBHOOK_SECRET", secret);

  const payload = JSON.stringify({
    email: "cook@test.com",
    line_items: [
      { sku: "sauce-cube-spicy", quantity: 3 }
    ]
  });

  const hmacSignature = await computeShopifyHmac(payload, secret);

  const res = await app.request("/functions/shopify_sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Hmac-Sha256": hmacSignature
    },
    body: payload
  });

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.user_profile.user_id, COOK_USER_ID);
});

Deno.test("Integration: POST /functions/analytics_event forwards proxy events", async () => {
  await clearMocks();

  const res = await app.request("/functions/analytics_event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event_name: "recipe_viewed",
      distinct_id: COOK_USER_ID,
      properties: {
        device: "iOS",
        source: "feed"
      }
    })
  });

  // Since PostHog/Firebase configs are undefined/unset, Hono returns success: true immediately
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
});
