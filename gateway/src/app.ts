import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";

const NOT_FOUND = { success: false, error: { code: "NOT_FOUND", message: "Not found" } };
const UPSTREAM_UNAVAILABLE = {
  success: false,
  error: { code: "UPSTREAM_UNAVAILABLE", message: "Service unavailable" },
};
const UPSTREAM_TIMEOUT = {
  success: false,
  error: { code: "UPSTREAM_TIMEOUT", message: "Service did not respond in time" },
};

export function createGateway(env = process.env, upstreamTimeoutMs = 12_000) {
  const vehicles = env.VEHICLE_SERVICE_URL ?? "http://127.0.0.1:3006";
  const transport = env.TRANSPORT_SERVICE_URL ?? "http://127.0.0.1:3010";
  const alerts = env.ALERT_SERVICE_URL ?? "http://127.0.0.1:3011";
  const reporting = env.REPORTING_SERVICE_URL ?? "http://127.0.0.1:3012";
  const integration = env.INTEGRATION_SERVICE_URL ?? "http://127.0.0.1:3013";
  const routes = [
    ["/api/v1/auth", env.AUTH_SERVICE_URL ?? "http://127.0.0.1:3002"],
    ["/api/v1/companies", env.COMPANY_SERVICE_URL ?? "http://127.0.0.1:3005"],
    ["/api/v1/users", env.USER_SERVICE_URL ?? "http://127.0.0.1:3003"],
    ["/api/v1/vehicles", vehicles],
    ["/api/v1/vehicle-types", vehicles],
    ["/api/v1/gps-devices", env.GPS_DEVICE_SERVICE_URL ?? "http://127.0.0.1:3007"],
    ["/api/v1/gps", env.GPS_DATA_SERVICE_URL ?? "http://127.0.0.1:3004"],
    ["/api/v1/routes", env.ROUTE_HISTORY_SERVICE_URL ?? "http://127.0.0.1:3009"],
    ["/api/v1/jobs", transport],
    ["/api/v1/driver", transport],
    ["/api/v1/alert-rules", alerts],
    ["/api/v1/geofences", alerts],
    ["/api/v1/alerts", alerts],
    ["/api/v1/dashboard", reporting],
    ["/api/v1/reports", reporting],
    ["/api/v1/integrations", integration],
    ["/api/v1/integration-logs", integration],
    ["/api/v1/system-logs", integration],
    ["/api/v1/navigation", env.NAVIGATION_SERVICE_URL ?? "http://127.0.0.1:3014"],
  ];

  return new Elysia()
    .use(cors({ origin: env.WEB_ORIGIN ?? "http://localhost:3000" }))
    .get("/", () => ({ service: "gateway", status: "ok" }))
    .all("/api/v1/*", async ({ request, server, set }) => {
      const { pathname, search } = new URL(request.url);
      const route = routes.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
      if (!route) {
        set.status = 404;
        return NOT_FOUND;
      }

      const headers = new Headers();
      for (const name of ["authorization", "content-type", "user-agent"]) {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
      }
      headers.set("x-request-id", crypto.randomUUID());
      const ip = server?.requestIP(request)?.address;
      if (ip) headers.set("x-forwarded-for", ip);

      const body = ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer();
      const deadline = AbortSignal.timeout(upstreamTimeoutMs);
      try {
        const upstream = await fetch(`${route[1]}${pathname}${search}`, {
          method: request.method,
          headers,
          body,
          redirect: "error",
          signal: AbortSignal.any([request.signal, deadline]),
        });
        const responseHeaders = new Headers();
        for (const name of ["content-type", "content-disposition", "cache-control", "retry-after", "www-authenticate"]) {
          const value = upstream.headers.get(name);
          if (value) responseHeaders.set(name, value);
        }
        const responseBody = upstream.body ? await upstream.arrayBuffer() : null;
        return new Response(responseBody, { status: upstream.status, headers: responseHeaders });
      } catch {
        if (deadline.aborted) {
          set.status = 504;
          return UPSTREAM_TIMEOUT;
        }
        set.status = 502;
        return UPSTREAM_UNAVAILABLE;
      }
    }, { parse: "none" });
}
