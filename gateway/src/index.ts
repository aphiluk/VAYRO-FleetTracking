import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";

const AUTH_URL = process.env.AUTH_SERVICE_URL ?? "http://127.0.0.1:3002";
const USER_URL = process.env.USER_SERVICE_URL ?? "http://127.0.0.1:3003";
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:3000";

// Only these paths reach auth-service; everything else stays unreachable through the gateway.
const AUTH_PATHS = ["/api/v1/auth", "/api/v1/companies/register"];

const app = new Elysia()
  .use(cors({ origin: WEB_ORIGIN }))
  .get("/", () => ({ service: "gateway", status: "ok" })) // Docker health check
  .all(
    "/api/v1/*",
    async ({ request, server, set }) => {
      const url = new URL(request.url);
      const isUserPath = url.pathname === "/api/v1/users" || url.pathname.startsWith("/api/v1/users/");
      if (!isUserPath && !AUTH_PATHS.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) {
        set.status = 404;
        return { success: false, error: { code: "NOT_FOUND", message: "Not found" } };
      }

      // Rebuild the forwarding headers rather than copying the client's: the client IP is set here, never trusted from the caller.
      const headers = new Headers();
      for (const name of ["authorization", "content-type", "user-agent"]) {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
      }
      headers.set("x-request-id", crypto.randomUUID());
      const ip = server?.requestIP(request)?.address;
      if (ip) headers.set("x-forwarded-for", ip);

      try {
        const upstream = await fetch(`${isUserPath ? USER_URL : AUTH_URL}${url.pathname}${url.search}`, {
          method: request.method,
          headers,
          body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer(),
        });
        return new Response(upstream.body, {
          status: upstream.status,
          headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
        });
      } catch {
        set.status = 502;
        return { success: false, error: { code: "UPSTREAM_UNAVAILABLE", message: "Service unavailable" } };
      }
    },
  )
  .listen({
    hostname: process.env.HOST ?? "0.0.0.0",
    port: Number(process.env.PORT ?? 3000),
  });

console.log(`gateway listening on ${app.server?.hostname}:${app.server?.port}`);
