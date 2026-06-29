import { Hono } from 'https://deno.land/x/hono@v3.11.8/mod.ts'
import { cors } from 'https://deno.land/x/hono@v3.11.8/middleware/cors/index.ts'
import { getUserClient, getServiceClient, getCurrentUser } from '../shared/deps.ts'

const app = new Hono()

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowHeaders: ['Content-Type', 'Authorization', 'apikey'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
}))

// Ingredients endpoints
app.get('/ingredients', async (c) => {
  const userClient = getUserClient(c)
  const limit = parseInt(c.req.query('limit') || '10')
  const offset = parseInt(c.req.query('offset') || '0')

  try {
    const { data, error } = await userClient
      .from('recipe_ingredients')
      .select('*')
      .range(offset, offset + limit - 1)

    if (error) {
      return c.json({ detail: `Failed to list ingredients: ${error.message}` }, 400)
    }
    return c.json(data)
  } catch (err) {
    return c.json({ detail: `Failed to list ingredients: ${(err as any).message}` }, 400)
  }
})

app.get('/ingredients/:id', async (c) => {
  const id = c.req.param('id')
  const userClient = getUserClient(c)

  try {
    const { data, error } = await userClient.from('recipe_ingredients').select('*').eq('id', id)
    if (error || !data || data.length === 0) {
      return c.json({ detail: 'Ingredient not found or access denied.' }, 404)
    }
    return c.json(data[0])
  } catch (err) {
    return c.json({ detail: `Failed to fetch ingredient: ${(err as any).message}` }, 400)
  }
})

app.post('/ingredients', async (c) => {
  const currentUser = await getCurrentUser(c)
  if (currentUser.role !== 'cms_editor') {
    return c.json({ detail: 'Forbidden: Requires cms_editor role.' }, 403)
  }

  const serviceClient = getServiceClient()
  const body = await c.req.json()

  try {
    const { data, error } = await serviceClient.from('recipe_ingredients').insert(body).select()
    if (error || !data || data.length === 0) {
      return c.json({ detail: 'Failed to create ingredient.' }, 400)
    }
    return c.json(data[0], 201)
  } catch (err) {
    return c.json({ detail: `Failed to create ingredient: ${(err as any).message}` }, 400)
  }
})

app.put('/ingredients/:id', async (c) => {
  const id = c.req.param('id')
  const currentUser = await getCurrentUser(c)
  if (currentUser.role !== 'cms_editor') {
    return c.json({ detail: 'Forbidden: Requires cms_editor role.' }, 403)
  }

  const serviceClient = getServiceClient()
  const body = await c.req.json()
  if (!body || Object.keys(body).length === 0) {
    return c.json({ detail: 'No update fields provided.' }, 400)
  }

  try {
    const { data, error } = await serviceClient.from('recipe_ingredients').update(body).eq('id', id).select()
    if (error || !data || data.length === 0) {
      return c.json({ detail: 'Ingredient not found or update failed.' }, 404)
    }
    return c.json(data[0])
  } catch (err) {
    return c.json({ detail: `Failed to update ingredient: ${(err as any).message}` }, 400)
  }
})

app.delete('/ingredients/:id', async (c) => {
  const id = c.req.param('id')
  const currentUser = await getCurrentUser(c)
  if (currentUser.role !== 'cms_editor') {
    return c.json({ detail: 'Forbidden: Requires cms_editor role.' }, 403)
  }

  const serviceClient = getServiceClient()
  try {
    const { error } = await serviceClient.from('recipe_ingredients').delete().eq('id', id)
    if (error) {
      return c.json({ detail: `Failed to delete ingredient: ${error.message}` }, 400)
    }
    c.status(204)
    return c.body(null)
  } catch (err) {
    return c.json({ detail: `Failed to delete ingredient: ${(err as any).message}` }, 400)
  }
})

// Steps endpoints
app.get('/steps', async (c) => {
  const userClient = getUserClient(c)
  const limit = parseInt(c.req.query('limit') || '10')
  const offset = parseInt(c.req.query('offset') || '0')

  try {
    const { data, error } = await userClient
      .from('recipe_steps')
      .select('*')
      .range(offset, offset + limit - 1)

    if (error) {
      return c.json({ detail: `Failed to list steps: ${error.message}` }, 400)
    }
    return c.json(data)
  } catch (err) {
    return c.json({ detail: `Failed to list steps: ${(err as any).message}` }, 400)
  }
})

app.get('/steps/:id', async (c) => {
  const id = c.req.param('id')
  const userClient = getUserClient(c)

  try {
    const { data, error } = await userClient.from('recipe_steps').select('*').eq('id', id)
    if (error || !data || data.length === 0) {
      return c.json({ detail: 'Step not found or access denied.' }, 404)
    }
    return c.json(data[0])
  } catch (err) {
    return c.json({ detail: `Failed to fetch step: ${(err as any).message}` }, 400)
  }
})

app.post('/steps', async (c) => {
  const currentUser = await getCurrentUser(c)
  if (currentUser.role !== 'cms_editor') {
    return c.json({ detail: 'Forbidden: Requires cms_editor role.' }, 403)
  }

  const serviceClient = getServiceClient()
  const body = await c.req.json()

  try {
    const { data, error } = await serviceClient.from('recipe_steps').insert(body).select()
    if (error || !data || data.length === 0) {
      return c.json({ detail: 'Failed to create step.' }, 400)
    }
    return c.json(data[0], 201)
  } catch (err) {
    return c.json({ detail: `Failed to create step: ${(err as any).message}` }, 400)
  }
})

app.put('/steps/:id', async (c) => {
  const id = c.req.param('id')
  const currentUser = await getCurrentUser(c)
  if (currentUser.role !== 'cms_editor') {
    return c.json({ detail: 'Forbidden: Requires cms_editor role.' }, 403)
  }

  const serviceClient = getServiceClient()
  const body = await c.req.json()
  if (!body || Object.keys(body).length === 0) {
    return c.json({ detail: 'No update fields provided.' }, 400)
  }

  try {
    const { data, error } = await serviceClient.from('recipe_steps').update(body).eq('id', id).select()
    if (error || !data || data.length === 0) {
      return c.json({ detail: 'Step not found or update failed.' }, 404)
    }
    return c.json(data[0])
  } catch (err) {
    return c.json({ detail: `Failed to update step: ${(err as any).message}` }, 400)
  }
})

app.delete('/steps/:id', async (c) => {
  const id = c.req.param('id')
  const currentUser = await getCurrentUser(c)
  if (currentUser.role !== 'cms_editor') {
    return c.json({ detail: 'Forbidden: Requires cms_editor role.' }, 403)
  }

  const serviceClient = getServiceClient()
  try {
    const { error } = await serviceClient.from('recipe_steps').delete().eq('id', id)
    if (error) {
      return c.json({ detail: `Failed to delete step: ${error.message}` }, 400)
    }
    c.status(204)
    return c.body(null)
  } catch (err) {
    return c.json({ detail: `Failed to delete step: ${(err as any).message}` }, 400)
  }
})

// Guided cooking sequence
app.get('/:recipe_id/guided', async (c) => {
  const recipeId = c.req.param('recipe_id')
  const client = getUserClient(c)

  try {
    const { data, error } = await client
      .from('recipe_steps')
      .select('step_number,description')
      .eq('recipe_id', recipeId)
      .order('step_number')

    if (error) {
      return c.json({ detail: `Failed to fetch guided instructions: ${error.message}` }, 400)
    }

    const steps = (data || []).map(s => ({
      step: s.step_number,
      instruction: s.description
    }))
    return c.json(steps)
  } catch (err) {
    return c.json({ detail: `Failed to fetch guided instructions: ${(err as any).message}` }, 400)
  }
})

Deno.serve((req) => {
  const url = new URL(req.url)
  if (url.pathname.startsWith('/functions/v1/cooking')) {
    url.pathname = url.pathname.replace('/functions/v1/cooking', '')
  }
  const newReq = new Request(url.toString(), req)
  return app.fetch(newReq)
})
