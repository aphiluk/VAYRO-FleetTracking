import { Elysia } from "elysia";
import { userRoutes } from "./users";

new Elysia()
  .get("/", () => ({ service: "user-service", status: "ok" }))
  .use(userRoutes)
  .listen({ hostname: process.env.HOST ?? "0.0.0.0", port: Number(process.env.PORT ?? 3000) });
