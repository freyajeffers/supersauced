import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { app } from "../../index.ts";
import { overrideClients, overrideAuth } from "../../deps.ts";
import { MockSupabaseClient } from "./client_mock.ts";

Deno.test("GET /user_profiles - list user profiles", async () => {
  const mockProfiles = [{
    user_id: "user-123",
    first_name: "Sauce",
    last_name: "Chef",
    bio: "Head development chef for Super Sauced.",
    avatar_path: null
  }];
  
  const mockClient = new MockSupabaseClient(mockProfiles);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/user_profiles");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.length, 1);
  assertEquals(body[0].first_name, "Sauce");
  assertEquals(body[0].full_name, "Sauce Chef");
});

Deno.test("GET /user_profiles/:id - get profile success", async () => {
  const mockProfiles = [{
    user_id: "user-123",
    first_name: "Sauce",
    last_name: "Chef"
  }];
  
  const mockClient = new MockSupabaseClient(mockProfiles);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/user_profiles/user-123");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.first_name, "Sauce");
  assertEquals(body.full_name, "Sauce Chef");
});

Deno.test("PUT /user_profiles/:id - update profile success", async () => {
  const mockProfiles = [{
    user_id: "user-123",
    first_name: "new_name",
    last_name: "Chef"
  }];
  
  const mockClient = new MockSupabaseClient(mockProfiles);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/user_profiles/user-123", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ first_name: "new_name" })
  });

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.first_name, "new_name");
});

Deno.test("PUT /user_profiles/:id - update profile forbidden", async () => {
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/user_profiles/other-user", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ first_name: "hack_username" })
  });

  assertEquals(res.status, 403);
});

// GET /user_profiles
Deno.test("GET /user_profiles - database query error", async () => {
  const mockClient = new MockSupabaseClient(null, { message: "Permission denied on user_profiles" });
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/user_profiles");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to query profiles: Permission denied on user_profiles");
});

Deno.test("GET /user_profiles - unexpected exception", async () => {
  const customClient = {
    from() {
      throw new Error("Connection failed unexpectedly");
    }
  } as any;
  overrideClients(customClient, customClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/user_profiles");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to query profiles: Connection failed unexpectedly");
});

// GET /user_profiles/:id
Deno.test("GET /user_profiles/:id - access denied to other user id", async () => {
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/user_profiles/user-456");
  assertEquals(res.status, 404);
  const body = await res.json();
  assertEquals(body.detail, "Profile not found or access denied.");
});

Deno.test("GET /user_profiles/:id - database select error or profile not found", async () => {
  // Empty data returned
  let mockClient = new MockSupabaseClient([]);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  let res = await app.request("/user_profiles/user-123");
  assertEquals(res.status, 404);
  let body = await res.json();
  assertEquals(body.detail, "Profile not found or access denied.");

  // Error object returned
  mockClient = new MockSupabaseClient(null, { message: "Internal select error" });
  overrideClients(mockClient, mockClient);
  res = await app.request("/user_profiles/user-123");
  assertEquals(res.status, 404);
});

Deno.test("GET /user_profiles/:id - unexpected exception during fetch", async () => {
  const customClient = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                single() {
                  throw new Error("Crash during single fetch");
                }
              };
            }
          };
        }
      };
    }
  } as any;
  overrideClients(customClient, customClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/user_profiles/user-123");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to fetch profile: Crash during single fetch");
});

// PUT /user_profiles/:id
Deno.test("PUT /user_profiles/:id - empty body error", async () => {
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/user_profiles/user-123", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "No update fields provided.");
});

Deno.test("PUT /user_profiles/:id - update full_name parsed correctly", async () => {
  const mockProfiles = [{
    user_id: "user-123",
    first_name: "Gordon",
    last_name: "Ramsay",
    bio: "Angry chef"
  }];
  const mockClient = new MockSupabaseClient(mockProfiles);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/user_profiles/user-123", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ full_name: "Gordon Ramsay", bio: "Angry chef" })
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.first_name, "Gordon");
  assertEquals(body.last_name, "Ramsay");
  assertEquals(body.full_name, "Gordon Ramsay");
});

Deno.test("PUT /user_profiles/:id - database update fails or not found", async () => {
  // Empty result array
  let mockClient = new MockSupabaseClient([]);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  let res = await app.request("/user_profiles/user-123", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ first_name: "Jamie" })
  });
  assertEquals(res.status, 404);
  let body = await res.json();
  assertEquals(body.detail, "Profile not found or update failed.");

  // Error returned from db update
  mockClient = new MockSupabaseClient(null, { message: "Update violated foreign key constraint" });
  overrideClients(mockClient, mockClient);
  res = await app.request("/user_profiles/user-123", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ first_name: "Jamie" })
  });
  assertEquals(res.status, 404);
});

Deno.test("PUT /user_profiles/:id - unexpected exception during update", async () => {
  const customClient = {
    from() {
      return {
        update() {
          throw new Error("Deadlock in DB");
        }
      };
    }
  } as any;
  overrideClients(customClient, customClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/user_profiles/user-123", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ first_name: "Jamie" })
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to update profile: Deadlock in DB");
});

Deno.test("GET /user_profiles - null data returned", async () => {
  const mockClient = new MockSupabaseClient(null);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });
  try {
    const res = await app.request("/user_profiles");
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.length, 0);
  } finally {
    overrideClients(null, null);
    overrideAuth(null, null);
  }
});

Deno.test("GET /user_profiles - null name fields mapped to empty full_name", async () => {
  const mockProfiles = [{
    user_id: "user-123",
    first_name: null,
    last_name: null,
    bio: "Head development chef for Super Sauced.",
    avatar_path: null
  }];
  const mockClient = new MockSupabaseClient(mockProfiles);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });
  try {
    const res = await app.request("/user_profiles");
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.length, 1);
    assertEquals(body[0].first_name, null);
    assertEquals(body[0].last_name, null);
    assertEquals(body[0].full_name, "");
  } finally {
    overrideClients(null, null);
    overrideAuth(null, null);
  }
});

Deno.test("PUT /user_profiles/:id - update full_name single word, bio, and avatar_path", async () => {
  const mockProfiles = [{
    user_id: "user-123",
    first_name: "Jamie",
    last_name: "",
    bio: "No bio",
    avatar_path: "path/to/avatar"
  }];
  const mockClient = new MockSupabaseClient(mockProfiles);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });
  try {
    const res = await app.request("/user_profiles/user-123", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: "Jamie",
        last_name: "Oliver",
        bio: "No bio",
        avatar_path: "path/to/avatar"
      })
    });
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.first_name, "Jamie");
  } finally {
    overrideClients(null, null);
    overrideAuth(null, null);
  }
});

Deno.test("PUT /user_profiles/:id - update full_name when first_name is also provided", async () => {
  const mockProfiles = [{
    user_id: "user-123",
    first_name: "Gordon",
    last_name: "Ramsay"
  }];
  const mockClient = new MockSupabaseClient(mockProfiles);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });
  try {
    const res = await app.request("/user_profiles/user-123", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: "Gordon",
        full_name: "Gordon Ramsay"
      })
    });
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.first_name, "Gordon");
  } finally {
    overrideClients(null, null);
    overrideAuth(null, null);
  }
});

