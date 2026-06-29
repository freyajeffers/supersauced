import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { app } from "../../index.ts";
import { overrideClients, overrideAuth } from "../../deps.ts";
import { MockSupabaseClient } from "./client_mock.ts";

Deno.test("GET /subscriptions - list tiers success for admin", async () => {
  const mockSubscriptions = [{
    id: "sub-1",
    name: "Premium Tier",
    price: 9.99,
    cadence: "monthly",
    features: ["All recipes"],
    revenuecat_product_id: "premium_monthly"
  }];

  const mockClient = new MockSupabaseClient(mockSubscriptions);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "admin-123", role: "admin" }, { id: "admin-123", email: "admin@example.com", role: "admin" });

  const res = await app.request("/subscriptions");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.length, 2);
  assertEquals(body[1].name, "Premium Tier");
});

Deno.test("GET /subscriptions - list tiers forbidden for non-admin", async () => {
  overrideAuth({ sub: "user-123", role: "authenticated" }, { id: "user-123", email: "user@example.com", role: "authenticated" });

  const res = await app.request("/subscriptions");
  assertEquals(res.status, 403);
});

Deno.test("POST /subscriptions/webhook - RevenueCat webhook success", async () => {
  const mockProfiles = [{
    id: "user-123",
    email: "user123@example.com",
    sauce_log: {}
  }];

  const mockClient = new MockSupabaseClient(mockProfiles);
  overrideClients(mockClient, mockClient);

  // Set environment webhook secret for the test
  Deno.env.set("REVENUECAT_WEBHOOK_SECRET", "test-rc-secret");

  const res = await app.request("/subscriptions/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer test-rc-secret"
    },
    body: JSON.stringify({
      event: {
        type: "INITIAL_PURCHASE",
        app_user_id: "user-123",
        entitlement_id: "premium_access",
        product_id: "premium_monthly",
        expiration_at_ms: 1799999999000
      }
    })
  });

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.subscription_active, true);
});
