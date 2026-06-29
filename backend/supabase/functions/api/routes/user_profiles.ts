import { Hono } from 'https://deno.land/x/hono@v3.11.8/mod.ts';
import { getServiceClient, getUserClient, getCurrentUser } from '../deps.ts';

const router = new Hono();

// List current user's profile(s) using service client (bypass RLS)
router.get('/', async (c) => {
  const currentUser = await getCurrentUser(c);
  const client = getUserClient(c);
  try {
    const { data, error } = await client
      .from('user_profiles')
      .select('*')
      .eq('user_id', currentUser.id);
    if (error) {
      return c.json({ detail: `Failed to query profiles: ${error.message}` }, 400);
    }
    const mapped = (data || []).map((p: any) => ({
      id: p.user_id,
      user_id: p.user_id,
      first_name: p.first_name,
      last_name: p.last_name,
      full_name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
      bio: p.bio,
      avatar_path: p.avatar_path,
    }));
    return c.json(mapped);
  } catch (err) {
    return c.json({ detail: `Failed to query profiles: ${(err as any).message}` }, 400);
  }
});

// Get specific profile - ensure only own profile can be accessed
router.get('/:id', async (c) => {
  const id = c.req.param('id');
  const currentUser = await getCurrentUser(c);
  if (id !== currentUser.id) {
    return c.json({ detail: 'Profile not found or access denied.' }, 404);
  }
  const client = getUserClient(c);
  try {
    const { data, error } = await client.from('user_profiles').select('*').eq('user_id', id).single();
    if (error || !data) {
      return c.json({ detail: 'Profile not found or access denied.' }, 404);
    }
    const p = data;
    return c.json({
      id: p.user_id,
      user_id: p.user_id,
      first_name: p.first_name,
      last_name: p.last_name,
      full_name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
      bio: p.bio,
      avatar_path: p.avatar_path,
    });
  } catch (err) {
    return c.json({ detail: `Failed to fetch profile: ${(err as any).message}` }, 400);
  }
});

// Update own profile
router.put('/:id', async (c) => {
  const id = c.req.param('id');
  const currentUser = await getCurrentUser(c);
  if (id !== currentUser.id) {
    return c.json({ detail: 'Forbidden: You can only modify your own profile.' }, 403);
  }
  const client = getUserClient(c);
  const body = await c.req.json();
  if (!body || Object.keys(body).length === 0) {
    return c.json({ detail: 'No update fields provided.' }, 400);
  }
  const updateFields: any = {};
  if (body.first_name !== undefined) updateFields.first_name = body.first_name;
  if (body.last_name !== undefined) updateFields.last_name = body.last_name;
  if (body.bio !== undefined) updateFields.bio = body.bio;
  if (body.avatar_path !== undefined) updateFields.avatar_path = body.avatar_path;
  if (body.full_name && !body.first_name) {
    const parts = body.full_name.trim().split(' ');
    updateFields.first_name = parts[0];
    updateFields.last_name = parts.slice(1).join(' ');
  }
  try {
    const { data, error } = await client.from('user_profiles').update(updateFields).eq('user_id', id).select();
    if (error || !data || data.length === 0) {
      return c.json({ detail: 'Profile not found or update failed.' }, 404);
    }
    const p = data[0];
    return c.json({
      id: p.user_id,
      user_id: p.user_id,
      first_name: p.first_name,
      last_name: p.last_name,
      full_name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
      bio: p.bio,
      avatar_path: p.avatar_path,
    });
  } catch (err) {
    return c.json({ detail: `Failed to update profile: ${(err as any).message}` }, 400);
  }
});

export default router;
