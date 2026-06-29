import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { readFileStr } from "https://deno.land/std@0.224.0/fs/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "http://127.0.0.1:54321";
// Supabase REST URL, but for raw Postgres we need the DB URL from MCP output
// We know from supabase start output that DB URL is postgresql://postgres:postgres@127.0.0.1:54322/postgres
const DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const client = new Client(DB_URL);
await client.connect();

const schemaPath = "/home/freya/supersauced/schema.sql";
const schema = await Deno.readTextFile(schemaPath);
await client.queryArray(schema);
console.log("Schema applied successfully");
await client.end();
