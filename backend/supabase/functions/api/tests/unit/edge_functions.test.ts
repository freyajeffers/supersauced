import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { app } from "../../index.ts";
import { overrideClients } from "../../deps.ts";
import { MockSupabaseClient } from "./client_mock.ts";

// Helper to generate correct Shopify HMAC signature for verification testing
async function generateShopifySignature(body: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const data = encoder.encode(body);
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, data);
  return btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
}

// ----------------------------------------------------
// POST /functions/auth_callback
// ----------------------------------------------------

Deno.test("POST /functions/auth_callback - invalid JSON body", async () => {
  const res = await app.request("/functions/auth_callback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "Not JSON"
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Invalid JSON body");
});

Deno.test("POST /functions/auth_callback - missing user info", async () => {
  // Empty user object
  let res = await app.request("/functions/auth_callback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: {} })
  });
  assertEquals(res.status, 400);
  let body = await res.json();
  assertEquals(body.detail, "Missing user info (id and email are required)");

  // Missing email
  res = await app.request("/functions/auth_callback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: { id: "user-123" } })
  });
  assertEquals(res.status, 400);
});

Deno.test("POST /functions/auth_callback - success with metadata full name", async () => {
  const mockClient = new MockSupabaseClient([]);
  overrideClients(mockClient, mockClient);

  const payload = {
    user: {
      id: "user-123",
      email: "jane.doe@example.com",
      user_metadata: {
        full_name: "Jane Doe",
        bio: "Avid cook"
      }
    }
  };

  const res = await app.request("/functions/auth_callback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.user.user_id, "user-123");
  assertEquals(body.user.first_name, "Jane");
  assertEquals(body.user.last_name, "Doe");
  assertEquals(body.user.bio, "Avid cook");
});

Deno.test("POST /functions/auth_callback - success with single-word full name", async () => {
  const mockClient = new MockSupabaseClient([]);
  overrideClients(mockClient, mockClient);

  const payload = {
    user: {
      id: "user-123",
      email: "jane.doe@example.com",
      user_metadata: {
        full_name: "Jane",
        bio: ""
      }
    }
  };

  const res = await app.request("/functions/auth_callback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.user.first_name, "Jane");
  assertEquals(body.user.last_name, "");
});

Deno.test("POST /functions/auth_callback - success with missing full name / fallbacks", async () => {
  const mockClient = new MockSupabaseClient([]);
  overrideClients(mockClient, mockClient);

  const payload = {
    user: {
      id: "user-123",
      email: "chef123@example.com"
      // user_metadata is omitted
    }
  };

  const res = await app.request("/functions/auth_callback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.user.first_name, "chef123"); // fallback to email prefix
  assertEquals(body.user.last_name, "");
  assertEquals(body.user.bio, "");
});

Deno.test("POST /functions/auth_callback - upsert database error", async () => {
  const customClient = {
    from() {
      return {
        upsert() {
          throw new Error("Simulated connection timeout");
        }
      };
    }
  } as any;
  overrideClients(customClient, customClient);

  const payload = {
    user: {
      id: "user-123",
      email: "chef@example.com"
    }
  };

  const res = await app.request("/functions/auth_callback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.detail, "Upsert failed: Simulated connection timeout");
});


// ----------------------------------------------------
// POST /functions/shopify_sync
// ----------------------------------------------------

Deno.test("POST /functions/shopify_sync - missing signature header", async () => {
  const res = await app.request("/functions/shopify_sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.detail, "Missing X-Shopify-Hmac-Sha256 signature header");
});

Deno.test("POST /functions/shopify_sync - invalid webhook signature", async () => {
  Deno.env.set("SHOPIFY_WEBHOOK_SECRET", "secret-key");

  const res = await app.request("/functions/shopify_sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Hmac-Sha256": "bad-signature-base64"
    },
    body: JSON.stringify({ email: "test@example.com" })
  });
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.detail, "Invalid webhook signature");
});

Deno.test("POST /functions/shopify_sync - invalid raw body JSON", async () => {
  const secret = "my-shopify-secret";
  Deno.env.set("SHOPIFY_WEBHOOK_SECRET", secret);

  const rawBody = "Not JSON at all!";
  const validSig = await generateShopifySignature(rawBody, secret);

  const res = await app.request("/functions/shopify_sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Hmac-Sha256": validSig
    },
    body: rawBody
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Invalid JSON body");
});

Deno.test("POST /functions/shopify_sync - missing email identifier", async () => {
  const secret = "my-shopify-secret";
  Deno.env.set("SHOPIFY_WEBHOOK_SECRET", secret);

  const rawBody = JSON.stringify({ not_email: "something" });
  const validSig = await generateShopifySignature(rawBody, secret);

  const res = await app.request("/functions/shopify_sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Hmac-Sha256": validSig
    },
    body: rawBody
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Missing customer identifier (email)");
});

Deno.test("POST /functions/shopify_sync - database profile query error", async () => {
  const secret = "my-shopify-secret";
  Deno.env.set("SHOPIFY_WEBHOOK_SECRET", secret);

  const rawBody = JSON.stringify({ email: "chef@example.com" });
  const validSig = await generateShopifySignature(rawBody, secret);

  const mockClient = new MockSupabaseClient(null, { message: "Database is locked" });
  overrideClients(mockClient, mockClient);

  const res = await app.request("/functions/shopify_sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Hmac-Sha256": validSig
    },
    body: rawBody
  });
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.detail, "Database profile query error: Database is locked");
});

Deno.test("POST /functions/shopify_sync - user profile not found (logged pending)", async () => {
  const secret = "my-shopify-secret";
  Deno.env.set("SHOPIFY_WEBHOOK_SECRET", secret);

  const rawBody = JSON.stringify({ email: "nonexistent@example.com" });
  const validSig = await generateShopifySignature(rawBody, secret);

  const mockClient = new MockSupabaseClient([]); // empty profiles
  overrideClients(mockClient, mockClient);

  const res = await app.request("/functions/shopify_sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Hmac-Sha256": validSig
    },
    body: rawBody
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.message, "User profile not found, logged pending credits.");
});

Deno.test("POST /functions/shopify_sync - success with matching customer user profile", async () => {
  const secret = "my-shopify-secret";
  Deno.env.set("SHOPIFY_WEBHOOK_SECRET", secret);

  const rawBody = JSON.stringify({
    customer: { email: "buyer@example.com" },
    line_items: [{ title: "Awesome Pan", quantity: 1 }]
  });
  const validSig = await generateShopifySignature(rawBody, secret);

  const mockProfiles = [{
    user_id: "user-buyer-777",
    email: "buyer@example.com",
    first_name: "Bob",
    last_name: "Builder"
  }];
  const mockClient = new MockSupabaseClient(mockProfiles);
  overrideClients(mockClient, mockClient);

  const res = await app.request("/functions/shopify_sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Hmac-Sha256": validSig
    },
    body: rawBody
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.user_profile.id, "user-buyer-777");
  assertEquals(body.user_profile.first_name, "Bob");
  assertEquals(body.user_profile.purchased_items[0].title, "Awesome Pan");
});


// ----------------------------------------------------
// POST /functions/analytics_event
// ----------------------------------------------------

Deno.test("POST /functions/analytics_event - invalid JSON body", async () => {
  const res = await app.request("/functions/analytics_event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "Not JSON"
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Invalid JSON body");
});

Deno.test("POST /functions/analytics_event - missing parameters", async () => {
  // Missing distinct_id
  let res = await app.request("/functions/analytics_event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_name: "recipe_view" })
  });
  assertEquals(res.status, 400);
  let body = await res.json();
  assertEquals(body.detail, "Missing required analytics parameters");

  // Missing event_name
  res = await app.request("/functions/analytics_event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ distinct_id: "user-1" })
  });
  assertEquals(res.status, 400);
});

Deno.test("POST /functions/analytics_event - success with unconfigured dispatch", async () => {
  // Clear env vars to make sure neither PostHog nor Firebase is dispatched
  Deno.env.delete("POSTHOG_HOST");
  Deno.env.delete("POSTHOG_API_KEY");
  Deno.env.delete("FIREBASE_PROJECT_ID");
  Deno.env.delete("FIREBASE_API_KEY");

  const res = await app.request("/functions/analytics_event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_name: "heartbeat", distinct_id: "user-99" })
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
});

Deno.test("POST /functions/analytics_event - fully configured PostHog & Firebase success path", async () => {
  Deno.env.set("POSTHOG_HOST", "https://app.posthog.com");
  Deno.env.set("POSTHOG_API_KEY", "ph-key-123");
  Deno.env.set("FIREBASE_PROJECT_ID", "fb-proj-456");
  Deno.env.set("FIREBASE_API_KEY", "fb-key-789");

  const originalFetch = globalThis.fetch;
  const calledUrls: string[] = [];

  globalThis.fetch = async (input: string | Request | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = input.toString();
    calledUrls.push(urlStr);
    return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
  };

  try {
    const res = await app.request("/functions/analytics_event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_name: "purchase_complete",
        distinct_id: "user-123",
        properties: { amount: 15.00 }
      })
    });

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);
    assertEquals(calledUrls.length, 2);
    assert(calledUrls.includes("https://app.posthog.com/capture/"));
    assert(calledUrls.includes("https://firebase.googleapis.com/v1/projects/fb-proj-456/events:logEvent?key=fb-key-789"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("POST /functions/analytics_event - PostHog and Firebase error reporting", async () => {
  Deno.env.set("POSTHOG_HOST", "https://app.posthog.com");
  Deno.env.set("POSTHOG_API_KEY", "ph-key-123");
  Deno.env.set("FIREBASE_PROJECT_ID", "fb-proj-456");
  Deno.env.set("FIREBASE_API_KEY", "fb-key-789");

  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: string | Request | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = input.toString();
    if (urlStr.includes("posthog")) {
      return new Response("Unauthorized PostHog Token", { status: 403 });
    }
    // Simulate network error for Firebase fetch
    throw new Error("Connection refused");
  };

  try {
    const res = await app.request("/functions/analytics_event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_name: "recipe_share",
        distinct_id: "user-123"
      })
    });

    assertEquals(res.status, 500);
    const body = await res.json();
    assertEquals(body.success, false);
    assertEquals(body.errors.length, 2);
    assert(body.errors[0].includes("PostHog error 403: Unauthorized PostHog Token"));
    assert(body.errors[1].includes("Firebase request failed: Connection refused"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function assert(condition: boolean, message?: string) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}
