import { Hono } from 'https://deno.land/x/hono@v3.11.8/mod.ts'
import { getUserClient, getServiceClient, getCurrentUser } from '../deps.ts'

const router = new Hono()

router.get('/', async (c) => {
  const userClient = getUserClient(c)
  const limit = parseInt(c.req.query('limit') || '10')
  const offset = parseInt(c.req.query('offset') || '0')

  try {
    const { data, error } = await userClient
      .from('instruction_steps')
      .select('*')
      .range(offset, offset + limit - 1)

    if (error) {
      return c.json({ detail: `Failed to list steps: ${error.message}` }, 400)
    }

    const mapped = (data || []).map(s => ({
      id: s.id,
      recipe_id: s.recipe_id,
      step_number: s.step_number,
      description: s.instruction_text,
      instruction_text: s.instruction_text,
      is_active_cooking: s.is_active_cooking,
      timer_seconds: s.timer_seconds
    }))

    return c.json(mapped)
  } catch (err) {
    return c.json({ detail: `Failed to list steps: ${(err as any).message}` }, 400)
  }
})

router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const userClient = getUserClient(c)

  try {
    const { data, error } = await userClient.from('instruction_steps').select('*').eq('id', id)
    if (error || !data || data.length === 0) {
      return c.json({ detail: 'Step not found or access denied.' }, 404)
    }
    const s = data[0]
    return c.json({
      id: s.id,
      recipe_id: s.recipe_id,
      step_number: s.step_number,
      description: s.instruction_text,
      instruction_text: s.instruction_text,
      is_active_cooking: s.is_active_cooking,
      timer_seconds: s.timer_seconds
    })
  } catch (err) {
    return c.json({ detail: `Failed to fetch step: ${(err as any).message}` }, 400)
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
    step_number: body.step_number,
    instruction_text: body.description || body.instruction_text || '',
    is_active_cooking: body.is_active_cooking || false,
    timer_seconds: body.timer_seconds || 0
  }

  try {
    const { data, error } = await serviceClient.from('instruction_steps').insert(payload).select()
    if (error || !data || data.length === 0) {
      return c.json({ detail: `Failed to create step: ${error?.message || 'Database error'}` }, 400)
    }
    const s = data[0]
    return c.json({
      id: s.id,
      recipe_id: s.recipe_id,
      step_number: s.step_number,
      description: s.instruction_text,
      instruction_text: s.instruction_text,
      is_active_cooking: s.is_active_cooking,
      timer_seconds: s.timer_seconds
    }, 201)
  } catch (err) {
    return c.json({ detail: `Failed to create step: ${(err as any).message}` }, 400)
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
  if (body.step_number !== undefined) updateFields.step_number = body.step_number
  if (body.description !== undefined) updateFields.instruction_text = body.description
  if (body.instruction_text !== undefined) updateFields.instruction_text = body.instruction_text
  if (body.is_active_cooking !== undefined) updateFields.is_active_cooking = body.is_active_cooking
  if (body.timer_seconds !== undefined) updateFields.timer_seconds = body.timer_seconds

  try {
    const { data, error } = await serviceClient.from('instruction_steps').update(updateFields).eq('id', id).select()
    if (error || !data || data.length === 0) {
      return c.json({ detail: 'Step not found or update failed.' }, 404)
    }
    const s = data[0]
    return c.json({
      id: s.id,
      recipe_id: s.recipe_id,
      step_number: s.step_number,
      description: s.instruction_text,
      instruction_text: s.instruction_text,
      is_active_cooking: s.is_active_cooking,
      timer_seconds: s.timer_seconds
    })
  } catch (err) {
    return c.json({ detail: `Failed to update step: ${(err as any).message}` }, 400)
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
    const { error } = await serviceClient.from('instruction_steps').delete().eq('id', id)
    if (error) {
      return c.json({ detail: `Failed to delete step: ${error.message}` }, 400)
    }
    c.status(204)
    return c.body(null)
  } catch (err) {
    return c.json({ detail: `Failed to delete step: ${(err as any).message}` }, 400)
  }
})

export default router
