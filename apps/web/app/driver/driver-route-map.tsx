"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import type { DriverJob, RouteCoordinate } from "./driver-demo";
import type { DriverNavigation } from "./driver-navigation";
import { focus, Icon } from "./driver-ui";

const streetStyle = "https://tiles.openfreemap.org/styles/liberty";
const localStyle = {
  version: 8 as const,
  sources: {},
  layers: [{ id: "driver-map-background", type: "background" as const, paint: { "background-color": "#edf1f5", "background-opacity": 0 } }],
};

type MapMode = "loading" | "street" | "schematic" | "static";
type RouteBounds = [RouteCoordinate, RouteCoordinate];

function getBounds(path: RouteCoordinate[]): RouteBounds {
  const x = path.map(([longitude]) => longitude);
  const y = path.map(([, latitude]) => latitude);
  return [[Math.min(...x), Math.min(...y)], [Math.max(...x), Math.max(...y)]];
}

function cameraPadding(map: MapLibreMap) {
  const container = map.getContainer();
  const { clientHeight: height, clientWidth: width } = container;
  const header = container.closest(".driver-full-map")?.querySelector(".driver-map-header");
  const headerBottom = header?.getBoundingClientRect().bottom ?? 96;
  const top = Math.min(headerBottom + 24, height * 0.34);
  const inset = Math.min(64, Math.max(32, width / 9));
  return { top, right: inset + 18, bottom: Math.min(164, height * 0.3), left: inset };
}

function fitRoute(map: MapLibreMap, bounds: RouteBounds) {
  map.fitBounds(bounds, { padding: cameraPadding(map), duration: 0, maxZoom: 13, bearing: 0 });
}

function addRoute(map: MapLibreMap, path: RouteCoordinate[]) {
  map.addSource("driver-demo-route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: path } } });
  map.addLayer({ id: "driver-route-outline", type: "line", source: "driver-demo-route", paint: { "line-width": 9, "line-color": "#ffffff" }, layout: { "line-join": "round", "line-cap": "round" } });
  map.addLayer({ id: "driver-route-line", type: "line", source: "driver-demo-route", paint: { "line-width": 5, "line-color": "#c53849" }, layout: { "line-join": "round", "line-cap": "round" } });
}

function markerElement(text: string, kind: "pickup" | "delivery" | "vehicle") {
  const element = document.createElement("span");
  element.className = `driver-map-pin driver-map-pin-${kind}`;
  element.setAttribute("role", "presentation");
  element.setAttribute("aria-hidden", "true");
  element.textContent = text;
  return element;
}

function RouteDiagram({ path, vehicle, bounds, zoom }: { path: RouteCoordinate[]; vehicle: RouteCoordinate; bounds: RouteBounds; zoom: number }) {
  const [[west, south], [east, north]] = bounds;
  const scale = zoom * Math.min(360 / Math.max(east - west, 0.01), 280 / Math.max(north - south, 0.01));
  const project = ([x, y]: RouteCoordinate) => [240 + (x - (west + east) / 2) * scale, 200 - (y - (south + north) / 2) * scale] as const;
  const points = path.map((point) => project(point).join(",")).join(" ");
  const stops = [project(path[0]), project(path[path.length - 1])];
  const [truckX, truckY] = project(vehicle);

  return (
    <svg aria-hidden="true" viewBox="0 0 480 400" className="absolute inset-0 size-full">
      <polyline points={points} fill="none" stroke="#fff" strokeWidth="9" strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={points} fill="none" stroke="#c53849" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
      {stops.map(([x, y], index) => (
        <g key={index === 0 ? "pickup" : "delivery"}>
          <circle cx={x} cy={y} r="18" fill={index === 0 ? "#3e4d63" : "#a72d3a"} stroke="#fff" strokeWidth="3" />
          <text x={x} y={y} dy=".34em" fill="white" fontSize="18" fontWeight="700" textAnchor="middle">{index === 0 ? "A" : "B"}</text>
        </g>
      ))}
      <circle cx={truckX} cy={truckY} r="10" fill="#20593f" stroke="#fff" strokeWidth="3" />
    </svg>
  );
}

export default function DriverRouteMap({ job, navigation }: { job: DriverJob; navigation: DriverNavigation | null }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const truckRef = useRef<MapLibreMarker | null>(null);
  const [mode, setMode] = useState<MapMode>("loading");
  const [diagramZoom, setDiagramZoom] = useState(1);
  const [overview, setOverview] = useState(false);
  const path = [job.pickup.coordinate, ...job.via, job.delivery.coordinate];
  const vehicle = navigation?.position ?? job.via[Math.floor(job.via.length / 2)] ?? job.pickup.coordinate;
  const bounds = getBounds(path);
  const interactive = mode === "street" || mode === "schematic";
  const guiding = navigation !== null;

  useEffect(() => {
    const element = container.current;
    if (!element) return;

    let disposed = false;
    let map: MapLibreMap | undefined;
    let deadline: number | undefined;
    let layer: "street" | "schematic" = "street";
    let ready = false;
    const route = [job.pickup.coordinate, ...job.via, job.delivery.coordinate];
    const routeBounds = getBounds(route);

    function switchToSchematic() {
      if (!map || disposed || layer === "schematic") return;
      layer = "schematic";
      window.clearTimeout(deadline);
      deadline = window.setTimeout(() => setMode("static"), 3500);
      map.setStyle(localStyle, { diff: false });
    }

    async function initialize(target: HTMLDivElement) {
      try {
        const { Map, Marker } = await import("maplibre-gl");
        if (disposed) return;
        const instance = new Map({
          container: target,
          style: streetStyle,
          center: job.pickup.coordinate,
          zoom: 9,
          scrollZoom: false,
          dragRotate: false,
          touchPitch: false,
          maxPitch: 0,
          attributionControl: { compact: true },
        });
        map = instance;
        mapRef.current = instance;
        fitRoute(instance, routeBounds);

        new Marker({ element: markerElement("A", "pickup") }).setLngLat(job.pickup.coordinate).addTo(instance);
        new Marker({ element: markerElement("B", "delivery") }).setLngLat(job.delivery.coordinate).addTo(instance);
        truckRef.current = new Marker({ element: markerElement("", "vehicle"), rotationAlignment: "map" })
          .setLngLat(job.via[Math.floor(job.via.length / 2)] ?? job.pickup.coordinate).addTo(instance);

        instance.on("style.load", () => addRoute(instance, route));
        instance.on("idle", () => {
          if (disposed || !instance.getLayer("driver-route-line")) return;
          ready = true;
          window.clearTimeout(deadline);
          setMode(layer);
        });
        instance.on("error", () => {
          if (!ready) switchToSchematic();
        });
        deadline = window.setTimeout(switchToSchematic, 4500);
      } catch {
        if (disposed) return;
        window.clearTimeout(deadline);
        map?.remove();
        map = undefined;
        mapRef.current = null;
        setMode("static");
      }
    }

    void initialize(element);
    return () => {
      disposed = true;
      window.clearTimeout(deadline);
      map?.remove();
      mapRef.current = null;
      truckRef.current = null;
    };
  }, [job]);

  useEffect(() => {
    const map = mapRef.current;
    if (!interactive || !guiding || !map) return;
    const stopFollowing = () => setOverview(true);
    map.on("dragstart", stopFollowing);
    return () => { map.off("dragstart", stopFollowing); };
  }, [interactive, guiding]);

  useEffect(() => {
    const map = mapRef.current;
    const truck = truckRef.current;
    if (!interactive || !navigation || !map || !truck) return;
    truck.getElement().classList.add("driver-map-pin-guidance");
    truck.setLngLat(navigation.position).setRotation(navigation.bearing);
    if (overview) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.easeTo({
      center: navigation.position,
      bearing: reducedMotion ? 0 : navigation.bearing,
      zoom: 13.4,
      padding: cameraPadding(map),
      duration: reducedMotion ? 0 : 230,
    });
  }, [interactive, navigation, overview]);

  function zoomBy(delta: number) {
    if (interactive && mapRef.current) {
      if (guiding) setOverview(true);
      mapRef.current.zoomTo(mapRef.current.getZoom() + delta, { duration: 0 });
      return;
    }
    setDiagramZoom((previous) => Math.min(2, Math.max(1, previous + delta * 0.25)));
  }

  function resetFrame() {
    if (guiding) setOverview(true);
    if (interactive && mapRef.current) fitRoute(mapRef.current, bounds);
    else setDiagramZoom(1);
  }

  return (
    <div className="driver-route-map isolate overflow-hidden">
      {!interactive && <RouteDiagram path={path} vehicle={vehicle} bounds={bounds} zoom={diagramZoom} />}
      <div ref={container} aria-hidden={!interactive} role="region" aria-label="แผนที่เส้นทางงานขนส่ง" className={interactive ? "absolute inset-0" : "invisible absolute inset-0"} />
      <span role="status" className="driver-map-note pointer-events-none absolute z-10 max-w-[75%] rounded-lg border border-[var(--fleet-line)] bg-[var(--fleet-highlight)] px-2 py-1 text-xs text-[var(--fleet-muted)]">
        {mode === "street" ? "แผนที่ถนน · เส้นทางตัวอย่าง" : mode === "loading" ? "แผนผังตัวอย่าง · กำลังโหลดถนน" : "แผนผังเส้นทางตัวอย่าง"}
      </span>
      <div className="driver-map-tools absolute z-10 grid gap-1.5" role="group" aria-label="เครื่องมือแผนที่">
        <button type="button" aria-label="ซูมเข้า" onClick={() => zoomBy(1)} disabled={!interactive && diagramZoom >= 2} className={`driver-map-control ${focus}`}>+</button>
        <button type="button" aria-label="ซูมออก" onClick={() => zoomBy(-1)} disabled={!interactive && diagramZoom <= 1} className={`driver-map-control ${focus}`}>−</button>
        <button type="button" aria-label="แสดงทั้งเส้นทาง" onClick={resetFrame} className={`driver-map-control ${focus}`}><Icon name="route" /></button>
        {guiding && interactive && (
          <button type="button" aria-label="ติดตามรถจำลอง" aria-pressed={!overview} onClick={() => setOverview(false)} className={`driver-map-control ${focus}`}><Icon name="locate" /></button>
        )}
      </div>
    </div>
  );
}
