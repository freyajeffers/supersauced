import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { app } from "../../index.ts";
import { overrideClients } from "../../deps.ts";
import { MockSupabaseClient } from "./client_mock.ts";

Deno.test("POST /auth/signup - success path", async () => {
  const mockUser = { id: "user-123", email: "user123@example.com", user_metadata: { username: "chef123" } };
  const mockSession = { access_token: "jwt-token", refresh_token: "refresh", expires_in: 3600, token_type: "bearer" };
  const mockClient = new MockSupabaseClient(null, null, mockSession, mockUser, null);
  overrideClients(mockClient, mockClient);

  const res = await app.request("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "user123@example.com",
      password: "password123",
      username: "chef123"
    })
  });

  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals(body.user.id, "user-123");
  assertEquals(body.session.access_token, "jwt-token");
});

Deno.test("POST /auth/login - success path", async () => {
  const mockUser = { id: "user-123", email: "user123@example.com", user_metadata: { username: "chef123" } };
  const mockSession = { access_token: "jwt-token", refresh_token: "refresh", expires_in: 3600, token_type: "bearer" };
  const mockClient = new MockSupabaseClient(null, null, mockSession, mockUser, null);
  overrideClients(mockClient, mockClient);

  const res = await app.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "user123@example.com",
      password: "password123"
    })
  });

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.user.email, "user123@example.com");
  assertEquals(body.session.access_token, "jwt-token");
});
