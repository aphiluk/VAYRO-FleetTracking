import { Elysia } from "elysia";
import { authResolver, internalClient } from "@vayro/service-kit";
import { httpDirectories } from "./adapters/directories";
import { config } from "./config/env";
import { internalRoutes } from "./modules/internal/internal.routes";
import { vehicleRoutes, type VehicleRouteOptions } from "./modules/vehicles/vehicles.routes";

export function createVehicleApp(options: Partial<VehicleRouteOptions> = {}) {
  return new Elysia({ normalize: false })
    .get("/", () => ({ service: "vehicle-service", status: "ok" }))
    .use(vehicleRoutes({
      resolveUser: options.resolveUser ?? authResolver(internalClient(config.authServiceUrl, config.internalToken)),
      directories: options.directories ?? httpDirectories(),
    }))
    .use(internalRoutes);
}
