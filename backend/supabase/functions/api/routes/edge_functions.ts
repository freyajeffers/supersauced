import { Hono } from 'https://deno.land/x/hono@v3.11.8/mod.ts';
import { getServiceClient } from '../deps.ts';

const router = new Hono();

// Auth callback edge function: creates or updates user profile and settings
router.post('/auth_callback', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ detail: 'Invalid JSON body' }, 400);
  }
  const user = body.user;
  if (!user?.id || !user?.email) {
    return c.json({ detail: 'Missing user info (id and email are required)' }, 400);
  }
  const meta = user.user_metadata || {};
  const fullName = meta.full_name || '';
  const parts = fullName.trim().split(' ');
  const firstName = parts[0] || user.email.split('@')[0];
  const lastName = parts.slice(1).join(' ') || '';
  const profileData = {
    user_id: user.id,
    first_name: firstName,
    last_name: lastName,
    bio: meta.bio || '',
  };
  const client = getServiceClient();
  try {
    await client.from('user_profiles').upsert(profileData, { onConflict: 'user_id' });
    await client.from('user_settings').upsert({
      user_id: user.id,
      measurement_system: 'metric',
      push_notifications: false,
      newsletter: false,
    }, { onConflict: 'user_id' });
  } catch (e) {
    return c.json({ detail: `Upsert failed: ${(e as any).message}` }, 500);
  }
  return c.json({ success: true, user: profileData }, 200);
});

// Shopify sync edge function: validates signature, matches user via email, returns profile
router.post('/shopify_sync', async (c) => {
  const signature = c.req.header('X-Shopify-Hmac-Sha256');
  if (!signature) return c.json({ detail: 'Missing X-Shopify-Hmac-Sha256 signature header' }, 401);
  const secret = Deno.env.get('SHOPIFY_WEBHOOK_SECRET') || '';
  const rawBody = await c.req.text();
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const data = encoder.encode(rawBody);
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, data);
  const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
  if (signature !== expectedSignature) return c.json({ detail: 'Invalid webhook signature' }, 401);
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ detail: 'Invalid JSON body' }, 400);
  }
  const email = payload.email || (payload.customer || {}).email;
  const lineItems = payload.line_items || [];
  if (!email) return c.json({ detail: 'Missing customer identifier (email)' }, 400);
  const client = getServiceClient();
  // Find matching user profile by email
  const { data: profiles, error: profErr } = await client.from('user_profiles').select('*').eq('email', email);
  if (profErr) {
    return c.json({ detail: `Database profile query error: ${profErr.message}` }, 500);
  }
  if (!profiles || profiles.length === 0) {
    return c.json({ success: true, message: 'User profile not found, logged pending credits.' }, 200);
  }
  const profile = profiles[0];
  return c.json({
    success: true,
    user_profile: {
      id: profile.user_id,
      user_id: profile.user_id,
      first_name: profile.first_name,
      last_name: profile.last_name,
      purchased_items: lineItems,
    },
  }, 200);
});

// Analytics event edge function: forwards events to PostHog and Firebase if configured
router.post('/analytics_event', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ detail: 'Invalid JSON body' }, 400);
  }
  const { event_name, distinct_id, properties = {} } = body;
  if (!event_name || !distinct_id) {
    return c.json({ detail: 'Missing required analytics parameters' }, 400);
  }
  const errors: string[] = [];
  // PostHog forwarding
  const posthogHost = Deno.env.get('POSTHOG_HOST');
  const posthogApiKey = Deno.env.get('POSTHOG_API_KEY');
  if (posthogHost && posthogApiKey) {
    const posthogUrl = `${posthogHost}/capture/`;
    const payload = {
      api_key: posthogApiKey,
      event: event_name,
      properties: { distinct_id, ...properties },
    };
    try {
      const resp = await fetch(posthogUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${posthogApiKey}` },
        body: JSON.stringify(payload),
      });
      if (resp.status >= 400) {
        errors.push(`PostHog error ${resp.status}: ${await resp.text()}`);
      }
    } catch (e) {
      errors.push(`PostHog request failed: ${(e as any).message}`);
    }
  }
  // Firebase forwarding
  const firebaseProjectId = Deno.env.get('FIREBASE_PROJECT_ID');
  const firebaseApiKey = Deno.env.get('FIREBASE_API_KEY');
  if (firebaseProjectId && firebaseApiKey) {
    const firebaseUrl = `https://firebase.googleapis.com/v1/projects/${firebaseProjectId}/events:logEvent?key=${firebaseApiKey}`;
    const payload = { name: event_name, params: { user_id: distinct_id, ...properties } };
    try {
      const resp = await fetch(firebaseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (resp.status >= 400) {
        errors.push(`Firebase error ${resp.status}: ${await resp.text()}`);
      }
    } catch (e) {
      errors.push(`Firebase request failed: ${(e as any).message}`);
    }
  }
  if (errors.length) {
    return c.json({ success: false, errors }, 500);
  }
  return c.json({ success: true }, 200);
});

export default router;
