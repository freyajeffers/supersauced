import { Hono } from 'https://deno.land/x/hono@v3.11.8/mod.ts'
import { cors } from 'https://deno.land/x/hono@v3.11.8/middleware/cors/index.ts'
import { getUserClient } from '../shared/deps.ts'

const app = new Hono()

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowHeaders: ['Content-Type', 'Authorization', 'apikey'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
}))

app.get('/recipes/:recipe_id/adjust-servings', async (c) => {
  const recipeId = c.req.param('recipe_id')
  const targetServings = parseInt(c.req.query('target_servings') || '')
  if (isNaN(targetServings) || targetServings < 1) {
    return c.json({ detail: 'Desired number of servings must be greater than or equal to 1' }, 400)
  }

  const client = getUserClient(c)
  try {
    const { data: recipe, error: recErr } = await client
      .from('recipes')
      .select('servings_default')
      .eq('id', recipeId)
      .single()

    if (recErr || !recipe || !recipe.servings_default) {
      return c.json({ detail: 'Recipe missing default servings' }, 400)
    }

    const defaultServings = recipe.servings_default
    const factor = targetServings / defaultServings

    const { data: ingredients, error: ingErr } = await client
      .from('recipe_ingredients')
      .select('id,quantity,unit')
      .eq('recipe_id', recipeId)

    if (ingErr) {
      return c.json({ detail: `Serving adjustment failed: ${ingErr.message}` }, 400)
    }

    const scaled = ingredients.map(ing => {
      const scaled_quantity = (ing.quantity !== null && ing.quantity !== undefined)
        ? Math.round(ing.quantity * factor * 100) / 100
        : undefined;
      return {
        ...ing,
        scaled_quantity
      }
    })

    return c.json({ target_servings: targetServings, ingredients: scaled })
  } catch (err) {
    return c.json({ detail: `Serving adjustment failed: ${(err as any).message}` }, 400)
  }
})

app.get('/ingredients/:ingredient_id/substitutes', (c) => {
  const ingredientId = c.req.param('ingredient_id').toLowerCase()
  const substitutesMap: Record<string, string[]> = {
    egg: ['flaxseed', 'chia seed', 'applesauce'],
    butter: ['coconut oil', 'olive oil', 'margarine']
  }
  return c.json(substitutesMap[ingredientId] || [])
})

Deno.serve((req) => {
  const url = new URL(req.url)
  if (url.pathname.startsWith('/functions/v1/scaler')) {
    url.pathname = url.pathname.replace('/functions/v1/scaler', '')
  }
  const newReq = new Request(url.toString(), req)
  return app.fetch(newReq)
})
