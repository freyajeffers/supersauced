import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { app, handleRequest } from "../../index.ts";
import { overrideClients, overrideAuth } from "../../deps.ts";
import { MockSupabaseClient } from "./client_mock.ts";

Deno.test("GET /health returns 200 OK", async () => {
  const res = await app.request("/health");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body, { status: "ok", version: "1.0.0" });
});

Deno.test("OPTIONS /health returns CORS headers", async () => {
  const res = await app.request("/health", {
    method: "OPTIONS"
  });
  assertEquals(res.status, 204);
  assertEquals(res.headers.get("access-control-allow-origin"), "*");
  assertEquals(res.headers.get("access-control-allow-methods"), "GET,POST,PUT,DELETE,OPTIONS,PATCH");
});

Deno.test("app.onError catches uncaught router exceptions", async () => {
  // Mock current user so we pass the auth check in /auth/user
  overrideAuth({ sub: "user-123" }, { id: "user-123", email: "user123@example.com", role: "authenticated" });

  // Create a client that throws an uncaught exception on any DB query
  const mockClient = new class extends MockSupabaseClient {
    override from(table: string): any {
      throw new Error("Simulated Uncaught Database Exception");
    }
  }(null, null);
  overrideClients(mockClient, mockClient);

  const res = await app.request("/auth/user");
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.detail, "Simulated Uncaught Database Exception");
  assertEquals(typeof body.stack, "string");
});

Deno.test("handleRequest strips /functions/v1/api prefix", async () => {
  const req = new Request("http://localhost/functions/v1/api/health");
  const res = await handleRequest(req);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.status, "ok");
});

Deno.test("handleRequest strips /api prefix but leaves /api/v1", async () => {
  const req1 = new Request("http://localhost/api/health");
  const res1 = await handleRequest(req1);
  assertEquals(res1.status, 200);
  const body1 = await res1.json();
  assertEquals(body1.status, "ok");

  // /api/v1 should not be stripped to /v1
  const req2 = new Request("http://localhost/api/v1/features/ping");
  const res2 = await handleRequest(req2);
  assertEquals(res2.status, 200);
  const body2 = await res2.json();
  assertEquals(body2.message, "features endpoint reachable");
});



