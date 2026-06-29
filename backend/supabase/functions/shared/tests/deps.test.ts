import { assertEquals, assertRejects, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Context } from 'https://deno.land/x/hono@v3.11.8/mod.ts'
import { HTTPException } from 'https://deno.land/x/hono@v3.11.8/http-exception.ts'
import { verifyAndDecodeJwt, handleSharedError } from "../deps.ts";

async function createSignedJwt(payload: any, secret: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const base64urlEncode = (arr: Uint8Array) => {
    const binString = String.fromCharCode(...arr);
    return btoa(binString).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  };
  const encoder = new TextEncoder();
  const headerB64 = base64urlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64urlEncode(encoder.encode(JSON.stringify(payload)));

  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const data = encoder.encode(`${headerB64}.${payloadB64}`);
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, data);
  const signatureB64 = base64urlEncode(new Uint8Array(signatureBuffer));

  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

const TEST_SECRET = "my-super-secret-key-at-least-32-characters-long";

Deno.test("verifyAndDecodeJwt - success path with valid signature", async () => {
  const payload = {
    sub: "user-123",
    email: "chef@example.com",
    role: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3600
  };
  const token = await createSignedJwt(payload, TEST_SECRET);
  const decoded = await verifyAndDecodeJwt(token, TEST_SECRET);
  assertEquals(decoded.sub, "user-123");
  assertEquals(decoded.email, "chef@example.com");
});

Deno.test("verifyAndDecodeJwt - fails on invalid signature", async () => {
  const payload = {
    sub: "user-123",
    exp: Math.floor(Date.now() / 1000) + 3600
  };
  const token = await createSignedJwt(payload, TEST_SECRET);
  // TAMPER WITH SIGNATURE
  const tamperedToken = token.slice(0, -5) + "xxxxx";
  await assertRejects(async () => {
    await verifyAndDecodeJwt(tamperedToken, TEST_SECRET);
  }, Error, "Invalid token signature or format");
});

Deno.test("verifyAndDecodeJwt - fails on expired token", async () => {
  const payload = {
    sub: "user-123",
    exp: Math.floor(Date.now() / 1000) - 100 // Expired 100 seconds ago
  };
  const token = await createSignedJwt(payload, TEST_SECRET);
  await assertRejects(async () => {
    await verifyAndDecodeJwt(token, TEST_SECRET);
  }, Error, "Token has expired");
});

Deno.test("verifyAndDecodeJwt - fails on missing sub claim", async () => {
  const payload = {
    email: "test@example.com",
    exp: Math.floor(Date.now() / 1000) + 3600
  };
  const token = await createSignedJwt(payload, TEST_SECRET);
  await assertRejects(async () => {
    await verifyAndDecodeJwt(token, TEST_SECRET);
  }, Error, "Token is missing subject claim (sub)");
});

Deno.test("handleSharedError - formats HTTPException correctly", () => {
  let responseData: any = null;
  let responseStatus: any = null;

  const mockContext = {
    json(data: any, status: any) {
      responseData = data;
      responseStatus = status;
      return { data, status };
    }
  } as unknown as Context;

  const err = new HTTPException(401, { message: "Access Token Invalid" });
  handleSharedError(mockContext, err);

  assertEquals(responseStatus, 401);
  assertEquals(responseData, { detail: "Access Token Invalid" });
});

Deno.test("handleSharedError - formats standard Error correctly", () => {
  let responseData: any = null;
  let responseStatus: any = null;

  const mockContext = {
    json(data: any, status: any) {
      responseData = data;
      responseStatus = status;
      return { data, status };
    }
  } as unknown as Context;

  const err = new Error("Something went wrong");
  handleSharedError(mockContext, err);

  assertEquals(responseStatus, 400);
  assertEquals(responseData, { detail: "Something went wrong" });
});
