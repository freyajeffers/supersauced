import { Hono } from 'https://deno.land/x/hono@v3.11.8/mod.ts'
import { getUserClient, getServiceClient, getCurrentUser } from '../deps.ts'

const router = new Hono()

router.get('/', async (c) => {
  const userClient = getUserClient(c)
  const limit = parseInt(c.req.query('limit') || '10')
  const offset = parseInt(c.req.query('offset') || '0')

  try {
    const { data, error } = await userClient
      .from('recipe_ingredients')
      .select('*, ingredient:ingredients(name), unit:units(abbreviation)')
      .range(offset, offset + limit - 1)

    if (error) {
      return c.json({ detail: `Failed to list ingredients: ${error.message}` }, 400)
    }

    const mapped = (data || []).map(item => ({
      id: item.id,
      recipe_id: item.recipe_id,
      ingredient_id: item.ingredient_id,
      unit_id: item.unit_id,
      quantity: item.quantity_decimal !== null ? Number(item.quantity_decimal) : null,
      quantity_decimal: item.quantity_decimal !== null ? Number(item.quantity_decimal) : null,
      name: (item as any).ingredient?.name || '',
      unit: (item as any).unit?.abbreviation || '',
      notes: item.preparation_state,
      preparation_state: item.preparation_state
    }))

    return c.json(mapped)
  } catch (err) {
    return c.json({ detail: `Failed to list ingredients: ${(err as any).message}` }, 400)
  }
})

router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const userClient = getUserClient(c)

  try {
    const { data, error } = await userClient
      .from('recipe_ingredients')
      .select('*, ingredient:ingredients(name), unit:units(abbreviation)')
      .eq('id', id)

    if (error || !data || data.length === 0) {
      return c.json({ detail: 'Ingredient not found or access denied.' }, 404)
    }
    const item = data[0]
    return c.json({
      id: item.id,
      recipe_id: item.recipe_id,
      ingredient_id: item.ingredient_id,
      unit_id: item.unit_id,
      quantity: item.quantity_decimal !== null ? Number(item.quantity_decimal) : null,
      quantity_decimal: item.quantity_decimal !== null ? Number(item.quantity_decimal) : null,
      name: (item as any).ingredient?.name || '',
      unit: (item as any).unit?.abbreviation || '',
      notes: item.preparation_state,
      preparation_state: item.preparation_state
    })
  } catch (err) {
    return c.json({ detail: `Failed to fetch ingredient: ${(err as any).message}` }, 400)
  }
})

router.post('/', async (c) => {
  const currentUser = await getCurrentUser(c)
  if (currentUser.role !== 'cms_editor') {
    return c.json({ detail: 'Forbidden: Requires cms_editor role.' }, 403)
  }

  const serviceClient = getServiceClient()
  const body = await c.req.json()

  const payload = {
    recipe_id: body.recipe_id,
    ingredient_id: body.ingredient_id,
    unit_id: body.unit_id,
    quantity_decimal: body.quantity !== undefined ? body.quantity : body.quantity_decimal,
    preparation_state: body.notes || body.preparation_state
  }

  try {
    const { data, error } = await serviceClient.from('recipe_ingredients').insert(payload).select()
    if (error || !data || data.length === 0) {
      return c.json({ detail: `Failed to create ingredient: ${error?.message || 'Database error'}` }, 400)
    }
    const item = data[0]
    return c.json({
      id: item.id,
      recipe_id: item.recipe_id,
      ingredient_id: item.ingredient_id,
      unit_id: item.unit_id,
      quantity: item.quantity_decimal !== null ? Number(item.quantity_decimal) : null,
      quantity_decimal: item.quantity_decimal !== null ? Number(item.quantity_decimal) : null,
      notes: item.preparation_state,
      preparation_state: item.preparation_state
    }, 201)
  } catch (err) {
    return c.json({ detail: `Failed to create ingredient: ${(err as any).message}` }, 400)
  }
})

router.put('/:id', async (c) => {
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

  const updateFields: any = {}
  if (body.recipe_id !== undefined) updateFields.recipe_id = body.recipe_id
  if (body.ingredient_id !== undefined) updateFields.ingredient_id = body.ingredient_id
  if (body.unit_id !== undefined) updateFields.unit_id = body.unit_id
  if (body.quantity !== undefined) updateFields.quantity_decimal = body.quantity
  if (body.quantity_decimal !== undefined) updateFields.quantity_decimal = body.quantity_decimal
  if (body.notes !== undefined) updateFields.preparation_state = body.notes
  if (body.preparation_state !== undefined) updateFields.preparation_state = body.preparation_state

  try {
    const { data, error } = await serviceClient.from('recipe_ingredients').update(updateFields).eq('id', id).select()
    if (error || !data || data.length === 0) {
      return c.json({ detail: 'Ingredient not found or update failed.' }, 404)
    }
    const item = data[0]
    return c.json({
      id: item.id,
      recipe_id: item.recipe_id,
      ingredient_id: item.ingredient_id,
      unit_id: item.unit_id,
      quantity: item.quantity_decimal !== null ? Number(item.quantity_decimal) : null,
      quantity_decimal: item.quantity_decimal !== null ? Number(item.quantity_decimal) : null,
      notes: item.preparation_state,
      preparation_state: item.preparation_state
    })
  } catch (err) {
    return c.json({ detail: `Failed to update ingredient: ${(err as any).message}` }, 400)
  }
})

router.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const currentUser = await getCurrentUser(c)
  if (currentUser.role !== 'authenticated' && currentUser.role !== 'cms_editor') {
    return c.json({ detail: 'Forbidden.' }, 403)
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

export default router
