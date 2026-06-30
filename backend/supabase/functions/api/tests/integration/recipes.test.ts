import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { app } from "../../index.ts";
import { clearMocks, getAuthHeaderForUser, CHEF_USER_ID, COOK_USER_ID, CHILI_RECIPE_ID } from "./setup.ts";

Deno.test("Integration: GET /recipes lists seeded recipes", async () => {
  await clearMocks();

  const res = await app.request("/recipes");
  assertEquals(res.status, 200);
  const body = await res.json();
  console.log("RECIPES BODY:", JSON.stringify(body, null, 2));
  // Ensure both seeded recipes are present
  assertNotEquals(body.length, 0);
  const chili = body.find((r: any) => r.id === CHILI_RECIPE_ID);
  assertNotEquals(chili, undefined);
  assertEquals(chili.title, "Vegan Spicy Chili");
});

Deno.test("Integration: GET /recipes/:id details fetch", async () => {
  await clearMocks();

  const res = await app.request(`/recipes/${CHILI_RECIPE_ID}`);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.title, "Vegan Spicy Chili");
  assertEquals(body.servings, 4); // default servings from recipe_metrics
});

Deno.test("Integration: GET /api/v1/features/recipes/:id/adjust-servings calculates serving adjustments on seeded ingredients", async () => {
  await clearMocks();
  const authHeader = await getAuthHeaderForUser(COOK_USER_ID, "authenticated", "cook@test.com");

  const res = await app.request(`/api/v1/features/recipes/${CHILI_RECIPE_ID}/adjust-servings?target_servings=8`, {
    method: "GET",
    headers: {
      "Authorization": authHeader
    }
  });

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.target_servings, 8);
  
  // Chili has default 4 servings. Target is 8, so scaling factor is 2.0.
  // Kidney Beans default is 2.0 cups -> scaled should be 4.0.
  // Diced Tomatoes default is 1.5 cups -> scaled should be 3.0.
  const beans = body.ingredients.find((ing: any) => ing.name === "Red Kidney Beans");
  assertNotEquals(beans, undefined);
  assertEquals(beans.scaled_quantity, 4);

  const tomatoes = body.ingredients.find((ing: any) => ing.name === "Diced Tomatoes");
  assertNotEquals(tomatoes, undefined);
  assertEquals(tomatoes.scaled_quantity, 3);
});

Deno.test("Integration: POST /recipes role checks", async () => {
  await clearMocks();

  // 1. Authenticated regular user (cook) should get 403 Forbidden
  const cookAuthHeader = await getAuthHeaderForUser(COOK_USER_ID, "authenticated", "cook@test.com");
  const res1 = await app.request("/recipes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": cookAuthHeader
    },
    body: JSON.stringify({
      title: "Illegal Recipe Entry",
      description: "Should fail"
    })
  });
  assertEquals(res1.status, 403);

  // 2. CMS Editor user (chef) should get 201 Created and successfully save both recipe and metrics
  const chefAuthHeader = await getAuthHeaderForUser(CHEF_USER_ID, "cms_editor", "chef@test.com");
  const uniqueSlug = `integration-slug-${Date.now()}`;
  const res2 = await app.request("/recipes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": chefAuthHeader
    },
    body: JSON.stringify({
      title: "Integration Test Soup",
      slug: uniqueSlug,
      description: "A wonderful testing soup",
      servings: 6,
      difficulty: 1 // easy
    })
  });

  assertEquals(res2.status, 201);
  const body2 = await res2.json();
  assertNotEquals(body2.id, undefined);
  assertEquals(body2.title, "Integration Test Soup");
  assertEquals(body2.servings, 6);
  assertEquals(body2.difficulty_level, "easy");
});
