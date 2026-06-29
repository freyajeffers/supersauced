import { Hono } from 'https://deno.land/x/hono@v3.11.8/mod.ts'
import { cors } from 'https://deno.land/x/hono@v3.11.8/middleware/cors/index.ts'
import { getServiceClient, getCurrentUser } from '../shared/deps.ts'

const app = new Hono()

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowHeaders: ['Content-Type', 'Authorization', 'apikey'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
}))

async function requireAdmin(c: any) {
  const currentUser = await getCurrentUser(c)
  if (currentUser.role !== 'admin') {
    throw new Error('Admin role required')
  }
}

app.get('/', async (c) => {
  try {
    await requireAdmin(c)
  } catch (err) {
    return c.json({ detail: (err as any).message }, 403)
  }

  const client = getServiceClient()
  try {
    const { data, error } = await client.from('subscriptions').select('*')
    if (error) {
      return c.json({ detail: `Failed to list subscriptions: ${error.message}` }, 400)
    }
    return c.json(data)
  } catch (err) {
    return c.json({ detail: `Failed to list subscriptions: ${(err as any).message}` }, 400)
  }
})

app.post('/', async (c) => {
  try {
    await requireAdmin(c)
  } catch (err) {
    return c.json({ detail: (err as any).message }, 403)
  }

  const client = getServiceClient()
  const body = await c.req.json()

  try {
    const { data, error } = await client.from('subscriptions').insert(body).select()
    if (error || !data || data.length === 0) {
      return c.json({ detail: 'Failed to create subscription' }, 400)
    }
    return c.json(data[0], 201)
  } catch (err) {
    return c.json({ detail: `Create subscription failed: ${(err as any).message}` }, 400)
  }
})

app.put('/:id', async (c) => {
  try {
    await requireAdmin(c)
  } catch (err) {
    return c.json({ detail: (err as any).message }, 403)
  }

  const id = c.req.param('id')
  const client = getServiceClient()
  const body = await c.req.json()
  if (!body || Object.keys(body).length === 0) {
    return c.json({ detail: 'No update fields provided.' }, 400)
  }

  try {
    const { data, error } = await client.from('subscriptions').update(body).eq('id', id).select()
    if (error || !data || data.length === 0) {
      return c.json({ detail: 'Subscription not found or update failed.' }, 404)
    }
    return c.json(data[0])
  } catch (err) {
    return c.json({ detail: `Update subscription failed: ${(err as any).message}` }, 400)
  }
})

app.delete('/:id', async (c) => {
  try {
    await requireAdmin(c)
  } catch (err) {
    return c.json({ detail: (err as any).message }, 403)
  }

  const id = c.req.param('id')
  const client = getServiceClient()

  try {
    const { error } = await client.from('subscriptions').delete().eq('id', id)
    if (error) {
      return c.json({ detail: `Delete subscription failed: ${error.message}` }, 400)
    }
    c.status(204)
    return c.body(null)
  } catch (err) {
    return c.json({ detail: `Delete subscription failed: ${(err as any).message}` }, 400)
  }
})

app.post('/webhook', async (c) => {
  const authorization = c.req.header('Authorization')
  const secret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') || 'mock-revenuecat-webhook-secret'
  const expectedAuth = `Bearer ${secret}`

  if (!authorization || authorization !== expectedAuth) {
    return c.json({ detail: 'Invalid or missing RevenueCat webhook authentication token' }, 401)
  }

  let payload;
  try {
    payload = await c.req.json()
  } catch (err) {
    return c.json({ detail: 'Invalid JSON payload' }, 400)
  }

  const event = payload.get ? payload.get('event') : payload.event
  if (!event) {
    return c.json({ detail: 'Missing event data in payload' }, 400)
  }

  const eventType = event.type
  const userId = event.app_user_id
  const entitlementId = event.entitlement_id
  const productId = event.product_id
  const expirationAtMs = event.expiration_at_ms

  if (!userId) {
    return c.json({ detail: 'Missing app_user_id in event data' }, 400)
  }

  let isActive = eventType === 'INITIAL_PURCHASE' || eventType === 'RENEWAL' || eventType === 'SUBSCRIBER_ALIAS'
  if (eventType === 'CANCELLATION' || eventType === 'EXPIRATION' || eventType === 'BILLING_ISSUE') {
    isActive = false
  }

  const client = getServiceClient()

  try {
    const { data: profileData, error: profileErr } = await client.from('user_profiles').select('*').eq('id', userId)
    if (profileErr || !profileData || profileData.length === 0) {
      return c.json({ detail: `User profile with ID ${userId} not found.` }, 404)
    }

    const profile = profileData[0]
    const sauceLog = profile.sauce_log || {}
    sauceLog.subscription = {
      is_active: isActive,
      entitlement_id: entitlementId || null,
      product_id: productId || null,
      event_type: eventType,
      expiration_at_ms: expirationAtMs || null,
      last_webhook_received_at: new Date().toISOString()
    }

    const { error: updateErr } = await client.from('user_profiles').update({ sauce_log: sauceLog }).eq('id', userId)
    if (updateErr) {
      return c.json({ detail: `Failed to update sauce log: ${updateErr.message}` }, 500)
    }

    return c.json({
      success: true,
      processed_event: eventType,
      user_id: userId,
      subscription_active: isActive
    })
  } catch (err) {
    return c.json({ detail: `Failed to process RevenueCat webhook: ${(err as any).message}` }, 500)
  }
})

app.get('/status', async (c) => {
  const currentUser = await getCurrentUser(c)
  return c.json({ user_id: currentUser.id, tier: 'free' })
})

app.post('/upgrade', async (c) => {
  const currentUser = await getCurrentUser(c)
  return c.json({ user_id: currentUser.id, new_tier: 'premium', status: 'upgraded' })
})

Deno.serve((req) => {
  const url = new URL(req.url)
  if (url.pathname.startsWith('/functions/v1/billing')) {
    url.pathname = url.pathname.replace('/functions/v1/billing', '')
  }
  const newReq = new Request(url.toString(), req)
  return app.fetch(newReq)
})
