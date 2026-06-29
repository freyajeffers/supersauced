import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { app } from "../../index.ts";
import { clearMocks, getAuthHeaderForUser, COOK_USER_ID } from "./setup.ts";

Deno.test("Integration: POST /auth/signup & /auth/login workflow", async () => {
  clearMocks();
  
  const testEmail = `integration-test-${Date.now()}@example.com`;
  const testPassword = "SecurePassword123!";
  const testUsername = `user-${Date.now()}`;

  // 1. SIGNUP
  const signupRes = await app.request("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
      username: testUsername,
      full_name: "Integration Test User"
    })
  });

  assertEquals(signupRes.status, 201);
  const signupBody = await signupRes.json();
  assertNotEquals(signupBody.user.id, undefined);
  assertEquals(signupBody.user.email, testEmail);

  // 2. LOGIN
  const loginRes = await app.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword
    })
  });

  assertEquals(loginRes.status, 200);
  const loginBody = await loginRes.json();
  assertNotEquals(loginBody.session.access_token, undefined);
  assertEquals(loginBody.user.email, testEmail);
});

Deno.test("Integration: GET /auth/user profile fetch", async () => {
  clearMocks();

  const authHeader = await getAuthHeaderForUser(COOK_USER_ID, "authenticated", "cook@test.com");

  const res = await app.request("/auth/user", {
    method: "GET",
    headers: {
      "Authorization": authHeader
    }
  });

  if (res.status !== 200) {
    console.log("GET /auth/user failed with status:", res.status, "body:", await res.text());
  }
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.user_id, COOK_USER_ID);
  assertEquals(body.first_name, "Casual");
  assertEquals(body.last_name, "Cook");
});
