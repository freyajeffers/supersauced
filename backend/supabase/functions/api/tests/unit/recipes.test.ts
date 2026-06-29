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
