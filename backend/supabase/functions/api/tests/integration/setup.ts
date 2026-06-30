import { seedDatabase } from "./seed.ts";
import { overrideClients, overrideAuth } from "../../deps.ts";
export const CHEF_USER_ID = "e7b39a3f-e8b9-47bb-a951-40439d5e3111";
export const COOK_USER_ID = "e7b39a3f-e8b9-47bb-a951-40439d5e3222";
export const CHILI_RECIPE_ID = "c1111111-1111-1111-1111-111111111111";
export const PASTA_RECIPE_ID = "c2222222-2222-2222-2222-222222222222";

export async function clearMocks() {
  // Reset any overridden clients/auth for isolated tests
  overrideClients(null, null);
  overrideAuth(null, null);

  // Preserve the real anon key in SUPABASE_PUBLISHABLE_KEY before we overwrite SUPABASE_ANON_KEY
  const originalAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (originalAnonKey && !originalAnonKey.startsWith('eyJ')) {
    Deno.env.set('SUPABASE_PUBLISHABLE_KEY', originalAnonKey);
  }

  // Ensure Supabase env vars are set for the test environment
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'test-key');
  Deno.env.set('SUPABASE_JWT_SECRET', Deno.env.get('SUPABASE_JWT_SECRET') || 'test-secret-at-least-32-characters-long');
  Deno.env.set('SUPABASE_JWKS_URL', 'http://localhost:54321/auth/v1/.well-known/jwks.json');

  // Seed required test data using real Supabase service client
  await seedDatabase();

  const adminJwt = await createSignedJwt({
    sub: CHEF_USER_ID,
    email: 'admin@test.com',
    role: 'admin',
    exp: Math.floor(Date.now() / 1000) + 3600,
  }, Deno.env.get('SUPABASE_JWT_SECRET') || 'test-secret-at-least-32-characters-long');
  // Use JWT for anon key only; keep service role key for admin operations
  Deno.env.set('SUPABASE_ANON_KEY', adminJwt);
  // Do NOT override SUPABASE_SERVICE_ROLE_KEY with JWT

}

export async function createSignedJwt(payload: any, _secret?: string): Promise<string> {
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

export async function getAuthHeaderForUser(userId: string, role: string, email: string): Promise<string> {
  const secret = Deno.env.get("SUPABASE_JWT_SECRET") || "test-secret-at-least-32-characters-long";
  const payload = {
    sub: userId,
    email: email,
    role: role,
    exp: Math.floor(Date.now() / 1000) + 3600
  };
  const token = await createSignedJwt(payload, secret);
  return `Bearer ${token}`;
}
