import { ApiError, authResolver, http, internalClient, ok, requireRole, type Identity } from "@vayro/service-kit";
import { Elysia, t } from "elysia";
import type { NavigationRouteRequest } from "../../../packages/shared-types";
import { createNavigationProvider, type NavigationProvider } from "./providers";
import { readConfig } from "./config/env";

export interface NavigationOptions {
  resolveUser?: (authorization: string | null | undefined) => Promise<Identity>;
  provider?: NavigationProvider;
}

const point = t.Object({
  latitude: t.Number({ minimum: -90, maximum: 90 }),
  longitude: t.Number({ minimum: -180, maximum: 180 }),
}, { additionalProperties: false });

export function createNavigationApp(options: NavigationOptions = {}) {
  const config = options.resolveUser && options.provider ? null : readConfig();
  const resolveUser = options.resolveUser ?? authResolver(internalClient(config!.authServiceUrl, config!.internalToken));
  const provider = options.provider ?? createNavigationProvider(config!);

  const routes = new Elysia({ normalize: false }).use(http)
    .derive(async ({ headers }) => {
      const caller = await resolveUser(headers.authorization);
      requireRole(caller, "company_admin", "dispatcher", "driver");
      if (!caller.company_id) throw new ApiError(403, "FORBIDDEN", "An active company workspace is required");
      return { companyId: caller.company_id };
    })
    .get("/api/v1/navigation/search", async ({ companyId, query }) => {
      const q = query.q.trim().replace(/\s+/g, " ");
      if (q.length < 2 || /[\u0000-\u001f\u007f]/.test(query.q)) {
        throw new ApiError(422, "VALIDATION_ERROR", "Search must contain at least two characters without control characters");
      }
      return ok(await provider.search(companyId, q));
    }, { query: t.Object({ q: t.String({ minLength: 2, maxLength: 200 }) }, { additionalProperties: false }) })
    .post("/api/v1/navigation/route", async ({ companyId, body }) => {
      if (body.origin.latitude === body.destination.latitude && body.origin.longitude === body.destination.longitude) {
        throw new ApiError(422, "VALIDATION_ERROR", "Origin and destination must be different");
      }
      return ok(await provider.route(companyId, body as NavigationRouteRequest));
    }, { body: t.Object({ origin: point, destination: point }, { additionalProperties: false }) });

  return new Elysia({ normalize: false })
    .get("/", () => ({ service: "navigation-service", status: "ok" }))
    .use(routes);
}
