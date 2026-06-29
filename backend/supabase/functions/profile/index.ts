import { Hono } from 'https://deno.land/x/hono@v3.11.8/mod.ts'
import { cors } from 'https://deno.land/x/hono@v3.11.8/middleware/cors/index.ts'
import { getUserClient, getCurrentUser } from '../shared/deps.ts'

const app = new Hono()

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowHeaders: ['Content-Type', 'Authorization', 'apikey'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
}))

app.get('/', async (c) => {
  const client = getUserClient(c)
  try {
    const { data, error } = await client.from('user_profiles').select('*')
    if (error) {
      return c.json({ detail: `Failed to query profiles: ${error.message}` }, 400)
    }
    return c.json(data)
  } catch (err) {
    return c.json({ detail: `Failed to query profiles: ${(err as any).message}` }, 400)
  }
})

app.get('/:id', async (c) => {
  const id = c.req.param('id')
  const client = getUserClient(c)
  try {
    const { data, error } = await client.from('user_profiles').select('*').eq('id', id)
    if (error || !data || data.length === 0) {
      return c.json({ detail: 'Profile not found or access denied.' }, 404)
    }
    return c.json(data[0])
  } catch (err) {
    return c.json({ detail: `Failed to fetch profile: ${(err as any).message}` }, 400)
  }
})

app.put('/:id', async (c) => {
  const id = c.req.param('id')
  const currentUser = await getCurrentUser(c)
  const client = getUserClient(c)

  if (id !== currentUser.id) {
    return c.json({ detail: 'Forbidden: You can only modify your own profile.' }, 403)
  }

  const body = await c.req.json()
  if (!body || Object.keys(body).length === 0) {
    return c.json({ detail: 'No update fields provided.' }, 400)
  }

  try {
    const { data, error } = await client
      .from('user_profiles')
      .update(body)
      .eq('id', id)
      .select()

    if (error || !data || data.length === 0) {
      return c.json({ detail: 'Profile not found or update failed.' }, 404)
    }
    return c.json(data[0])
  } catch (err) {
    return c.json({ detail: `Failed to update profile: ${(err as any).message}` }, 400)
  }
})

app.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const currentUser = await getCurrentUser(c)
  const client = getUserClient(c)

  if (id !== currentUser.id) {
    return c.json({ detail: 'Forbidden: You can only delete your own profile.' }, 403)
  }

  try {
    const { error } = await client.from('user_profiles').delete().eq('id', id)
    if (error) {
      return c.json({ detail: `Failed to delete profile: ${error.message}` }, 400)
    }
    c.status(204)
    return c.body(null)
  } catch (err) {
    return c.json({ detail: `Failed to delete profile: ${(err as any).message}` }, 400)
  }
})

app.get('/rewards/:user_id', async (c) => {
  const userId = c.req.param('user_id')
  const currentUser = await getCurrentUser(c)

  if (currentUser.role !== 'admin' && currentUser.role !== 'cms_editor' && currentUser.id !== userId) {
    return c.json({ detail: 'Can only view your own rewards.' }, 403)
  }
  return c.json({ user_id: userId, points: 1234 })
})

Deno.serve((req) => {
  const url = new URL(req.url)
  if (url.pathname.startsWith('/functions/v1/profile')) {
    url.pathname = url.pathname.replace('/functions/v1/profile', '')
  }
  const newReq = new Request(url.toString(), req)
  return app.fetch(newReq)
})
