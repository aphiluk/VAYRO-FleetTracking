import { describe, expect, test } from "bun:test";
import { ApiError, type Identity } from "@vayro/service-kit";
import { createNavigationApp } from "../src/app";
import { createNavigationProvider, decodeShape, type NavigationProvider } from "../src/providers";

const routeInput = { origin: { latitude: 13.7465, longitude: 100.5302 }, destination: { latitude: 13.7294, longitude: 100.5418 } };
const placeResponse = { features: [{ geometry: { type: "Point", coordinates: [100.5302625, 13.746778] }, properties: { osm_type: "W", osm_id: 42, name: "หอศิลปวัฒนธรรมแห่งกรุงเทพมหานคร", city: "กรุงเทพมหานคร" } }] };
const routeResponse = {
  trip: {
    status: 0,
    units: "kilometers",
    summary: { length: 0.07, time: 10.246 },
    legs: [{ shape: "sl_fYi_{v~DxAoO", maneuvers: [
      { instruction: "Drive east.", length: 0.07, time: 10.246, begin_shape_index: 0, end_shape_index: 1 },
      { instruction: "You have arrived.", length: 0, time: 0, begin_shape_index: 1, end_shape_index: 1 },
    ] }],
  },
};

function provider(fetcher: (url: URL, init: RequestInit) => Promise<Response>, options: { timeoutMs?: number; intervalMs?: number; now?: () => number } = {}) {
  return createNavigationProvider({ geocodingUrl: "https://geocoding.example/api/", routingUrl: "https://routing.example/route", fetcher, intervalMs: 0, ...options });
}

function appFor(identity: Identity | null, backend: NavigationProvider) {
  return createNavigationApp({
    provider: backend,
    resolveUser: async () => {
      if (!identity) throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
      return identity;
    },
  });
}

const admin: Identity = { role: "company_admin", company_id: "10", user_id: "20" };
const bodyRequest = (body: unknown) => new Request("http://localhost/api/v1/navigation/route", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("navigation API", () => {
  test("health is public and API requires a company user's authentication before calling providers", async () => {
    let calls = 0;
    const backend = provider(async () => { calls++; return Response.json(placeResponse); });
    const anonymous = appFor(null, backend);
    expect((await anonymous.handle(new Request("http://localhost/"))).status).toBe(200);
    expect((await anonymous.handle(new Request("http://localhost/api/v1/navigation/search?q=Bangkok"))).status).toBe(401);
    expect((await appFor({ role: "platform_admin", company_id: null }, backend).handle(bodyRequest(routeInput))).status).toBe(403);
    expect((await appFor({ role: "driver", company_id: null }, backend).handle(bodyRequest(routeInput))).status).toBe(403);
    expect(calls).toBe(0);
  });

  test("company admin, dispatcher and driver can search; normalization and company scope reach the provider", async () => {
    const calls: string[][] = [];
    const backend: NavigationProvider = {
      search: async (company, q) => { calls.push([company, q]); return []; },
      route: async () => { throw new Error("unused"); },
    };
    for (const role of ["company_admin", "dispatcher", "driver"] as const) {
      const app = appFor({ ...admin, role }, backend);
      const response = await app.handle(new Request("http://localhost/api/v1/navigation/search?q=%20Bangkok%20%20Art%20"));
      const result = await response.json();
      expect(response.status).toBe(200);
      expect(result).toMatchObject({ success: true, data: [] });
      expect(typeof result.request_id).toBe("string");
    }
    expect(calls).toEqual(Array.from({ length: 3 }, () => ["10", "Bangkok Art"]));
  });

  test("rejects empty, short, oversized and control-character searches", async () => {
    let calls = 0;
    const app = appFor(admin, provider(async () => { calls++; return Response.json(placeResponse); }));
    for (const q of ["  ", "a", "a".repeat(201), "Bangkok\nArt"]) {
      const response = await app.handle(new Request(`http://localhost/api/v1/navigation/search?q=${encodeURIComponent(q)}`));
      expect(response.status).toBe(422);
      expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    }
    expect(calls).toBe(0);
  });

  test("rejects invalid coordinates, extra provider options and identical endpoints before provider call", async () => {
    let calls = 0;
    const app = appFor(admin, provider(async () => { calls++; return Response.json(routeResponse); }));
    const badInputs = [
      { ...routeInput, origin: { latitude: 91, longitude: 100 } },
      { ...routeInput, destination: { latitude: 13, longitude: "100" } },
      { ...routeInput, origin: { latitude: null, longitude: 100 } },
      { ...routeInput, destination: routeInput.origin },
      { ...routeInput, provider_url: "http://private.internal/" },
    ];
    for (const input of badInputs) expect((await app.handle(bodyRequest(input))).status).toBe(422);
    expect(calls).toBe(0);
  });
});

describe("Photon and Valhalla adapters", () => {
  test("returns address coordinates and caches successful results inside the company", async () => {
    let calls = 0;
    let currentTime = 1000;
    const backend = provider(async (url) => {
      calls++;
      expect(url.searchParams.get("q")).toBe("Bangkok Art");
      expect(url.searchParams.get("limit")).toBe("5");
      return Response.json(placeResponse);
    }, { now: () => currentTime });
    expect(await backend.search("10", "Bangkok Art")).toEqual([{ id: "W:42", label: "หอศิลปวัฒนธรรมแห่งกรุงเทพมหานคร, กรุงเทพมหานคร", latitude: 13.746778, longitude: 100.5302625 }]);
    await backend.search("10", "Bangkok Art");
    expect(calls).toBe(1);
    await backend.search("11", "Bangkok Art");
    expect(calls).toBe(2);
    currentTime += 300_001;
    await backend.search("10", "Bangkok Art");
    expect(calls).toBe(3);
  });

  test("decodes polyline6 into longitude-latitude pairs and preserves maneuver indices and units", async () => {
    const backend = provider(async (_, init) => {
      expect(JSON.parse(init.body as string)).toEqual({ locations: [{ lat: 13.7465, lon: 100.5302 }, { lat: 13.7294, lon: 100.5418 }], costing: "auto", units: "kilometers", language: "en-US" });
      return Response.json(routeResponse);
    });
    const result = await backend.route("10", routeInput);
    expect(result.geometry.coordinates).toHaveLength(2);
    expect(result.geometry.coordinates[0]).toEqual([100.530181, 13.746394]);
    expect(result).toMatchObject({ provider: "valhalla", profile: "auto", distance_meters: 70, duration_seconds: 10.246 });
    expect(result.steps[0]).toEqual({ instruction: "Drive east.", distance_meters: 70, duration_seconds: 10.246, begin_shape_index: 0, end_shape_index: 1 });
  });

  test("does not invent a route when the provider cannot find a road", async () => {
    const backend = provider(async () => Response.json({ error_code: 171, error: "Provider diagnostics" }, { status: 400 }));
    const response = await appFor(admin, backend).handle(bodyRequest(routeInput));
    expect(response.status).toBe(422);
    expect((await response.json()).error).toEqual({ code: "NAVIGATION_NO_ROUTE", message: "No road route was found between these locations" });
  });

  test("rejects malformed JSON, coordinates and oversized responses", async () => {
    const invalidPlaces = { features: [{ ...placeResponse.features[0], geometry: { type: "Point", coordinates: [Infinity, 13] } }] };
    for (const response of [new Response("<html>Unavailable</html>"), Response.json(invalidPlaces), new Response(" ".repeat(2 * 1024 * 1024 + 1))]) {
      await expect(provider(async () => response).search("10", "Bangkok")).rejects.toMatchObject({ code: "NAVIGATION_INVALID_RESPONSE", status: 502 });
    }
  });

  test("rejects malformed shapes and invalid maneuver indices", async () => {
    for (const shape of ["?", "~~~~~~~?", "", "\n"]) expect(() => decodeShape(shape)).toThrow(ApiError);
    const broken = structuredClone(routeResponse);
    broken.trip.legs[0]!.maneuvers[0]!.end_shape_index = 999;
    await expect(provider(async () => Response.json(broken)).route("10", routeInput)).rejects.toMatchObject({ code: "NAVIGATION_INVALID_RESPONSE" });
  });

  test("times out provider requests and sanitizes network failures", async () => {
    const slow = provider(async (_, init) => new Promise<Response>((_, reject) => {
      init.signal!.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
    }), { timeoutMs: 5 });
    await expect(slow.search("10", "Bangkok")).rejects.toMatchObject({ code: "NAVIGATION_TIMEOUT", status: 504 });
    await expect(provider(async () => { throw new Error("private request URL and credential"); }).route("10", routeInput)).rejects.toMatchObject({ code: "NAVIGATION_UNAVAILABLE", message: "Navigation provider is currently unavailable" });
  });

  test("limits cache misses, reuses an in-flight request and honors provider backoff", async () => {
    let calls = 0;
    const backend = provider(async () => { calls++; return Response.json(placeResponse); }, { intervalMs: 1000 });
    const [first, second] = await Promise.all([backend.search("10", "Bangkok"), backend.search("10", "Bangkok")]);
    expect(first).toEqual(second);
    expect(calls).toBe(1);
    await expect(backend.search("10", "Siam")).rejects.toMatchObject({ status: 429 });
    const busy = provider(async () => new Response("busy", { status: 429 }));
    await expect(busy.search("10", "Bangkok")).rejects.toMatchObject({ code: "NAVIGATION_RATE_LIMITED" });
    await expect(busy.search("10", "Siam")).rejects.toMatchObject({ status: 429 });
  });
});
