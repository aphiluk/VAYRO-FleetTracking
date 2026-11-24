import { ApiError } from "@vayro/service-kit";
import type { NavigationPlace, NavigationRoute, NavigationRouteRequest } from "../../../packages/shared-types";

export interface NavigationProvider {
  search(companyId: string, q: string): Promise<NavigationPlace[]>;
  route(companyId: string, input: NavigationRouteRequest): Promise<NavigationRoute>;
}

interface ProviderOptions {
  geocodingUrl: string;
  routingUrl: string;
  fetcher?: (url: URL, init: RequestInit) => Promise<Response>;
  timeoutMs?: number;
  intervalMs?: number;
  now?: () => number;
}

type CacheEntry<T> = { expires: number; value: T };
const invalidResponse = () => new ApiError(502, "NAVIGATION_INVALID_RESPONSE", "Navigation provider returned an invalid response");
const noRoute = () => new ApiError(422, "NAVIGATION_NO_ROUTE", "No road route was found between these locations");
const maximumBytes = 2 * 1024 * 1024;
const maximumPoints = 25_000;
const cacheLifetimeMs = 5 * 60 * 1000;
const maximumCacheEntries = 100;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidResponse();
  return value as Record<string, unknown>;
}

function finite(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) throw invalidResponse();
  return value;
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.body) throw invalidResponse();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) throw invalidResponse();
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch (error) {
    if (error instanceof ApiError || (error instanceof DOMException && ["TimeoutError", "AbortError"].includes(error.name))) throw error;
    throw invalidResponse();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

// Valhalla's native JSON shape is polyline6. Its maneuver indices refer to these decoded points.
export function decodeShape(shape: unknown): [number, number][] {
  if (typeof shape !== "string" || shape.length > 250_000) throw invalidResponse();
  const encoded = shape;
  let offset = 0;
  let latitude = 0;
  let longitude = 0;
  function delta() {
    let result = 0;
    let shift = 0;
    let code: number;
    do {
      if (offset >= encoded.length || shift > 25) throw invalidResponse();
      code = encoded.charCodeAt(offset++) - 63;
      if (code < 0 || code > 63) throw invalidResponse();
      result += (code & 31) * 2 ** shift;
      shift += 5;
    } while (code >= 32);
    return result % 2 ? -(result + 1) / 2 : result / 2;
  }
  const coordinates: [number, number][] = [];
  while (offset < shape.length) {
    latitude += delta();
    longitude += delta();
    coordinates.push([finite(longitude / 1e6, -180, 180), finite(latitude / 1e6, -90, 90)]);
    if (coordinates.length > maximumPoints) throw invalidResponse();
  }
  if (coordinates.length < 2) throw invalidResponse();
  return coordinates;
}

function parseSearch(payload: unknown): NavigationPlace[] {
  const features = object(payload).features;
  if (!Array.isArray(features) || features.length > 50) throw invalidResponse();
  const results = new Map<string, NavigationPlace>();
  for (const value of features) {
    const feature = object(value);
    const geometry = object(feature.geometry);
    const properties = object(feature.properties);
    const coords = geometry.coordinates;
    if (geometry.type !== "Point" || !Array.isArray(coords) || coords.length !== 2) throw invalidResponse();
    const longitude = finite(coords[0], -180, 180);
    const latitude = finite(coords[1], -90, 90);
    const address = [properties.housenumber, properties.street].filter((part) => typeof part === "string" && part.trim()).join(" ");
    const pieces = [properties.name, address, properties.district, properties.city, properties.state, properties.postcode, properties.country];
    if (pieces.some((part) => part !== undefined && typeof part !== "string")) throw invalidResponse();
    const label = [...new Set(pieces.filter((part): part is string => typeof part === "string" && !!part.trim()).map((part) => part.trim()))].join(", ");
    if (!label || label.length > 1500 || typeof properties.osm_type !== "string" || !["string", "number"].includes(typeof properties.osm_id)) throw invalidResponse();
    const id = `${properties.osm_type}:${properties.osm_id}`;
    if (id.length > 100) throw invalidResponse();
    const duplicateKey = `${latitude},${longitude}:${label}`;
    results.set(duplicateKey, { id, label, latitude, longitude });
  }
  return [...results.values()].slice(0, 5);
}

function parseRoute(payload: unknown): NavigationRoute {
  const trip = object(object(payload).trip);
  if (trip.status !== 0 || trip.units !== "kilometers" || !Array.isArray(trip.legs) || trip.legs.length !== 1) throw invalidResponse();
  const leg = object(trip.legs[0]);
  const summary = object(trip.summary);
  const coordinates = decodeShape(leg.shape);
  if (!Array.isArray(leg.maneuvers) || !leg.maneuvers.length || leg.maneuvers.length > 2000) throw invalidResponse();
  let previousEnd = 0;
  const steps = leg.maneuvers.map((value) => {
    const maneuver = object(value);
    const begin = finite(maneuver.begin_shape_index, previousEnd, coordinates.length - 1);
    const end = finite(maneuver.end_shape_index, begin, coordinates.length - 1);
    if (!Number.isInteger(begin) || !Number.isInteger(end) || typeof maneuver.instruction !== "string" || !maneuver.instruction.trim() || maneuver.instruction.length > 1500) throw invalidResponse();
    previousEnd = end;
    return {
      instruction: maneuver.instruction.trim(),
      distance_meters: finite(maneuver.length, 0, 5000) * 1000,
      duration_seconds: finite(maneuver.time, 0, 1_209_600),
      begin_shape_index: begin,
      end_shape_index: end,
    };
  });
  return {
    provider: "valhalla",
    profile: "auto",
    geometry: { type: "LineString", coordinates },
    distance_meters: finite(summary.length, 0, 5000) * 1000,
    duration_seconds: finite(summary.time, 0, 1_209_600),
    steps,
  };
}

export function createNavigationProvider(options: ProviderOptions): NavigationProvider {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  const nextRequest = { search: 0, route: 0 };
  const places = new Map<string, CacheEntry<NavigationPlace[]>>();
  const routes = new Map<string, CacheEntry<NavigationRoute>>();
  const pendingPlaces = new Map<string, Promise<NavigationPlace[]>>();
  const pendingRoutes = new Map<string, Promise<NavigationRoute>>();

  async function cached<T>(cache: Map<string, CacheEntry<T>>, pending: Map<string, Promise<T>>, key: string, run: () => Promise<T>): Promise<T> {
    const entry = cache.get(key);
    if (entry && entry.expires > now()) return entry.value;
    if (pending.has(key)) return pending.get(key)!;
    const request = run().then((value) => {
      cache.delete(key);
      if (cache.size >= maximumCacheEntries) cache.delete(cache.keys().next().value!);
      cache.set(key, { value, expires: now() + cacheLifetimeMs });
      return value;
    }).finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  }

  async function call(kind: "search" | "route", url: URL, init: RequestInit = {}) {
    if (now() < nextRequest[kind]) throw new ApiError(429, "NAVIGATION_RATE_LIMITED", "Please wait a moment before trying navigation again");
    nextRequest[kind] = now() + (options.intervalMs ?? 1000);
    const controller = new AbortController();
    const signal = controller.signal;
    const timeout = setTimeout(() => controller.abort(new DOMException("Navigation provider timeout", "TimeoutError")), options.timeoutMs ?? 8000);
    try {
      const response = await fetcher(url, {
        ...init,
        headers: { accept: "application/json", "user-agent": "VAYRO-Navigation/1.0", ...init.headers },
        redirect: "error",
        signal,
      });
      if (response.status === 429) {
        nextRequest[kind] = now() + 10_000;
        await response.body?.cancel();
        throw new ApiError(429, "NAVIGATION_RATE_LIMITED", "Navigation provider is busy, please try again shortly");
      }
      if (!response.ok && (kind !== "route" || response.status !== 400)) {
        await response.body?.cancel();
        throw new ApiError(503, "NAVIGATION_UNAVAILABLE", "Navigation provider is currently unavailable");
      }
      const payload = await readJson(response);
      if (kind === "route" && [154, 170, 171, 440, 441, 442].includes(Number(object(payload).error_code))) throw noRoute();
      if (!response.ok) throw invalidResponse();
      return payload;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (signal.aborted || (error instanceof DOMException && ["TimeoutError", "AbortError"].includes(error.name))) {
        throw new ApiError(504, "NAVIGATION_TIMEOUT", "Navigation provider took too long to respond");
      }
      throw new ApiError(503, "NAVIGATION_UNAVAILABLE", "Navigation provider is currently unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    search(companyId, q) {
      return cached(places, pendingPlaces, JSON.stringify([companyId, q]), async () => {
        const url = new URL(options.geocodingUrl);
        url.searchParams.set("q", q);
        url.searchParams.set("limit", "5");
        return parseSearch(await call("search", url));
      });
    },
    route(companyId, input) {
      return cached(routes, pendingRoutes, JSON.stringify([companyId, input.origin, input.destination]), async () => {
        const locations = [input.origin, input.destination].map(({ latitude, longitude }) => ({ lat: latitude, lon: longitude }));
        const body = JSON.stringify({ locations, costing: "auto", units: "kilometers", language: "en-US" });
        return parseRoute(await call("route", new URL(options.routingUrl), { method: "POST", headers: { "content-type": "application/json" }, body }));
      });
    },
  };
}
