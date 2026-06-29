import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { app } from "../../index.ts";
import { clearMocks, getAuthHeaderForUser, CHEF_USER_ID, COOK_USER_ID } from "./setup.ts";

Deno.test("Integration: GET /user_profiles lists user's own profile only under RLS", async () => {
  clearMocks();

  const authHeader = await getAuthHeaderForUser(COOK_USER_ID, "authenticated", "cook@test.com");

  const res = await app.request("/user_profiles", {
    method: "GET",
    headers: {
      "Authorization": authHeader
    }
  });

  assertEquals(res.status, 200);
  const body = await res.json();
  // RLS filters out profiles other than the logged-in user, so length should be 1
  assertEquals(body.length, 1);
  assertEquals(body[0].user_id, COOK_USER_ID);
});

Deno.test("Integration: GET /user_profiles/:id - success on own profile", async () => {
  clearMocks();

  const authHeader = await getAuthHeaderForUser(COOK_USER_ID, "authenticated", "cook@test.com");

  const res = await app.request(`/user_profiles/${COOK_USER_ID}`, {
    method: "GET",
    headers: {
      "Authorization": authHeader
    }
  });

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.user_id, COOK_USER_ID);
});

Deno.test("Integration: GET /user_profiles/:id - 404 (access denied) on other user's profile due to RLS", async () => {
  clearMocks();

  const authHeader = await getAuthHeaderForUser(COOK_USER_ID, "authenticated", "cook@test.com");

  const res = await app.request(`/user_profiles/${CHEF_USER_ID}`, {
    method: "GET",
    headers: {
      "Authorization": authHeader
    }
  });

  // PostGREST returns empty results under RLS select restrictions, which maps to a 404 Not Found
  assertEquals(res.status, 404);
});

Deno.test("Integration: PUT /user_profiles/:id - success on own profile", async () => {
  clearMocks();

  const authHeader = await getAuthHeaderForUser(COOK_USER_ID, "authenticated", "cook@test.com");

  const res = await app.request(`/user_profiles/${COOK_USER_ID}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Authorization": authHeader
    },
    body: JSON.stringify({
      bio: "Updated bio for cook user"
    })
  });

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.bio, "Updated bio for cook user");
});

Deno.test("Integration: PUT /user_profiles/:id - 403 Forbidden on other user's profile", async () => {
  clearMocks();

  const authHeader = await getAuthHeaderForUser(COOK_USER_ID, "authenticated", "cook@test.com");

  const res = await app.request(`/user_profiles/${CHEF_USER_ID}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Authorization": authHeader
    },
    body: JSON.stringify({
      bio: "Malicious update attempt"
    })
  });

  assertEquals(res.status, 403);
});
