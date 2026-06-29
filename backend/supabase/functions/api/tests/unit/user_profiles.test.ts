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
