import { Hono } from 'https://deno.land/x/hono@v3.11.8/mod.ts'
import { cors } from 'https://deno.land/x/hono@v3.11.8/middleware/cors/index.ts'
import { getServiceClient, getCurrentUser } from '../shared/deps.ts'

const app = new Hono()

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowHeaders: ['Content-Type', 'Authorization', 'apikey', 'X-Shopify-Hmac-Sha256'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
}))

app.post('/shopify_sync', async (c) => {
  const signature = c.req.header('X-Shopify-Hmac-Sha256')
  if (!signature) {
    return c.json({ detail: 'Missing X-Shopify-Hmac-Sha256 signature header' }, 401)
  }

  const secret = Deno.env.get('SHOPIFY_WEBHOOK_SECRET') || ''
  const rawBody = await c.req.text()

  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const data = encoder.encode(rawBody)
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, data)
  const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))

  if (signature !== expectedSignature) {
    return c.json({ detail: 'Invalid webhook signature' }, 401)
  }

  let payload;
  try {
    payload = JSON.parse(rawBody)
  } catch (err) {
    return c.json({ detail: 'Invalid JSON body' }, 400)
  }

  const email = payload.email || (payload.customer || {}).email
  const lineItems = payload.line_items || []

  if (!email) {
    return c.json({ detail: 'Missing customer identifier (email)' }, 400)
  }

  const client = getServiceClient()
  try {
    const { data: profiles, error: queryErr } = await client
      .from('user_profiles')
      .select('*')
      .eq('email', email)

    if (queryErr) {
      return c.json({ detail: `Database query error: ${queryErr.message}` }, 500)
    }

    if (!profiles || profiles.length === 0) {
      const pendingCredits = []
      for (const item of lineItems) {
        const sku = item.sku
        const quantity = item.quantity || 0
        if (sku) {
          pendingCredits.push({ email, sku, quantity })
        }
      }
      if (pendingCredits.length > 0) {
        try {
          await client.from('pending_sauce_log_credits').insert(pendingCredits)
        } catch (err) {
          return c.json({ success: true, message: `User profile not found. Pending credit log skipped: ${(err as any).message}` })
        }
      }
      return c.json({ success: true, message: 'User profile not found, logged pending credits.' })
    }

    const profile = profiles[0]
    const profileId = profile.id
    const sauceLog = profile.sauce_log || {}
    if (!sauceLog.inventory) {
      sauceLog.inventory = {}
    }

    const inventory = sauceLog.inventory
    for (const item of lineItems) {
      const sku = item.sku
      const quantity = item.quantity || 0
      if (sku) {
        if (!inventory[sku]) {
          inventory[sku] = { quantity: 0, last_updated: '' }
        }
        inventory[sku].quantity += quantity
        inventory[sku].last_updated = new Date().toISOString()
      }
    }

    const { data: updatedData, error: updateErr } = await client
      .from('user_profiles')
      .update({ sauce_log: sauceLog })
      .eq('id', profileId)
      .select()

    if (updateErr || !updatedData || updatedData.length === 0) {
      return c.json({ detail: `Failed to update sauce log: ${updateErr?.message || 'Database error'}` }, 500)
    }

    return c.json({ success: true, user_profile: updatedData[0] })
  } catch (err) {
    return c.json({ detail: `Failed to update sauce log: ${(err as any).message}` }, 500)
  }
})

app.post('/purchase', async (c) => {
  const currentUser = await getCurrentUser(c)
  const body = await c.req.json()
  const itemId = body.item_id
  return c.json({ order_id: `ORD-${currentUser.id.substring(0, 4)}-${(itemId || '').substring(0, 4)}`, status: 'pending' }, 201)
})

Deno.serve((req) => {
  const url = new URL(req.url)
  if (url.pathname.startsWith('/functions/v1/shopify')) {
    url.pathname = url.pathname.replace('/functions/v1/shopify', '')
  }
  const newReq = new Request(url.toString(), req)
  return app.fetch(newReq)
})
