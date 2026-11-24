import { http, ok, type Caller } from "@vayro/service-kit";
import { Elysia } from "elysia";
import type { Directories } from "../../adapters/directories";
import { assignDriverSchema, createTypeSchema, createVehicleSchema, paramsSchema, statusSchema, typeQuerySchema, updateTypeSchema, updateVehicleSchema, vehicleQuerySchema } from "./vehicles.model";
import * as service from "./vehicles.service";

export interface VehicleRouteOptions {
  resolveUser: (authorization: string | null | undefined) => Promise<Caller>;
  directories: Directories;
}

export const vehicleRoutes = ({ resolveUser, directories }: VehicleRouteOptions) =>
  new Elysia({ normalize: false }).use(http)
    .derive(async ({ headers }) => ({ me: await resolveUser(headers.authorization) }))
    .get("/api/v1/vehicles", async ({ me, query }) => ok(await service.listVehicles(me, query)), { query: vehicleQuerySchema })
    .get("/api/v1/vehicles/:id", async ({ me, params }) => ok(await service.getVehicle(me, params.id)), { params: paramsSchema })
    .post("/api/v1/vehicles", async ({ me, body, ip, set }) => {
      const vehicle = await service.createVehicle({ me, directories, ip }, body);
      set.status = 201;
      return ok(vehicle, "Vehicle created");
    }, { body: createVehicleSchema })
    .put("/api/v1/vehicles/:id", async ({ me, params, body, ip }) => ok(await service.updateVehicle({ me, directories, ip }, params.id, body), "Vehicle updated"), { params: paramsSchema, body: updateVehicleSchema })
    .delete("/api/v1/vehicles/:id", async ({ me, params, ip }) => ok(await service.updateVehicle({ me, directories, ip }, params.id, { vehicle_status: "inactive" }, "vehicle.disable"), "Vehicle disabled; history preserved"), { params: paramsSchema })
    .patch("/api/v1/vehicles/:id/driver", async ({ me, params, body, ip }) => ok(await service.updateVehicle({ me, directories, ip }, params.id, body, "vehicle.assign_driver"), "Vehicle driver updated"), { params: paramsSchema, body: assignDriverSchema })
    .patch("/api/v1/vehicles/:id/status", async ({ me, params, body, ip }) => ok(await service.updateVehicle({ me, directories, ip }, params.id, body, "vehicle.change_status"), "Vehicle status updated"), { params: paramsSchema, body: statusSchema })
    .get("/api/v1/vehicle-types", async ({ me, query }) => ok(await service.listTypes(me, query)), { query: typeQuerySchema })
    .post("/api/v1/vehicle-types", async ({ me, body, ip, set }) => {
      const vehicleType = await service.createType({ me, directories, ip }, body);
      set.status = 201;
      return ok(vehicleType, "Vehicle type created");
    }, { body: createTypeSchema })
    .put("/api/v1/vehicle-types/:id", async ({ me, params, body, ip }) => ok(await service.updateType({ me, directories, ip }, params.id, body), "Vehicle type updated"), { params: paramsSchema, body: updateTypeSchema })
    .delete("/api/v1/vehicle-types/:id", async ({ me, params, ip }) => ok(await service.updateType({ me, directories, ip }, params.id, { is_active: false }, "vehicle_type.disable"), "Vehicle type disabled; vehicle references preserved"), { params: paramsSchema });
