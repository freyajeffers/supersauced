import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { app } from "../../index.ts";
import { clearMocks, getAuthHeaderForUser, CHEF_USER_ID, COOK_USER_ID } from "./setup.ts";

Deno.test("Integration: GET /subscriptions access rights", async () => {
  clearMocks();

  // 1. Regular user gets 403
  const cookAuthHeader = await getAuthHeaderForUser(COOK_USER_ID, "authenticated", "cook@test.com");
  const res1 = await app.request("/subscriptions", {
    method: "GET",
    headers: {
      "Authorization": cookAuthHeader
    }
  });
  assertEquals(res1.status, 403);

  // 2. Admin user gets 200
  const adminAuthHeader = await getAuthHeaderForUser(CHEF_USER_ID, "admin", "admin@test.com");
  const res2 = await app.request("/subscriptions", {
    method: "GET",
    headers: {
      "Authorization": adminAuthHeader
    }
  });
  assertEquals(res2.status, 200);
});

Deno.test("Integration: POST /subscriptions/webhook processes RevenueCat events", async () => {
  clearMocks();

  Deno.env.set("REVENUECAT_WEBHOOK_SECRET", "rc-integration-secret");

  const res = await app.request("/subscriptions/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer rc-integration-secret"
    },
    body: JSON.stringify({
      event: {
        type: "INITIAL_PURCHASE",
        app_user_id: COOK_USER_ID,
        entitlement_id: "premium_entitlement",
        product_id: "premium_monthly",
        expiration_at_ms: Date.now() + 30 * 86400 * 1000
      }
    })
  });

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.user_id, COOK_USER_ID);
  assertEquals(body.subscription_active, true);
});
