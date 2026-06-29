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

app.get('/', async (c) => {
  const userClient = getUserClient(c)
  const limit = parseInt(c.req.query('limit') || '10')
  const offset = parseInt(c.req.query('offset') || '0')
  const cubeTags = c.req.query('cube_tags')
  const dietaryTags = c.req.query('dietary_tags')

  try {
    let query = userClient.from('recipes').select('*')

    if (cubeTags) {
      const tagsList = cubeTags.split(',').map(t => t.trim()).filter(Boolean)
      if (tagsList.length > 0) {
        query = query.contains('cube_tags', tagsList)
      }
    }

    if (dietaryTags) {
      const tagsList = dietaryTags.split(',').map(t => t.trim()).filter(Boolean)
      if (tagsList.length > 0) {
        query = query.contains('dietary_tags', tagsList)
      }
    }

    const { data, error } = await query.range(offset, offset + limit - 1)

    if (error) {
      return c.json({ detail: `Failed to list recipes: ${error.message}` }, 400)
    }
    return c.json(data)
  } catch (err) {
    return c.json({ detail: `Failed to list recipes: ${(err as any).message}` }, 400)
  }
})

app.get('/:id', async (c) => {
  const id = c.req.param('id')
  const userClient = getUserClient(c)

  try {
    const { data, error } = await userClient.from('recipes').select('*').eq('id', id)
    if (error || !data || data.length === 0) {
      return c.json({ detail: 'Recipe not found or access denied.' }, 404)
    }
    return c.json(data[0])
  } catch (err) {
    return c.json({ detail: `Failed to fetch recipe: ${(err as any).message}` }, 400)
  }
})

app.post('/', async (c) => {
  const currentUser = await getCurrentUser(c)
  if (currentUser.role !== 'cms_editor') {
    return c.json({ detail: 'Forbidden: Requires cms_editor role.' }, 403)
  }

  const serviceClient = getServiceClient()
  const body = await c.req.json()

  try {
    const { data, error } = await serviceClient.from('recipes').insert(body).select()
    if (error || !data || data.length === 0) {
      return c.json({ detail: 'Failed to create recipe.' }, 400)
    }
    return c.json(data[0], 201)
  } catch (err) {
    return c.json({ detail: `Failed to create recipe: ${(err as any).message}` }, 400)
  }
})

app.put('/:id', async (c) => {
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
    const { data, error } = await serviceClient.from('recipes').update(body).eq('id', id).select()
    if (error || !data || data.length === 0) {
      return c.json({ detail: 'Recipe not found or update failed.' }, 404)
    }
    return c.json(data[0])
  } catch (err) {
    return c.json({ detail: `Failed to update recipe: ${(err as any).message}` }, 400)
  }
})

app.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const currentUser = await getCurrentUser(c)
  if (currentUser.role !== 'cms_editor') {
    return c.json({ detail: 'Forbidden: Requires cms_editor role.' }, 403)
  }

  const serviceClient = getServiceClient()
  try {
    const { error } = await serviceClient.from('recipes').delete().eq('id', id)
    if (error) {
      return c.json({ detail: `Failed to delete recipe: ${error.message}` }, 400)
    }
    c.status(204)
    return c.body(null)
  } catch (err) {
    return c.json({ detail: `Failed to delete recipe: ${(err as any).message}` }, 400)
  }
})

app.post('/:id/video', async (c) => {
  const recipeId = c.req.param('id')
  let filename = 'video.mp4'
  try {
    const body = await c.req.parseBody()
    const file = body['video']
    if (file && typeof file !== 'string') {
      filename = (file as any).name || 'video.mp4'
    }
  } catch (err) {
    // Ignore, use fallback
  }
  return c.json({ video_url: `https://cdn.supersauced/videos/${recipeId}/${filename}` }, 201)
})

app.post('/:id/tags', async (c) => {
  const recipeId = c.req.param('id')
  const currentUser = await getCurrentUser(c)
  if (currentUser.role !== 'cms_editor') {
    return c.json({ detail: 'Forbidden: Requires cms_editor role.' }, 403)
  }

  const client = getServiceClient()
  const tags = await c.req.json<string[]>()

  try {
    const { data, error } = await client
      .from('recipes')
      .update({ cube_tags: tags })
      .eq('id', recipeId)
      .select()

    if (error || !data || data.length === 0) {
      return c.json({ detail: 'Recipe not found.' }, 404)
    }
    return c.json(data[0])
  } catch (err) {
    return c.json({ detail: `Tag update failed: ${(err as any).message}` }, 400)
  }
})

app.post('/:id/publish', async (c) => {
  const recipeId = c.req.param('id')
  const currentUser = await getCurrentUser(c)
  if (currentUser.role !== 'cms_editor') {
    return c.json({ detail: 'Forbidden: Requires cms_editor role.' }, 403)
  }

  const client = getServiceClient()
  try {
    const { data, error } = await client
      .from('recipes')
      .update({ is_published: true })
      .eq('id', recipeId)
      .select()

    if (error || !data || data.length === 0) {
      return c.json({ detail: 'Recipe not found or cannot be published.' }, 404)
    }
    return c.json(data[0])
  } catch (err) {
    return c.json({ detail: `Publish failed: ${(err as any).message}` }, 400)
  }
})

app.delete('/:id/publish', async (c) => {
  const recipeId = c.req.param('id')
  const currentUser = await getCurrentUser(c)
  if (currentUser.role !== 'cms_editor') {
    return c.json({ detail: 'Forbidden: Requires cms_editor role.' }, 403)
  }

  const client = getServiceClient()
  try {
    const { error } = await client
      .from('recipes')
      .update({ is_published: false })
      .eq('id', recipeId)

    if (error) {
      return c.json({ detail: `Unpublish failed: ${error.message}` }, 400)
    }
    c.status(204)
    return c.body(null)
  } catch (err) {
    return c.json({ detail: `Unpublish failed: ${(err as any).message}` }, 400)
  }
})

Deno.serve((req) => {
  const url = new URL(req.url)
  if (url.pathname.startsWith('/functions/v1/recipes')) {
    url.pathname = url.pathname.replace('/functions/v1/recipes', '')
  }
  const newReq = new Request(url.toString(), req)
  return app.fetch(newReq)
})
