# Analytics Documentation
<!-- toc -->

## Overview

The Super Sauced MVP captures user interaction data to inform product decisions, improve the **Speed to Meal** experience, and monitor system health. Two analytics services are integrated:

1. **PostHog** – self‑hosted analytics platform for event tracking, feature flags, and funnel analysis.
2. **Firebase Analytics** – Google‑backed mobile analytics for iOS (and future Android) apps, providing automated attribution, crash reporting, and integration with other Firebase services.

Both services ingest events from the mobile client (React Native) and backend (Supabase Edge Functions) and forward them to the respective dashboards.

---

## 1. PostHog Integration

### 1.1. Setup

- **Self‑hosted instance**: Deploy a PostHog Docker compose stack on a secure VPS.
- **Project API key**: Obtain the project‑level API token from the PostHog UI (`Settings → Project API keys`).
- **Base URL**: `https://analytics.supersauced.com` (replace with your domain).

### 1.2. Client‑side (React Native) Implementation

```ts
import { PostHog } from 'posthog-react-native';

const posthog = new PostHog('YOUR_POSTHOG_API_KEY', {
  host: 'https://analytics.supersauced.com',
  // optional: enable batch sending for reduced network overhead
  // requestTimeout: 3000,
});

// Initialize when app starts
await posthog.init();

// Example event: User opens the recipe list (Speed to Meal screen)
posthog.capture('screen_view', {
  screen: 'recipe_list',
  duration_ms: 0,
});

// Example event: User saves a recipe
posthog.capture('recipe_saved', {
  recipe_id: recipe.id,
  user_id: user.id,
});
```

### 1.3. Backend (Supabase Edge Function) Events

When certain backend actions occur (e.g., a new recipe is published), an Edge Function can forward a PostHog event:

```ts
import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);

serve(async (req) => {
  const { data, error } = await supabase
    .from('recipes')
    .insert(req.json());

  if (!error) {
    await fetch('https://analytics.supersauced.com/capture/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('POSTHOG_API_KEY')}` },
      body: JSON.stringify({
        event: 'recipe_created',
        properties: { recipe_id: data[0].id, author_id: data[0].author_id },
      }),
    });
  }

  return new Response(JSON.stringify({ data, error }));
});
```

### 1.4. Feature Flags & A/B Tests

PostHog’s feature flag system can be queried directly from the client to toggle experimental UI:

```ts
const flags = await posthog.getFeatureFlags();
if (flags['new_save_button']) {
  // render new UI variant
}
```

---

## 2. Firebase Analytics Integration

### 2.1. Setup

1. Create a Firebase project (`supersauced`).
2. Add an iOS app in the Firebase console and download `GoogleService-Info.plist`.
3. Place the plist in the Xcode project (or the Expo managed workflow via `expo prebuild`).
4. Enable **Google Analytics** for the project.

### 2.2. React Native (Expo) Integration

Install the package:

```bash
expo install expo-firebase-analytics
```

```ts
import * as Analytics from 'expo-firebase-analytics';

// Log a custom event when a user starts cooking
await Analytics.logEvent('start_cooking', {
  recipe_id: recipe.id,
  cuisine: recipe.cuisine,
});

// Log screen view automatically (optional)
await Analytics.setCurrentScreen('RecipeDetail');
```

### 2.3. Linking Backend Events

For server‑side actions (e.g., a user completes a purchase through Shopify), you can forward a Firebase event using the **REST API**:

```ts
await fetch(`https://firebase.googleapis.com/v1/projects/${process.env.FIREBASE_PROJECT_ID}/events:logEvent?key=${process.env.FIREBASE_API_KEY}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'purchase_complete',
    params: { user_id: user.id, amount_usd: order.total },
  }),
});
```

### 2.4. Audiences & Conversions

Configure **Audiences** in the Firebase console (e.g., `high_engagement_users` – users with ≥5 saved recipes). Use these audiences for targeted **Firebase Cloud Messaging** notifications or to seed **Google Ads** campaigns.

---

## 3. Consolidated Event Schema (Shared Between Services)

| Event Name         | Description                                 | Common Properties                               |
|--------------------|---------------------------------------------|-------------------------------------------------|
| `screen_view`      | User navigates to a screen                  | `screen` (string), `duration_ms` (number)       |
| `recipe_saved`     | User bookmarks a recipe                     | `recipe_id` (uuid), `user_id` (uuid)            |
| `recipe_created`   | Backend created a new recipe                | `recipe_id` (uuid), `author_id` (uuid)          |
| `start_cooking`    | User begins cooking a recipe                | `recipe_id` (uuid), `cuisine` (string)         |
| `purchase_complete`| Shopify checkout completed                  | `order_id` (string), `amount_usd` (number)      |

Both PostHog and Firebase can ingest these events; the client sends to PostHog for detailed funnel analysis, while Firebase provides automatic attribution and integration with other Firebase services.

---

## 4. GDPR / Privacy Considerations

- **User consent**: Prompt users on first launch to opt‑in to analytics. Store consent in Supabase `user_consent` table.
- **Event de‑identification**: Do not send PII (email, name) in event payloads. Use hashed IDs where needed.
- **Data retention**: Configure PostHog retention policy (e.g., 90 days) and Firebase data deletion settings per GDPR requirements.

---

## 5. Validation & Testing

1. Run the mobile app in a dev build and verify events appear in the PostHog **Live Events** view and Firebase **DebugView**.
2. Use the Supabase `analytics_events` log table (a simple audit trail) to confirm edge‑function forwarding works.
3. Unit‑test the edge‑function HTTP request with mock fetch to ensure the correct payload shape.

---

*This documentation should be kept in sync with any changes to the event schema or analytics provider credentials.*
