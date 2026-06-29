import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { app } from "../../index.ts";
import { clearMocks } from "./setup.ts";

Deno.test("Integration: GET /health returns 200 OK", async () => {
  clearMocks();
  const res = await app.request("/health");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.status, "ok");
  assertEquals(body.version, "1.0.0");
});

Deno.test("Integration: OPTIONS /health returns CORS headers", async () => {
  clearMocks();
  const res = await app.request("/health", {
    method: "OPTIONS"
  });
  assertEquals(res.status, 204);
  assertEquals(res.headers.get("access-control-allow-origin"), "*");
});
