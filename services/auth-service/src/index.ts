import { Elysia } from "elysia";
import { authRoutes } from "./routes/auth";
import { companyRoutes } from "./routes/companies";

const app = new Elysia()
  .get("/", () => ({ service: "auth-service", status: "ok" })) // Docker health check
  .use(authRoutes)
  .use(companyRoutes)
  .listen({
    hostname: process.env.HOST ?? "0.0.0.0",
    port: Number(process.env.PORT ?? 3000),
  });

console.log(`auth-service listening on ${app.server?.hostname}:${app.server?.port}`);
