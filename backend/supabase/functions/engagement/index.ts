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

// Likes
app.post('/recipes/:recipe_id/like', async (c) => {
  const recipeId = c.req.param('recipe_id')
  const currentUser = await getCurrentUser(c)
  const client = getUserClient(c)

  try {
    const { data, error } = await client
      .from('likes')
      .insert({ user_id: currentUser.id, recipe_id: recipeId })
      .select()

    if (error || !data || data.length === 0) {
      return c.json({ detail: 'Failed to like recipe' }, 400)
    }
    return c.json(data[0], 201)
  } catch (err) {
    return c.json({ detail: `Like failed: ${(err as any).message}` }, 400)
  }
})

app.delete('/recipes/:recipe_id/like', async (c) => {
  const recipeId = c.req.param('recipe_id')
  const currentUser = await getCurrentUser(c)
  const client = getUserClient(c)

  try {
    const { error } = await client
      .from('likes')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('recipe_id', recipeId)

    if (error) {
      return c.json({ detail: `Unlike failed: ${error.message}` }, 400)
    }
    c.status(204)
    return c.body(null)
  } catch (err) {
    return c.json({ detail: `Unlike failed: ${(err as any).message}` }, 400)
  }
})

app.get('/likes', async (c) => {
  const currentUser = await getCurrentUser(c)
  const client = getUserClient(c)

  try {
    const { data: likes, error: likesErr } = await client
      .from('likes')
      .select('recipe_id')
      .eq('user_id', currentUser.id)

    if (likesErr) {
      return c.json({ detail: `Failed to list liked recipes: ${likesErr.message}` }, 400)
    }

    const recipeIds = likes.map(l => l.recipe_id)
    if (recipeIds.length === 0) {
      return c.json([])
    }

    const { data: recipes, error: recipesErr } = await client
      .from('recipes')
      .select('*')
      .in('id', recipeIds)

    if (recipesErr) {
      return c.json({ detail: `Failed to list liked recipes: ${recipesErr.message}` }, 400)
    }

    return c.json(recipes)
  } catch (err) {
    return c.json({ detail: `Failed to list liked recipes: ${(err as any).message}` }, 400)
  }
})

// Bookmarks
app.post('/recipes/:recipe_id/bookmark', async (c) => {
  const recipeId = c.req.param('recipe_id')
  const currentUser = await getCurrentUser(c)
  const client = getUserClient(c)

  try {
    const { data, error } = await client
      .from('bookmarks')
      .insert({ user_id: currentUser.id, recipe_id: recipeId })
      .select()

    if (error || !data || data.length === 0) {
      return c.json({ detail: 'Failed to bookmark recipe' }, 400)
    }
    return c.json(data[0], 201)
  } catch (err) {
    return c.json({ detail: `Bookmark failed: ${(err as any).message}` }, 400)
  }
})

app.delete('/recipes/:recipe_id/bookmark', async (c) => {
  const recipeId = c.req.param('recipe_id')
  const currentUser = await getCurrentUser(c)
  const client = getUserClient(c)

  try {
    const { error } = await client
      .from('bookmarks')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('recipe_id', recipeId)

    if (error) {
      return c.json({ detail: `Unbookmark failed: ${error.message}` }, 400)
    }
    c.status(204)
    return c.body(null)
  } catch (err) {
    return c.json({ detail: `Unbookmark failed: ${(err as any).message}` }, 400)
  }
})

app.get('/bookmarks', async (c) => {
  const currentUser = await getCurrentUser(c)
  const client = getUserClient(c)

  try {
    const { data: bookmarks, error: bmErr } = await client
      .from('bookmarks')
      .select('recipe_id')
      .eq('user_id', currentUser.id)

    if (bmErr) {
      return c.json({ detail: `Failed to list bookmarks: ${bmErr.message}` }, 400)
    }

    const ids = bookmarks.map(b => b.recipe_id)
    if (ids.length === 0) {
      return c.json([])
    }

    const { data: recipes, error: recErr } = await client
      .from('recipes')
      .select('*')
      .in('id', ids)

    if (recErr) {
      return c.json({ detail: `Failed to list bookmarks: ${recErr.message}` }, 400)
    }

    return c.json(recipes)
  } catch (err) {
    return c.json({ detail: `Failed to list bookmarks: ${(err as any).message}` }, 400)
  }
})

// Shares
app.post('/recipes/:recipe_id/share', async (c) => {
  const recipeId = c.req.param('recipe_id')
  const currentUser = await getCurrentUser(c)
  const client = getUserClient(c)

  try {
    const { data, error } = await client
      .from('shares')
      .insert({ user_id: currentUser.id, recipe_id: recipeId })
      .select()

    if (error || !data || data.length === 0) {
      return c.json({ detail: 'Failed to record share' }, 400)
    }
    return c.json(data[0], 201)
  } catch (err) {
    return c.json({ detail: `Share failed: ${(err as any).message}` }, 400)
  }
})

// Recommendations
app.get('/recipes/recommendations', async (c) => {
  const currentUser = await getCurrentUser(c)
  const client = getUserClient(c)
  const limit = parseInt(c.req.query('limit') || '5')

  try {
    const { data: likes, error: likesErr } = await client
      .from('likes')
      .select('recipe_id')
      .eq('user_id', currentUser.id)

    if (likesErr) {
      return c.json({ detail: `Recommendation failed: ${likesErr.message}` }, 400)
    }

    const likedIds = likes.map(l => l.recipe_id)
    if (likedIds.length === 0) {
      const { data: recent, error: recentErr } = await client
        .from('recipes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (recentErr) {
        return c.json({ detail: `Recommendation failed: ${recentErr.message}` }, 400)
      }
      return c.json(recent)
    }

    const { data: likedRecipes, error: recsErr } = await client
      .from('recipes')
      .select('cube_tags,dietary_tags')
      .in('id', likedIds)

    if (recsErr) {
      return c.json({ detail: `Recommendation failed: ${recsErr.message}` }, 400)
    }

    const tags = new Set<string>()
    for (const r of likedRecipes) {
      (r.cube_tags || []).forEach((t: any) => tags.add(t));
      (r.dietary_tags || []).forEach((t: any) => tags.add(t));
    }

    if (tags.size === 0) {
      return c.json([])
    }

    const tagStr = Array.from(tags).join(',')
    const { data: recs, error: finalErr } = await client
      .from('recipes')
      .select('*')
      .or(`cube_tags.cs.{${tagStr}},dietary_tags.cs.{${tagStr}}`)
      .limit(limit)

    if (finalErr) {
      return c.json({ detail: `Recommendation failed: ${finalErr.message}` }, 400)
    }

    return c.json(recs)
  } catch (err) {
    return c.json({ detail: `Recommendation failed: ${(err as any).message}` }, 400)
  }
})

// Ratings & Comments
app.post('/recipes/:recipe_id/rating', async (c) => {
  const recipeId = c.req.param('recipe_id')
  const currentUser = await getCurrentUser(c)
  const client = getUserClient(c)
  const body = await c.req.json()

  try {
    const { data, error } = await client
      .from('ratings')
      .insert({
        user_id: currentUser.id,
        recipe_id: recipeId,
        rating: body.rating,
        comment: body.comment
      })
      .select()

    if (error || !data || data.length === 0) {
      return c.json({ detail: 'Failed to submit rating' }, 400)
    }
    return c.json(data[0], 201)
  } catch (err) {
    return c.json({ detail: `Rating failed: ${(err as any).message}` }, 400)
  }
})

app.get('/recipes/:recipe_id/ratings', async (c) => {
  const recipeId = c.req.param('recipe_id')
  const client = getUserClient(c)

  try {
    const { data, error } = await client
      .from('ratings')
      .select('*')
      .eq('recipe_id', recipeId)

    if (error) {
      return c.json({ detail: `Failed to fetch ratings: ${error.message}` }, 400)
    }
    return c.json(data)
  } catch (err) {
    return c.json({ detail: `Failed to fetch ratings: ${(err as any).message}` }, 400)
  }
})

// QR
app.get('/:recipe_id/qr', (c) => {
  const recipeId = c.req.param('recipe_id')
  return c.json({ qr_url: `https://app.supersauced.com/recipe/${recipeId}` })
})

// Discover
app.get('/discover', async (c) => {
  const currentUser = await getCurrentUser(c)
  const client = getUserClient(c)
  const limit = parseInt(c.req.query('limit') || '10')

  try {
    const { data: likedRes, error: likedErr } = await client
      .from('likes')
      .select('recipe_id')
      .eq('user_id', currentUser.id)

    if (likedErr) {
      return c.json({ detail: `Discovery failed: ${likedErr.message}` }, 400)
    }

    const likedIds = likedRes.map(r => r.recipe_id)
    let query = client.from('recipes').select('*')
    if (likedIds.length > 0) {
      query = query.not('id', 'in', `(${likedIds.join(',')})`)
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      return c.json({ detail: `Discovery failed: ${error.message}` }, 400)
    }
    return c.json(data)
  } catch (err) {
    return c.json({ detail: `Discovery failed: ${(err as any).message}` }, 400)
  }
})

// Push Notifications
app.post('/notifications', async (c) => {
  const currentUser = await getCurrentUser(c)
  if (currentUser.role !== 'admin' && currentUser.role !== 'cms_editor') {
    return c.json({ detail: 'Insufficient permissions to send notifications.' }, 403)
  }
  const body = await c.req.json()
  return c.json({ queued: true, target_user: body.user_id }, 202)
})

// Feed
app.get('/feed', (c) => {
  const limit = parseInt(c.req.query('limit') || '20')
  const feed = [
    { type: 'like', user_id: 'user123', recipe_id: 'rec456', timestamp: '2023-01-01T12:00:00Z' },
    { type: 'comment', user_id: 'user789', recipe_id: 'rec012', comment: 'Great recipe!', timestamp: '2023-01-02T08:30:00Z' }
  ]
  return c.json(feed.slice(0, limit))
})

Deno.serve((req) => {
  const url = new URL(req.url)
  if (url.pathname.startsWith('/functions/v1/engagement')) {
    url.pathname = url.pathname.replace('/functions/v1/engagement', '')
  }
  const newReq = new Request(url.toString(), req)
  return app.fetch(newReq)
})
