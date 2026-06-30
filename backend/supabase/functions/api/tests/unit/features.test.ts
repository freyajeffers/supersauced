import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { app } from "../../index.ts";
import { overrideClients, overrideAuth } from "../../deps.ts";
import { MockSupabaseClient, MockBuilder } from "./client_mock.ts";

// 1. GET /api/v1/features/ping
Deno.test("GET /api/v1/features/ping - success path", async () => {
  const res = await app.request("/api/v1/features/ping");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.message, "features endpoint reachable");
});

// 2. GET /api/v1/features/search
Deno.test("GET /api/v1/features/search - success path with metrics and tags", async () => {
  const mockRecipes = [
    {
      id: "recipe-chili",
      author_id: "author-123",
      title: "Chili Con Carne",
      slug: "chili-con-carne",
      description: "Yummy Chili",
      status: "published",
      published_at: "2026-06-29T12:00:00Z",
      cube_tags: ["spicy"],
      dietary_tags: ["gluten-free"],
      metrics: { servings: 4, difficulty_level: "medium" }
    }
  ];
  const mockClient = new MockSupabaseClient(mockRecipes);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/api/v1/features/search?limit=5&offset=0");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.length, 1);
  assertEquals(body[0].title, "Chili Con Carne");
  assertEquals(body[0].cube_tags[0], "spicy");
  assertEquals(body[0].dietary_tags[0], "gluten-free");
  assertEquals(body[0].servings, 4);
  assertEquals(body[0].difficulty_level, "medium");
});

Deno.test("GET /api/v1/features/search - error case from database", async () => {
  const mockClient = new MockSupabaseClient(null, { message: "DB Connection Failure" });
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/api/v1/features/search");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Search failed: DB Connection Failure");
});

// 3. Likes POST and DELETE
Deno.test("POST /api/v1/features/recipes/:id/like - success path", async () => {
  const mockLikeData = [{ id: "like-1", user_id: "user-123", recipe_id: "recipe-123", collection_name: "likes" }];
  const mockClient = new MockSupabaseClient(mockLikeData);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/api/v1/features/recipes/recipe-123/like", {
    method: "POST"
  });
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals(body.recipe_id, "recipe-123");
  assertEquals(body.collection_name, "likes");
});

Deno.test("POST /api/v1/features/recipes/:id/like - error path", async () => {
  const mockClient = new MockSupabaseClient(null, { message: "Duplicate key violation" });
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/api/v1/features/recipes/recipe-123/like", {
    method: "POST"
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to like recipe: Duplicate key violation");
});

Deno.test("DELETE /api/v1/features/recipes/:id/like - success path", async () => {
  const mockClient = new MockSupabaseClient([]);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/api/v1/features/recipes/recipe-123/like", {
    method: "DELETE"
  });
  assertEquals(res.status, 204);
});

Deno.test("DELETE /api/v1/features/recipes/:id/like - error path", async () => {
  const mockClient = new MockSupabaseClient(null, { message: "Network error" });
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/api/v1/features/recipes/recipe-123/like", {
    method: "DELETE"
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Unlike failed: Network error");
});

// 4. GET /api/v1/features/likes
Deno.test("GET /api/v1/features/likes - lists user's liked recipes", async () => {
  const customClient = {
    from(table: string) {
      if (table === 'saved_recipes') {
        return new MockBuilder([{ recipe_id: "recipe-123" }]);
      }
      if (table === 'recipes') {
        return new MockBuilder([{
          id: "recipe-123",
          title: "Tasty Tacos",
          slug: "tasty-tacos",
          description: "Tacos!",
          status: "published",
          metrics: { servings: 3, difficulty_level: "easy" }
        }]);
      }
      return new MockBuilder([]);
    }
  } as any;

  overrideClients(customClient, customClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/api/v1/features/likes");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.length, 1);
  assertEquals(body[0].title, "Tasty Tacos");
  assertEquals(body[0].servings, 3);
});

Deno.test("GET /api/v1/features/likes - empty liked recipes list", async () => {
  const mockClient = new MockSupabaseClient([]);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/api/v1/features/likes");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.length, 0);
});

Deno.test("GET /api/v1/features/likes - database error on likes list", async () => {
  const mockClient = new MockSupabaseClient(null, { message: "Internal DB Error" });
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/api/v1/features/likes");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to list liked recipes: Internal DB Error");
});

Deno.test("GET /api/v1/features/likes - database error on recipes list", async () => {
  const customClient = {
    from(table: string) {
      if (table === 'saved_recipes') {
        return new MockBuilder([{ recipe_id: "recipe-123" }]);
      }
      if (table === 'recipes') {
        return new MockBuilder(null, { message: "Recipes fetch error" });
      }
      return new MockBuilder([]);
    }
  } as any;

  overrideClients(customClient, customClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/api/v1/features/likes");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to list liked recipes: Recipes fetch error");
});

// 5. Bookmarks POST, DELETE, GET
Deno.test("POST /api/v1/features/recipes/:id/bookmark - success path", async () => {
  const mockBookmark = [{ id: "bookmark-1", user_id: "user-123", recipe_id: "recipe-123", collection_name: "bookmarks" }];
  const mockClient = new MockSupabaseClient(mockBookmark);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/api/v1/features/recipes/recipe-123/bookmark", {
    method: "POST"
  });
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals(body.collection_name, "bookmarks");
});

Deno.test("POST /api/v1/features/recipes/:id/bookmark - error path", async () => {
  const mockClient = new MockSupabaseClient(null, { message: "Internal error" });
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/api/v1/features/recipes/recipe-123/bookmark", {
    method: "POST"
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to bookmark recipe: Internal error");
});

Deno.test("DELETE /api/v1/features/recipes/:id/bookmark - success path", async () => {
  const mockClient = new MockSupabaseClient([]);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/api/v1/features/recipes/recipe-123/bookmark", {
    method: "DELETE"
  });
  assertEquals(res.status, 204);
});

Deno.test("DELETE /api/v1/features/recipes/:id/bookmark - error path", async () => {
  const mockClient = new MockSupabaseClient(null, { message: "Internal error" });
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/api/v1/features/recipes/recipe-123/bookmark", {
    method: "DELETE"
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Unbookmark failed: Internal error");
});

Deno.test("GET /api/v1/features/bookmarks - lists user's bookmarks", async () => {
  const customClient = {
    from(table: string) {
      if (table === 'saved_recipes') {
        return new MockBuilder([{ recipe_id: "recipe-123" }]);
      }
      if (table === 'recipes') {
        return new MockBuilder([{
          id: "recipe-123",
          title: "Tasty Tacos",
          slug: "tasty-tacos",
          description: "Tacos!",
          status: "published",
          metrics: { servings: 3, difficulty_level: "easy" }
        }]);
      }
      return new MockBuilder([]);
    }
  } as any;

  overrideClients(customClient, customClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/api/v1/features/bookmarks");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.length, 1);
  assertEquals(body[0].title, "Tasty Tacos");
});

Deno.test("GET /api/v1/features/bookmarks - empty bookmarks", async () => {
  const mockClient = new MockSupabaseClient([]);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/api/v1/features/bookmarks");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.length, 0);
});

Deno.test("GET /api/v1/features/bookmarks - database error on bookmarks list", async () => {
  const mockClient = new MockSupabaseClient(null, { message: "Internal DB Error" });
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/api/v1/features/bookmarks");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to list bookmarks: Internal DB Error");
});

Deno.test("GET /api/v1/features/bookmarks - database error on recipes fetch", async () => {
  const customClient = {
    from(table: string) {
      if (table === 'saved_recipes') {
        return new MockBuilder([{ recipe_id: "recipe-123" }]);
      }
      if (table === 'recipes') {
        return new MockBuilder(null, { message: "Fetch recipes failed" });
      }
      return new MockBuilder([]);
    }
  } as any;

  overrideClients(customClient, customClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/api/v1/features/bookmarks");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to list bookmarks: Fetch recipes failed");
});

// 6. Nutrition & Macros
Deno.test("GET /api/v1/features/recipes/:id/nutrition - success path with linked products and nutrition", async () => {
  const mockRecipeProducts = [
    {
      quantity: 2,
      product: {
        nutrition: {
          calories: 100,
          protein_g: 5,
          carbs_g: 10,
          fat_g: 2
        }
      }
    }
  ];
  const mockClient = new MockSupabaseClient(mockRecipeProducts);
  overrideClients(mockClient, mockClient);

  const res = await app.request("/api/v1/features/recipes/recipe-123/nutrition");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.calories_per_serving, 200);
  assertEquals(body.protein_g, 10);
  assertEquals(body.carbs_g, 20);
  assertEquals(body.fat_g, 4);
});

Deno.test("GET /api/v1/features/recipes/:id/nutrition - fallback baseline calculations when no products linked", async () => {
  const mockClient = new MockSupabaseClient([]);
  overrideClients(mockClient, mockClient);

  const res = await app.request("/api/v1/features/recipes/recipe-123/nutrition");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.calories_per_serving, 320);
  assertEquals(body.protein_g, 12);
  assertEquals(body.carbs_g, 45);
  assertEquals(body.fat_g, 8);
});

Deno.test("GET /api/v1/features/recipes/:id/nutrition - error path", async () => {
  const mockClient = new MockSupabaseClient(null, { message: "Internal error" });
  overrideClients(mockClient, mockClient);

  const res = await app.request("/api/v1/features/recipes/recipe-123/nutrition");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Nutrition fetch failed: Internal error");
});

// 7. Share Recipes
Deno.test("POST /api/v1/features/recipes/:id/share - success path", async () => {
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });
  const res = await app.request("/api/v1/features/recipes/recipe-123/share", { method: "POST" });
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals(body.recipe_id, "recipe-123");
  assertEquals(body.user_id, "user-123");
});

// 8. Recommendations
Deno.test("GET /api/v1/features/recipes/recommendations - success path", async () => {
  const mockRecipes = [
    {
      id: "rec-1",
      title: "Recommended Salad",
      slug: "recommended-salad",
      description: "Heathy Salad",
      status: "published",
      metrics: { servings: 2, difficulty_level: "easy" }
    }
  ];
  const mockClient = new MockSupabaseClient(mockRecipes);
  overrideClients(mockClient, mockClient);

  const res = await app.request("/api/v1/features/recipes/recommendations?limit=3");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.length, 1);
  assertEquals(body[0].title, "Recommended Salad");
});

Deno.test("GET /api/v1/features/recipes/recommendations - error path", async () => {
  const mockClient = new MockSupabaseClient(null, { message: "Database read failed" });
  overrideClients(mockClient, mockClient);

  const res = await app.request("/api/v1/features/recipes/recommendations");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Recommendation failed: Database read failed");
});

// 9. Rating & Comments
Deno.test("POST /api/v1/features/recipes/:id/rating - success path", async () => {
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });
  const res = await app.request("/api/v1/features/recipes/recipe-123/rating", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating: 4, comment: "Tasty!" })
  });
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals(body.recipe_id, "recipe-123");
  assertEquals(body.rating, 4);
  assertEquals(body.comment, "Tasty!");
});

Deno.test("GET /api/v1/features/recipes/:id/ratings - success path", async () => {
  const res = await app.request("/api/v1/features/recipes/recipe-123/ratings");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.length, 1);
  assertEquals(body[0].recipe_id, "recipe-123");
});

// 10. Serving Size Adjuster
Deno.test("GET /api/v1/features/recipes/:id/adjust-servings - invalid parameters", async () => {
  const res = await app.request("/api/v1/features/recipes/recipe-123/adjust-servings?target_servings=0");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Desired number of servings must be greater than or equal to 1");
});

Deno.test("GET /api/v1/features/recipes/:id/adjust-servings - recipe missing default servings", async () => {
  const customClient = {
    rpc(fn: string, args: any) {
      return Promise.resolve({ data: [], error: null });
    },
    from(table: string) {
      return {
        select(cols: string = "*") { return this; },
        eq(col: string, val: any) { return this; },
        single() {
          return Promise.resolve({ data: null, error: null });
        }
      };
    }
  } as any;

  overrideClients(customClient, customClient);
  const res = await app.request("/api/v1/features/recipes/recipe-123/adjust-servings?target_servings=4");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Recipe missing default servings");
});

Deno.test("GET /api/v1/features/recipes/:id/adjust-servings - success with no ingredients scaled", async () => {
  const customClient = {
    rpc(fn: string, args: any) {
      return Promise.resolve({ data: [], error: null });
    },
    from(table: string) {
      return {
        select(cols: string = "*") { return this; },
        eq(col: string, val: any) { return this; },
        single() {
          return Promise.resolve({ data: { id: "recipe-123" }, error: null });
        }
      };
    }
  } as any;

  overrideClients(customClient, customClient);
  const res = await app.request("/api/v1/features/recipes/recipe-123/adjust-servings?target_servings=4");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.target_servings, 4);
  assertEquals(body.ingredients.length, 0);
});

Deno.test("GET /api/v1/features/recipes/:id/adjust-servings - failure on RPC", async () => {
  const customClient = {
    rpc(fn: string, args: any) {
      return Promise.resolve({ data: null, error: { message: "Database crash" } });
    }
  } as any;

  overrideClients(customClient, customClient);
  const res = await app.request("/api/v1/features/recipes/recipe-123/adjust-servings?target_servings=4");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Serving adjustment failed: Database crash");
});

// 11. QR Code deep links
Deno.test("GET /api/v1/features/:id/qr - success path", async () => {
  const res = await app.request("/api/v1/features/recipe-123/qr");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.qr_url, "https://app.supersauced.com/recipe/recipe-123");
});

// 12. Publishing
Deno.test("POST /api/v1/features/:id/publish - forbidden for non-editor", async () => {
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });
  const res = await app.request("/api/v1/features/recipe-123/publish", { method: "POST" });
  assertEquals(res.status, 403);
});

Deno.test("POST /api/v1/features/:id/publish - success for cms_editor", async () => {
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });
  const mockRecipe = [{ id: "recipe-123", status: "published" }];
  const mockClient = new MockSupabaseClient(mockRecipe);
  overrideClients(mockClient, mockClient);

  const res = await app.request("/api/v1/features/recipe-123/publish", { method: "POST" });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.status, "published");
});

Deno.test("POST /api/v1/features/:id/publish - failure from database", async () => {
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });
  const customClient = {
    from() {
      return {
        update() { return this; },
        eq() { return this; },
        select() { return this; },
        then(resolve: any, reject: any) {
          reject(new Error("Internal Error"));
        }
      };
    }
  } as any;
  overrideClients(customClient, customClient);

  const res = await app.request("/api/v1/features/recipe-123/publish", { method: "POST" });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Publish failed: Internal Error");
});

Deno.test("POST /api/v1/features/:id/publish - recipe not found", async () => {
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });
  const mockClient = new MockSupabaseClient([]);
  overrideClients(mockClient, mockClient);

  const res = await app.request("/api/v1/features/recipe-123/publish", { method: "POST" });
  assertEquals(res.status, 404);
  const body = await res.json();
  assertEquals(body.detail, "Recipe not found or cannot be published.");
});

Deno.test("DELETE /api/v1/features/:id/publish - forbidden for non-editor", async () => {
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });
  const res = await app.request("/api/v1/features/recipe-123/publish", { method: "DELETE" });
  assertEquals(res.status, 403);
});

Deno.test("DELETE /api/v1/features/:id/publish - success for cms_editor", async () => {
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });
  const mockClient = new MockSupabaseClient([]);
  overrideClients(mockClient, mockClient);

  const res = await app.request("/api/v1/features/recipe-123/publish", { method: "DELETE" });
  assertEquals(res.status, 204);
});

Deno.test("DELETE /api/v1/features/:id/publish - failure from database", async () => {
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });
  const mockClient = new MockSupabaseClient(null, { message: "Internal Error" });
  overrideClients(mockClient, mockClient);

  const res = await app.request("/api/v1/features/recipe-123/publish", { method: "DELETE" });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Unpublish failed: Internal Error");
});

// 13. Step Video Upload
Deno.test("POST /api/v1/features/:id/video - success with mock body parsing", async () => {
  const res = await app.request("/api/v1/features/recipe-123/video", {
    method: "POST"
  });
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals(body.video_url, "https://cdn.supersauced.com/videos/recipe-123/video.mp4");
});

// 14. Tagging & Categorization
Deno.test("POST /api/v1/features/:id/tags - success", async () => {
  const res = await app.request("/api/v1/features/recipe-123/tags", {
    method: "POST"
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
});

// 15. Admin Analytics Dashboard
Deno.test("GET /api/v1/features/admin/analytics - forbidden for non-admin", async () => {
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });
  const res = await app.request("/api/v1/features/admin/analytics");
  assertEquals(res.status, 403);
});

Deno.test("GET /api/v1/features/admin/analytics - success for admin", async () => {
  overrideAuth({ sub: "admin-123" }, { id: "admin-123", email: "admin@example.com", role: "admin" });
  
  const mockCountQuery = {
    select(col: string, opts: any) {
      return Promise.resolve({ count: 42, error: null });
    }
  };
  const customClient = {
    from(table: string) {
      return mockCountQuery;
    }
  } as any;

  overrideClients(customClient, customClient);
  const res = await app.request("/api/v1/features/admin/analytics");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.recipes, 42);
  assertEquals(body.users, 42);
  assertEquals(body.likes, 42);
});

Deno.test("GET /api/v1/features/admin/analytics - DB failure", async () => {
  overrideAuth({ sub: "admin-123" }, { id: "admin-123", email: "admin@example.com", role: "admin" });
  
  const customClient = {
    from(table: string) {
      return {
        select(col: string, opts: any) {
          return Promise.reject(new Error("Analytics failed"));
        }
      };
    }
  } as any;

  overrideClients(customClient, customClient);
  const res = await app.request("/api/v1/features/admin/analytics");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Analytics fetch failed: Analytics failed");
});

// 16. Discovery Mode
Deno.test("GET /api/v1/features/discover - success with non-empty bookmarks", async () => {
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const customClient = {
    from(table: string) {
      if (table === 'saved_recipes') {
        return new MockBuilder([{ recipe_id: "recipe-1" }]);
      }
      if (table === 'recipes') {
        return new MockBuilder([{ id: "recipe-2", title: "Discovered Soup" }]);
      }
      return new MockBuilder([]);
    }
  } as any;

  overrideClients(customClient, customClient);
  const res = await app.request("/api/v1/features/discover");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.length, 1);
  assertEquals(body[0].title, "Discovered Soup");
});

Deno.test("GET /api/v1/features/discover - success with empty bookmarks", async () => {
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const customClient = {
    from(table: string) {
      if (table === 'saved_recipes') {
        return new MockBuilder([]);
      }
      if (table === 'recipes') {
        return new MockBuilder([{ id: "recipe-1", title: "Fresh Discovered Soup" }]);
      }
      return new MockBuilder([]);
    }
  } as any;

  overrideClients(customClient, customClient);
  const res = await app.request("/api/v1/features/discover");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.length, 1);
  assertEquals(body[0].title, "Fresh Discovered Soup");
});

Deno.test("GET /api/v1/features/discover - DB failure on saved_recipes", async () => {
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const customClient = {
    from(table: string) {
      if (table === 'saved_recipes') {
        return new MockBuilder(null, { message: "Saved fetch error" });
      }
      return new MockBuilder([]);
    }
  } as any;

  overrideClients(customClient, customClient);
  const res = await app.request("/api/v1/features/discover");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Discovery failed: Saved fetch error");
});

Deno.test("GET /api/v1/features/discover - DB failure on recipes", async () => {
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const customClient = {
    from(table: string) {
      if (table === 'saved_recipes') {
        return new MockBuilder([]);
      }
      if (table === 'recipes') {
        return new MockBuilder(null, { message: "Recipes fetch error" });
      }
      return new MockBuilder([]);
    }
  } as any;

  overrideClients(customClient, customClient);
  const res = await app.request("/api/v1/features/discover");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Discovery failed: Recipes fetch error");
});

// 17. Push Notifications
Deno.test("POST /api/v1/features/notifications - forbidden for user", async () => {
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });
  const res = await app.request("/api/v1/features/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: "other-user", message: "Hello" })
  });
  assertEquals(res.status, 403);
});

Deno.test("POST /api/v1/features/notifications - allowed for admin", async () => {
  overrideAuth({ sub: "admin-123" }, { id: "admin-123", email: "admin@example.com", role: "admin" });
  const res = await app.request("/api/v1/features/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: "other-user", message: "Hello" })
  });
  assertEquals(res.status, 202);
  const body = await res.json();
  assertEquals(body.queued, true);
  assertEquals(body.target_user, "other-user");
});

// 18. Community Feed
Deno.test("GET /api/v1/features/feed - success", async () => {
  const res = await app.request("/api/v1/features/feed?limit=1");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.length, 1);
});

// 19. Ingredient Substitution
Deno.test("GET /api/v1/features/ingredients/:id/substitutes - success", async () => {
  const res = await app.request("/api/v1/features/ingredients/egg/substitutes");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.length, 3);
  assertEquals(body[0], "flaxseed");

  const resDefault = await app.request("/api/v1/features/ingredients/unknown/substitutes");
  assertEquals(resDefault.status, 200);
  const bodyDefault = await resDefault.json();
  assertEquals(bodyDefault.length, 0);
});

// 20. Rewards / Loyalty
Deno.test("GET /api/v1/features/rewards/:id - view own rewards success", async () => {
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });
  const res = await app.request("/api/v1/features/rewards/user-123");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.points, 1234);
});

Deno.test("GET /api/v1/features/rewards/:id - view other user rewards forbidden", async () => {
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });
  const res = await app.request("/api/v1/features/rewards/other-user");
  assertEquals(res.status, 403);
});

Deno.test("GET /api/v1/features/rewards/:id - view other user rewards allowed for admin", async () => {
  overrideAuth({ sub: "admin-123" }, { id: "admin-123", email: "admin@example.com", role: "admin" });
  const res = await app.request("/api/v1/features/rewards/other-user");
  assertEquals(res.status, 200);
});

// 21. DTC Purchasing
Deno.test("POST /api/v1/features/purchase - success", async () => {
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });
  const res = await app.request("/api/v1/features/purchase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item_id: "prod-abc" })
  });
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals(body.status, "pending");
});

// 22. Premium Subscription Tier
Deno.test("GET /api/v1/features/subscription/status - success", async () => {
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });
  const res = await app.request("/api/v1/features/subscription/status");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.tier, "free");
});

Deno.test("POST /api/v1/features/subscription/upgrade - success", async () => {
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });
  const res = await app.request("/api/v1/features/subscription/upgrade", { method: "POST" });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.new_tier, "premium");
});

// 23. Guided Instructions
Deno.test("GET /api/v1/features/:id/guided - success", async () => {
  const mockGuidedSteps = [
    { step_number: 1, instruction_text: "Slice onions" },
    { step_number: 2, instruction_text: "Sauté onions" }
  ];
  const mockClient = new MockSupabaseClient(mockGuidedSteps);
  overrideClients(mockClient, mockClient);

  const res = await app.request("/api/v1/features/recipe-123/guided");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.length, 2);
  assertEquals(body[0].step, 1);
  assertEquals(body[1].instruction, "Sauté onions");
});

Deno.test("GET /api/v1/features/:id/guided - DB failure", async () => {
  const mockClient = new MockSupabaseClient(null, { message: "Internal Error" });
  overrideClients(mockClient, mockClient);

  const res = await app.request("/api/v1/features/recipe-123/guided");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to fetch guided instructions: Internal Error");
});

Deno.test("GET /api/v1/features/search - unexpected exception during search", async () => {
  const customClient = {
    from() {
      throw new Error("Unexpected database crash");
    }
  } as any;
  overrideClients(customClient, customClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/api/v1/features/search");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Search failed: Unexpected database crash");
});

Deno.test("POST /api/v1/features/recipes/:recipe_id/like - unexpected exception during like", async () => {
  const customClient = {
    from() {
      throw new Error("Crash during like");
    }
  } as any;
  overrideClients(customClient, customClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/api/v1/features/recipes/recipe-123/like", { method: "POST" });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Like failed: Crash during like");
});

Deno.test("DELETE /api/v1/features/recipes/:recipe_id/like - unexpected exception during unlike", async () => {
  const customClient = {
    from() {
      throw new Error("Crash during unlike");
    }
  } as any;
  overrideClients(customClient, customClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/api/v1/features/recipes/recipe-123/like", { method: "DELETE" });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Unlike failed: Crash during unlike");
});

Deno.test("GET /api/v1/features/likes - unexpected exception during likes fetch", async () => {
  const customClient = {
    from() {
      throw new Error("Crash listing likes");
    }
  } as any;
  overrideClients(customClient, customClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/api/v1/features/likes");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to list liked recipes: Crash listing likes");
});

Deno.test("POST /api/v1/features/recipes/:recipe_id/bookmark - unexpected exception during bookmark", async () => {
  const customClient = {
    from() {
      throw new Error("Crash during bookmark");
    }
  } as any;
  overrideClients(customClient, customClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/api/v1/features/recipes/recipe-123/bookmark", { method: "POST" });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Bookmark failed: Crash during bookmark");
});

Deno.test("DELETE /api/v1/features/recipes/:recipe_id/bookmark - unexpected exception during unbookmark", async () => {
  const customClient = {
    from() {
      throw new Error("Crash during unbookmark");
    }
  } as any;
  overrideClients(customClient, customClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/api/v1/features/recipes/recipe-123/bookmark", { method: "DELETE" });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Unbookmark failed: Crash during unbookmark");
});

Deno.test("GET /api/v1/features/bookmarks - unexpected exception during bookmarks fetch", async () => {
  const customClient = {
    from() {
      throw new Error("Crash listing bookmarks");
    }
  } as any;
  overrideClients(customClient, customClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/api/v1/features/bookmarks");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to list bookmarks: Crash listing bookmarks");
});

Deno.test("GET /api/v1/features/recipes/:id/nutrition - unexpected exception during nutrition fetch", async () => {
  const customClient = {
    from() {
      throw new Error("Crash fetching nutrition");
    }
  } as any;
  overrideClients(customClient, customClient);

  const res = await app.request("/api/v1/features/recipes/recipe-123/nutrition");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Nutrition fetch failed: Crash fetching nutrition");
});

Deno.test("GET /api/v1/features/recipes/recommendations - unexpected exception during recommendations", async () => {
  const customClient = {
    from() {
      throw new Error("Crash fetching recommendations");
    }
  } as any;
  overrideClients(customClient, customClient);

  const res = await app.request("/api/v1/features/recipes/recommendations");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Recommendation failed: Crash fetching recommendations");
});

Deno.test("GET /api/v1/features/recipes/:id/adjust-servings - unexpected exception during adjust-servings", async () => {
  const customClient = {
    rpc() {
      throw new Error("Crash scaling servings");
    }
  } as any;
  overrideClients(customClient, customClient);

  const res = await app.request("/api/v1/features/recipes/recipe-123/adjust-servings?target_servings=4");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Serving adjustment failed: Crash scaling servings");
});

Deno.test("GET /api/v1/features/discover - unexpected exception during discover", async () => {
  const customClient = {
    from() {
      throw new Error("Crash during discovery");
    }
  } as any;
  overrideClients(customClient, customClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/api/v1/features/discover");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Discovery failed: Crash during discovery");
});

Deno.test("DELETE /api/v1/features/:id/publish - unexpected exception during unpublish", async () => {
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });
  const customClient = {
    from() {
      throw new Error("Crash during unpublishing");
    }
  } as any;
  overrideClients(customClient, customClient);

  const res = await app.request("/api/v1/features/recipe-123/publish", { method: "DELETE" });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Unpublish failed: Crash during unpublishing");
});

Deno.test("GET /api/v1/features/search - fallback cases (missing metrics/tags, null data)", async () => {
  const mockRecipes = [
    {
      id: "recipe-salad",
      author_id: "author-123",
      title: "Salad",
      slug: "salad",
      description: "Yummy Salad",
      status: "published",
      published_at: "2026-06-29T12:00:00Z",
      cube_tags: null,
      dietary_tags: null,
      metrics: null
    }
  ];
  const mockClient = new MockSupabaseClient(mockRecipes);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });
  try {
    const res = await app.request("/api/v1/features/search?limit=5&offset=0");
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.length, 1);
    assertEquals(body[0].title, "Salad");
    assertEquals(body[0].cube_tags.length, 0);
    assertEquals(body[0].dietary_tags.length, 0);
    assertEquals(body[0].servings, 1);
    assertEquals(body[0].difficulty_level, "easy");
  } finally {
    overrideClients(null, null);
    overrideAuth(null, null);
  }
});

Deno.test("GET /api/v1/features/likes - fallback serving size and difficulty level", async () => {
  const customClient = {
    from(table: string) {
      if (table === 'saved_recipes') {
        return new MockBuilder([{ recipe_id: "recipe-123" }]);
      }
      if (table === 'recipes') {
        return new MockBuilder([{
          id: "recipe-123",
          title: "Tasty Tacos",
          slug: "tasty-tacos",
          description: "Tacos!",
          status: "published",
          metrics: null
        }]);
      }
      return new MockBuilder([]);
    }
  } as any;

  overrideClients(customClient, customClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });
  try {
    const res = await app.request("/api/v1/features/likes");
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.length, 1);
    assertEquals(body[0].servings, 1);
    assertEquals(body[0].difficulty_level, "easy");
  } finally {
    overrideClients(null, null);
    overrideAuth(null, null);
  }
});

Deno.test("GET /api/v1/features/recipes/:id/nutrition - items with null values and fallback baseline", async () => {
  const mockRecipeProducts = [
    {
      quantity: null,
      product: {
        nutrition: {
          calories: null,
          protein_g: null,
          carbs_g: null,
          fat_g: null
        }
      }
    },
    {
      quantity: 3,
      product: null
    }
  ];
  const mockClient = new MockSupabaseClient(mockRecipeProducts);
  overrideClients(mockClient, mockClient);
  try {
    const res = await app.request("/api/v1/features/recipes/recipe-123/nutrition");
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.calories_per_serving, 0);
  } finally {
    overrideClients(null, null);
  }
});

Deno.test("GET /api/v1/features/recipes/:id/adjust-servings - target servings missing or isNaN", async () => {
  const res = await app.request("/api/v1/features/recipes/recipe-123/adjust-servings?target_servings=abc");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Desired number of servings must be greater than or equal to 1");

  const resMissing = await app.request("/api/v1/features/recipes/recipe-123/adjust-servings");
  assertEquals(resMissing.status, 400);
  const bodyMissing = await resMissing.json();
  assertEquals(bodyMissing.detail, "Desired number of servings must be greater than or equal to 1");
});

Deno.test("GET /api/v1/features/recipes/:id/adjust-servings - scaled ingredients success path", async () => {
  const mockScaledIngredients = [
    {
      ingredient_id: "ing-1",
      recipe_id: "recipe-123",
      quantity_decimal: 1.5,
      scaled_quantity: 3.0,
      ingredient_name: "Sugar",
      unit_abbreviation: "tbsp",
      preparation_state: "fine"
    },
    {
      ingredient_id: "ing-2",
      recipe_id: "recipe-123",
      quantity_decimal: null,
      scaled_quantity: null,
      ingredient_name: null,
      unit_abbreviation: null,
      preparation_state: null
    }
  ];
  const customClient = {
    rpc(fn: string, args: any) {
      return Promise.resolve({ data: mockScaledIngredients, error: null });
    }
  } as any;

  overrideClients(customClient, customClient);
  try {
    const res = await app.request("/api/v1/features/recipes/recipe-123/adjust-servings?target_servings=4");
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.target_servings, 4);
    assertEquals(body.ingredients.length, 2);
    assertEquals(body.ingredients[0].quantity, 1.5);
    assertEquals(body.ingredients[0].scaled_quantity, 3.0);
    assertEquals(body.ingredients[0].name, "Sugar");
    assertEquals(body.ingredients[1].quantity, null);
    assertEquals(body.ingredients[1].scaled_quantity, undefined);
    assertEquals(body.ingredients[1].name, "");
  } finally {
    overrideClients(null, null);
  }
});

Deno.test("POST /api/v1/features/:id/video - different video parameter types", async () => {
  // video as string
  const formDataString = new FormData();
  formDataString.append("video", "my-video-string");
  let res = await app.request("/api/v1/features/recipe-123/video", {
    method: "POST",
    body: formDataString
  });
  assertEquals(res.status, 201);
  let body = await res.json();
  assertEquals(body.video_url, "https://cdn.supersauced.com/videos/recipe-123/video.mp4");

  // video as file with name
  const formDataFile = new FormData();
  const blob = new Blob(["video content"], { type: "video/mp4" });
  formDataFile.append("video", blob, "custom_recording.mp4");
  res = await app.request("/api/v1/features/recipe-123/video", {
    method: "POST",
    body: formDataFile
  });
  assertEquals(res.status, 201);
  body = await res.json();
  assertEquals(body.video_url, "https://cdn.supersauced.com/videos/recipe-123/custom_recording.mp4");
});

Deno.test("POST /api/v1/features/notifications - allowed for cms_editor", async () => {
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });
  try {
    const res = await app.request("/api/v1/features/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: "other-user", message: "Hello" })
    });
    assertEquals(res.status, 202);
    const body = await res.json();
    assertEquals(body.queued, true);
  } finally {
    overrideAuth(null, null);
  }
});

Deno.test("GET /api/v1/features/rewards/:id - view other user rewards allowed for cms_editor", async () => {
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });
  try {
    const res = await app.request("/api/v1/features/rewards/other-user");
    assertEquals(res.status, 200);
  } finally {
    overrideAuth(null, null);
  }
});

Deno.test("POST /api/v1/features/purchase - fallback item_id", async () => {
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });
  try {
    const res = await app.request("/api/v1/features/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assertEquals(res.status, 201);
    const body = await res.json();
    assertEquals(body.status, "pending");
  } finally {
    overrideAuth(null, null);
  }
});


