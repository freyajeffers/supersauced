import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { app } from "../../index.ts";
import { overrideClients, overrideAuth } from "../../deps.ts";
import { MockSupabaseClient } from "./client_mock.ts";

// 1. GET /recipe_steps
Deno.test("GET /recipe_steps - success path", async () => {
  const mockSteps = [{
    id: "step-123",
    recipe_id: "recipe-123",
    step_number: 1,
    instruction_text: "Boil water",
    is_active_cooking: true,
    timer_seconds: 300
  }];
  const mockClient = new MockSupabaseClient(mockSteps);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/recipe_steps?limit=10&offset=0");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.length, 1);
  assertEquals(body[0].id, "step-123");
  assertEquals(body[0].recipe_id, "recipe-123");
  assertEquals(body[0].step_number, 1);
  assertEquals(body[0].description, "Boil water");
  assertEquals(body[0].instruction_text, "Boil water");
  assertEquals(body[0].is_active_cooking, true);
  assertEquals(body[0].timer_seconds, 300);
});

Deno.test("GET /recipe_steps - database error", async () => {
  const mockClient = new MockSupabaseClient(null, { message: "Internal DB Error" });
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/recipe_steps");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to list steps: Internal DB Error");
});

Deno.test("GET /recipe_steps - unexpected exception", async () => {
  const customClient = {
    from() {
      return {
        select() { return this; },
        range() {
          throw new Error("Died querying");
        }
      };
    }
  } as any;
  overrideClients(customClient, customClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/recipe_steps");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to list steps: Died querying");
});

// 2. GET /recipe_steps/:id
Deno.test("GET /recipe_steps/:id - success path", async () => {
  const mockStep = [{
    id: "step-123",
    recipe_id: "recipe-123",
    step_number: 2,
    instruction_text: "Chop carrots",
    is_active_cooking: false,
    timer_seconds: 0
  }];
  const mockClient = new MockSupabaseClient(mockStep);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/recipe_steps/step-123");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.id, "step-123");
  assertEquals(body.step_number, 2);
  assertEquals(body.description, "Chop carrots");
  assertEquals(body.instruction_text, "Chop carrots");
  assertEquals(body.is_active_cooking, false);
  assertEquals(body.timer_seconds, 0);
});

Deno.test("GET /recipe_steps/:id - not found / access denied", async () => {
  const mockClient = new MockSupabaseClient([]);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/recipe_steps/step-missing");
  assertEquals(res.status, 404);
  const body = await res.json();
  assertEquals(body.detail, "Step not found or access denied.");
});

Deno.test("GET /recipe_steps/:id - database error", async () => {
  const mockClient = new MockSupabaseClient(null, { message: "Permission error" });
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/recipe_steps/step-123");
  assertEquals(res.status, 404);
  const body = await res.json();
  assertEquals(body.detail, "Step not found or access denied.");
});

Deno.test("GET /recipe_steps/:id - unexpected exception", async () => {
  const customClient = {
    from() {
      return {
        select() { return this; },
        eq() {
          throw new Error("Broken connection");
        }
      };
    }
  } as any;
  overrideClients(customClient, customClient);
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/recipe_steps/step-123");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to fetch step: Broken connection");
});

// 3. POST /recipe_steps
Deno.test("POST /recipe_steps - forbidden for regular user", async () => {
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/recipe_steps", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipe_id: "recipe-123" })
  });
  assertEquals(res.status, 403);
});

Deno.test("POST /recipe_steps - success path with description", async () => {
  const mockStep = [{
    id: "step-new",
    recipe_id: "recipe-123",
    step_number: 3,
    instruction_text: "Bake at 350F",
    is_active_cooking: true,
    timer_seconds: 1800
  }];
  const mockClient = new MockSupabaseClient(mockStep);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });

  const res = await app.request("/recipe_steps", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipe_id: "recipe-123",
      step_number: 3,
      description: "Bake at 350F",
      is_active_cooking: true,
      timer_seconds: 1800
    })
  });
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals(body.id, "step-new");
  assertEquals(body.description, "Bake at 350F");
  assertEquals(body.instruction_text, "Bake at 350F");
  assertEquals(body.is_active_cooking, true);
  assertEquals(body.timer_seconds, 1800);
});

Deno.test("POST /recipe_steps - success path with instruction_text", async () => {
  const mockStep = [{
    id: "step-new-2",
    recipe_id: "recipe-123",
    step_number: 4,
    instruction_text: "Cool down",
    is_active_cooking: false,
    timer_seconds: 0
  }];
  const mockClient = new MockSupabaseClient(mockStep);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });

  const res = await app.request("/recipe_steps", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipe_id: "recipe-123",
      step_number: 4,
      instruction_text: "Cool down"
    })
  });
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals(body.id, "step-new-2");
  assertEquals(body.description, "Cool down");
  assertEquals(body.is_active_cooking, false);
  assertEquals(body.timer_seconds, 0);
});

Deno.test("POST /recipe_steps - database error", async () => {
  const mockClient = new MockSupabaseClient(null, { message: "Unique constraint violated" });
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });

  const res = await app.request("/recipe_steps", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipe_id: "recipe-123" })
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to create step: Unique constraint violated");
});

Deno.test("POST /recipe_steps - unexpected exception", async () => {
  const customClient = {
    from() {
      return {
        insert() {
          throw new Error("DB Crash");
        }
      };
    }
  } as any;
  overrideClients(customClient, customClient);
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });

  const res = await app.request("/recipe_steps", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipe_id: "recipe-123" })
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to create step: DB Crash");
});

// 4. PUT /recipe_steps/:id
Deno.test("PUT /recipe_steps/:id - forbidden for regular user", async () => {
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/recipe_steps/step-123", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ step_number: 5 })
  });
  assertEquals(res.status, 403);
});

Deno.test("PUT /recipe_steps/:id - empty body error", async () => {
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });

  const res = await app.request("/recipe_steps/step-123", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "No update fields provided.");
});

Deno.test("PUT /recipe_steps/:id - success path with description", async () => {
  const mockStep = [{
    id: "step-123",
    recipe_id: "recipe-123",
    step_number: 10,
    instruction_text: "Preheat oven",
    is_active_cooking: false,
    timer_seconds: 600
  }];
  const mockClient = new MockSupabaseClient(mockStep);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });

  const res = await app.request("/recipe_steps/step-123", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipe_id: "recipe-123",
      step_number: 10,
      description: "Preheat oven",
      is_active_cooking: false,
      timer_seconds: 600
    })
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.id, "step-123");
  assertEquals(body.step_number, 10);
  assertEquals(body.description, "Preheat oven");
  assertEquals(body.is_active_cooking, false);
  assertEquals(body.timer_seconds, 600);
});

Deno.test("PUT /recipe_steps/:id - success path with instruction_text", async () => {
  const mockStep = [{
    id: "step-123",
    recipe_id: "recipe-123",
    step_number: 1,
    instruction_text: "Sift flour"
  }];
  const mockClient = new MockSupabaseClient(mockStep);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });

  const res = await app.request("/recipe_steps/step-123", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instruction_text: "Sift flour"
    })
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.description, "Sift flour");
});

Deno.test("PUT /recipe_steps/:id - not found / update failed", async () => {
  const mockClient = new MockSupabaseClient([]);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });

  const res = await app.request("/recipe_steps/step-missing", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ step_number: 4 })
  });
  assertEquals(res.status, 404);
  const body = await res.json();
  assertEquals(body.detail, "Step not found or update failed.");
});

Deno.test("PUT /recipe_steps/:id - unexpected exception", async () => {
  const customClient = {
    from() {
      return {
        update() {
          throw new Error("Network split");
        }
      };
    }
  } as any;
  overrideClients(customClient, customClient);
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });

  const res = await app.request("/recipe_steps/step-123", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ step_number: 4 })
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to update step: Network split");
});

// 5. DELETE /recipe_steps/:id
Deno.test("DELETE /recipe_steps/:id - forbidden for regular user", async () => {
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  const res = await app.request("/recipe_steps/step-123", {
    method: "DELETE"
  });
  assertEquals(res.status, 403);
});

Deno.test("DELETE /recipe_steps/:id - success path", async () => {
  const mockClient = new MockSupabaseClient([]);
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });

  const res = await app.request("/recipe_steps/step-123", {
    method: "DELETE"
  });
  assertEquals(res.status, 204);
});

Deno.test("DELETE /recipe_steps/:id - database error", async () => {
  const mockClient = new MockSupabaseClient(null, { message: "Referential integrity error" });
  overrideClients(mockClient, mockClient);
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });

  const res = await app.request("/recipe_steps/step-123", {
    method: "DELETE"
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to delete step: Referential integrity error");
});

Deno.test("DELETE /recipe_steps/:id - unexpected exception", async () => {
  const customClient = {
    from() {
      return {
        delete() {
          throw new Error("Crash during delete");
        }
      };
    }
  } as any;
  overrideClients(customClient, customClient);
  overrideAuth({ sub: "editor-123" }, { id: "editor-123", email: "editor@example.com", role: "cms_editor" });

  const res = await app.request("/recipe_steps/step-123", {
    method: "DELETE"
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.detail, "Failed to delete step: Crash during delete");
});
