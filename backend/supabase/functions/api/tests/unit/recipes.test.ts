import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { app } from "../../index.ts";
import { overrideClients, overrideAuth } from "../../deps.ts";
import { MockSupabaseClient } from "./client_mock.ts";

Deno.test("GET /recipes - list recipes", async () => {
  const mockRecipes = [{
    id: "recipe-123",
    title: "Awesome Sauce",
    metrics: { servings: 2, difficulty_level: "medium" }
  }];
  const mockClient = new MockSupabaseClient(mockRecipes);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/recipes");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.length, 1);
  assertEquals(body[0].title, "Awesome Sauce");
});

Deno.test("GET /recipes/:id - fetch recipe", async () => {
  const mockRecipe = [{
    id: "recipe-123",
    title: "Awesome Sauce"
  }];
  const mockClient = new MockSupabaseClient(mockRecipe);
  overrideClients(mockClient, mockClient);

  const res = await app.request("/recipes/recipe-123");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.title, "Awesome Sauce");
});

Deno.test("POST /recipes - forbidden for regular user", async () => {
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user-123@example.com", role: "authenticated" });
  const res = await app.request("/recipes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "New Recipe" })
  });
  assertEquals(res.status, 403);
});

Deno.test("POST /recipes - allowed for cms_editor", async () => {
  const mockRecipe = [{ id: "recipe-456", title: "New Recipe" }];
  const mockClient = new MockSupabaseClient(mockRecipe);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });

  const res = await app.request("/recipes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "New Recipe" })
  });
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals(body.title, "New Recipe");
});

Deno.test("GET /recipe_ingredients - list ingredients", async () => {
  const mockIngredients = [{
    id: "ing-1",
    recipe_id: "recipe-123",
    quantity_decimal: 100,
    ingredient: { name: "Sauce Base" },
    unit: { abbreviation: "g" }
  }];
  const mockClient = new MockSupabaseClient(mockIngredients);
  overrideClients(mockClient, mockClient);

  const res = await app.request("/recipe_ingredients");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.length, 1);
  assertEquals(body[0].name, "Sauce Base");
});

Deno.test("GET /recipe_steps - list steps", async () => {
  const mockSteps = [{
    id: "step-1",
    recipe_id: "recipe-123",
    step_number: 1,
    instruction_text: "Mix ingredients"
  }];
  const mockClient = new MockSupabaseClient(mockSteps);
  overrideClients(mockClient, mockClient);

  const res = await app.request("/recipe_steps");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.length, 1);
  assertEquals(body[0].description, "Mix ingredients");
});

Deno.test("GET /recipes/:id/adjust-servings - scale ingredients", async () => {
  const mockRpcData = [
    {
      ingredient_id: "ing-1",
      recipe_id: "recipe-123",
      quantity_decimal: 100,
      scaled_quantity: 200,
      ingredient_name: "Garlic",
      unit_abbreviation: "g",
      preparation_state: null
    },
    {
      ingredient_id: "ing-2",
      recipe_id: "recipe-123",
      quantity_decimal: null,
      scaled_quantity: null,
      ingredient_name: "Salt",
      unit_abbreviation: null,
      preparation_state: null
    }
  ];

  const customClient = {
    rpc(fn: string, args: any) {
      if (fn === 'scale_recipe_servings') {
        return Promise.resolve({ data: mockRpcData, error: null });
      }
      return Promise.resolve({ data: null, error: { message: `Unknown RPC: ${fn}` } });
    },
    from(table: string) {
      return {
        select(cols: string = "*") {
          return this;
        },
        eq(col: string, val: any) {
          return this;
        },
        single() {
          return Promise.resolve({ data: { id: "recipe-123" }, error: null });
        },
        then(resolve: any) {
          resolve({ data: [], error: null });
        }
      };
    }
  } as any;

  overrideClients(customClient, customClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/api/v1/features/recipes/recipe-123/adjust-servings?target_servings=4");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.target_servings, 4);
  assertEquals(body.ingredients.length, 2);
  assertEquals(body.ingredients[0].scaled_quantity, 200);
  assertEquals(body.ingredients[1].scaled_quantity, undefined);
});

// GET /recipes error cases
Deno.test("GET /recipes - database error", async () => {
  const mockClient = new MockSupabaseClient(null, { message: "DB Connection timeout" });
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/recipes");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to list recipes: DB Connection timeout");
});

Deno.test("GET /recipes - unexpected exception", async () => {
  const customClient = {
    from() {
      return {
        select() { return this; },
        range() {
          throw new Error("Failed query");
        }
      };
    }
  } as any;
  overrideClients(customClient, customClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/recipes");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to list recipes: Failed query");
});

// GET /recipes/:id error cases
Deno.test("GET /recipes/:id - not found", async () => {
  const mockClient = new MockSupabaseClient(null, { message: "Single recipe missing" });
  overrideClients(mockClient, mockClient);

  const res = await app.request("/recipes/recipe-missing");
  assertEquals(res.status, 404);
  const body = await res.json();
  assertEquals(body.detail, "Recipe not found");
});

// POST /recipes edge cases and error cases
Deno.test("POST /recipes - database error on recipe insert", async () => {
  const mockClient = new MockSupabaseClient(null, { message: "Slug already exists" });
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });

  const res = await app.request("/recipes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "New Recipe" })
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to create recipe: Slug already exists");
});

Deno.test("POST /recipes - unexpected exception", async () => {
  const customClient = {
    from() {
      return {
        insert() {
          throw new Error("Crashed inserting recipe");
        }
      };
    }
  } as any;
  overrideClients(customClient, customClient);
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });

  const res = await app.request("/recipes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "New Recipe" })
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to create recipe: Crashed inserting recipe");
});

Deno.test("POST /recipes - different fields payload mapping", async () => {
  const mockRecipe = [{ id: "recipe-789", title: "Apple Pie", slug: "custom-pie", cube_tags: ["sweet"], dietary_tags: ["vegan"] }];
  const mockClient = new MockSupabaseClient(mockRecipe);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });

  const res = await app.request("/recipes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Apple Pie",
      slug: "custom-pie",
      prep_time_minutes: 10,
      cook_time_minutes: 30,
      difficulty: 2,
      servings: 6,
      cube_tags: ["sweet"],
      dietary_tags: ["vegan"]
    })
  });
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals(body.slug, "custom-pie");
  assertEquals(body.prep_time_seconds, 600);
  assertEquals(body.cook_time_seconds, 1800);
  assertEquals(body.difficulty_level, "medium");
  assertEquals(body.servings, 6);
});

// PUT /recipes/:id
Deno.test("PUT /recipes/:id - empty body error", async () => {
  const res = await app.request("/recipes/recipe-123", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "No update fields provided.");
});

Deno.test("PUT /recipes/:id - success path updating recipe fields only", async () => {
  const mockRecipe = [{ id: "recipe-123", title: "Updated Pie", author_id: "editor-123" }];
  const customClient = {
    from(table: string) {
      if (table === "recipes") {
        return {
          update(fields: any) { return this; },
          eq(col: string, val: any) { return this; },
          select() {
            return Promise.resolve({ data: mockRecipe, error: null });
          }
        };
      }
      if (table === "recipe_metrics") {
        return {
          select() { return this; },
          eq(col: string, val: any) {
            return Promise.resolve({ data: [{ prep_time_seconds: 120, servings: 4 }], error: null });
          }
        };
      }
      return {};
    }
  } as any;

  overrideClients(customClient, customClient);

  const res = await app.request("/recipes/recipe-123", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Updated Pie" })
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.title, "Updated Pie");
  assertEquals(body.servings, 4);
});

Deno.test("PUT /recipes/:id - success path updating metrics fields only", async () => {
  const mockRecipe = [{ id: "recipe-123", title: "Original Pie", author_id: "editor-123" }];
  const customClient = {
    from(table: string) {
      if (table === "recipes") {
        return {
          select() { return this; },
          eq(col: string, val: any) {
            return Promise.resolve({ data: mockRecipe, error: null });
          }
        };
      }
      if (table === "recipe_metrics") {
        return {
          update(fields: any) { return this; },
          select() { return this; },
          eq(col: string, val: any) {
            return Promise.resolve({ data: [{ prep_time_seconds: 300, cook_time_seconds: 600, servings: 5, difficulty_level: "hard" }], error: null });
          }
        };
      }
      return {};
    }
  } as any;

  overrideClients(customClient, customClient);

  const res = await app.request("/recipes/recipe-123", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prep_time_seconds: 300,
      cook_time_seconds: 600,
      servings_default: 5,
      difficulty: 3
    })
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.title, "Original Pie");
  assertEquals(body.servings, 5);
  assertEquals(body.prep_time_seconds, 300);
  assertEquals(body.cook_time_seconds, 600);
  assertEquals(body.difficulty_level, "hard");
});

Deno.test("PUT /recipes/:id - recipe not found on update recipes table", async () => {
  const mockClient = new MockSupabaseClient([]);
  overrideClients(mockClient, mockClient);

  const res = await app.request("/recipes/recipe-missing", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Updated Title" })
  });
  assertEquals(res.status, 404);
  const body = await res.json();
  assertEquals(body.detail, "Recipe not found or update failed.");
});

Deno.test("PUT /recipes/:id - recipe not found on select table", async () => {
  const mockClient = new MockSupabaseClient([]);
  overrideClients(mockClient, mockClient);

  const res = await app.request("/recipes/recipe-missing", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ servings: 10 })
  });
  assertEquals(res.status, 404);
  const body = await res.json();
  assertEquals(body.detail, "Recipe not found.");
});

Deno.test("PUT /recipes/:id - unexpected exception", async () => {
  const customClient = {
    from() {
      throw new Error("Fatal update exception");
    }
  } as any;
  overrideClients(customClient, customClient);

  const res = await app.request("/recipes/recipe-123", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "New Title" })
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to update recipe: Fatal update exception");
});

// DELETE /recipes/:id
Deno.test("DELETE /recipes/:id - forbidden for regular user", async () => {
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/recipes/recipe-123", {
    method: "DELETE"
  });
  assertEquals(res.status, 403);
});

Deno.test("DELETE /recipes/:id - success for cms_editor", async () => {
  const mockClient = new MockSupabaseClient([]);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });

  const res = await app.request("/recipes/recipe-123", {
    method: "DELETE"
  });
  assertEquals(res.status, 204);
});

Deno.test("DELETE /recipes/:id - database error", async () => {
  const mockClient = new MockSupabaseClient(null, { message: "Row is locked" });
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });

  const res = await app.request("/recipes/recipe-123", {
    method: "DELETE"
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to delete recipe: Row is locked");
});

Deno.test("DELETE /recipes/:id - unexpected exception", async () => {
  const customClient = {
    from() {
      return {
        delete() {
          throw new Error("Deletion failed crash");
        }
      };
    }
  } as any;
  overrideClients(customClient, customClient);
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });

  const res = await app.request("/recipes/recipe-123", {
    method: "DELETE"
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to delete recipe: Deletion failed crash");
});

Deno.test("GET /recipes - list recipes with hard difficulty", async () => {
  const mockRecipes = [{
    id: "recipe-hard",
    title: "Hard Soufflé",
    metrics: { servings: 2, difficulty_level: "hard" }
  }];
  const mockClient = new MockSupabaseClient(mockRecipes);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/recipes");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.length, 1);
  assertEquals(body[0].difficulty, 3);
  assertEquals(body[0].difficulty_level, "hard");
});

Deno.test("GET /recipes/:id - fetch recipe with hard difficulty", async () => {
  const mockRecipe = [{
    id: "recipe-hard",
    title: "Hard Soufflé",
    metrics: { servings: 2, difficulty_level: "hard" }
  }];
  const mockClient = new MockSupabaseClient(mockRecipe);
  overrideClients(mockClient, mockClient);

  const res = await app.request("/recipes/recipe-hard");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.difficulty, 3);
  assertEquals(body.difficulty_level, "hard");
});

Deno.test("POST /recipes - allowed for cms_editor with difficulty 1", async () => {
  const mockRecipe = [{ id: "recipe-456", title: "Easy Eggs" }];
  const mockClient = new MockSupabaseClient(mockRecipe);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });

  const res = await app.request("/recipes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Easy Eggs", difficulty: 1 })
  });
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals(body.difficulty_level, "easy");
});

Deno.test("POST /recipes - allowed for cms_editor with difficulty_level default fallback", async () => {
  const mockRecipe = [{ id: "recipe-456", title: "Fallback Eggs" }];
  const mockClient = new MockSupabaseClient(mockRecipe);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });

  const res = await app.request("/recipes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Fallback Eggs" })
  });
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals(body.difficulty_level, "easy");
});

Deno.test("PUT /recipes/:id - success path updating difficulty to 1 (easy)", async () => {
  const mockRecipe = [{ id: "recipe-123", title: "Original Pie", author_id: "editor-123" }];
  const customClient = {
    from(table: string) {
      if (table === "recipes") {
        return {
          select() { return this; },
          eq(col: string, val: any) {
            return Promise.resolve({ data: mockRecipe, error: null });
          }
        };
      }
      if (table === "recipe_metrics") {
        return {
          update(fields: any) { return this; },
          select() { return this; },
          eq(col: string, val: any) {
            return Promise.resolve({ data: [{ servings: 5, difficulty_level: "easy" }], error: null });
          }
        };
      }
      return {};
    }
  } as any;

  overrideClients(customClient, customClient);

  const res = await app.request("/recipes/recipe-123", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      difficulty: 1
    })
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.difficulty_level, "easy");
});

Deno.test("PUT /recipes/:id - success path updating difficulty to 2 (medium)", async () => {
  const mockRecipe = [{ id: "recipe-123", title: "Original Pie", author_id: "editor-123" }];
  const customClient = {
    from(table: string) {
      if (table === "recipes") {
        return {
          select() { return this; },
          eq(col: string, val: any) {
            return Promise.resolve({ data: mockRecipe, error: null });
          }
        };
      }
      if (table === "recipe_metrics") {
        return {
          update(fields: any) { return this; },
          select() { return this; },
          eq(col: string, val: any) {
            return Promise.resolve({ data: [{ servings: 5, difficulty_level: "medium" }], error: null });
          }
        };
      }
      return {};
    }
  } as any;

  overrideClients(customClient, customClient);

  const res = await app.request("/recipes/recipe-123", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      difficulty: 2
    })
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.difficulty_level, "medium");
});

