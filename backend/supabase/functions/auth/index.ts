import { Hono } from 'https://deno.land/x/hono@v3.11.8/mod.ts'
import { cors } from 'https://deno.land/x/hono@v3.11.8/middleware/cors/index.ts'
import { getServiceClient, getUserClient, getCurrentUser } from '../shared/deps.ts'
import { SignUpRequest, LoginRequest } from '../shared/types.ts'

const app = new Hono()

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowHeaders: ['Content-Type', 'Authorization', 'apikey'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
}))

app.post('/signup', async (c) => {
  const body = await c.req.json<SignUpRequest>()
  const client = getServiceClient()

  const metadata = {
    username: body.username,
    full_name: body.full_name,
    avatar_url: body.avatar_url,
    onboarding_survey: body.onboarding_survey || {},
    sauce_log: body.sauce_log || {},
  }

  const { data, error } = await client.auth.signUp({
    email: body.email,
    password: body.password || '',
    options: { data: metadata }
  })

  if (error) {
    return c.json({ detail: `Signup failed: ${error.message}` }, 400)
  }

  if (!data.session) {
    return c.json({ detail: 'Signup completed, but session could not be established (verification email sent).' }, 400)
  }

  if (!data.user) {
    return c.json({ detail: 'Signup completed, but user data is missing.' }, 400)
  }

  return c.json({
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      token_type: data.session.token_type
    },
    user: {
      id: data.user.id,
      email: data.user.email,
      username: data.user.user_metadata?.username,
      full_name: data.user.user_metadata?.full_name,
      avatar_url: data.user.user_metadata?.avatar_url
    }
  }, 201)
})

app.post('/login', async (c) => {
  const body = await c.req.json<LoginRequest>()
  const client = getServiceClient()

  const { data, error } = await client.auth.signInWithPassword({
    email: body.email,
    password: body.password || ''
  })

  if (error) {
    return c.json({ detail: `Login failed: ${error.message}` }, 400)
  }

  if (!data.session) {
    return c.json({ detail: 'Could not establish login session.' }, 401)
  }

  if (!data.user) {
    return c.json({ detail: 'Could not retrieve user details.' }, 400)
  }

  return c.json({
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      token_type: data.session.token_type
    },
    user: {
      id: data.user.id,
      email: data.user.email,
      username: data.user.user_metadata?.username,
      full_name: data.user.user_metadata?.full_name,
      avatar_url: data.user.user_metadata?.avatar_url
    }
  })
})

app.get('/user', async (c) => {
  const currentUser = await getCurrentUser(c)
  const client = getUserClient(c)

  const { data, error } = await client
    .from('user_profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single()

  if (error || !data) {
    return c.json({ detail: 'User profile not found in database.' }, 404)
  }

  return c.json(data)
})

app.post('/auth_callback', async (c) => {
  let body;
  try {
    body = await c.req.json()
  } catch (err) {
    return c.json({ detail: 'Invalid JSON body' }, 400)
  }

  const user = body.user
  if (!user || !user.id || !user.email) {
    return c.json({ detail: 'Missing user info (id and email are required)' }, 400)
  }

  const userMetadata = user.user_metadata || {}

  const profileData = {
    id: user.id,
    email: user.email,
    username: userMetadata.username || user.email.split('@')[0],
    full_name: userMetadata.full_name || '',
    avatar_url: userMetadata.avatar_url || '',
    onboarding_survey: userMetadata.onboarding_survey || {},
    sauce_log: userMetadata.sauce_log || {}
  }

  const client = getServiceClient()
  try {
    const { data, error } = await client
      .from('user_profiles')
      .upsert(profileData, { onConflict: 'id' })
      .select()

    if (error || !data || data.length === 0) {
      return c.json({ detail: `Upsert failed: ${error?.message || 'Database error'}` }, 500)
    }
    return c.json({ success: true, user: data[0] })
  } catch (err) {
    return c.json({ detail: `Upsert failed: ${(err as any).message}` }, 500)
  }
})

Deno.serve((req) => {
  const url = new URL(req.url)
  if (url.pathname.startsWith('/functions/v1/auth')) {
    url.pathname = url.pathname.replace('/functions/v1/auth', '')
  }
  const newReq = new Request(url.toString(), req)
  return app.fetch(newReq)
})
