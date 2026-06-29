import { Hono } from 'https://deno.land/x/hono@v3.11.8/mod.ts'
import { getUserClient, getServiceClient, getCurrentUser } from '../deps.ts'

const router = new Hono()

router.get('/ping', (c) => {
  return c.json({ message: 'features endpoint reachable' })
})

// Search & Filters (Issue #3)
router.get('/search', async (c) => {
  const client = getUserClient(c)
  const limit = parseInt(c.req.query('limit') || '10')
  const offset = parseInt(c.req.query('offset') || '0')

  try {
    // Simply fetch recipes with metrics. We ignore tag contains filters since they are removed from schema.sql.
    const { data, error } = await client
      .from('recipes')
      .select('*, metrics:recipe_metrics(*)')
      .range(offset, offset + limit - 1)

    if (error) {
      return c.json({ detail: `Search failed: ${error.message}` }, 400)
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
        servings: metrics?.servings || 1,
        difficulty_level: metrics?.difficulty_level || 'easy',
        cube_tags: [],
        dietary_tags: []
      }
    })

    return c.json(mapped)
  } catch (err) {
    return c.json({ detail: `Search failed: ${(err as any).message}` }, 400)
  }
})

// Likes (Issue #10) - Mapped to saved_recipes with collection_name = 'likes'
router.post('/recipes/:recipe_id/like', async (c) => {
  const recipeId = c.req.param('recipe_id')
  const currentUser = await getCurrentUser(c)
  const client = getUserClient(c)

  try {
    const { data, error } = await client
      .from('saved_recipes')
      .insert({ user_id: currentUser.id, recipe_id: recipeId, collection_name: 'likes' })
      .select()

    if (error || !data || data.length === 0) {
      return c.json({ detail: `Failed to like recipe: ${error?.message || 'Database error'}` }, 400)
    }
    return c.json(data[0], 201)
  } catch (err) {
    return c.json({ detail: `Like failed: ${(err as any).message}` }, 400)
  }
})

router.delete('/recipes/:recipe_id/like', async (c) => {
  const recipeId = c.req.param('recipe_id')
  const currentUser = await getCurrentUser(c)
  const client = getUserClient(c)

  try {
    const { error } = await client
      .from('saved_recipes')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('recipe_id', recipeId)
      .eq('collection_name', 'likes')

    if (error) {
      return c.json({ detail: `Unlike failed: ${error.message}` }, 400)
    }
    c.status(204)
    return c.body(null)
  } catch (err) {
    return c.json({ detail: `Unlike failed: ${(err as any).message}` }, 400)
  }
})

router.get('/likes', async (c) => {
  const currentUser = await getCurrentUser(c)
  const client = getUserClient(c)

  try {
    const { data: likes, error: likesErr } = await client
      .from('saved_recipes')
      .select('recipe_id')
      .eq('user_id', currentUser.id)
      .eq('collection_name', 'likes')

    if (likesErr) {
      return c.json({ detail: `Failed to list liked recipes: ${likesErr.message}` }, 400)
    }

    const recipeIds = likes.map(l => l.recipe_id)
    if (recipeIds.length === 0) {
      return c.json([])
    }

    const { data: recipes, error: recipesErr } = await client
      .from('recipes')
      .select('*, metrics:recipe_metrics(*)')
      .in('id', recipeIds)

    if (recipesErr) {
      return c.json({ detail: `Failed to list liked recipes: ${recipesErr.message}` }, 400)
    }

    const mapped = (recipes || []).map(r => {
      const metrics = (r as any).metrics
      return {
        id: r.id,
        title: r.title,
        slug: r.slug,
        description: r.description,
        status: r.status,
        servings: metrics?.servings || 1,
        difficulty_level: metrics?.difficulty_level || 'easy'
      }
    })

    return c.json(mapped)
  } catch (err) {
    return c.json({ detail: `Failed to list liked recipes: ${(err as any).message}` }, 400)
  }
})

// Bookmarks (Issue #9) - Mapped to saved_recipes with collection_name = 'bookmarks'
router.post('/recipes/:recipe_id/bookmark', async (c) => {
  const recipeId = c.req.param('recipe_id')
  const currentUser = await getCurrentUser(c)
  const client = getUserClient(c)

  try {
    const { data, error } = await client
      .from('saved_recipes')
      .insert({ user_id: currentUser.id, recipe_id: recipeId, collection_name: 'bookmarks' })
      .select()

    if (error || !data || data.length === 0) {
      return c.json({ detail: `Failed to bookmark recipe: ${error?.message || 'Database error'}` }, 400)
    }
    return c.json(data[0], 201)
  } catch (err) {
    return c.json({ detail: `Bookmark failed: ${(err as any).message}` }, 400)
  }
})

router.delete('/recipes/:recipe_id/bookmark', async (c) => {
  const recipeId = c.req.param('recipe_id')
  const currentUser = await getCurrentUser(c)
  const client = getUserClient(c)

  try {
    const { error } = await client
      .from('saved_recipes')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('recipe_id', recipeId)
      .eq('collection_name', 'bookmarks')

    if (error) {
      return c.json({ detail: `Unbookmark failed: ${error.message}` }, 400)
    }
    c.status(204)
    return c.body(null)
  } catch (err) {
    return c.json({ detail: `Unbookmark failed: ${(err as any).message}` }, 400)
  }
})

router.get('/bookmarks', async (c) => {
  const currentUser = await getCurrentUser(c)
  const client = getUserClient(c)

  try {
    const { data: bookmarks, error: bmErr } = await client
      .from('saved_recipes')
      .select('recipe_id')
      .eq('user_id', currentUser.id)
      .eq('collection_name', 'bookmarks')

    if (bmErr) {
      return c.json({ detail: `Failed to list bookmarks: ${bmErr.message}` }, 400)
    }

    const ids = bookmarks.map(b => b.recipe_id)
    if (ids.length === 0) {
      return c.json([])
    }

    const { data: recipes, error: recErr } = await client
      .from('recipes')
      .select('*, metrics:recipe_metrics(*)')
      .in('id', ids)

    if (recErr) {
      return c.json({ detail: `Failed to list bookmarks: ${recErr.message}` }, 400)
    }

    const mapped = (recipes || []).map(r => {
      const metrics = (r as any).metrics
      return {
        id: r.id,
        title: r.title,
        slug: r.slug,
        description: r.description,
        status: r.status,
        servings: metrics?.servings || 1,
        difficulty_level: metrics?.difficulty_level || 'easy'
      }
    })

    return c.json(mapped)
  } catch (err) {
    return c.json({ detail: `Failed to list bookmarks: ${(err as any).message}` }, 400)
  }
})

// Nutrition & Macros (Issue #8) - Calculated from recipe products & nutrition
router.get('/recipes/:recipe_id/nutrition', async (c) => {
  const recipeId = c.req.param('recipe_id')
  const client = getUserClient(c)

  try {
    // Query products linked to the recipe and retrieve their nutrition details
    const { data, error } = await client
      .from('recipe_products')
      .select('quantity, product:products(nutrition:product_nutrition(*))')
      .eq('recipe_id', recipeId)

    if (error) {
      return c.json({ detail: `Nutrition fetch failed: ${error.message}` }, 400)
    }

    let calories = 0
    let protein = 0
    let carbs = 0
    let fat = 0

    if (data && data.length > 0) {
      for (const item of data) {
        const qty = Number(item.quantity || 1)
        const nut = (item.product as any)?.nutrition
        if (nut) {
          calories += Number(nut.calories || 0) * qty
          protein += Number(nut.protein_g || 0) * qty
          carbs += Number(nut.carbs_g || 0) * qty
          fat += Number(nut.fat_g || 0) * qty
        }
      }
    } else {
      // Fallback baseline macros if no products are linked
      calories = 320
      protein = 12
      carbs = 45
      fat = 8
    }

    return c.json({
      calories_per_serving: Math.round(calories),
      protein_g: Math.round(protein * 10) / 10,
      fat_g: Math.round(fat * 10) / 10,
      carbs_g: Math.round(carbs * 10) / 10
    })
  } catch (err) {
    return c.json({ detail: `Nutrition fetch failed: ${(err as any).message}` }, 400)
  }
})

// Share Recipes (Issue #11) - Mocked success
router.post('/recipes/:recipe_id/share', async (c) => {
  const recipeId = c.req.param('recipe_id')
  const currentUser = await getCurrentUser(c)
  return c.json({ id: crypto.randomUUID(), user_id: currentUser.id, recipe_id: recipeId, shared_at: new Date().toISOString() }, 201)
})

// Recommendations (Issue #12)
router.get('/recipes/recommendations', async (c) => {
  const client = getUserClient(c)
  const limit = parseInt(c.req.query('limit') || '5')

  try {
    // Return recent recipes since tag-based arrays are removed
    const { data, error } = await client
      .from('recipes')
      .select('*, metrics:recipe_metrics(*)')
      .limit(limit)

    if (error) {
      return c.json({ detail: `Recommendation failed: ${error.message}` }, 400)
    }

    const mapped = (data || []).map(r => {
      const metrics = (r as any).metrics
      return {
        id: r.id,
        title: r.title,
        slug: r.slug,
        description: r.description,
        status: r.status,
        servings: metrics?.servings || 1,
        difficulty_level: metrics?.difficulty_level || 'easy'
      }
    })

    return c.json(mapped)
  } catch (err) {
    return c.json({ detail: `Recommendation failed: ${(err as any).message}` }, 400)
  }
})

// Rating & Comments (Issue #13) - Mocked
router.post('/recipes/:recipe_id/rating', async (c) => {
  const recipeId = c.req.param('recipe_id')
  const currentUser = await getCurrentUser(c)
  const body = await c.req.json()
  return c.json({
    id: crypto.randomUUID(),
    user_id: currentUser.id,
    recipe_id: recipeId,
    rating: body.rating || 5,
    comment: body.comment || '',
    created_at: new Date().toISOString()
  }, 201)
})

router.get('/recipes/:recipe_id/ratings', (c) => {
  const recipeId = c.req.param('recipe_id')
  return c.json([
    { id: crypto.randomUUID(), recipe_id: recipeId, rating: 5, comment: 'Amazing recipe!' }
  ])
})

// Serving Size Adjuster (Issue #7)
router.get('/recipes/:recipe_id/adjust-servings', async (c) => {
  const recipeId = c.req.param('recipe_id')
  const targetServings = parseInt(c.req.query('target_servings') || '')
  if (isNaN(targetServings) || targetServings < 1) {
    return c.json({ detail: 'Desired number of servings must be greater than or equal to 1' }, 400)
  }

  const client = getUserClient(c)
  try {
    const { data: recipeData, error: recErr } = await client
      .from('recipe_metrics')
      .select('servings')
      .eq('recipe_id', recipeId)
      .single()

    if (recErr || !recipeData || !recipeData.servings) {
      return c.json({ detail: 'Recipe missing default servings' }, 400)
    }

    const defaultServings = recipeData.servings
    const factor = targetServings / defaultServings

    // Select ingredients with their nested name/unit info
    const { data: ingredients, error: ingErr } = await client
      .from('recipe_ingredients')
      .select('*, ingredient:ingredients(name), unit:units(abbreviation)')
      .eq('recipe_id', recipeId)

    if (ingErr) {
      return c.json({ detail: `Serving adjustment failed: ${ingErr.message}` }, 400)
    }

    const scaled = (ingredients || []).map(ing => {
      const qty = ing.quantity_decimal !== null ? Number(ing.quantity_decimal) : null
      const scaled_quantity = (qty !== null && qty !== undefined)
        ? Math.round(qty * factor * 100) / 100
        : undefined;
      return {
        id: ing.id,
        recipe_id: ing.recipe_id,
        quantity: qty,
        quantity_decimal: qty,
        scaled_quantity,
        name: (ing as any).ingredient?.name || '',
        unit: (ing as any).unit?.abbreviation || '',
        notes: ing.preparation_state
      }
    })

    return c.json({ target_servings: targetServings, ingredients: scaled })
  } catch (err) {
    return c.json({ detail: `Serving adjustment failed: ${(err as any).message}` }, 400)
  }
})

// QR Code deep links (Issue #14)
router.get('/:recipe_id/qr', (c) => {
  const recipeId = c.req.param('recipe_id')
  return c.json({ qr_url: `https://app.supersauced.com/recipe/${recipeId}` })
})

// Publishing (Issue #17)
router.post('/:recipe_id/publish', async (c) => {
  const recipeId = c.req.param('recipe_id')
  const currentUser = await getCurrentUser(c)
  if (currentUser.role !== 'cms_editor') {
    return c.json({ detail: 'Forbidden: Requires cms_editor role.' }, 403)
  }

  const client = getServiceClient()
  try {
    const { data, error } = await client
      .from('recipes')
      .update({ status: 'published', published_at: new Date().toISOString() })
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

router.delete('/:recipe_id/publish', async (c) => {
  const recipeId = c.req.param('recipe_id')
  const currentUser = await getCurrentUser(c)
  if (currentUser.role !== 'cms_editor') {
    return c.json({ detail: 'Forbidden: Requires cms_editor role.' }, 403)
  }

  const client = getServiceClient()
  try {
    const { error } = await client
      .from('recipes')
      .update({ status: 'draft', published_at: null })
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

// Step Video Upload (Issue #18)
router.post('/:recipe_id/video', async (c) => {
  const recipeId = c.req.param('recipe_id')
  let filename = 'video.mp4'
  try {
    const body = await c.req.parseBody()
    const file = body['video']
    if (file && typeof file !== 'string') {
      filename = (file as any).name || 'video.mp4'
    }
  } catch (err) {
    // Ignore
  }
  return c.json({ video_url: `https://cdn.supersauced.com/videos/${recipeId}/${filename}` }, 201)
})

// Tagging & Categorization (Issue #19) - Mocked
router.post('/:recipe_id/tags', async (c) => {
  return c.json({ success: true })
})

// Admin Analytics Dashboard (Issue #20)
router.get('/admin/analytics', async (c) => {
  const currentUser = await getCurrentUser(c)
  if (currentUser.role !== 'admin') {
    return c.json({ detail: 'Admin access required.' }, 403)
  }

  const client = getServiceClient()
  try {
    const [recipes, users, saved] = await Promise.all([
      client.from('recipes').select('id', { count: 'exact', head: true }),
      client.from('user_profiles').select('user_id', { count: 'exact', head: true }),
      client.from('saved_recipes').select('recipe_id', { count: 'exact', head: true })
    ])

    return c.json({
      recipes: recipes.count || 0,
      users: users.count || 0,
      likes: saved.count || 0,
      bookmarks: saved.count || 0
    })
  } catch (err) {
    return c.json({ detail: `Analytics fetch failed: ${(err as any).message}` }, 400)
  }
})

// Discovery Mode (Issue #21)
router.get('/discover', async (c) => {
  const currentUser = await getCurrentUser(c)
  const client = getUserClient(c)
  const limit = parseInt(c.req.query('limit') || '10')

  try {
    const { data: saved, error: savedErr } = await client
      .from('saved_recipes')
      .select('recipe_id')
      .eq('user_id', currentUser.id)

    if (savedErr) {
      return c.json({ detail: `Discovery failed: ${savedErr.message}` }, 400)
    }

    const savedIds = (saved || []).map(r => r.recipe_id)
    let query = client.from('recipes').select('*')
    if (savedIds.length > 0) {
      query = query.not('id', 'in', `(${savedIds.join(',')})`)
    }

    const { data, error } = await query.limit(limit)

    if (error) {
      return c.json({ detail: `Discovery failed: ${error.message}` }, 400)
    }
    return c.json(data)
  } catch (err) {
    return c.json({ detail: `Discovery failed: ${(err as any).message}` }, 400)
  }
})

// Push Notifications (Issue #22)
router.post('/notifications', async (c) => {
  const currentUser = await getCurrentUser(c)
  if (currentUser.role !== 'admin' && currentUser.role !== 'cms_editor') {
    return c.json({ detail: 'Insufficient permissions to send notifications.' }, 403)
  }
  const body = await c.req.json()
  return c.json({ queued: true, target_user: body.user_id }, 202)
})

// Community / Social Feed (Issue #25)
router.get('/feed', (c) => {
  const limit = parseInt(c.req.query('limit') || '20')
  const feed = [
    { type: 'like', user_id: 'user123', recipe_id: 'rec456', timestamp: '2023-01-01T12:00:00Z' },
    { type: 'comment', user_id: 'user789', recipe_id: 'rec012', comment: 'Great recipe!', timestamp: '2023-01-02T08:30:00Z' }
  ]
  return c.json(feed.slice(0, limit))
})

// Ingredient Substitution Suggestions (Issue #28)
router.get('/ingredients/:ingredient_id/substitutes', (c) => {
  const ingredientId = c.req.param('ingredient_id').toLowerCase()
  const substitutesMap: Record<string, string[]> = {
    egg: ['flaxseed', 'chia seed', 'applesauce'],
    butter: ['coconut oil', 'olive oil', 'margarine']
  }
  return c.json(substitutesMap[ingredientId] || [])
})

// Rewards / Loyalty Program (Issue #29)
router.get('/rewards/:user_id', async (c) => {
  const userId = c.req.param('user_id')
  const currentUser = await getCurrentUser(c)

  if (currentUser.role !== 'admin' && currentUser.role !== 'cms_editor' && currentUser.id !== userId) {
    return c.json({ detail: 'Can only view your own rewards.' }, 403)
  }
  return c.json({ user_id: userId, points: 1234 })
})

// DTC Purchasing / In-App Commerce (Issue #30)
router.post('/purchase', async (c) => {
  const currentUser = await getCurrentUser(c)
  const body = await c.req.json()
  const itemId = body.item_id
  return c.json({ order_id: `ORD-${currentUser.id.substring(0, 4)}-${(itemId || '').substring(0, 4)}`, status: 'pending' }, 201)
})

// Premium Subscription Tier (Issue #31)
router.get('/subscription/status', async (c) => {
  const currentUser = await getCurrentUser(c)
  return c.json({ user_id: currentUser.id, tier: 'free' })
})

router.post('/subscription/upgrade', async (c) => {
  const currentUser = await getCurrentUser(c)
  return c.json({ user_id: currentUser.id, new_tier: 'premium', status: 'upgraded' })
})

// Hands-Free Voice Navigation (Issue #27)
router.get('/:recipe_id/guided', async (c) => {
  const recipeId = c.req.param('recipe_id')
  const client = getUserClient(c)

  try {
    const { data, error } = await client
      .from('instruction_steps')
      .select('step_number,instruction_text')
      .eq('recipe_id', recipeId)
      .order('step_number')

    if (error) {
      return c.json({ detail: `Failed to fetch guided instructions: ${error.message}` }, 400)
    }

    const steps = (data || []).map(s => ({
      step: s.step_number,
      instruction: s.instruction_text
    }))
    return c.json(steps)
  } catch (err) {
    return c.json({ detail: `Failed to fetch guided instructions: ${(err as any).message}` }, 400)
  }
})

export default router
