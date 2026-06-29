import { getServiceClient } from "../../deps.ts";
import { CHILI_RECIPE_ID, PASTA_RECIPE_ID, COOK_USER_ID, CHEF_USER_ID } from "./setup.ts";

export async function seedDatabase() {
  const client = getServiceClient();

  // ---- Auth users (seed) ----
  try {
    const r1 = await client.rpc("create_test_user", { p_id: COOK_USER_ID, p_email: "cook@test.com" });
    if (r1.error) console.error("Error creating cook test user:", r1.error);
    const r2 = await client.rpc("create_test_user", { p_id: CHEF_USER_ID, p_email: "chef@test.com" });
    if (r2.error) console.error("Error creating chef test user:", r2.error);
  } catch (err) {
    console.error("Failed to seed auth users:", err);
  }

  // ---- User profiles ----
  try {
    const p1 = await client.from("user_profiles").upsert(
      {
        user_id: COOK_USER_ID,
        first_name: "Casual",
        last_name: "Cook",
        bio: "",
        email: "cook@test.com",
      },
      { onConflict: "user_id" }
    );
    if (p1.error) console.error("Error seeding cook profile:", p1.error);

    const p2 = await client.from("user_profiles").upsert(
      {
        user_id: CHEF_USER_ID,
        first_name: "Chef",
        last_name: "Master",
        bio: "",
        email: "chef@test.com",
      },
      { onConflict: "user_id" }
    );
    if (p2.error) console.error("Error seeding chef profile:", p2.error);
  } catch (err) {
    console.error("Failed to seed user profiles:", err);
  }

  // ---- User settings ----
  try {
    await client.from("user_settings").upsert(
      {
        user_id: COOK_USER_ID,
        measurement_system: "metric",
        push_notifications: false,
        newsletter: false,
      },
      { onConflict: "user_id" }
    );
    await client.from("user_settings").upsert(
      {
        user_id: CHEF_USER_ID,
        measurement_system: "metric",
        push_notifications: false,
        newsletter: false,
      },
      { onConflict: "user_id" }
    );
  } catch (_) {}

  // ---- Units ----
  let cupUnitId: string | undefined;
  let unitUnitId: string | undefined;
  try {
    const { data: existingUnits } = await client.from("units").select("id, name").in("name", ["cup", "unit"]);
    const existingMap = new Map((existingUnits || []).map((u: any) => [u.name, u.id]));

    if (!existingMap.has("cup") || !existingMap.has("unit")) {
      const toInsert = [];
      if (!existingMap.has("cup")) toInsert.push({ name: "cup", abbreviation: "c" });
      if (!existingMap.has("unit")) toInsert.push({ name: "unit", abbreviation: "u" });

      const { data: inserted } = await client.from("units").insert(toInsert).select();
      if (inserted) {
        for (const u of inserted as any[]) {
          existingMap.set(u.name, u.id);
        }
      }
    }
    cupUnitId = existingMap.get("cup");
    unitUnitId = existingMap.get("unit");
  } catch (err) {
    console.error("Failed to seed units:", err);
  }

  // ---- Ingredients ----
  let beansId: string | undefined;
  let tomatoesId: string | undefined;
  try {
    const { data: existingIngs } = await client.from("ingredients").select("id, name").in("name", ["Red Kidney Beans", "Diced Tomatoes"]);
    const existingMap = new Map((existingIngs || []).map((i: any) => [i.name, i.id]));

    if (!existingMap.has("Red Kidney Beans") || !existingMap.has("Diced Tomatoes")) {
      const toInsert = [];
      if (!existingMap.has("Red Kidney Beans")) {
        toInsert.push({ name: "Red Kidney Beans", default_unit_id: cupUnitId });
      }
      if (!existingMap.has("Diced Tomatoes")) {
        toInsert.push({ name: "Diced Tomatoes", default_unit_id: cupUnitId });
      }

      const { data: inserted } = await client.from("ingredients").insert(toInsert).select();
      if (inserted) {
        for (const i of inserted as any[]) {
          existingMap.set(i.name, i.id);
        }
      }
    }
    beansId = existingMap.get("Red Kidney Beans");
    tomatoesId = existingMap.get("Diced Tomatoes");
  } catch (err) {
    console.error("Failed to seed ingredients:", err);
  }

  // ---- Recipes & metrics ----
  try {
    await client.from("recipes").upsert(
      [
        {
          id: CHILI_RECIPE_ID,
          author_id: COOK_USER_ID,
          title: "Vegan Spicy Chili",
          slug: "vegan-spicy-chili",
          description: "A hearty vegan chili.",
          status: "published",
          published_at: new Date().toISOString(),
        },
        {
          id: PASTA_RECIPE_ID,
          author_id: COOK_USER_ID,
          title: "Pasta Primavera",
          slug: "pasta-primavera",
          description: "Fresh pasta with veggies.",
          status: "published",
          published_at: new Date().toISOString(),
        },
      ],
      { onConflict: "id" }
    );
    await client.from("recipe_metrics").upsert(
      [
        { recipe_id: CHILI_RECIPE_ID, servings: 4, difficulty_level: "medium" },
        { recipe_id: PASTA_RECIPE_ID, servings: 2, difficulty_level: "easy" },
      ],
      { onConflict: "recipe_id" }
    );
  } catch (_) {}

  // ---- Recipe ingredients for scaling test ----
  try {
    // Delete existing recipe ingredients for this recipe to prevent duplicates
    await client.from("recipe_ingredients").delete().eq("recipe_id", CHILI_RECIPE_ID);

    await client.from("recipe_ingredients").insert(
      [
        {
          recipe_id: CHILI_RECIPE_ID,
          ingredient_id: beansId,
          unit_id: cupUnitId,
          quantity_decimal: 2.0,
        },
        {
          recipe_id: CHILI_RECIPE_ID,
          ingredient_id: tomatoesId,
          unit_id: cupUnitId,
          quantity_decimal: 1.5,
        },
      ]
    );
  } catch (err) {
    console.error("Failed to seed recipe ingredients:", err);
  }
}
