import { Hono } from 'https://deno.land/x/hono@v3.11.8/mod.ts'
import { cors } from 'https://deno.land/x/hono@v3.11.8/middleware/cors/index.ts'
import authRouter from './routes/auth.ts'
import userProfilesRouter from './routes/user_profiles.ts'
import recipesRouter from './routes/recipes.ts'
import recipeIngredientsRouter from './routes/recipe_ingredients.ts'
import recipeStepsRouter from './routes/recipe_steps.ts'
import subscriptionsRouter from './routes/subscriptions.ts'
import edgeFunctionsRouter from './routes/edge_functions.ts'
import featuresRouter from './routes/features.ts'

export const app = new Hono()

app.onError((err, c) => {
  console.error("Hono router error:", err);
  return c.json({ detail: err.message, stack: err.stack }, 500);
})


// Apply CORS middleware
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowHeaders: ['Content-Type', 'Authorization', 'apikey', 'X-Shopify-Hmac-Sha256'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
}))

// Root health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', version: '1.0.0' })
})

// Mount routers matching FastAPI endpoint patterns
app.route('/auth', authRouter)
app.route('/user_profiles', userProfilesRouter)
app.route('/functions', edgeFunctionsRouter)
app.route('/recipes', recipesRouter)
app.route('/recipe_ingredients', recipeIngredientsRouter)
app.route('/recipe_steps', recipeStepsRouter)
app.route('/subscriptions', subscriptionsRouter)

// Optional compatibility routes under /api/v1 prefix
app.route('/api/v1/auth', authRouter)
app.route('/api/v1/user_profiles', userProfilesRouter)
app.route('/api/v1/functions', edgeFunctionsRouter)
app.route('/api/v1/recipes', recipesRouter)
app.route('/api/v1/recipe_ingredients', recipeIngredientsRouter)
app.route('/api/v1/recipe_steps', recipeStepsRouter)
app.route('/api/v1/subscriptions', subscriptionsRouter)

app.route('/api/v1/features', featuresRouter)
app.route('/v1/features', featuresRouter)

// Serve request by rewriting path prefix if running in Supabase local/hosted function env
if (import.meta.main) {
  Deno.serve(async (req) => {
    const url = new URL(req.url)
    // Strip "/functions/v1/api" or "/api" (if not /api/v1) prefix if it exists to match our registered Hono routes
    if (url.pathname.startsWith('/functions/v1/api')) {
      url.pathname = url.pathname.replace('/functions/v1/api', '')
    } else if (url.pathname.startsWith('/api') && !url.pathname.startsWith('/api/v1')) {
      url.pathname = url.pathname.replace('/api', '')
    }
    const newReq = new Request(url.toString(), req)
    return await app.fetch(newReq)
  })
}
