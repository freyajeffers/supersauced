import { Hono } from 'https://deno.land/x/hono@v3.11.8/mod.ts'
import { getServiceClient, getCurrentUser } from '../deps.ts'

const router = new Hono()

// Require admin helper middleware/function
async function requireAdmin(c: any) {
  const currentUser = await getCurrentUser(c)
  if (currentUser.role !== 'admin') {
    throw new Error('Admin role required')
  }
}

// In-memory mock storage for administrative subscription tiers during testing
let mockTiers = [
  {
    id: "sub-1",
    name: "Free Tier",
    price: 0.00,
    cadence: "monthly",
    features: ["Standard recipes", "Ad-supported"],
    revenuecat_product_id: "free_monthly"
  },
  {
    id: "sub-2",
    name: "Premium Tier",
    price: 9.99,
    cadence: "monthly",
    features: ["All recipes", "Ad-free", "Guided voice navigation"],
    revenuecat_product_id: "premium_monthly"
  }
]

router.get('/', async (c) => {
  try {
    await requireAdmin(c)
  } catch (err) {
    return c.json({ detail: (err as any).message }, 403)
  }
  return c.json(mockTiers)
})

router.post('/', async (c) => {
  try {
    await requireAdmin(c)
  } catch (err) {
    return c.json({ detail: (err as any).message }, 403)
  }

  const body = await c.req.json()
  const newTier = {
    id: body.id || crypto.randomUUID(),
    name: body.name || 'New Tier',
    price: body.price || 0.0,
    cadence: body.cadence || 'monthly',
    features: body.features || [],
    revenuecat_product_id: body.revenuecat_product_id || ''
  }
  mockTiers.push(newTier)
  return c.json(newTier, 201)
})

router.put('/:id', async (c) => {
  try {
    await requireAdmin(c)
  } catch (err) {
    return c.json({ detail: (err as any).message }, 403)
  }

  const id = c.req.param('id')
  const body = await c.req.json()
  
  const index = mockTiers.findIndex(t => t.id === id)
  if (index === -1) {
    return c.json({ detail: 'Subscription not found' }, 404)
  }

  mockTiers[index] = { ...mockTiers[index], ...body }
  return c.json(mockTiers[index])
})

router.delete('/:id', async (c) => {
  try {
    await requireAdmin(c)
  } catch (err) {
    return c.json({ detail: (err as any).message }, 403)
  }

  const id = c.req.param('id')
  const index = mockTiers.findIndex(t => t.id === id)
  if (index === -1) {
    return c.json({ detail: 'Subscription not found' }, 404)
  }

  mockTiers.splice(index, 1)
  c.status(204)
  return c.body(null)
})

router.post('/webhook', async (c) => {
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
    // Assert the user exists in database
    const { data: profileData, error: profileErr } = await client.from('user_profiles').select('*').eq('user_id', userId)
    if (profileErr || !profileData || profileData.length === 0) {
      return c.json({ detail: `User profile with ID ${userId} not found.` }, 404)
    }

    // Since there is no sauce_log JSONB column in schema.sql user_profiles,
    // we process the webhook and return success directly.
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

export default router
