import { ApiError, http, ok, type Identity } from "@vayro/service-kit";
import { Elysia, t } from "elysia";
import type { DeviceDirectory } from "../adapters/device-directory";
import type { EventPublisher } from "../adapters/event-publisher";
import type { FleetDirectory } from "../adapters/fleet-directory";
import { ingestLocation } from "../application/ingest-location";
import { fleetLatest, vehicleHistory, vehicleLatest } from "../application/query-locations";
import { historyQuery, ingestBody, vehicleParams } from "../schemas/gps.schema";

export interface RouteDeps {
  identity: (authorization: string | null | undefined) => Promise<Identity>;
  fleet: FleetDirectory;
  devices: DeviceDirectory;
  events: EventPublisher;
}

export const locationRoutes = ({ identity, fleet, devices, events }: RouteDeps) =>
  new Elysia({ normalize: false }).use(http)
    .derive(async ({ headers }) => ({ caller: await identity(headers.authorization) }))
    .post("/api/v1/gps/ingest", async ({ caller, body, set }) => {
      const point = await ingestLocation({ identity: caller, fleet, devices, events }, body);
      set.status = 201;
      return ok(point, "GPS position stored");
    }, { body: ingestBody })
    .get("/api/v1/gps/fleet/latest", async ({ caller, request, query, set }) => {
      const params = new URL(request.url).searchParams;
      if (params.size !== 1 || !params.has("vehicle_ids")) throw new ApiError(422, "VALIDATION_ERROR", "Only vehicle_ids is accepted");
      set.headers["cache-control"] = "no-store";
      return ok(await fleetLatest(caller, query.vehicle_ids));
    }, {
      query: t.Object({ vehicle_ids: t.String({ maxLength: 1999, pattern: "^[1-9][0-9]{0,18}(,[1-9][0-9]{0,18})*$" }) }, { additionalProperties: false }),
    })
    .get("/api/v1/gps/vehicles/:vehicleId/locations", async ({ caller, params, query }) => {
      const { rows, meta } = await vehicleHistory(caller, fleet, params.vehicleId, query);
      return { ...ok(rows), meta };
    }, { params: vehicleParams, query: historyQuery })
    .get("/api/v1/gps/vehicles/:vehicleId/latest", async ({ caller, params }) => ok(await vehicleLatest(caller, fleet, params.vehicleId)), { params: vehicleParams });
