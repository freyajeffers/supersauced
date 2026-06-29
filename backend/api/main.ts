// backend/api/main.ts
import { Application } from "https://deno.land/x/oak@v12.5.0/mod.ts";
import { cors } from "https://deno.land/x/oak_cors@v1.2.0/mod.ts";
import { getCurrentUser } from "./dependencies.ts";

const app = new Application();

app.use(cors());
app.use(router.routes());
app.use(router.allowedMethods());

const PORT = Deno.env.get("PORT") || "8000";
console.log(`Server running on http://localhost:${PORT}`);
await app.listen({ port: Number(PORT) });
