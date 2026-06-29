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

app.post('/analytics_event', async (c) => {
  let body;
  try {
    body = await c.req.json()
  } catch (err) {
    return c.json({ detail: 'Invalid JSON body' }, 400)
  }

  const { event_name, distinct_id, properties = {} } = body
  if (!event_name || !distinct_id) {
    return c.json({ detail: 'Missing required analytics parameters' }, 400)
  }

  const errors: string[] = []

  // 1. PostHog API
  const posthogHost = Deno.env.get('POSTHOG_HOST') || ''
  const posthogApiKey = Deno.env.get('POSTHOG_API_KEY') || ''
  if (posthogHost && posthogApiKey) {
    const posthogUrl = `${posthogHost}/capture/`
    const posthogPayload = {
      api_key: posthogApiKey,
      event: event_name,
      properties: { distinct_id, ...properties }
    }
    try {
      const resp = await fetch(posthogUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${posthogApiKey}`
        },
        body: JSON.stringify(posthogPayload)
      })
      if (resp.status >= 400) {
        errors.push(`PostHog capture API returned status ${resp.status}: ${await resp.text()}`)
      }
    } catch (err) {
      errors.push(`Failed to forward to PostHog: ${(err as any).message}`)
    }
  }

  // 2. Firebase API
  const firebaseProjectId = Deno.env.get('FIREBASE_PROJECT_ID') || ''
  const firebaseApiKey = Deno.env.get('FIREBASE_API_KEY') || 'mock-firebase-api-key'
  if (firebaseProjectId) {
    const firebaseUrl = `https://firebase.googleapis.com/v1/projects/${firebaseProjectId}/events:logEvent?key=${firebaseApiKey}`
    const firebasePayload = {
      name: event_name,
      params: { user_id: distinct_id, ...properties }
    }
    try {
      const resp = await fetch(firebaseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(firebasePayload)
      })
      if (resp.status >= 400) {
        errors.push(`Firebase REST API returned status ${resp.status}: ${await resp.text()}`)
      }
    } catch (err) {
      errors.push(`Failed to forward to Firebase: ${(err as any).message}`)
    }
  }

  if (errors.length > 0) {
    return c.json({ success: false, errors })
  }
  return c.json({ success: true })
})

app.get('/admin/metrics', async (c) => {
  const currentUser = await getCurrentUser(c)
  if (currentUser.role !== 'admin') {
    return c.json({ detail: 'Admin access required.' }, 403)
  }

  const client = getServiceClient()
  try {
    const [recipes, users, likes, bookmarks] = await Promise.all([
      client.from('recipes').select('id', { count: 'exact', head: true }),
      client.from('user_profiles').select('id', { count: 'exact', head: true }),
      client.from('likes').select('id', { count: 'exact', head: true }),
      client.from('bookmarks').select('id', { count: 'exact', head: true })
    ])

    return c.json({
      recipes: recipes.count || 0,
      users: users.count || 0,
      likes: likes.count || 0,
      bookmarks: bookmarks.count || 0
    })
  } catch (err) {
    return c.json({ detail: `Analytics fetch failed: ${(err as any).message}` }, 400)
  }
})

Deno.serve((req) => {
  const url = new URL(req.url)
  if (url.pathname.startsWith('/functions/v1/analytics')) {
    url.pathname = url.pathname.replace('/functions/v1/analytics', '')
  } else if (url.pathname.startsWith('/analytics')) {
    url.pathname = url.pathname.replace('/analytics', '')
  }
  const newReq = new Request(url.toString(), req)
  return app.fetch(newReq)
})
