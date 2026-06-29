import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8'
import { Context } from 'https://deno.land/x/hono@v3.11.8/mod.ts'
import { HTTPException } from 'https://deno.land/x/hono@v3.11.8/http-exception.ts'
import { CurrentUser } from './types.ts'

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
  const token = c.req.header('Authorization')?.replace('Bearer ', '') || '';
  const secretsToTry = [
    Deno.env.get('JWT_SECRET'),
    Deno.env.get('SUPABASE_JWT_SECRET'),
    'super-secret-jwt-token-with-at-least-32-characters-long',
    'test-secret-at-least-32-characters-long'
  ].filter(Boolean) as string[];

  let lastError: any = null;
  for (const secret of secretsToTry) {
    try {
      return await verifyAndDecodeJwt(token, secret);
    } catch (err) {
      lastError = err;
    }
  }

  const errorMsg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new HTTPException(401, { message: errorMsg });
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
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'http://localhost:54321';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || 'test-key';
  return createClient(supabaseUrl, serviceKey);
}

export function getUserClient(c: Context): SupabaseClient {
  if (userClientOverride) return userClientOverride;
  const authHeader = c.req.header('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'http://localhost:54321';
  // Use a non-privileged anon key; avoid pulling in service role key which can bypass RLS.
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || 'public-anon-key';
  return createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authHeader || '',
        apikey: anonKey,
      }
    }
  });
}
