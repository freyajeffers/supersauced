import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { app } from "../../index.ts";

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
