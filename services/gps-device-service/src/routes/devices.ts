import { http, ok, type Identity } from "@vayro/service-kit";
import { Elysia, t } from "elysia";
import type { VehicleDirectory } from "../adapters/vehicle-directory";
import * as devices from "../application/devices";
import { createDeviceBody, idParams, listDevicesQuery, updateDeviceBody } from "../schemas/device.schema";

export interface RouteDeps {
  resolveUser: (authorization: string | null | undefined) => Promise<Identity>;
  vehicles: VehicleDirectory;
}

export const deviceRoutes = ({ resolveUser, vehicles }: RouteDeps) =>
  new Elysia({ normalize: false }).use(http)
    .derive(async ({ headers }) => ({ caller: await resolveUser(headers.authorization) }))
    .get("/api/v1/gps-devices", async ({ caller, query }) => ok(await devices.listDevices(caller, query)), { query: listDevicesQuery })
    .get("/api/v1/gps-devices/:id", async ({ caller, params }) => ok(await devices.getDevice(caller, params.id)), { params: idParams })
    .post("/api/v1/gps-devices", async ({ caller, body, ip, set }) => {
      const device = await devices.createDevice({ identity: caller, vehicles, ip }, body);
      set.status = 201;
      return ok(device, "GPS device created");
    }, { body: createDeviceBody })
    .put("/api/v1/gps-devices/:id", async ({ caller, params, body, ip }) => ok(await devices.updateDevice({ identity: caller, vehicles, ip }, params.id, body), "GPS device updated"), {
      params: idParams,
      body: updateDeviceBody,
    })
    .delete("/api/v1/gps-devices/:id", async ({ caller, params, ip }) => ok(await devices.disableDevice({ identity: caller, vehicles, ip }, params.id), "GPS connection disabled; history preserved"), { params: idParams })
    .patch("/api/v1/gps-devices/:id/status", async ({ caller, params, body, ip }) => {
      return ok(await devices.setDeviceEnabled({ identity: caller, vehicles, ip }, params.id, body.enabled));
    }, { params: idParams, body: t.Object({ enabled: t.Boolean() }, { additionalProperties: false }) })
    .get("/api/v1/gps-devices/:id/status", async ({ caller, params }) => ok(await devices.getDeviceStatus(caller, params.id)), { params: idParams });
