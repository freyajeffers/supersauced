# Data Fetching & Caching

<!-- toc -->

## Overview

The Super Sauced MVP uses **TanStack Query** (formerly React Query) as the primary data‑fetching and caching solution for both the React Native mobile app and the Next.js web app. TanStack Query provides:

- Automatic caching and background refetching of Supabase data.
- Optimistic updates for near‑instant UI feedback (e.g., saving a recipe).
- Simple, type‑safe hooks that integrate directly with the `@supabase/supabase-js` client.
- Built‑in support for pagination, infinite scrolling, and error retries.

## Why TanStack Query?

- **Free & open‑source** – aligns with the low‑cost strategy for the 6‑week MVP.
- **Deep Supabase integration** – the Supabase SDK works seamlessly with TanStack Query’s async functions.
- **Optimistic UI** – essential for the “saved recipe” experience where the UI must update within 1 second.
- **Developer familiarity** – React‑centric API matches the existing React Native and Next.js codebases.

## Basic Setup

1. Install the packages:

```bash
npm install @tanstack/react-query @supabase/supabase-js
```

1. Create a shared Supabase client (e.g., `supabaseClient.ts`):

```typescript
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

1. Wrap your app with the QueryProvider:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Rest of your app */}
    </QueryClientProvider>
  );
}
```

## Example: Fetching the Recipe List with Filters

```tsx
import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabaseClient';

interface Recipe {
  id: string;
  title: string;
  dietary_tags: string[];
  cube_tags: string[];
  // …other fields
}

function useRecipes(filters: { search?: string; tags?: string[] }) {
  return useQuery<Recipe[], Error>(
    ['recipes', filters],
    async () => {
      let query = supabase.from('recipes').select('*');

      if (filters.search) {
        query = query.textSearch('fts', filters.search);
      }

      if (filters.tags?.length) {
        // Example: filter by any matching tag using the GIN "overlaps" operator
        query = query.filter('dietary_tags', 'ov', filters.tags);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Recipe[];
    },
    {
      // Keep data fresh for 5 minutes; refetch on window focus
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: true,
    }
  );
}
```

## Optimistic Updates – Saving a Recipe

```tsx
function useSaveRecipe() {
  const queryClient = useQueryClient();

  return useMutation(
    async (recipeId: string) => {
      const { error } = await supabase
        .from('saved_recipes')
        .insert({ recipe_id: recipeId, user_id: supabase.auth.user()?.id });
      if (error) throw error;
    },
    {
      // Optimistically add the recipe to the cached list
      onMutate: async (recipeId) => {
        await queryClient.cancelQueries(['saved', supabase.auth.user()?.id]);
        const previous = queryClient.getQueryData(['saved', supabase.auth.user()?.id]);
        queryClient.setQueryData(['saved', supabase.auth.user()?.id], (old: any) => {
          return old ? [...old, { recipe_id: recipeId }] : [{ recipe_id: recipeId }];
        });
        return { previous };
      },
      // Roll back on error
      onError: (err, variables, context: any) => {
        queryClient.setQueryData(['saved', supabase.auth.user()?.id], context.previous);
      },
      // Refetch after success to sync with the server
      onSettled: () => {
        queryClient.invalidateQueries(['saved', supabase.auth.user()?.id]);
      },
    }
  );
}
```

## Pagination & Infinite Scrolling

TanStack Query’s `useInfiniteQuery` works with Supabase’s pagination helpers (`range`, `limit`, `offset`). See the TanStack Query docs for a full example.

## Resources

- TanStack Query Docs: <https://tanstack.com/query/v4/docs/overview>
- Supabase JavaScript SDK: <https://supabase.com/docs/reference/javascript>
- Example repo (public): <https://github.com/supersauced/supersauced‑client‑demo>

---

*Keep this file in sync with any future changes to the data‑fetching strategy or Supabase schema.*
