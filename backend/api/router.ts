// backend/api/router.ts
import { Router } from "https://deno.land/x/oak@v12.5.0/mod.ts";
import authRouter from "./auth.ts";
import recipesRouter from "./recipes/recipes.ts";
import analyticsRouter from "./analytics.ts";
import pushRouter from "./push_notifications.ts";
import revenueRouter from "./revenue.ts";

const router = new Router();

router.use("/auth", authRouter.routes(), authRouter.allowedMethods());
router.use("/recipes", recipesRouter.routes(), recipesRouter.allowedMethods());
router.use("/analytics", analyticsRouter.routes(), analyticsRouter.allowedMethods());
router.use("/push", pushRouter.routes(), pushRouter.allowedMethods());
router.use("/revenue", revenueRouter.routes(), revenueRouter.allowedMethods());

export default router;
