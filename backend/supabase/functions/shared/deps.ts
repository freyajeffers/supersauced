import { createSupabaseContext } from 'npm:@supabase/server'
import { createContextClient, createAdminClient, extractCredentials } from 'npm:@supabase/server/core'
import { SupabaseClient } from 'npm:@supabase/supabase-js'
import { Context } from 'https://deno.land/x/hono@v3.11.8/mod.ts'
import { HTTPException } from 'https://deno.land/x/hono@v3.11.8/http-exception.ts'
import { CurrentUser } from './types.ts'

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-shopify-hmac-sha256',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
  'Access-Control-Max-Age': '600',
};

export function handleSharedError(c: Context, err: any) {
  if (err instanceof HTTPException) {
    return c.json({ detail: err.message }, err.status);
  }
  const errorMsg = err instanceof Error ? err.message : String(err);
  return c.json({ detail: errorMsg }, 400);
}

export async function verifyAndDecodeJwt(token: string, secret: string): Promise<any> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const [headerB64, payloadB64, signatureB64] = parts;

  const base64urlDecode = (str: string) => {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  };

  const data = encoder.encode(`${headerB64}.${payloadB64}`);
  const signature = base64urlDecode(signatureB64);

  const isValid = await crypto.subtle.verify(
    'HMAC',
    key,
    signature,
    data
  );

  if (!isValid) {
    throw new Error('Invalid token signature or format');
  }

  const payloadText = new TextDecoder().decode(base64urlDecode(payloadB64));
  const payload = JSON.parse(payloadText);

  if (payload.exp && Date.now() / 1000 > payload.exp) {
    throw new Error('Token has expired');
  }

  if (!payload.sub) {
    throw new Error('Token is missing subject claim (sub)');
  }

  return payload;
}

let getJwtClaimsOverride: any = null;
let getCurrentUserOverride: any = null;

export function overrideAuth(claims: any, user: any) {
  getJwtClaimsOverride = claims;
  getCurrentUserOverride = user;
}

const getEnvOverrides = () => {
  const url = Deno.env.get('SUPABASE_URL') || 'http://localhost:54321';
  const pubKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || 'public-anon-key';
  const secKey = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'service-role-key';
  
  let jwks = null;
  const rawJwks = Deno.env.get('SUPABASE_JWKS');
  if (rawJwks && rawJwks.trim()) {
    try {
      jwks = JSON.parse(rawJwks);
    } catch (_) {}
  }
  
  if (!jwks) {
    const rawJwksUrl = Deno.env.get('SUPABASE_JWKS_URL');
    if (rawJwksUrl && rawJwksUrl.trim()) {
      try {
        jwks = new URL(rawJwksUrl);
      } catch (_) {}
    }
  }
  
  if (!jwks) {
    const jwtSecret = Deno.env.get('SUPABASE_JWT_SECRET') || Deno.env.get('JWT_SECRET');
    if (jwtSecret) {
      try {
        const secretBytes = new TextEncoder().encode(jwtSecret);
        const binString = String.fromCharCode(...secretBytes);
        const k = btoa(binString).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
        jwks = {
          keys: [
            {
              kty: "oct",
              alg: "HS256",
              k: k,
              use: "sig",
              kid: "default"
            }
          ]
        };
      } catch (_) {}
    }
  }

  if (!jwks && (url.includes('localhost') || url.includes('127.0.0.1'))) {
    try {
      jwks = new URL(url + '/auth/v1/.well-known/jwks.json');
    } catch (_) {}
  }

  return {
    url,
    publishableKeys: {
      default: pubKey,
    },
    secretKeys: {
      default: secKey,
    },
    jwks
  };
};

export async function getJwtClaims(c: Context): Promise<any> {
  if (getJwtClaimsOverride) return getJwtClaimsOverride;
  const env = getEnvOverrides();
  const { data, error } = await createSupabaseContext(c.req.raw, {
    auth: 'user',
    env
  });
  if (error) {
    throw new HTTPException(401, { message: error.message });
  }
  return data.jwtClaims;
}

export async function getCurrentUser(c: Context): Promise<CurrentUser> {
  if (getCurrentUserOverride) return getCurrentUserOverride;
  const env = getEnvOverrides();
  const { data, error } = await createSupabaseContext(c.req.raw, {
    auth: 'user',
    env
  });
  if (error) {
    throw new HTTPException(401, { message: error.message });
  }
  const claims = data.userClaims;
  if (!claims) {
    throw new HTTPException(401, { message: 'Unauthorized' });
  }
  return {
    id: claims.id,
    email: claims.email || '',
    role: claims.role || 'authenticated'
  };
}


let serviceClientOverride: any = null;
let userClientOverride: any = null;

export function overrideClients(service: any, user: any) {
  serviceClientOverride = service;
  userClientOverride = user;
}

export function getServiceClient(): SupabaseClient {
  if (serviceClientOverride) return serviceClientOverride;
  const env = getEnvOverrides();
  return createAdminClient({ env });
}

export function getUserClient(c: Context): SupabaseClient {
  if (userClientOverride) return userClientOverride;
  const creds = extractCredentials(c.req.raw);
  const env = getEnvOverrides();
  return createContextClient({
    auth: { token: creds.token },
    env
  });
}

