import { assertEquals, assertExists, assertRejects, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Context } from 'https://deno.land/x/hono@v3.11.8/mod.ts'
import { HTTPException } from 'https://deno.land/x/hono@v3.11.8/http-exception.ts'
import {
  getServiceClient,
  getUserClient,
  getJwtClaims,
  getCurrentUser,
  overrideClients,
  overrideAuth,
  verifyAndDecodeJwt
} from "../../deps.ts";

async function createSignedJwt(payload: any, secret: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT", kid: "default" };
  const base64urlEncode = (arr: Uint8Array) => {
    const binString = String.fromCharCode(...arr);
    return btoa(binString).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  };
  const encoder = new TextEncoder();
  const headerB64 = base64urlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64urlEncode(encoder.encode(JSON.stringify(payload)));

  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const data = encoder.encode(`${headerB64}.${payloadB64}`);
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, data);
  const signatureB64 = base64urlEncode(new Uint8Array(signatureBuffer));

  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

const TEST_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";

const getTestApiKey = () => {
  const pubKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (pubKey && !pubKey.startsWith("eyJ")) return pubKey;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (anonKey && !anonKey.startsWith("eyJ")) return anonKey;
  return "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
};

Deno.test("api/deps.ts - verifyAndDecodeJwt", async () => {
  const payload = {
    sub: "user-abc",
    email: "user@example.com",
    role: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 300
  };
  const token = await createSignedJwt(payload, TEST_SECRET);
  const decoded = await verifyAndDecodeJwt(token, TEST_SECRET);
  assertEquals(decoded.sub, "user-abc");
  assertEquals(decoded.email, "user@example.com");

  // Tampered JWT
  await assertRejects(async () => {
    await verifyAndDecodeJwt(token + "invalid", TEST_SECRET);
  });

  // Invalid format
  await assertRejects(async () => {
    await verifyAndDecodeJwt("invalid-format-token", TEST_SECRET);
  });

  // Token has expired
  const expiredPayload = {
    sub: "user-abc",
    exp: Math.floor(Date.now() / 1000) - 100
  };
  const expiredToken = await createSignedJwt(expiredPayload, TEST_SECRET);
  await assertRejects(async () => {
    await verifyAndDecodeJwt(expiredToken, TEST_SECRET);
  }, Error, "Token has expired");

  // Token is missing subject claim
  const missingSubPayload = {
    email: "user@example.com",
    exp: Math.floor(Date.now() / 1000) + 300
  };
  const missingSubToken = await createSignedJwt(missingSubPayload, TEST_SECRET);
  await assertRejects(async () => {
    await verifyAndDecodeJwt(missingSubToken, TEST_SECRET);
  }, Error, "Token is missing subject claim (sub)");

  // Token with no expiration claim (should decode successfully)
  const noExpPayload = {
    sub: "user-no-exp"
  };
  const noExpToken = await createSignedJwt(noExpPayload, TEST_SECRET);
  const noExpDecoded = await verifyAndDecodeJwt(noExpToken, TEST_SECRET);
  assertEquals(noExpDecoded.sub, "user-no-exp");
});

Deno.test("api/deps.ts - getEnvOverrides with SUPABASE_JWKS", () => {
  const origJwks = Deno.env.get("SUPABASE_JWKS");
  try {
    Deno.env.set("SUPABASE_JWKS", '{"keys": []}');
    overrideClients(null, null);

    const client = getServiceClient();
    assertExists(client);
  } finally {
    if (origJwks !== undefined) {
      Deno.env.set("SUPABASE_JWKS", origJwks);
    } else {
      Deno.env.delete("SUPABASE_JWKS");
    }
  }
});

Deno.test("api/deps.ts - getEnvOverrides with SUPABASE_JWKS_URL", () => {
  const origJwks = Deno.env.get("SUPABASE_JWKS");
  const origJwksUrl = Deno.env.get("SUPABASE_JWKS_URL");
  try {
    Deno.env.delete("SUPABASE_JWKS");
    Deno.env.set("SUPABASE_JWKS_URL", "https://example.com/.well-known/jwks.json");
    overrideClients(null, null);

    const client = getServiceClient();
    assertExists(client);
  } finally {
    if (origJwks !== undefined) {
      Deno.env.set("SUPABASE_JWKS", origJwks);
    } else {
      Deno.env.delete("SUPABASE_JWKS");
    }
    if (origJwksUrl !== undefined) {
      Deno.env.set("SUPABASE_JWKS_URL", origJwksUrl);
    } else {
      Deno.env.delete("SUPABASE_JWKS_URL");
    }
    overrideClients(null, null);
    overrideAuth(null, null);
  }
});

Deno.test("api/deps.ts - getEnvOverrides with non-localhost url", () => {
  const origUrl = Deno.env.get("SUPABASE_URL");
  const origJwks = Deno.env.get("SUPABASE_JWKS");
  const origJwksUrl = Deno.env.get("SUPABASE_JWKS_URL");
  const origJwtSecret = Deno.env.get("SUPABASE_JWT_SECRET");
  const origJwtSecretSec = Deno.env.get("JWT_SECRET");
  try {
    Deno.env.set("SUPABASE_URL", "https://custom-project.supabase.co");
    Deno.env.delete("SUPABASE_JWKS");
    Deno.env.delete("SUPABASE_JWKS_URL");
    Deno.env.delete("SUPABASE_JWT_SECRET");
    Deno.env.delete("JWT_SECRET");
    overrideClients(null, null);

    const client = getServiceClient();
    assertExists(client);
  } finally {
    if (origUrl !== undefined) {
      Deno.env.set("SUPABASE_URL", origUrl);
    } else {
      Deno.env.delete("SUPABASE_URL");
    }
    if (origJwks !== undefined) Deno.env.set("SUPABASE_JWKS", origJwks);
    if (origJwksUrl !== undefined) Deno.env.set("SUPABASE_JWKS_URL", origJwksUrl);
    if (origJwtSecret !== undefined) Deno.env.set("SUPABASE_JWT_SECRET", origJwtSecret);
    if (origJwtSecretSec !== undefined) Deno.env.set("JWT_SECRET", origJwtSecretSec);
  }
});

Deno.test("api/deps.ts - getJwtClaims and getCurrentUser real logic", async () => {
  const origPub = Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const origUrl = Deno.env.get("SUPABASE_URL");
  const origJwtSecret = Deno.env.get("SUPABASE_JWT_SECRET");
  const origJwtSecretSec = Deno.env.get("JWT_SECRET");
  try {
    Deno.env.set("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH");
    Deno.env.set("SUPABASE_URL", "http://localhost:54321");
    Deno.env.set("SUPABASE_JWT_SECRET", TEST_SECRET);
    Deno.env.set("JWT_SECRET", TEST_SECRET);

    // Reset auth overrides to invoke real createContext/verify
    overrideAuth(null, null);

    const payload = {
      sub: "user-real-123",
      email: "realchef@example.com",
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 300,
      // Add required custom fields for user claims inside Supabase Context if any
      id: "user-real-123"
    };

    const jwtSecret = Deno.env.get("SUPABASE_JWT_SECRET") || Deno.env.get("JWT_SECRET") || TEST_SECRET;
    const token = await createSignedJwt(payload, jwtSecret);
    const mockRequest = new Request("http://localhost/auth/user", {
      headers: {
        "Authorization": `Bearer ${token}`,
        "apikey": getTestApiKey()
      }
    });

    const mockContext = {
      req: {
        raw: mockRequest
      }
    } as unknown as Context;

    // Since createSupabaseContext will validate token against JWT_SECRET or SUPABASE_JWT_SECRET
    const claims = await getJwtClaims(mockContext);
    assertExists(claims);
    assertEquals(claims.sub, "user-real-123");

    const user = await getCurrentUser(mockContext);
    assertEquals(user.id, "user-real-123");
    assertEquals(user.email, "realchef@example.com");
    assertEquals(user.role, "authenticated");
  } finally {
    overrideAuth(null, null);
    overrideClients(null, null);
    if (origPub !== undefined) {
      Deno.env.set("SUPABASE_PUBLISHABLE_KEY", origPub);
    } else {
      Deno.env.delete("SUPABASE_PUBLISHABLE_KEY");
    }
    if (origUrl !== undefined) {
      Deno.env.set("SUPABASE_URL", origUrl);
    } else {
      Deno.env.delete("SUPABASE_URL");
    }
    if (origJwtSecret !== undefined) {
      Deno.env.set("SUPABASE_JWT_SECRET", origJwtSecret);
    } else {
      Deno.env.delete("SUPABASE_JWT_SECRET");
    }
    if (origJwtSecretSec !== undefined) {
      Deno.env.set("JWT_SECRET", origJwtSecretSec);
    } else {
      Deno.env.delete("JWT_SECRET");
    }
  }
});

Deno.test("api/deps.ts - getJwtClaims and getCurrentUser errors", async () => {
  try {
    overrideAuth(null, null);

    const mockRequest = new Request("http://localhost/auth/user", {
      headers: {
        "Authorization": "Bearer invalid-or-missing-token",
        "apikey": getTestApiKey()
      }
    });

    const mockContext = {
      req: {
        raw: mockRequest
      }
    } as unknown as Context;

    await assertRejects(async () => {
      await getJwtClaims(mockContext);
    }, HTTPException);

    await assertRejects(async () => {
      await getCurrentUser(mockContext);
    }, HTTPException);
  } finally {
    overrideAuth(null, null);
    overrideClients(null, null);
  }
});

Deno.test("api/deps.ts - getServiceClient and getUserClient", () => {
  try {
    // Test fallback creation when overrides are null
    overrideClients(null, null);

    const serviceClient = getServiceClient();
    assertExists(serviceClient);

    const mockRequest = new Request("http://localhost/auth/user", {
      headers: {
        "Authorization": "Bearer some-token",
        "apikey": getTestApiKey()
      }
    });
    const mockContext = {
      req: {
        raw: mockRequest
      }
    } as unknown as Context;

    const userClient = getUserClient(mockContext);
    assertExists(userClient);
  } finally {
    overrideClients(null, null);
    overrideAuth(null, null);
  }
});

Deno.test("api/deps.ts - getEnvOverrides with invalid SUPABASE_JWKS", () => {
  const origJwks = Deno.env.get("SUPABASE_JWKS");
  try {
    Deno.env.set("SUPABASE_JWKS", "invalid-json");
    overrideAuth(null, null);
    overrideClients(null, null);

    const client = getServiceClient();
    assertExists(client);
  } finally {
    if (origJwks !== undefined) {
      Deno.env.set("SUPABASE_JWKS", origJwks);
    } else {
      Deno.env.delete("SUPABASE_JWKS");
    }
  }
});

Deno.test("api/deps.ts - getEnvOverrides with invalid SUPABASE_JWKS_URL", () => {
  const origJwks = Deno.env.get("SUPABASE_JWKS");
  const origJwksUrl = Deno.env.get("SUPABASE_JWKS_URL");
  try {
    Deno.env.delete("SUPABASE_JWKS");
    Deno.env.set("SUPABASE_JWKS_URL", "not-a-url");
    overrideAuth(null, null);
    overrideClients(null, null);

    const client = getServiceClient();
    assertExists(client);
  } finally {
    if (origJwks !== undefined) {
      Deno.env.set("SUPABASE_JWKS", origJwks);
    } else {
      Deno.env.delete("SUPABASE_JWKS");
    }
    if (origJwksUrl !== undefined) {
      Deno.env.set("SUPABASE_JWKS_URL", origJwksUrl);
    } else {
      Deno.env.delete("SUPABASE_JWKS_URL");
    }
    overrideAuth(null, null);
    overrideClients(null, null);
  }
});

Deno.test("api/deps.ts - getEnvOverrides with local invalid URL", () => {
  const origUrl = Deno.env.get("SUPABASE_URL");
  const origJwks = Deno.env.get("SUPABASE_JWKS");
  const origJwksUrl = Deno.env.get("SUPABASE_JWKS_URL");
  const origJwtSecret = Deno.env.get("SUPABASE_JWT_SECRET");
  const origJwtSecretSec = Deno.env.get("JWT_SECRET");
  try {
    Deno.env.set("SUPABASE_URL", "localhost-no-protocol");
    Deno.env.delete("SUPABASE_JWKS");
    Deno.env.delete("SUPABASE_JWKS_URL");
    Deno.env.delete("SUPABASE_JWT_SECRET");
    Deno.env.delete("JWT_SECRET");
    overrideAuth(null, null);
    overrideClients(null, null);

    assertThrows(() => {
      getServiceClient();
    }, Error, "Invalid supabaseUrl");
  } finally {
    if (origUrl !== undefined) {
      Deno.env.set("SUPABASE_URL", origUrl);
    } else {
      Deno.env.delete("SUPABASE_URL");
    }
    if (origJwks !== undefined) {
      Deno.env.set("SUPABASE_JWKS", origJwks);
    } else {
      Deno.env.delete("SUPABASE_JWKS");
    }
    if (origJwksUrl !== undefined) {
      Deno.env.set("SUPABASE_JWKS_URL", origJwksUrl);
    } else {
      Deno.env.delete("SUPABASE_JWKS_URL");
    }
    if (origJwtSecret !== undefined) {
      Deno.env.set("SUPABASE_JWT_SECRET", origJwtSecret);
    } else {
      Deno.env.delete("SUPABASE_JWT_SECRET");
    }
    if (origJwtSecretSec !== undefined) {
      Deno.env.set("JWT_SECRET", origJwtSecretSec);
    } else {
      Deno.env.delete("JWT_SECRET");
    }
    overrideAuth(null, null);
    overrideClients(null, null);
  }
});

Deno.test("api/deps.ts - getEnvOverrides with remaining fallbacks and whitespace", () => {
  const origUrl = Deno.env.get("SUPABASE_URL");
  const origPub = Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const origAnon = Deno.env.get("SUPABASE_ANON_KEY");
  const origSec = Deno.env.get("SUPABASE_SECRET_KEY");
  const origSvc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const origJwks = Deno.env.get("SUPABASE_JWKS");
  const origJwksUrl = Deno.env.get("SUPABASE_JWKS_URL");
  const origJwtSecret = Deno.env.get("SUPABASE_JWT_SECRET");
  const origJwtSecretSec = Deno.env.get("JWT_SECRET");

  try {
    // 1. Test 127.0.0.1 in local URL
    Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
    Deno.env.delete("SUPABASE_JWKS");
    Deno.env.delete("SUPABASE_JWKS_URL");
    Deno.env.delete("SUPABASE_JWT_SECRET");
    Deno.env.delete("JWT_SECRET");
    overrideAuth(null, null);
    overrideClients(null, null);

    let client = getServiceClient();
    assertExists(client);

    // 2. Test whitespace-only JWKS & JWKS_URL
    Deno.env.set("SUPABASE_JWKS", "   ");
    Deno.env.set("SUPABASE_JWKS_URL", "   ");
    client = getServiceClient();
    assertExists(client);

    // 3. Test fallback to SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY and JWT_SECRET
    Deno.env.delete("SUPABASE_PUBLISHABLE_KEY");
    Deno.env.set("SUPABASE_ANON_KEY", "anon-fallback");
    Deno.env.delete("SUPABASE_SECRET_KEY");
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-fallback");
    Deno.env.delete("SUPABASE_JWT_SECRET");
    Deno.env.set("JWT_SECRET", TEST_SECRET);

    client = getServiceClient();
    assertExists(client);
  } finally {
    if (origUrl !== undefined) {
      Deno.env.set("SUPABASE_URL", origUrl);
    } else {
      Deno.env.delete("SUPABASE_URL");
    }
    if (origPub !== undefined) {
      Deno.env.set("SUPABASE_PUBLISHABLE_KEY", origPub);
    } else {
      Deno.env.delete("SUPABASE_PUBLISHABLE_KEY");
    }
    if (origAnon !== undefined) {
      Deno.env.set("SUPABASE_ANON_KEY", origAnon);
    } else {
      Deno.env.delete("SUPABASE_ANON_KEY");
    }
    if (origSec !== undefined) {
      Deno.env.set("SUPABASE_SECRET_KEY", origSec);
    } else {
      Deno.env.delete("SUPABASE_SECRET_KEY");
    }
    if (origSvc !== undefined) {
      Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", origSvc);
    } else {
      Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
    }
    if (origJwks !== undefined) {
      Deno.env.set("SUPABASE_JWKS", origJwks);
    } else {
      Deno.env.delete("SUPABASE_JWKS");
    }
    if (origJwksUrl !== undefined) {
      Deno.env.set("SUPABASE_JWKS_URL", origJwksUrl);
    } else {
      Deno.env.delete("SUPABASE_JWKS_URL");
    }
    if (origJwtSecret !== undefined) {
      Deno.env.set("SUPABASE_JWT_SECRET", origJwtSecret);
    } else {
      Deno.env.delete("SUPABASE_JWT_SECRET");
    }
    if (origJwtSecretSec !== undefined) {
      Deno.env.set("JWT_SECRET", origJwtSecretSec);
    } else {
      Deno.env.delete("JWT_SECRET");
    }
  }
});

Deno.test("api/deps.ts - getJwtClaims override", async () => {
  try {
    const mockClaims = { sub: "override-claims-sub", email: "override@example.com" };
    overrideAuth(mockClaims, null);

    const mockContext = {} as unknown as Context;
    const claims = await getJwtClaims(mockContext);
    assertEquals(claims, mockClaims);
  } finally {
    overrideAuth(null, null);
  }
});

Deno.test("api/deps.ts - getCurrentUser fallback role to authenticated", async () => {
  const origUrl = Deno.env.get("SUPABASE_URL");
  const origPub = Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const origJwtSecret = Deno.env.get("SUPABASE_JWT_SECRET");
  const origJwtSecretSec = Deno.env.get("JWT_SECRET");

  try {
    Deno.env.set("SUPABASE_URL", "http://localhost:54321");
    Deno.env.set("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH");
    Deno.env.set("SUPABASE_JWT_SECRET", TEST_SECRET);
    Deno.env.set("JWT_SECRET", TEST_SECRET);

    overrideAuth(null, null);
    overrideClients(null, null);

    const payload = {
      sub: "user-no-role",
      email: "norole@example.com",
      exp: Math.floor(Date.now() / 1000) + 300
    };
    const token = await createSignedJwt(payload, TEST_SECRET);

    const mockRequest = new Request("http://localhost/auth/user", {
      headers: {
        "Authorization": `Bearer ${token}`,
        "apikey": "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"
      }
    });

    const mockContext = {
      req: {
        raw: mockRequest
      }
    } as unknown as Context;

    const user = await getCurrentUser(mockContext);
    assertEquals(user.id, "user-no-role");
    assertEquals(user.role, "authenticated");
  } finally {
    if (origUrl !== undefined) Deno.env.set("SUPABASE_URL", origUrl);
    else Deno.env.delete("SUPABASE_URL");
    if (origPub !== undefined) Deno.env.set("SUPABASE_PUBLISHABLE_KEY", origPub);
    else Deno.env.delete("SUPABASE_PUBLISHABLE_KEY");
    if (origJwtSecret !== undefined) Deno.env.set("SUPABASE_JWT_SECRET", origJwtSecret);
    else Deno.env.delete("SUPABASE_JWT_SECRET");
    if (origJwtSecretSec !== undefined) Deno.env.set("JWT_SECRET", origJwtSecretSec);
    else Deno.env.delete("JWT_SECRET");

    overrideAuth(null, null);
    overrideClients(null, null);
  }
});

