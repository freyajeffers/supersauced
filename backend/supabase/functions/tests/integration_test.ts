import { assertEquals } from "https://deno.land/std@0.213.0/testing/asserts.ts";
import { delay } from "https://deno.land/std@0.213.0/async/delay.ts";

const COOK_USER_ID = "e7b39a3f-e8b9-47bb-a951-40439d5e3222";
const JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";

async function createSignedJwt(payload: any, _secret?: string): Promise<string> {
  const header = {
    alg: "ES256",
    typ: "JWT",
    kid: "b81269f1-21d8-4f2e-b719-c2240a840d90"
  };

  const base64urlEncode = (arr: Uint8Array) => {
    const binString = String.fromCharCode(...arr);
    return btoa(binString).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  };

  const encoder = new TextEncoder();
  const headerB64 = base64urlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64urlEncode(encoder.encode(JSON.stringify(payload)));

  const privateJwk = {
    kty: "EC",
    crv: "P-256",
    x: "M5Sjqn5zwC9Kl1zVfUUGvv9boQjCGd45G8sdopBExB4",
    y: "P6IXMvA2WYXSHSOMTBH2jsw_9rrzGy89FjPf6oOsIxQ",
    d: "dIhR8wywJlqlua4y_yMq2SLhlFXDZJBCvFrY1DCHyVU"
  };

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const data = encoder.encode(`${headerB64}.${payloadB64}`);
  const signatureBuffer = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    privateKey,
    data
  );
  const signatureB64 = base64urlEncode(new Uint8Array(signatureBuffer));

  return `${headerB64}.${payloadB64}.${signatureB64}`;
}


async function postAnalytics(payload: any) {
  const url = "http://127.0.0.1:54321/functions/v1/analytics/analytics_event";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
  return await fetch(url, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "apikey": anonKey,
      "Authorization": `Bearer ${anonKey}`
    },
    body: JSON.stringify(payload),
  });
}

Deno.test("analytics_event integration with retry", async () => {
  const payload = {
    event_name: "test_event",
    distinct_id: "test_user",
    properties: { foo: "bar" },
  };

  // wait a moment for the function to be ready
  await delay(2000);

  let resp;
  let attempts = 0;
  const maxAttempts = 5;
  while (attempts < maxAttempts) {
    try {
      resp = await postAnalytics(payload);
      if (resp.status === 200) break;
    } catch (_) {}
    attempts++;
    await delay(1000 * attempts); // exponential back‑off
  }

  if (!resp) {
    throw new Error("No response received");
  }
  const json = await resp.json();
  assertEquals(resp.status, 200);
  assertEquals(json.success, true);
});

Deno.test("upload-user-avatar integration flow", async () => {
  // Generate a valid JWT for the Cook User
  const token = await createSignedJwt({
    sub: COOK_USER_ID,
    email: "cook@test.com",
    role: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3600,
  }, JWT_SECRET);

  // Set up temporary local env vars for Bunny Net
  Deno.env.set("BUNNY_STORAGE_API_KEY", "mock-bunny-storage-api-key");
  Deno.env.set("BUNNY_STORAGE_ZONE", "supersauced-mock");

  // Intercept fetch to mock Bunny net PUT storage uploads
  const originalFetch = globalThis.fetch;
  let bunnyUploadIntercepted = false;
  let uploadedBytes: any = null;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = typeof input === "string" ? input : input.toString();
    if (urlStr.includes("storage.bunnycdn.com")) {
      bunnyUploadIntercepted = true;
      assertEquals(init?.method, "PUT");
      const headers = init?.headers as any;
      const accessKey = headers ? (headers["AccessKey"] || (typeof headers.get === "function" && headers.get("AccessKey"))) : null;
      assertEquals(accessKey, "mock-bunny-storage-api-key");
      uploadedBytes = init?.body;
      return new Response(JSON.stringify({ success: true, message: "File uploaded." }), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      });
    }
    return await originalFetch(input, init);
  };

  try {
    // Create multipart/form-data payload with a dummy image file
    const formData = new FormData();
    const dummyImage = new File([new Uint8Array([1, 2, 3, 4])], "avatar.jpg", { type: "image/jpeg" });
    formData.append("file", dummyImage);

    // Call the locally served upload-user-avatar edge function
    const url = "http://127.0.0.1:54321/functions/v1/upload-user-avatar";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "apikey": anonKey,
      },
      body: formData,
    });

    if (resp.status !== 200) {
      console.log("upload-user-avatar failed with status:", resp.status, "body:", await resp.text());
    }
    assertEquals(resp.status, 200);
    const json = await resp.json();
    assertEquals(json.message, "Avatar uploaded successfully.");
    assertEquals(json.avatar_path, `users/avatars/${COOK_USER_ID}.jpg`);

    // Verify database profile was updated
    const dbCheckUrl = `http://127.0.0.1:54321/functions/v1/api/user_profiles/${COOK_USER_ID}`;
    const dbCheckResp = await fetch(dbCheckUrl, {
      headers: {
        "Authorization": `Bearer ${token}`,
      }
    });
    if (dbCheckResp.status !== 200) {
      console.log("dbCheckResp failed. Status:", dbCheckResp.status, "Body:", await dbCheckResp.text());
    }
    assertEquals(dbCheckResp.status, 200);
    const dbProfile = await dbCheckResp.json();
    assertEquals(dbProfile.avatar_path, `users/avatars/${COOK_USER_ID}.jpg`);

  } finally {
    // Restore global fetch and clean up env
    globalThis.fetch = originalFetch;
    Deno.env.delete("BUNNY_STORAGE_API_KEY");
    Deno.env.delete("BUNNY_STORAGE_ZONE");
  }
});
