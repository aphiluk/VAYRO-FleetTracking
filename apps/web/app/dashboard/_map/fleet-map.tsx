"use client";

import { useEffect, useRef, useState } from "react";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  Marker as MapLibreMarker,
} from "maplibre-gl";
import { DEMO_CENTER } from "../_data/fleet-demo";
import { hasVehicleModel, mapVehicleLabel, type MapVehicle } from "../_data/map-vehicle";
import FleetMapSchematic, { vehicleColors } from "./fleet-map-schematic";

type OverlayInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type FleetMapProps = {
  vehicles: MapVehicle[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  theme: "light" | "dark";
  view: "2d" | "3d";
  recenterKey: number;
  focusKey: number;
  overlayInsets: OverlayInsets;
};

type MapStatus = "loading" | "ready" | "unavailable";
type MarkerParts = {
  marker: MapLibreMarker;
  button: HTMLButtonElement;
  dot: HTMLSpanElement;
  arrow: HTMLSpanElement;
  label: HTMLSpanElement;
};
type MapSession = {
  map: MapLibreMap;
  Marker: typeof MapLibreMarker;
  markers: Map<string, MarkerParts>;
  theme: FleetMapProps["theme"];
  view: FleetMapProps["view"];
  recenterKey: number;
  focusKey: number;
  overlayInsets: OverlayInsets;
  selectedId: string | null;
  visibleVehicleKey: string;
  select: (id: string) => void;
  isWaiting: boolean;
  isDisposed: boolean;
  loadingModels: boolean;
  modelsFailed: boolean;
  modelsAvailable: boolean;
  waitForTiles: () => void;
  getProps: () => FleetMapProps;
};

const ROUTE_SOURCE = "fleet-demo-route";
const BUILDINGS_LAYER = "fleet-demo-buildings";
const VEHICLE_MODEL_LAYER = "fleet-demo-vehicle-models";
const STYLE_URL = {
  light: "https://tiles.openfreemap.org/styles/liberty",
  dark: "https://tiles.openfreemap.org/styles/dark",
};
const routeColor = { light: "#c53849", dark: "#ff8e92" };

function getVehicleKey(vehicles: MapVehicle[]) {
  return vehicles.map(({ id }) => id).join("|");
}

function cameraDuration() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? 0
    : 400;
}

function cameraPadding(map: MapLibreMap, insets: OverlayInsets) {
  const { clientWidth: width, clientHeight: height } = map.getContainer();
  const gap = Math.min(40, Math.min(width, height) / 10);
  const { top, right, bottom, left } = insets;
  const horizontal = Math.min(1, (width * 0.7) / (left + right + gap * 2));
  const vertical = Math.min(1, (height * 0.7) / (top + bottom + gap * 2));
  return {
    top: Math.round((top + gap) * vertical),
    right: Math.round((right + gap) * horizontal),
    bottom: Math.round((bottom + gap) * vertical),
    left: Math.round((left + gap) * horizontal),
  };
}

function cameraAngle(view: FleetMapProps["view"]) {
  return view === "3d" ? { pitch: 50, bearing: -18 } : { pitch: 0, bearing: 0 };
}

function fitFleet(
  map: MapLibreMap,
  { vehicles, overlayInsets, view }: FleetMapProps,
  duration: number,
) {
  if (!vehicles.length) {
    map.easeTo({
      center: DEMO_CENTER,
      zoom: 11.35,
      duration,
      ...cameraAngle(view),
    });
    return;
  }

  const longitudes = vehicles.map(({ position }) => position[0]);
  const latitudes = vehicles.map(({ position }) => position[1]);
  map.fitBounds(
    [
      [Math.min(...longitudes), Math.min(...latitudes)],
      [Math.max(...longitudes), Math.max(...latitudes)],
    ],
    {
      padding: cameraPadding(map, overlayInsets),
      duration,
      maxZoom: 15.5,
      ...cameraAngle(view),
    },
  );
}

function createMarker(session: MapSession, vehicle: MapVehicle): MarkerParts {
  const button = document.createElement("button");
  button.type = "button";
  button.className =
    "group relative grid size-10 cursor-pointer place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fleet-focus)]";
  button.addEventListener("click", () => session.select(vehicle.id));

  const dot = document.createElement("span");
  dot.className =
    "grid size-7 place-items-center rounded-full border-2 border-white text-[13px] font-black text-[#1a2820] shadow-md";
  dot.setAttribute("aria-hidden", "true");
  const arrow = document.createElement("span");
  dot.append(arrow);

  const label = document.createElement("span");
  label.className =
    "pointer-events-none absolute bottom-full whitespace-nowrap rounded-md border border-[var(--fleet-line)] bg-[var(--fleet-surface)] px-2 py-1 font-mono text-xs font-bold text-[color:var(--fleet-text)] shadow-md";
  label.setAttribute("aria-hidden", "true");
  button.append(dot, label);

  const marker = new session.Marker({ element: button, anchor: "center" })
    .setLngLat(vehicle.position)
    .addTo(session.map);
  return { marker, button, dot, arrow, label };
}

function updateMarkers(
  session: MapSession,
  { vehicles, selectedId, view }: FleetMapProps,
) {
  const showModels = view === "3d" && session.modelsAvailable;
  const visibleIds = new Set(vehicles.map(({ id }) => id));
  for (const [id, { marker }] of session.markers) {
    if (!visibleIds.has(id)) {
      marker.remove();
      session.markers.delete(id);
    }
  }

  for (const vehicle of vehicles) {
    const marker =
      session.markers.get(vehicle.id) ?? createMarker(session, vehicle);
    session.markers.set(vehicle.id, marker);
    const selected = vehicle.id === selectedId;
    const directional = vehicle.heading !== null && (vehicle.status === "moving" || vehicle.status === "current");
    const text = directional ? "↑" : "•";
    marker.button.setAttribute("aria-label", mapVehicleLabel(vehicle));
    marker.label.textContent = vehicle.status === "delayed" ? `${vehicle.plate} · GPS เก่า` : vehicle.plate;
    marker.button.setAttribute("aria-pressed", String(selected));
    marker.button.style.zIndex = selected ? "2" : "1";
    marker.label.hidden = !selected;
    marker.dot.style.visibility = showModels && hasVehicleModel(vehicle) ? "hidden" : "visible";
    marker.dot.style.backgroundColor = vehicleColors[vehicle.status];
    marker.dot.style.boxShadow = selected
      ? "0 0 0 3px var(--fleet-signal), 0 3px 8px #27344950"
      : "";
    if (marker.arrow.textContent !== text) marker.arrow.textContent = text;
    marker.arrow.style.rotate = directional ? `${vehicle.heading! - session.map.getBearing()}deg` : "";
    marker.marker.setLngLat(vehicle.position);
  }
}

function updateRoute(map: MapLibreMap, vehicle: MapVehicle | undefined) {
  const source = map.getSource<GeoJSONSource>(ROUTE_SOURCE);
  const features =
    vehicle && vehicle.route.length > 1
      ? [
          {
            type: "Feature" as const,
            geometry: {
              type: "LineString" as const,
              coordinates: vehicle.route,
            },
            properties: {},
          },
        ]
      : [];
  source?.setData({ type: "FeatureCollection", features });
}

function updateBuildings(map: MapLibreMap, view: FleetMapProps["view"]) {
  for (const layer of map.getStyle().layers) {
    if (layer.type === "fill-extrusion")
      map.setLayoutProperty(
        layer.id,
        "visibility",
        view === "3d" ? "visible" : "none",
      );
  }
}

function addStyleLayers(session: MapSession) {
  const { map, theme, view } = session;
  const layers = map.getStyle().layers;
  const firstLabel = layers.find((layer) => layer.type === "symbol")?.id;
  const building = layers.find(
    (layer) => layer.type === "fill" && layer["source-layer"] === "building",
  );

  if (
    !layers.some((layer) => layer.type === "fill-extrusion") &&
    building?.type === "fill"
  ) {
    map.addLayer(
      {
        id: BUILDINGS_LAYER,
        type: "fill-extrusion",
        source: building.source,
        "source-layer": "building",
        minzoom: 14.5,
        filter: ["!=", ["get", "hide_3d"], true],
        paint: {
          "fill-extrusion-color": theme === "dark" ? "#596970" : "#d5d9ca",
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 0],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": 0.85,
        },
      },
      firstLabel,
    );
  }
  updateBuildings(map, view);
  map.addSource(ROUTE_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addLayer(
    {
      id: ROUTE_SOURCE,
      type: "line",
      source: ROUTE_SOURCE,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": routeColor[theme],
        "line-width": 3,
        "line-opacity": 0.85,
        "line-dasharray": [2, 1.3],
      },
    },
    firstLabel,
  );
  const { vehicles, selectedId } = session.getProps();
  updateRoute(
    map,
    vehicles.find(({ id }) => id === selectedId),
  );
}

function setModelsAvailable(session: MapSession, available: boolean) {
  if (session.isDisposed || session.modelsAvailable === available) return;
  session.modelsAvailable = available;
  updateMarkers(session, session.getProps());
}

function syncVehicleLayer(session: MapSession) {
  if (session.view !== "3d" || session.loadingModels || session.modelsFailed)
    return;
  if (!session.map.isStyleLoaded()) return;
  if (session.map.getLayer(VEHICLE_MODEL_LAYER)) return;

  session.loadingModels = true;
  void import("./fleet-map-vehicles")
    .then(({ createVehicleLayer }) => {
      if (
        session.isDisposed ||
        session.view !== "3d" ||
        !session.map.isStyleLoaded()
      )
        return;
      session.map.addLayer(
        createVehicleLayer(
          VEHICLE_MODEL_LAYER,
          () => (session.view === "3d" ? session.getProps().vehicles : []),
          (available) => setModelsAvailable(session, available),
        ),
      );
    })
    .catch(() => {
      session.modelsFailed = true;
    })
    .finally(() => {
      session.loadingModels = false;
    });
}

function syncMap(session: MapSession, props: FleetMapProps) {
  const { map } = session;
  const themeChanged = session.theme !== props.theme;
  const viewChanged = session.view !== props.view;
  const selectionChanged = session.selectedId !== props.selectedId;
  const fitRequested = session.recenterKey !== props.recenterKey;
  const focusRequested = session.focusKey !== props.focusKey;
  const { top, right, bottom, left } = props.overlayInsets;
  const previousInsets = session.overlayInsets;
  const layoutChanged =
    top !== previousInsets.top ||
    right !== previousInsets.right ||
    bottom !== previousInsets.bottom ||
    left !== previousInsets.left;
  const visibleVehicleKey = getVehicleKey(props.vehicles);
  const resultsChanged = session.visibleVehicleKey !== visibleVehicleKey;
  const selected = props.vehicles.find(({ id }) => id === props.selectedId);

  session.theme = props.theme;
  session.view = props.view;
  session.selectedId = props.selectedId;
  session.recenterKey = props.recenterKey;
  session.focusKey = props.focusKey;
  session.overlayInsets = props.overlayInsets;
  session.visibleVehicleKey = visibleVehicleKey;

  if (themeChanged) {
    session.waitForTiles();
    map.setStyle(STYLE_URL[props.theme], { diff: false });
  }
  if (viewChanged && !themeChanged && map.isStyleLoaded())
    updateBuildings(map, props.view);
  if (selectionChanged && !themeChanged) updateRoute(map, selected);
  if (layoutChanged) map.resize();

  if (fitRequested) {
    fitFleet(map, props, cameraDuration());
  } else if (
    selected &&
    (selectionChanged || focusRequested || viewChanged || layoutChanged || resultsChanged)
  ) {
    const padding = cameraPadding(map, props.overlayInsets);
    map.easeTo({
      center: selected.position,
      zoom: Math.max(map.getZoom(), props.view === "3d" ? 15.6 : 14.2),
      offset: [
        (padding.left - padding.right) / 2,
        (padding.top - padding.bottom) / 2,
      ],
      ...cameraAngle(props.view),
      duration: cameraDuration(),
    });
  } else if (
    viewChanged ||
    layoutChanged ||
    (resultsChanged && props.vehicles.length > 0)
  ) {
    fitFleet(map, props, cameraDuration());
  }

  updateMarkers(session, props);
  syncVehicleLayer(session);
  if (props.view === "3d" || viewChanged) map.triggerRepaint();
}

export default function FleetMap(props: FleetMapProps) {
  const mapElement = useRef<HTMLDivElement>(null);
  const latestProps = useRef(props);
  const sessionRef = useRef<MapSession | null>(null);
  const [status, setStatus] = useState<MapStatus>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    latestProps.current = props;
    if (sessionRef.current) syncMap(sessionRef.current, props);
  }, [props]);

  useEffect(() => {
    const element = mapElement.current;
    if (!element) return;

    let disposed = false;
    let session: MapSession | undefined;
    let resize: ResizeObserver | undefined;
    let timeout: ReturnType<typeof setTimeout>;

    function waitForTiles() {
      if (session) {
        session.isWaiting = true;
        setStatus("loading");
      }
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (!disposed) setStatus("unavailable");
      }, 9000);
    }

    waitForTiles();
    void import("maplibre-gl")
      .then(({ Map, Marker, AttributionControl, ScaleControl }) => {
        if (disposed) return;
        setStatus("loading");
        const initial = latestProps.current;
        const map = new Map({
          container: element,
          style: STYLE_URL[initial.theme],
          center: DEMO_CENTER,
          zoom: 11.35,
          ...cameraAngle(initial.view),
          maxPitch: 65,
          maxZoom: 19,
          renderWorldCopies: false,
          attributionControl: false,
        });

        const current: MapSession = {
          map,
          Marker,
          markers: new globalThis.Map(),
          theme: initial.theme,
          view: initial.view,
          recenterKey: initial.recenterKey,
          selectedId: initial.selectedId,
          focusKey: initial.focusKey,
          overlayInsets: initial.overlayInsets,
          visibleVehicleKey: getVehicleKey(initial.vehicles),
          isWaiting: true,
          isDisposed: false,
          loadingModels: false,
          modelsFailed: false,
          modelsAvailable: false,
          select: (id) => latestProps.current.onSelect(id),
          waitForTiles,
          getProps: () => latestProps.current,
        };
        sessionRef.current = session = current;
        map.addControl(
          new AttributionControl({ compact: true }),
          "bottom-left",
        );
        map.addControl(
          new ScaleControl({ unit: "metric", maxWidth: 88 }),
          "bottom-right",
        );
        map
          .getCanvas()
          .setAttribute("aria-label", "แผนที่ติดตามรถในกรุงเทพฯ และปริมณฑล");
        fitFleet(map, initial, 0);
        updateMarkers(current, initial);

        map.on("style.load", () => addStyleLayers(current));
        map.on("idle", () => {
          if (
            current.isWaiting &&
            map
              .queryRenderedFeatures()
              .some(({ source }) => source && source !== ROUTE_SOURCE)
          ) {
            current.isWaiting = false;
            clearTimeout(timeout);
            setStatus("ready");
          }
          syncVehicleLayer(current);
        });
        map.on("rotate", () => updateMarkers(current, latestProps.current));
        map.on("error", () => {
          if (current.isWaiting && !map.getStyle()?.layers.length)
            setStatus("unavailable");
        });
        map.on("webglcontextlost", () => {
          current.isWaiting = true;
          setModelsAvailable(current, false);
          setStatus("unavailable");
        });
        map.on("webglcontextrestored", waitForTiles);
        resize = new ResizeObserver(() => map.resize());
        resize.observe(element);
      })
      .catch(() => {
        if (disposed) return;
        if (!session) element.replaceChildren();
        setStatus("unavailable");
      });

    return () => {
      disposed = true;
      clearTimeout(timeout);
      resize?.disconnect();
      if (session) {
        session.isDisposed = true;
        for (const { marker } of session.markers.values()) marker.remove();
        session.map.remove();
      }
      sessionRef.current = null;
    };
  }, [attempt]);

  const isReady = status === "ready";
  const controlSurface =
    "soft-panel border border-[var(--fleet-line)] bg-[var(--fleet-surface)] text-[color:var(--fleet-text)]";
  const controlButton =
    "grid size-10 cursor-pointer place-items-center rounded-lg text-lg font-semibold hover:bg-[var(--fleet-selected)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fleet-focus)]";
  const attributionTheme =
    props.theme === "dark"
      ? "[&_.maplibregl-ctrl-attrib]:bg-[var(--fleet-surface)]! [&_.maplibregl-ctrl-attrib]:text-[color:var(--fleet-text)]! [&_.maplibregl-ctrl-attrib-button]:invert [&_.maplibregl-ctrl-attrib_a]:text-[color:var(--fleet-text)]! [&_.maplibregl-ctrl-scale]:border-[var(--fleet-muted)]! [&_.maplibregl-ctrl-scale]:bg-[var(--fleet-surface)]! [&_.maplibregl-ctrl-scale]:text-[color:var(--fleet-text)]!"
      : "";

  return (
    <div
      className="absolute inset-0 isolate overflow-hidden"
      aria-label="แผนที่ติดตามรถ"
    >
      {!isReady && (
        <FleetMapSchematic
          vehicles={props.vehicles.filter(({ status }) => status !== "current" && status !== "delayed")}
          selectedId={props.selectedId}
          onSelect={props.onSelect}
          theme={props.theme}
        />
      )}
      <div
        ref={mapElement}
        className={`absolute! inset-0 [&_.maplibregl-ctrl-attrib]:max-w-[min(60vw,21rem)] [&_.maplibregl-ctrl-attrib]:text-[10px] [&_.maplibregl-ctrl-scale]:text-[10px] max-lg:[&_.maplibregl-ctrl-bottom-left]:bottom-20! max-lg:[&_.maplibregl-ctrl-bottom-right]:bottom-20! ${attributionTheme} ${isReady ? "" : "pointer-events-none opacity-0"}`}
        inert={!isReady}
      />
      {isReady ? (
        <div
          className={`absolute right-3 top-[10.75rem] z-10 grid gap-0.5 p-1 lg:bottom-24 lg:right-4 lg:top-auto lg:flex ${controlSurface}`}
        >
          <button
            type="button"
            className={controlButton}
            aria-label="ขยายแผนที่"
            title="ขยายแผนที่"
            onClick={() =>
              sessionRef.current?.map.zoomIn({ duration: cameraDuration() })
            }
          >
            +
          </button>
          <button
            type="button"
            className={controlButton}
            aria-label="ย่อแผนที่"
            title="ย่อแผนที่"
            onClick={() =>
              sessionRef.current?.map.zoomOut({ duration: cameraDuration() })
            }
          >
            −
          </button>
          <button
            type="button"
            className={controlButton}
            aria-label="หมุนแผนที่กลับทิศเหนือ"
            title="หมุนแผนที่กลับทิศเหนือ"
            onClick={() =>
              sessionRef.current?.map.resetNorth({ duration: cameraDuration() })
            }
          >
            ↑
          </button>
        </div>
      ) : (
        <div
          className={`absolute bottom-22 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs font-medium lg:bottom-3 ${controlSurface}`}
        >
          <span role="status">
            {status === "loading"
              ? "กำลังโหลดแผนที่ถนน · แสดงแผนผังชั่วคราว"
              : "แผนที่ถนนโหลดไม่ได้ · แสดงแผนผังจำลอง"}
          </span>
          {status === "unavailable" && (
            <button
              type="button"
              className="cursor-pointer rounded underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fleet-focus)]"
              onClick={() => {
                setStatus("loading");
                setAttempt((current) => current + 1);
              }}
            >
              ลองใหม่
            </button>
          )}
        </div>
      )}
    </div>
  );
}
