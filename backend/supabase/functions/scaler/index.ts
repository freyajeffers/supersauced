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
    // Utilize the optimized database RPC for native serving size calculations
    const { data, error } = await client
      .rpc('scale_recipe_servings', { p_recipe_id: recipeId, p_target_servings: targetServings })

    if (error) {
      return c.json({ detail: `Serving adjustment failed: ${error.message}` }, 400)
    }

    if (!data || data.length === 0) {
      // Check if recipe exists at all or simply has no ingredients loaded
      const { data: recCheck } = await client.from('recipes').select('id').eq('id', recipeId).single()
      if (!recCheck) {
        return c.json({ detail: 'Recipe missing default servings' }, 400)
      }
      return c.json({ target_servings: targetServings, ingredients: [] })
    }

    const scaled = data.map((item: any) => {
      const qty = item.quantity_decimal !== null ? Number(item.quantity_decimal) : null;
      const scaledQty = item.scaled_quantity !== null ? Number(item.scaled_quantity) : undefined;
      return {
        id: item.ingredient_id,
        recipe_id: item.recipe_id,
        quantity: qty,
        quantity_decimal: qty,
        scaled_quantity: scaledQty,
        name: item.ingredient_name || '',
        unit: item.unit_abbreviation || '',
        notes: item.preparation_state
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
