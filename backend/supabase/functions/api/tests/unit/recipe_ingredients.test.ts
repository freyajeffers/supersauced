import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { app } from "../../index.ts";
import { overrideClients, overrideAuth } from "../../deps.ts";
import { MockSupabaseClient } from "./client_mock.ts";

// 1. GET /recipe_ingredients
Deno.test("GET /recipe_ingredients - success path", async () => {
  const mockIngredients = [{
    id: "ing-1",
    recipe_id: "recipe-123",
    ingredient_id: "i-1",
    unit_id: "u-1",
    quantity_decimal: 15.5,
    ingredient: { name: "Tomato" },
    unit: { abbreviation: "pcs" },
    preparation_state: "sliced"
  }];
  const mockClient = new MockSupabaseClient(mockIngredients);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/recipe_ingredients?limit=5&offset=0");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.length, 1);
  assertEquals(body[0].id, "ing-1");
  assertEquals(body[0].recipe_id, "recipe-123");
  assertEquals(body[0].ingredient_id, "i-1");
  assertEquals(body[0].unit_id, "u-1");
  assertEquals(body[0].quantity, 15.5);
  assertEquals(body[0].quantity_decimal, 15.5);
  assertEquals(body[0].name, "Tomato");
  assertEquals(body[0].unit, "pcs");
  assertEquals(body[0].notes, "sliced");
  assertEquals(body[0].preparation_state, "sliced");
});

Deno.test("GET /recipe_ingredients - database error", async () => {
  const mockClient = new MockSupabaseClient(null, { message: "Internal Database Error" });
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/recipe_ingredients");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to list ingredients: Internal Database Error");
});

Deno.test("GET /recipe_ingredients - unexpected exception", async () => {
  const customClient = {
    from() {
      return {
        select() { return this; },
        range() {
          throw new Error("Query exploded");
        }
      };
    }
  } as any;
  overrideClients(customClient, customClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/recipe_ingredients");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to list ingredients: Query exploded");
});

// 2. GET /recipe_ingredients/:id
Deno.test("GET /recipe_ingredients/:id - success path", async () => {
  const mockIngredient = [{
    id: "ing-1",
    recipe_id: "recipe-123",
    ingredient_id: "i-1",
    unit_id: "u-1",
    quantity_decimal: 5,
    ingredient: { name: "Salt" },
    unit: { abbreviation: "tsp" },
    preparation_state: "finely ground"
  }];
  const mockClient = new MockSupabaseClient(mockIngredient);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/recipe_ingredients/ing-1");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.id, "ing-1");
  assertEquals(body.name, "Salt");
  assertEquals(body.unit, "tsp");
  assertEquals(body.notes, "finely ground");
  assertEquals(body.quantity, 5);
});

Deno.test("GET /recipe_ingredients/:id - not found / access denied", async () => {
  const mockClient = new MockSupabaseClient([]);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/recipe_ingredients/ing-missing");
  assertEquals(res.status, 404);
  const body = await res.json();
  assertEquals(body.detail, "Ingredient not found or access denied.");
});

Deno.test("GET /recipe_ingredients/:id - database error", async () => {
  const mockClient = new MockSupabaseClient(null, { message: "Database timeout" });
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/recipe_ingredients/ing-1");
  assertEquals(res.status, 404);
  const body = await res.json();
  assertEquals(body.detail, "Ingredient not found or access denied.");
});

Deno.test("GET /recipe_ingredients/:id - unexpected exception", async () => {
  const customClient = {
    from() {
      return {
        select() { return this; },
        eq() {
          throw new Error("Connection broken");
        }
      };
    }
  } as any;
  overrideClients(customClient, customClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/recipe_ingredients/ing-1");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to fetch ingredient: Connection broken");
});

// 3. POST /recipe_ingredients
Deno.test("POST /recipe_ingredients - forbidden for regular user", async () => {
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/recipe_ingredients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipe_id: "recipe-123" })
  });
  assertEquals(res.status, 403);
  const body = await res.json();
  assertEquals(body.detail, "Forbidden: Requires cms_editor role.");
});

Deno.test("POST /recipe_ingredients - success path for cms_editor", async () => {
  const mockIngredient = [{
    id: "ing-new",
    recipe_id: "recipe-123",
    ingredient_id: "i-2",
    unit_id: "u-2",
    quantity_decimal: 1.5,
    preparation_state: "chopped"
  }];
  const mockClient = new MockSupabaseClient(mockIngredient);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });

  const res = await app.request("/recipe_ingredients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipe_id: "recipe-123",
      ingredient_id: "i-2",
      unit_id: "u-2",
      quantity: 1.5,
      notes: "chopped"
    })
  });
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals(body.id, "ing-new");
  assertEquals(body.quantity, 1.5);
  assertEquals(body.notes, "chopped");
});

Deno.test("POST /recipe_ingredients - database error", async () => {
  const mockClient = new MockSupabaseClient(null, { message: "Duplicate record" });
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });

  const res = await app.request("/recipe_ingredients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipe_id: "recipe-123" })
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to create ingredient: Duplicate record");
});

Deno.test("POST /recipe_ingredients - unexpected exception", async () => {
  const customClient = {
    from() {
      return {
        insert() {
          throw new Error("Insertion failed catastrophically");
        }
      };
    }
  } as any;
  overrideClients(customClient, customClient);
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });

  const res = await app.request("/recipe_ingredients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipe_id: "recipe-123" })
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to create ingredient: Insertion failed catastrophically");
});

// 4. PUT /recipe_ingredients/:id
Deno.test("PUT /recipe_ingredients/:id - forbidden for regular user", async () => {
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/recipe_ingredients/ing-1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quantity: 10 })
  });
  assertEquals(res.status, 403);
});

Deno.test("PUT /recipe_ingredients/:id - empty body error", async () => {
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });

  const res = await app.request("/recipe_ingredients/ing-1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "No update fields provided.");
});

Deno.test("PUT /recipe_ingredients/:id - success path for cms_editor", async () => {
  const mockIngredient = [{
    id: "ing-1",
    recipe_id: "recipe-789",
    ingredient_id: "i-3",
    unit_id: "u-3",
    quantity_decimal: 2.2,
    preparation_state: "melted"
  }];
  const mockClient = new MockSupabaseClient(mockIngredient);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });

  const res = await app.request("/recipe_ingredients/ing-1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipe_id: "recipe-789",
      ingredient_id: "i-3",
      unit_id: "u-3",
      quantity_decimal: 2.2,
      preparation_state: "melted"
    })
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.recipe_id, "recipe-789");
  assertEquals(body.ingredient_id, "i-3");
  assertEquals(body.unit_id, "u-3");
  assertEquals(body.quantity_decimal, 2.2);
  assertEquals(body.preparation_state, "melted");
});

Deno.test("PUT /recipe_ingredients/:id - not found / update failed", async () => {
  const mockClient = new MockSupabaseClient([]);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });

  const res = await app.request("/recipe_ingredients/ing-missing", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quantity: 12 })
  });
  assertEquals(res.status, 404);
  const body = await res.json();
  assertEquals(body.detail, "Ingredient not found or update failed.");
});

Deno.test("PUT /recipe_ingredients/:id - unexpected exception", async () => {
  const customClient = {
    from() {
      return {
        update() {
          throw new Error("Update failure");
        }
      };
    }
  } as any;
  overrideClients(customClient, customClient);
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });

  const res = await app.request("/recipe_ingredients/ing-1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quantity: 15 })
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to update ingredient: Update failure");
});

// 5. DELETE /recipe_ingredients/:id
Deno.test("DELETE /recipe_ingredients/:id - forbidden for non-authenticated role", async () => {
  overrideAuth(null, null); // Anonymous user role defaults to non-authenticated (or non-cms_editor)
  // Let's set sub to empty and role to anon to make sure it's forbidden
  overrideAuth({ sub: "anon-123" }, { id: "anon-123", email: "anon@example.com", role: "anon" });

  const res = await app.request("/recipe_ingredients/ing-1", {
    method: "DELETE"
  });
  assertEquals(res.status, 403);
});

Deno.test("DELETE /recipe_ingredients/:id - success path for authenticated user", async () => {
  const mockClient = new MockSupabaseClient([]);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/recipe_ingredients/ing-1", {
    method: "DELETE"
  });
  assertEquals(res.status, 204);
});

Deno.test("DELETE /recipe_ingredients/:id - database error", async () => {
  const mockClient = new MockSupabaseClient(null, { message: "ForeignKey error" });
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/recipe_ingredients/ing-1", {
    method: "DELETE"
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to delete ingredient: ForeignKey error");
});

Deno.test("DELETE /recipe_ingredients/:id - unexpected exception", async () => {
  const customClient = {
    from() {
      return {
        delete() {
          throw new Error("Deletion crashed");
        }
      };
    }
  } as any;
  overrideClients(customClient, customClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/recipe_ingredients/ing-1", {
    method: "DELETE"
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to delete ingredient: Deletion crashed");
});

Deno.test("GET /recipe_ingredients - items with null values and missing relations", async () => {
  const mockIngredients = [{
    id: "ing-nulls",
    recipe_id: "recipe-123",
    ingredient_id: "i-1",
    unit_id: "u-1",
    quantity_decimal: null,
    ingredient: null,
    unit: null,
    preparation_state: null
  }];
  const mockClient = new MockSupabaseClient(mockIngredients);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/recipe_ingredients");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.length, 1);
  assertEquals(body[0].quantity, null);
  assertEquals(body[0].name, "");
  assertEquals(body[0].unit, "");
  assertEquals(body[0].notes, null);
});

Deno.test("GET /recipe_ingredients/:id - item with null values and missing relations", async () => {
  const mockIngredients = [{
    id: "ing-nulls",
    recipe_id: "recipe-123",
    ingredient_id: "i-1",
    unit_id: "u-1",
    quantity_decimal: null,
    ingredient: null,
    unit: null,
    preparation_state: null
  }];
  const mockClient = new MockSupabaseClient(mockIngredients);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/recipe_ingredients/ing-nulls");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.quantity, null);
  assertEquals(body.name, "");
  assertEquals(body.unit, "");
  assertEquals(body.notes, null);
});

Deno.test("POST /recipe_ingredients - empty / missing fields payload", async () => {
  const mockIngredient = [{
    id: "ing-new",
    recipe_id: "recipe-123",
    ingredient_id: "i-2",
    unit_id: "u-2",
    quantity_decimal: null,
    preparation_state: null
  }];
  const mockClient = new MockSupabaseClient(mockIngredient);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });

  const res = await app.request("/recipe_ingredients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipe_id: "recipe-123",
      ingredient_id: "i-2",
      unit_id: "u-2"
      // Missing quantity, notes, etc.
    })
  });
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals(body.id, "ing-new");
  assertEquals(body.quantity, null);
  assertEquals(body.notes, null);
});
