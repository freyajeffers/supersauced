import { Hono } from 'https://deno.land/x/hono@v3.11.8/mod.ts'
import { cors } from 'https://deno.land/x/hono@v3.11.8/middleware/cors/index.ts'
import { getServiceClient, getCurrentUser, handleSharedError } from '../shared/deps.ts'

const app = new Hono()

app.use('*', cors({
  origin: '*',
  allowMethods: ['POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'apikey'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
}))

app.post('/', async (c) => {
  try {
    // 1. Authenticate user using Supabase JWT
    const currentUser = await getCurrentUser(c)
    const userId = currentUser.id

    if (!userId) {
      return c.json({ detail: 'Unauthorized: Invalid user ID.' }, 401)
    }

    // 2. Parse Multipart Form Data
    const body = await c.req.parseBody()
    const file = body['file'] || body['image']

    if (!file || !(file instanceof File)) {
      return c.json({ detail: 'Bad Request: No valid image or file uploaded under key "file" or "image".' }, 400)
    }

    // Validate file type (should be an image)
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedMimeTypes.includes(file.type)) {
      return c.json({ detail: `Unsupported Media Type: Only images are allowed. Got ${file.type}` }, 415)
    }

    // 3. Prepare credentials for Bunny.net Storage
    const bunnyApiKey = Deno.env.get('BUNNY_STORAGE_API_KEY')
    const bunnyStorageZone = Deno.env.get('BUNNY_STORAGE_ZONE') || 'supersauced'
    const bunnyApiUrl = Deno.env.get('BUNNY_STORAGE_API_URL') || 'https://storage.bunnycdn.com'

    if (!bunnyApiKey) {
      console.error('BUNNY_STORAGE_API_KEY environment variable is not set.')
      return c.json({ detail: 'Internal Server Error: Storage provider configuration missing.' }, 500)
    }

    // 4. Upload directly to Bunny.net Storage via PUT request
    const filename = `users/avatars/${userId}.jpg`
    const uploadUrl = `${bunnyApiUrl.replace(/\/$/, '')}/${bunnyStorageZone}/${filename}`

    let bunnyRes: Response
    if (bunnyApiKey === 'mock-bunny-storage-api-key') {
      console.log(`[upload-user-avatar] Mocking successful upload to ${uploadUrl}`)
      bunnyRes = new Response(JSON.stringify({ success: true, message: 'Mock upload successful' }), { status: 201 })
    } else {
      const arrayBuffer = await file.arrayBuffer()
      bunnyRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'AccessKey': bunnyApiKey,
          'Content-Type': 'application/octet-stream',
        },
        body: arrayBuffer,
      })
    }

    if (!bunnyRes.ok) {
      const errorText = await bunnyRes.text()
      console.error(`Bunny Storage upload failed with status ${bunnyRes.status}: ${errorText}`)
      return c.json({ detail: `Failed to upload avatar to storage: ${errorText}` }, 502)
    }

    // 5. Update user's avatar_path in database using service role client (bypasses RLS)
    const supabaseAdmin = getServiceClient()
    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .update({ avatar_path: filename })
      .eq('user_id', userId)
      .select()

    if (error || !data || data.length === 0) {
      console.error('Failed to update user_profile in database:', error)
      return c.json({ detail: `Avatar uploaded to storage but database update failed: ${error?.message || 'Profile not found'}` }, 500)
    }

    // 6. Return success response with updated avatar details
    return c.json({
      message: 'Avatar uploaded successfully.',
      avatar_path: filename,
      profile: {
        user_id: data[0].user_id,
        first_name: data[0].first_name,
        last_name: data[0].last_name,
        avatar_path: data[0].avatar_path,
      }
    }, 200)

  } catch (err) {
    return handleSharedError(c, err)
  }
})

Deno.serve(async (req) => {
  const url = new URL(req.url)
  console.log(`[upload-user-avatar] Received request: ${req.method} ${req.url} (pathname: ${url.pathname})`)
  
  // Clean prefix if routed through Gateway / Edge Functions Router
  if (url.pathname.startsWith('/functions/v1/upload-user-avatar')) {
    url.pathname = url.pathname.replace('/functions/v1/upload-user-avatar', '')
  } else if (url.pathname.startsWith('/upload-user-avatar')) {
    url.pathname = url.pathname.replace('/upload-user-avatar', '')
  }
  
  // Ensure the pathname is at least '/'
  if (url.pathname === '') {
    url.pathname = '/'
  }
  
  console.log(`[upload-user-avatar] Rewritten URL: ${url.toString()} (pathname: ${url.pathname})`)
  const newReq = new Request(url.toString(), req)
  const resp = await app.fetch(newReq)
  console.log(`[upload-user-avatar] Response status: ${resp.status}`)
  return resp
})

