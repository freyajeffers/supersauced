import { Hono } from 'https://deno.land/x/hono@v3.11.8/mod.ts';
import { getServiceClient, getUserClient, getCurrentUser } from '../deps.ts';
import { SignUpRequest, LoginRequest } from '../types.ts';

const router = new Hono();

// Real signup using Supabase Auth client and profile/settings via service client
router.post('/signup', async (c) => {
  const body = await c.req.json<SignUpRequest>();
  const client = getUserClient(c);

  const { data, error } = await client.auth.signUp({
    email: body.email,
    password: body.password || '',
  });

  if (error) {
    return c.json({ detail: error.message }, 400);
  }

  const user = data.user;
  const session = data.session || {
    access_token: 'mock_access_token',
    refresh_token: 'mock_refresh_token',
    expires_in: 3600,
    token_type: 'bearer',
  };

  if (user) {
    // Store user for in‑memory login lookup
    if (body.email && user.id) {
      const store = (globalThis as any).__userStore || new Map();
      store.set(body.email, user.id);
      (globalThis as any).__userStore = store;
    }

    // Upsert profile and settings using service client (bypass RLS)
    const serviceClient = getServiceClient();
    try {
      await serviceClient.from('user_profiles').upsert({
        user_id: user.id,
        first_name: (body.full_name?.split(' ')[0]) || '',
        last_name: (body.full_name?.split(' ').slice(1).join(' ')) || '',
        bio: '',
        email: user.email,
      });
      await serviceClient.from('user_settings').upsert({
        user_id: user.id,
        measurement_system: 'metric',
        push_notifications: false,
        newsletter: false,
      });
    } catch (_) {}
  }

  return c.json({
    session,
    user: {
      id: user?.id,
      email: user?.email,
      username: body.username,
      full_name: body.full_name,
      avatar_url: body.avatar_url,
    },
  }, 201);
});

// Login: validate email exists and return mock session
router.post('/login', async (c) => {
  const body = await c.req.json<LoginRequest>();
  const client = getUserClient(c);

  const { data, error } = await client.auth.signInWithPassword({
    email: body.email,
    password: body.password || '',
  });

  if (error) {
    return c.json({ detail: error.message }, 400);
  }

  const user = data.user;
  const session = data.session || {
    access_token: 'mock_access_token',
    refresh_token: 'mock_refresh_token',
    expires_in: 3600,
    token_type: 'bearer',
  };

  const profileRes = await getServiceClient().from('user_profiles')
    .select('first_name,last_name')
    .eq('user_id', user?.id)
    .single();
  const profile: any = profileRes.data || {};

  if (body.email && user?.id) {
    const userStoreNew: Map<string, string> = (globalThis as any).__userStore || new Map();
    userStoreNew.set(body.email, user.id);
    (globalThis as any).__userStore = userStoreNew;
  }

  return c.json({
    session,
    user: {
      id: user?.id,
      email: user?.email,
      username: profile.first_name,
      full_name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
      avatar_url: null,
    },
  });
});

// Get current user's profile
router.get('/user', async (c) => {
  const currentUser = await getCurrentUser(c);
  const client = getUserClient(c);
  const { data: profiles, error: profErr } = await client
    .from('user_profiles')
    .select('*')
    .eq('user_id', currentUser.id);

  if (profErr || !profiles || profiles.length === 0) {
    if (profErr) {
      console.error("GET /auth/user DB query error:", profErr);
    } else {
      console.warn("GET /auth/user profiles is empty. currentUser.id:", currentUser.id);
    }
    return c.json({ detail: 'User profile not found' }, 404);
  }

  const data = profiles[0];
  return c.json({
    id: data.id,
    user_id: data.user_id,
    first_name: data.first_name,
    last_name: data.last_name,
    full_name: `${data.first_name || ''} ${data.last_name || ''}`.trim(),
    bio: data.bio,
    avatar_path: data.avatar_path,
  });
});

export default router;
