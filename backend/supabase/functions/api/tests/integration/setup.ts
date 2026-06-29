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

  // Ensure Supabase env vars are set for the test environment
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'test-key');
  Deno.env.set('SUPABASE_JWT_SECRET', Deno.env.get('SUPABASE_JWT_SECRET') || 'test-secret-at-least-32-characters-long');

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

export async function createSignedJwt(payload: any, secret: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
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
