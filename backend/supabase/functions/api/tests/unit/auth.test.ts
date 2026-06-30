import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { app } from "../../index.ts";
import { overrideClients, overrideAuth } from "../../deps.ts";
import { MockSupabaseClient } from "./client_mock.ts";

Deno.test("POST /auth/signup - success path", async () => {
  try {
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
        username: "chef123",
        full_name: "John Doe"
      })
    });

    assertEquals(res.status, 201);
    const body = await res.json();
    assertEquals(body.user.id, "user-123");
    assertEquals(body.user.full_name, "John Doe");
    assertEquals(body.session.access_token, "jwt-token");
  } finally {
    overrideClients(null, null);
    overrideAuth(null, null);
  }
});

Deno.test("POST /auth/signup - single word name, missing session fallback", async () => {
  try {
    const mockUser = { id: "user-456", email: "user456@example.com" };
    const mockClient = new MockSupabaseClient(null, null, null, mockUser, null);
    overrideClients(mockClient, mockClient);

    const res = await app.request("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "user456@example.com",
        username: "chef456",
        full_name: "Madonna"
      })
    });

    assertEquals(res.status, 201);
    const body = await res.json();
    assertEquals(body.user.id, "user-456");
    assertEquals(body.user.full_name, "Madonna");
    assertEquals(body.session.access_token, "mock_access_token");
  } finally {
    overrideClients(null, null);
    overrideAuth(null, null);
  }
});

Deno.test("POST /auth/signup - no user in response", async () => {
  try {
    const mockClient = new MockSupabaseClient(null, null, null, null, null);
    overrideClients(mockClient, mockClient);

    const res = await app.request("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "nouser@example.com",
        username: "nouser"
      })
    });

    assertEquals(res.status, 201);
    const body = await res.json();
    assertEquals(body.user.id, undefined);
  } finally {
    overrideClients(null, null);
    overrideAuth(null, null);
  }
});

Deno.test("POST /auth/signup - db error caught gracefully", async () => {
  try {
    const mockUser = { id: "user-789", email: "user789@example.com" };
    const mockClient = new class extends MockSupabaseClient {
      override from(table: string): any {
        throw new Error("Upsert forbidden or database down");
      }
    }(null, null, null, mockUser, null);
    overrideClients(mockClient, mockClient);

    const res = await app.request("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "user789@example.com",
        password: "password123",
        username: "chef789"
      })
    });

    assertEquals(res.status, 201);
    const body = await res.json();
    assertEquals(body.user.id, "user-789");
  } finally {
    overrideClients(null, null);
    overrideAuth(null, null);
  }
});

Deno.test("POST /auth/signup - signUp auth error", async () => {
  try {
    const mockClient = new MockSupabaseClient(null, null, null, null, { message: "Email rate limit exceeded" });
    overrideClients(mockClient, mockClient);

    const res = await app.request("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "fail@example.com",
        password: "password123"
      })
    });

    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.detail, "Email rate limit exceeded");
  } finally {
    overrideClients(null, null);
    overrideAuth(null, null);
  }
});

Deno.test("POST /auth/login - success path", async () => {
  try {
    const mockUser = { id: "user-123", email: "user123@example.com" };
    const mockSession = { access_token: "jwt-token", refresh_token: "refresh", expires_in: 3600, token_type: "bearer" };
    const mockClient = new MockSupabaseClient({ first_name: "Chef", last_name: "Sauce" }, null, mockSession, mockUser, null);
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
    assertEquals(body.user.username, "Chef");
    assertEquals(body.user.full_name, "Chef Sauce");
    assertEquals(body.session.access_token, "jwt-token");
  } finally {
    overrideClients(null, null);
    overrideAuth(null, null);
  }
});

Deno.test("POST /auth/login - signInWithPassword auth error", async () => {
  try {
    const mockClient = new MockSupabaseClient(null, null, null, null, { message: "Invalid login credentials" });
    overrideClients(mockClient, mockClient);

    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "badlogin@example.com",
        password: "wrongpassword"
      })
    });

    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.detail, "Invalid login credentials");
  } finally {
    overrideClients(null, null);
    overrideAuth(null, null);
  }
});

Deno.test("GET /auth/user - success path", async () => {
  try {
    overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

    const mockProfile = [{
      id: "profile-123",
      user_id: "user-123",
      first_name: "Freya",
      last_name: "Saucy",
      bio: "Hono tester extraordinaire",
      avatar_path: "avatars/freya.png"
    }];
    const mockClient = new MockSupabaseClient(mockProfile, null);
    overrideClients(mockClient, mockClient);

    const res = await app.request("/auth/user", {
      method: "GET"
    });

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.id, "profile-123");
    assertEquals(body.full_name, "Freya Saucy");
    assertEquals(body.bio, "Hono tester extraordinaire");
    assertEquals(body.avatar_path, "avatars/freya.png");
  } finally {
    overrideClients(null, null);
    overrideAuth(null, null);
  }
});

Deno.test("GET /auth/user - database select error", async () => {
  try {
    overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

    const mockClient = new MockSupabaseClient(null, { message: "Database read failure" });
    overrideClients(mockClient, mockClient);

    const res = await app.request("/auth/user", {
      method: "GET"
    });

    assertEquals(res.status, 404);
    const body = await res.json();
    assertEquals(body.detail, "User profile not found");
  } finally {
    overrideClients(null, null);
    overrideAuth(null, null);
  }
});

Deno.test("GET /auth/user - profile not found / empty", async () => {
  try {
    overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

    const mockClient = new MockSupabaseClient([], null);
    overrideClients(mockClient, mockClient);

    const res = await app.request("/auth/user", {
      method: "GET"
    });

    assertEquals(res.status, 404);
    const body = await res.json();
    assertEquals(body.detail, "User profile not found");
  } finally {
    overrideClients(null, null);
    overrideAuth(null, null);
  }
});

Deno.test("POST /auth/signup - missing password, missing full_name", async () => {
  try {
    const mockUser = { id: "user-no-pass-no-name", email: "nopass@example.com" };
    const mockClient = new MockSupabaseClient(null, null, null, mockUser, null);
    overrideClients(mockClient, mockClient);

    const res = await app.request("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "nopass@example.com"
      })
    });

    assertEquals(res.status, 201);
    const body = await res.json();
    assertEquals(body.user.id, "user-no-pass-no-name");
    assertEquals(body.user.full_name, undefined);
  } finally {
    overrideClients(null, null);
    overrideAuth(null, null);
  }
});

Deno.test("POST /auth/login - missing password and profile fallback", async () => {
  try {
    const mockUser = { id: "user-login-fallback", email: "loginfallback@example.com" };
    const mockClient = new MockSupabaseClient(null, null, null, mockUser, null);
    overrideClients(mockClient, mockClient);

    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "loginfallback@example.com"
      })
    });

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.user.email, "loginfallback@example.com");
    assertEquals(body.user.username, undefined);
    assertEquals(body.user.full_name, "");
  } finally {
    overrideClients(null, null);
    overrideAuth(null, null);
  }
});

Deno.test("GET /auth/user - profile with missing first and last name", async () => {
  try {
    overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

    const mockProfile = [{
      id: "profile-123",
      user_id: "user-123",
      bio: "Hono tester extra",
      avatar_path: null
    }];
    const mockClient = new MockSupabaseClient(mockProfile, null);
    overrideClients(mockClient, mockClient);

    const res = await app.request("/auth/user", {
      method: "GET"
    });

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.full_name, "");
    assertEquals(body.avatar_path, null);
  } finally {
    overrideClients(null, null);
    overrideAuth(null, null);
  }
});
