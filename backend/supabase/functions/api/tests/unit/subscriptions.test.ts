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

// POST /subscriptions
Deno.test("POST /subscriptions - forbidden for non-admin", async () => {
  overrideAuth({ sub: "user-123", role: "authenticated" }, { id: "user-123", email: "user@example.com", role: "authenticated" });

  const res = await app.request("/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Pro" })
  });
  assertEquals(res.status, 403);
});

Deno.test("POST /subscriptions - success for admin with custom values", async () => {
  overrideAuth({ sub: "admin-123", role: "admin" }, { id: "admin-123", email: "admin@example.com", role: "admin" });

  const customTier = {
    id: "sub-custom",
    name: "Custom Super Tier",
    price: 49.99,
    cadence: "yearly",
    features: ["Feature A", "Feature B"],
    revenuecat_product_id: "super_yearly"
  };

  const res = await app.request("/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(customTier)
  });
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals(body.id, "sub-custom");
  assertEquals(body.name, "Custom Super Tier");
  assertEquals(body.price, 49.99);
  assertEquals(body.cadence, "yearly");
  assertEquals(body.features, ["Feature A", "Feature B"]);
  assertEquals(body.revenuecat_product_id, "super_yearly");
});

Deno.test("POST /subscriptions - success for admin with empty body / defaults", async () => {
  overrideAuth({ sub: "admin-123", role: "admin" }, { id: "admin-123", email: "admin@example.com", role: "admin" });

  const res = await app.request("/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  assertEquals(res.status, 201);
  const body = await res.json();
  assert(body.id !== undefined);
  assertEquals(body.name, "New Tier");
  assertEquals(body.price, 0.0);
  assertEquals(body.cadence, "monthly");
  assertEquals(body.features, []);
  assertEquals(body.revenuecat_product_id, "");
});

// Helper for assertions
function assert(expr: boolean, msg?: string) {
  if (!expr) throw new Error(msg || "Assertion failed");
}

// PUT /subscriptions/:id
Deno.test("PUT /subscriptions/:id - forbidden for non-admin", async () => {
  overrideAuth({ sub: "user-123", role: "authenticated" }, { id: "user-123", email: "user@example.com", role: "authenticated" });

  const res = await app.request("/subscriptions/sub-1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Updated Name" })
  });
  assertEquals(res.status, 403);
});

Deno.test("PUT /subscriptions/:id - subscription not found", async () => {
  overrideAuth({ sub: "admin-123", role: "admin" }, { id: "admin-123", email: "admin@example.com", role: "admin" });

  const res = await app.request("/subscriptions/non-existent", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Updated Name" })
  });
  assertEquals(res.status, 404);
  const body = await res.json();
  assertEquals(body.detail, "Subscription not found");
});

Deno.test("PUT /subscriptions/:id - success for admin", async () => {
  overrideAuth({ sub: "admin-123", role: "admin" }, { id: "admin-123", email: "admin@example.com", role: "admin" });

  const res = await app.request("/subscriptions/sub-1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ price: 1.99, name: "Cheaper Free Tier" })
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.id, "sub-1");
  assertEquals(body.price, 1.99);
  assertEquals(body.name, "Cheaper Free Tier");
});

// DELETE /subscriptions/:id
Deno.test("DELETE /subscriptions/:id - forbidden for non-admin", async () => {
  overrideAuth({ sub: "user-123", role: "authenticated" }, { id: "user-123", email: "user@example.com", role: "authenticated" });

  const res = await app.request("/subscriptions/sub-1", {
    method: "DELETE"
  });
  assertEquals(res.status, 403);
});

Deno.test("DELETE /subscriptions/:id - subscription not found", async () => {
  overrideAuth({ sub: "admin-123", role: "admin" }, { id: "admin-123", email: "admin@example.com", role: "admin" });

  const res = await app.request("/subscriptions/non-existent", {
    method: "DELETE"
  });
  assertEquals(res.status, 404);
  const body = await res.json();
  assertEquals(body.detail, "Subscription not found");
});

Deno.test("DELETE /subscriptions/:id - success for admin", async () => {
  overrideAuth({ sub: "admin-123", role: "admin" }, { id: "admin-123", email: "admin@example.com", role: "admin" });

  const res = await app.request("/subscriptions/sub-1", {
    method: "DELETE"
  });
  assertEquals(res.status, 204);
  assertEquals(res.body, null);
});

// Webhook edge cases
Deno.test("POST /subscriptions/webhook - invalid/missing authentication", async () => {
  Deno.env.set("REVENUECAT_WEBHOOK_SECRET", "super-secret");

  // No authorization header
  let res = await app.request("/subscriptions/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  assertEquals(res.status, 401);
  let body = await res.json();
  assertEquals(body.detail, "Invalid or missing RevenueCat webhook authentication token");

  // Incorrect authorization token
  res = await app.request("/subscriptions/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer wrong-secret"
    },
    body: JSON.stringify({})
  });
  assertEquals(res.status, 401);
});

Deno.test("POST /subscriptions/webhook - invalid JSON payload", async () => {
  Deno.env.set("REVENUECAT_WEBHOOK_SECRET", "super-secret");

  const res = await app.request("/subscriptions/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer super-secret"
    },
    body: "Not a { JSON } at all!"
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Invalid JSON payload");
});

Deno.test("POST /subscriptions/webhook - missing event data", async () => {
  Deno.env.set("REVENUECAT_WEBHOOK_SECRET", "super-secret");

  const res = await app.request("/subscriptions/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer super-secret"
    },
    body: JSON.stringify({
      not_event: {}
    })
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Missing event data in payload");
});

Deno.test("POST /subscriptions/webhook - missing app_user_id in event data", async () => {
  Deno.env.set("REVENUECAT_WEBHOOK_SECRET", "super-secret");

  const res = await app.request("/subscriptions/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer super-secret"
    },
    body: JSON.stringify({
      event: {
        type: "INITIAL_PURCHASE"
        // missing app_user_id
      }
    })
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Missing app_user_id in event data");
});

Deno.test("POST /subscriptions/webhook - processes cancellation & expiration events", async () => {
  const mockProfiles = [{
    id: "user-123",
    email: "user123@example.com"
  }];
  const mockClient = new MockSupabaseClient(mockProfiles);
  overrideClients(mockClient, mockClient);
  Deno.env.set("REVENUECAT_WEBHOOK_SECRET", "super-secret");

  const res = await app.request("/subscriptions/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer super-secret"
    },
    body: JSON.stringify({
      event: {
        type: "CANCELLATION",
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
  assertEquals(body.subscription_active, false);
});

Deno.test("POST /subscriptions/webhook - user profile not found", async () => {
  // Empty profile data list from database
  const mockClient = new MockSupabaseClient([]);
  overrideClients(mockClient, mockClient);
  Deno.env.set("REVENUECAT_WEBHOOK_SECRET", "super-secret");

  const res = await app.request("/subscriptions/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer super-secret"
    },
    body: JSON.stringify({
      event: {
        type: "INITIAL_PURCHASE",
        app_user_id: "non-existent-user",
        entitlement_id: "premium_access"
      }
    })
  });

  assertEquals(res.status, 404);
  const body = await res.json();
  assertEquals(body.detail, "User profile with ID non-existent-user not found.");
});

Deno.test("POST /subscriptions/webhook - database select error", async () => {
  // Pass an error object to simulate select error
  const mockClient = new MockSupabaseClient(null, { message: "Internal server error" });
  overrideClients(mockClient, mockClient);
  Deno.env.set("REVENUECAT_WEBHOOK_SECRET", "super-secret");

  const res = await app.request("/subscriptions/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer super-secret"
    },
    body: JSON.stringify({
      event: {
        type: "INITIAL_PURCHASE",
        app_user_id: "user-123",
        entitlement_id: "premium_access"
      }
    })
  });

  assertEquals(res.status, 404);
  const body = await res.json();
  assertEquals(body.detail, "User profile with ID user-123 not found.");
});

Deno.test("POST /subscriptions/webhook - unexpected exception handler", async () => {
  const customClient = {
    from() {
      throw new Error("Supabase is completely down");
    }
  } as any;
  overrideClients(customClient, customClient);
  Deno.env.set("REVENUECAT_WEBHOOK_SECRET", "super-secret");

  const res = await app.request("/subscriptions/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer super-secret"
    },
    body: JSON.stringify({
      event: {
        type: "INITIAL_PURCHASE",
        app_user_id: "user-123",
        entitlement_id: "premium_access"
      }
    })
  });

  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.detail, "Failed to process RevenueCat webhook: Supabase is completely down");
});
