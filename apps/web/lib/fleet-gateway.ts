import "server-only";

import { cookies } from "next/headers";

export async function proxyFleet(request: Request, segments: string[]) {
  const fail = (status: number, code: string) => Response.json({
    success: false,
    error: { code, message: "Fleet request could not be completed" },
    request_id: crypto.randomUUID(),
  }, { status, headers: { "cache-control": "no-store" } });

  const path = segments.join("/");
  const valid = /^(vehicles|vehicle-types)(\/[1-9]\d*)?$/.test(path) && ["GET", "POST", "PUT", "DELETE"].includes(request.method);
  const drivers = path === "drivers" && request.method === "GET";
  const gps = path === "gps/latest" && request.method === "GET";
  const gpsDeviceList = path === "gps-devices" && ["GET", "POST"].includes(request.method);
  const gpsDevice = /^gps-devices\/[1-9]\d{0,18}$/.test(path) && ["GET", "PUT"].includes(request.method);
  const gpsDeviceStatus = /^gps-devices\/[1-9]\d{0,18}\/status$/.test(path) && ["GET", "PATCH"].includes(request.method);
  const gpsDevices = gpsDeviceList || gpsDevice || gpsDeviceStatus;
  if (!valid && !drivers && !gps && !gpsDevices) return fail(404, "NOT_FOUND");
  const token = (await cookies()).get("vayro_at")?.value;
  if (!token) return fail(401, "UNAUTHORIZED");

  if (request.method !== "GET" && request.headers.get("origin")) {
    try {
      const source = new URL(request.headers.get("origin")!);
      if (!["http:", "https:"].includes(source.protocol) || source.host !== request.headers.get("host")) return fail(403, "FORBIDDEN");
    } catch {
      return fail(403, "FORBIDDEN");
    }
  }

  try {
    const upstreamPath = gps ? "gps/fleet/latest" : drivers ? "users" : path;
    const url = new URL(`/api/v1/${upstreamPath}`, process.env.API_URL ?? "http://127.0.0.1:3001");
    const query = new URL(request.url).searchParams;
    if (gps) {
      const ids = query.get("vehicle_ids");
      if (query.size !== 1 || !ids || ids.length > 1999 || !/^[1-9]\d{0,18}(,[1-9]\d{0,18}){0,99}$/.test(ids)) {
        return fail(422, "VALIDATION_ERROR");
      }
      url.searchParams.set("vehicle_ids", ids);
    } else if (gpsDevices) {
      for (const [key, value] of query) {
        if (!gpsDeviceList || request.method !== "GET" || !["limit", "offset"].includes(key) || query.getAll(key).length !== 1) {
          return fail(422, "VALIDATION_ERROR");
        }
        url.searchParams.set(key, value);
      }
    } else {
      for (const key of ["limit", "offset", "q", "vehicle_status", "is_active"]) {
        const value = query.get(key);
        if (value !== null) url.searchParams.set(key, value);
      }
    }
    let body: string | undefined;
    if (request.method !== "GET") {
      body = await request.text();
      if (body.length > 16_384) return fail(413, "VALIDATION_ERROR");
      if (gpsDevices) {
        const allowed = gpsDeviceStatus ? ["enabled"] : ["vehicle_id", "device_code", "source_type", "provider_name"];
        let payload: unknown;
        try {
          payload = JSON.parse(body);
        } catch {
          return fail(422, "VALIDATION_ERROR");
        }
        if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).some((key) => !allowed.includes(key))) {
          return fail(422, "VALIDATION_ERROR");
        }
      }
    }
    const upstream = await fetch(url, {
      method: request.method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]),
    });
    return new Response(upstream.body, { status: upstream.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch {
    return fail(503, gps || gpsDevices ? "GPS_UNAVAILABLE" : "FLEET_UNAVAILABLE");
  }
}
