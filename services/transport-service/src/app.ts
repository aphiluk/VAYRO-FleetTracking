import { Elysia } from "elysia";
import { authResolver, internalClient } from "@vayro/service-kit";
import { httpDirectories } from "./adapters/directories";
import { config } from "./config/env";
import { internalRoutes } from "./modules/internal/internal.routes";
import { jobRoutes, type JobRouteOptions } from "./modules/jobs/jobs.routes";
import { systemLogs } from "./system-logs";

export function createTransportApp(options: Partial<JobRouteOptions> = {}) {
  return new Elysia({ normalize: false })
    .get("/", () => ({ service: "transport-service", status: "ok" }))
    .use(jobRoutes({ resolveUser: options.resolveUser ?? authResolver(internalClient(config.authServiceUrl, config.internalToken)), directories: options.directories ?? httpDirectories() }))
    .use(internalRoutes)
    .use(systemLogs);
}
export const app = createTransportApp();
