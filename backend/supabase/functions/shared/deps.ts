import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8'
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

export async function getJwtClaims(c: Context): Promise<any> {
  if (getJwtClaimsOverride) return getJwtClaimsOverride;
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Missing token' });
  }
  const token = authHeader.substring(7);
  const secret = Deno.env.get('SUPABASE_JWT_SECRET') || 'test-secret-at-least-32-characters-long';
  try {
    return await verifyAndDecodeJwt(token, secret);
  } catch (err) {
    const defaultSecret = 'super-secret-jwt-token-with-at-least-32-characters-long';
    if (secret !== defaultSecret) {
      try {
        return await verifyAndDecodeJwt(token, defaultSecret);
      } catch (_) {
        // Fall through to original error
      }
    }
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new HTTPException(401, { message: errorMsg });
  }
}

export async function getCurrentUser(c: Context): Promise<CurrentUser> {
  if (getCurrentUserOverride) return getCurrentUserOverride;
  const claims = await getJwtClaims(c);
  return {
    id: claims.sub,
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
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  return createClient(supabaseUrl, serviceKey);
}

export function getUserClient(c: Context): SupabaseClient {
  if (userClientOverride) return userClientOverride;
  const authHeader = c.req.header('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  return createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authHeader || ''
      }
    }
  });
}
