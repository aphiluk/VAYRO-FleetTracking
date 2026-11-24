"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import type { NavigationPlace, NavigationRoute } from "../../../../../packages/shared-types";
import { useAdminTheme } from "../_components/admin-shell";

type Props = {
  origin: NavigationPlace;
  destination: NavigationPlace;
  route?: NavigationRoute;
  stepIndex?: number | null;
  recenterKey?: number;
  fullScreen?: boolean;
  onMove?: (stop: "origin" | "destination", latitude: number, longitude: number) => void;
};

export default function NavigationRouteMap(props: Props) {
  const { theme } = useAdminTheme();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const pins = useRef<MapLibreMarker[]>([]);
  const current = useRef(props);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const [readyVersion, setReadyVersion] = useState(0);
  const { origin, destination, route, stepIndex, recenterKey } = props;

  useEffect(() => { current.current = props; }, [props]);

  useEffect(() => {
    const target = container.current;
    if (!target) return;
    let disposed = false;
    let map: MapLibreMap | undefined;
    const deadline = window.setTimeout(() => { if (!disposed) setState("error"); }, 15_000);

    async function initialize() {
      try {
        const { Map, Marker, NavigationControl } = await import("maplibre-gl");
        if (disposed || !target) return;
        map = new Map({
          container: target,
          style: `https://tiles.openfreemap.org/styles/${theme === "dark" ? "dark" : "liberty"}`,
          center: [current.current.origin.longitude, current.current.origin.latitude],
          zoom: 11,
          attributionControl: { compact: true },
          dragRotate: false,
          touchPitch: false,
          locale: { "NavigationControl.ZoomIn": "ขยายเส้นทาง", "NavigationControl.ZoomOut": "ย่อเส้นทาง" },
        });
        const instance = map;
        mapRef.current = instance;
        instance.addControl(new NavigationControl({ showCompass: false }), current.current.fullScreen ? "bottom-right" : "top-right");
        instance.on("load", () => {
          if (disposed) return;
          window.clearTimeout(deadline);
          for (const id of ["navigation-route", "navigation-step"]) {
            instance.addSource(id, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          }
          instance.addLayer({ id: "navigation-outline", type: "line", source: "navigation-route", paint: { "line-color": theme === "dark" ? "#252b35" : "#ffffff", "line-width": 9 }, layout: { "line-join": "round", "line-cap": "round" } });
          instance.addLayer({ id: "navigation-line", type: "line", source: "navigation-route", paint: { "line-color": theme === "dark" ? "#ff9699" : "#c53849", "line-width": 5 }, layout: { "line-join": "round", "line-cap": "round" } });
          instance.addLayer({ id: "navigation-selected-step", type: "line", source: "navigation-step", paint: { "line-color": "#2774bd", "line-width": 6 }, layout: { "line-join": "round", "line-cap": "round" } });
          pins.current = (["origin", "destination"] as const).map((stop, index) => {
            const pin = document.createElement("div");
            pin.className = "grid size-9 place-items-center rounded-full border-[3px] border-white bg-[#a72d3a] text-sm font-bold text-white shadow-lg";
            if (index === 0) pin.style.backgroundColor = "#3e4d63";
            pin.textContent = index === 0 ? "A" : "B";
            pin.setAttribute("aria-label", index === 0 ? "จุดรับสินค้า" : "จุดส่งสินค้า");
            const place = current.current[stop];
            const marker = new Marker({ element: pin, draggable: !!current.current.onMove })
              .setLngLat([place.longitude, place.latitude]).addTo(instance);
            marker.on("dragend", () => {
              const { lat, lng } = marker.getLngLat();
              current.current.onMove?.(stop, lat, lng);
            });
            return marker;
          });
          setState("ready");
          setReadyVersion((version) => version + 1);
        });
      } catch {
        if (!disposed) setState("error");
      }
    }

    void initialize();
    const observer = new ResizeObserver(() => map?.resize());
    observer.observe(target);
    return () => {
      disposed = true;
      window.clearTimeout(deadline);
      observer.disconnect();
      pins.current.forEach((pin) => pin.remove());
      pins.current = [];
      map?.remove();
      mapRef.current = null;
    };
  }, [theme, retry]);

  useEffect(() => {
    const map = mapRef.current;
    if (state !== "ready" || !map?.getSource("navigation-route")) return;
    const stops: [number, number][] = [[origin.longitude, origin.latitude], [destination.longitude, destination.latitude]];
    pins.current.forEach((pin, index) => pin.setLngLat(stops[index]));
    const points = route?.geometry.coordinates;
    const step = stepIndex == null ? undefined : route?.steps[stepIndex];
    const segment = step && points?.slice(step.begin_shape_index, step.end_shape_index + 1);
    const source = (id: string) => map.getSource(id) as GeoJSONSource;
    source("navigation-route").setData({ type: "FeatureCollection", features: points ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: points } }] : [] });
    source("navigation-step").setData({ type: "FeatureCollection", features: segment && segment.length > 1 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: segment } }] : [] });
    const bounds = (segment?.length ? segment : points) ?? stops;
    const extent = bounds.reduce(([west, south, east, north], [lng, lat]) => [Math.min(west, lng), Math.min(south, lat), Math.max(east, lng), Math.max(north, lat)], [Infinity, Infinity, -Infinity, -Infinity]);
    map.fitBounds([[extent[0], extent[1]], [extent[2], extent[3]]], { padding: props.fullScreen ? { top: 120, left: 45, right: 45, bottom: Math.min(200, map.getContainer().clientHeight * 0.3) } : 45, maxZoom: segment ? 16 : 14, duration: 0 });
  }, [origin, destination, route, stepIndex, recenterKey, state, readyVersion, props.fullScreen]);

  return (
    <div className={props.fullScreen ? "absolute inset-0 isolate overflow-hidden bg-[var(--fleet-quiet)]" : "relative isolate h-72 overflow-hidden rounded-2xl border border-[var(--fleet-line)] bg-[var(--fleet-quiet)] sm:h-80"}>
      <div ref={container} role="region" aria-label="แผนที่เส้นทางถนนจริง" className="h-full w-full" />
      {state !== "ready" && <div className="absolute inset-0 grid place-content-center gap-3 bg-[var(--fleet-surface)]/95 p-5 text-center text-sm">
        <p role="status">{state === "loading" ? "กำลังโหลดแผนที่ถนน…" : "โหลดแผนที่ถนนไม่ได้ กรุณาลองอีกครั้ง"}</p>
        {state === "error" && <button type="button" onClick={() => { setState("loading"); setRetry((value) => value + 1); }} className="min-h-11 rounded-xl border border-[var(--fleet-line)] px-3 font-semibold">โหลดแผนที่อีกครั้ง</button>}
      </div>}
    </div>
  );
}
