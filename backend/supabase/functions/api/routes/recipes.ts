import { Hono } from 'https://deno.land/x/hono@v3.11.8/mod.ts'
import { getServiceClient, getUserClient, getCurrentUser } from '../deps.ts'

const router = new Hono()

router.get('/', async (c) => {
  const client = getServiceClient()
  const limit = parseInt(c.req.query('limit') || '10')
  const offset = parseInt(c.req.query('offset') || '0')

  try {
    const { data, error } = await client
      .from('recipes')
      .select('*, metrics:recipe_metrics(*)')
      .range(offset, offset + limit - 1)

    if (error) {
      return c.json({ detail: `Failed to list recipes: ${error.message}` }, 400)
    }

    const mapped = (data || []).map(r => {
      const metrics = (r as any).metrics
      return {
        id: r.id,
        author_id: r.author_id,
        title: r.title,
        slug: r.slug,
        description: r.description,
        status: r.status,
        published_at: r.published_at,
        prep_time_seconds: metrics?.prep_time_seconds || 0,
        cook_time_seconds: metrics?.cook_time_seconds || 0,
        servings_default: metrics?.servings || 1,
        servings: metrics?.servings || 1,
        difficulty: metrics?.difficulty_level === 'easy' ? 1 : metrics?.difficulty_level === 'medium' ? 2 : 3,
        difficulty_level: metrics?.difficulty_level || 'easy',
        cube_tags: [],
        dietary_tags: []
      }
    })

    return c.json(mapped)
  } catch (err) {
    return c.json({ detail: `Failed to list recipes: ${(err as any).message}` }, 400)
  }
})

router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const client = getUserClient(c)

  const { data, error } = await client
    .from('recipes')
    .select('*, metrics:recipe_metrics(*)')
    .eq('id', id)
    .single()

  if (error) {
    return c.json({ detail: 'Recipe not found' }, 404)
  }

  const metrics = (data as any).metrics
  return c.json({
    id: data.id,
    author_id: data.author_id,
    title: data.title,
    slug: data.slug,
    description: data.description,
    status: data.status,
    published_at: data.published_at,
    prep_time_seconds: metrics?.prep_time_seconds || 0,
    cook_time_seconds: metrics?.cook_time_seconds || 0,
    servings_default: metrics?.servings || 1,
    servings: metrics?.servings || 1,
    difficulty: metrics?.difficulty_level === 'easy' ? 1 : metrics?.difficulty_level === 'medium' ? 2 : 3,
    difficulty_level: metrics?.difficulty_level || 'easy',
    cube_tags: [],
    dietary_tags: []
  })
})

router.post('/', async (c) => {
  const currentUser = await getCurrentUser(c)
  if (currentUser.role !== 'cms_editor') {
    return c.json({ detail: 'Forbidden: Requires cms_editor role.' }, 403)
  }

  const serviceClient = getServiceClient()
  const body = await c.req.json()

  const recipePayload = {
    title: body.title,
    slug: body.slug || body.title?.toLowerCase().replace(/ /g, '-'),
    description: body.description || '',
    status: body.status || 'draft',
    published_at: body.published_at || null,
    author_id: currentUser.id
  }

  try {
    const { data: recipeData, error: recipeErr } = await serviceClient
      .from('recipes')
      .insert(recipePayload)
      .select()

    if (recipeErr || !recipeData || recipeData.length === 0) {
      return c.json({ detail: `Failed to create recipe: ${recipeErr?.message || 'Database error'}` }, 400)
    }

    const recipe = recipeData[0]
    const difficultyLevel = body.difficulty === 1 ? 'easy' : body.difficulty === 2 ? 'medium' : body.difficulty_level || 'easy'
    const metricsPayload = {
      recipe_id: recipe.id,
      prep_time_seconds: body.prep_time_seconds || (body.prep_time_minutes ? body.prep_time_minutes * 60 : 0),
      cook_time_seconds: body.cook_time_seconds || (body.cook_time_minutes ? body.cook_time_minutes * 60 : 0),
      servings: body.servings || body.servings_default || 1,
      difficulty_level: difficultyLevel
    }

    await serviceClient.from('recipe_metrics').insert(metricsPayload)

    return c.json({
      id: recipe.id,
      ...recipe,
      ...metricsPayload,
      servings_default: metricsPayload.servings
    }, 201)
  } catch (err) {
    return c.json({ detail: `Failed to create recipe: ${(err as any).message}` }, 400)
  }
})

router.put('/:id', async (c) => {
  const id = c.req.param('id')
  const serviceClient = getServiceClient()
  const body = await c.req.json()
  if (!body || Object.keys(body).length === 0) {
    return c.json({ detail: 'No update fields provided.' }, 400)
  }

  const recipeUpdate: any = {}
  if (body.title !== undefined) recipeUpdate.title = body.title
  if (body.slug !== undefined) recipeUpdate.slug = body.slug
  if (body.description !== undefined) recipeUpdate.description = body.description
  if (body.status !== undefined) recipeUpdate.status = body.status
  if (body.published_at !== undefined) recipeUpdate.published_at = body.published_at

  const metricsUpdate: any = {}
  if (body.prep_time_seconds !== undefined) metricsUpdate.prep_time_seconds = body.prep_time_seconds
  if (body.cook_time_seconds !== undefined) metricsUpdate.cook_time_seconds = body.cook_time_seconds
  if (body.servings !== undefined) metricsUpdate.servings = body.servings
  if (body.servings_default !== undefined) metricsUpdate.servings = body.servings_default
  if (body.difficulty !== undefined) {
    metricsUpdate.difficulty_level = body.difficulty === 1 ? 'easy' : body.difficulty === 2 ? 'medium' : 'hard'
  }
  if (body.difficulty_level !== undefined) metricsUpdate.difficulty_level = body.difficulty_level

  try {
    let recipe = null
    if (Object.keys(recipeUpdate).length > 0) {
      const { data, error } = await serviceClient.from('recipes').update(recipeUpdate).eq('id', id).select()
      if (error || !data || data.length === 0) {
        return c.json({ detail: 'Recipe not found or update failed.' }, 404)
      }
      recipe = data[0]
    } else {
      const { data } = await serviceClient.from('recipes').select('*').eq('id', id)
      if (data && data.length > 0) recipe = data[0]
    }

    if (!recipe) {
      return c.json({ detail: 'Recipe not found.' }, 404)
    }

    if (Object.keys(metricsUpdate).length > 0) {
      await serviceClient.from('recipe_metrics').update(metricsUpdate).eq('recipe_id', id)
    }

    const { data: finalMetrics } = await serviceClient.from('recipe_metrics').select('*').eq('recipe_id', id)
    const metrics = finalMetrics && finalMetrics.length > 0 ? finalMetrics[0] : {}

    return c.json({
      id: recipe.id,
      author_id: recipe.author_id,
      title: recipe.title,
      slug: recipe.slug,
      description: recipe.description,
      status: recipe.status,
      published_at: recipe.published_at,
      prep_time_seconds: metrics.prep_time_seconds || 0,
      cook_time_seconds: metrics.cook_time_seconds || 0,
      servings: metrics.servings || 1,
      servings_default: metrics.servings || 1,
      difficulty_level: metrics.difficulty_level || 'easy'
    })
  } catch (err) {
    return c.json({ detail: `Failed to update recipe: ${(err as any).message}` }, 400)
  }
})

router.delete('/:id', async (c) => {
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

export default router
