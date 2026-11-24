import { useLayoutEffect, useRef } from "react";

export type Offset = { x: number; y: number };
export type PanelSize = { width: number; height: number };
type ResizeCorner = "bottom-right" | "top-right" | "left";
type Limits = { minX: number; maxX: number; minY: number; maxY: number };
type Drag = { pointerId: number; start: Offset; offset: Offset; limits: Limits };
type Resize = { pointerId: number; start: Offset; rect: DOMRect; area: DOMRect; west: boolean; north: boolean };
const origin: Offset = { x: 0, y: 0 };

const keyboardOffsets: Record<string, Offset> = {
  ArrowLeft: { x: -16, y: 0 },
  ArrowRight: { x: 16, y: 0 },
  ArrowUp: { x: 0, y: -16 },
  ArrowDown: { x: 0, y: 16 },
};

function getLimits(panel: HTMLElement, bounds: HTMLElement, offset: Offset): Limits | null {
  const rect = panel.getBoundingClientRect();
  const area = bounds.getBoundingClientRect();
  if (!rect.width || !rect.height || !area.width || !area.height) return null;

  const minX = offset.x + area.left - rect.left;
  const minY = offset.y + area.top - rect.top;
  return {
    minX,
    maxX: Math.max(minX, offset.x + area.right - rect.right),
    minY,
    maxY: Math.max(minY, offset.y + area.bottom - rect.bottom),
  };
}

function move(target: HTMLElement, position: Offset, limits: Limits): Offset {
  const x = Math.max(limits.minX, Math.min(limits.maxX, position.x));
  const y = Math.max(limits.minY, Math.min(limits.maxY, position.y));
  target.style.translate = x || y ? `${x}px ${y}px` : "";
  return { x, y };
}

function setSize(element: HTMLElement, size?: PanelSize) {
  element.style.width = size ? `${size.width}px` : "";
  element.style.height = size ? `${size.height}px` : "";
  element.dataset.panelSized = String(Boolean(size));
}

export function MapPanelHandle({ label, position = origin, size, expanded, corner, maxWidth = 560, onPositionChange, onSizeChange, onActivate }: {
  label: string;
  position?: Offset;
  size?: PanelSize;
  expanded: boolean;
  corner: ResizeCorner;
  maxWidth?: number;
  onPositionChange: (position: Offset) => void;
  onSizeChange: (size?: PanelSize) => void;
  onActivate: () => void;
}) {
  const handle = useRef<HTMLButtonElement>(null);
  const bounds = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLElement | null>(null);
  const offset = useRef(position);
  const drag = useRef<Drag | null>(null);
  const resize = useRef<Resize | null>(null);

  useLayoutEffect(() => {
    const element = handle.current?.closest<HTMLElement>("[data-map-panel]");
    const area = element?.closest("main")?.querySelector<HTMLElement>("[data-map-drag-bounds]");
    if (!element || !area) return;
    panel.current = element;
    bounds.current = area;
    offset.current = position;
    const { x, y } = position;
    element.style.translate = x || y ? `${x}px ${y}px` : "";

    const constrain = () => {
      if (resize.current) return;
      const limits = getLimits(element, area, offset.current);
      if (!limits) return;
      if (drag.current) drag.current.limits = limits;
      offset.current = move(element, offset.current, limits);
    };

    const applySize = () => {
      if (resize.current) return;
      const available = area.getBoundingClientRect();
      setSize(element, size && expanded ? {
        width: Math.min(size.width, available.width, maxWidth),
        height: Math.min(size.height, available.height),
      } : undefined);
      constrain();
    };
    applySize();
    const observer = new ResizeObserver(constrain);
    const areaObserver = new ResizeObserver(applySize);
    observer.observe(element);
    areaObserver.observe(area);
    return () => {
      observer.disconnect();
      areaObserver.disconnect();
      bounds.current = null;
      panel.current = null;
      drag.current = null;
      resize.current = null;
    };
  }, [position, size, expanded, maxWidth]);

  function start(pointerId: number, x: number, y: number) {
    if (drag.current || !panel.current || !bounds.current) return false;
    const limits = getLimits(panel.current, bounds.current, offset.current);
    if (!limits) return false;
    drag.current = { pointerId, start: { x, y }, offset: offset.current, limits };
    return true;
  }

  function follow(pointerId: number, x: number, y: number) {
    const current = drag.current;
    if (!current || current.pointerId !== pointerId || !panel.current) return;
    offset.current = move(panel.current, {
      x: current.offset.x + x - current.start.x,
      y: current.offset.y + y - current.start.y,
    }, current.limits);
  }

  function end(pointerId: number) {
    if (drag.current?.pointerId !== pointerId) return;
    drag.current = null;
    onPositionChange(offset.current);
  }

  function moveByKey(key: string) {
    const delta = keyboardOffsets[key];
    if ((!delta && key !== "Home") || !panel.current || !bounds.current) return false;
    const limits = getLimits(panel.current, bounds.current, offset.current);
    if (!limits) return false;
    const { x, y } = offset.current;
    offset.current = move(panel.current, delta ? { x: x + delta.x, y: y + delta.y } : origin, limits);
    onPositionChange(offset.current);
    return true;
  }

  function beginResize(pointerId: number, x: number, y: number) {
    if (!panel.current || !bounds.current || resize.current || drag.current) return false;
    resize.current = {
      pointerId,
      start: { x, y },
      rect: panel.current.getBoundingClientRect(),
      area: bounds.current.getBoundingClientRect(),
      west: corner === "left",
      north: corner === "top-right" || (corner === "left" && !window.matchMedia("(min-width: 64rem)").matches),
    };
    return true;
  }

  function resizeBy(delta: Offset) {
    const current = resize.current;
    const target = panel.current;
    if (!current || !target || !bounds.current) return;

    const { rect, area, west, north } = current;
    const widthLimit = Math.min(maxWidth, west ? rect.right - area.left : area.right - rect.left);
    const heightLimit = north ? rect.bottom - area.top : area.bottom - rect.top;
    const width = Math.min(widthLimit, Math.max(272, rect.width + (west ? -delta.x : delta.x)));
    const height = Math.min(heightLimit, Math.max(120, rect.height + (north ? -delta.y : delta.y)));
    setSize(target, { width, height });

    const next = target.getBoundingClientRect();
    const x = offset.current.x + (west ? rect.right - next.right : rect.left - next.left);
    const y = offset.current.y + (north ? rect.bottom - next.bottom : rect.top - next.top);
    const limits = getLimits(target, bounds.current, offset.current);
    if (limits) offset.current = move(target, { x, y }, limits);
  }

  function endResize(pointerId: number) {
    if (resize.current?.pointerId !== pointerId || !panel.current) return;
    const initial = resize.current.rect;
    resize.current = null;
    const rect = panel.current.getBoundingClientRect();
    if (rect.width === initial.width && rect.height === initial.height) {
      setSize(panel.current, size);
      return;
    }
    onPositionChange(offset.current);
    onSizeChange({ width: rect.width, height: rect.height });
  }

  const resizeCorner = {
    "bottom-right": "right-0.5 bottom-0.5 size-6 cursor-nwse-resize",
    "top-right": "right-0.5 top-0.5 cursor-nesw-resize",
    left: "left-0.5 top-0.5 cursor-nwse-resize lg:top-auto lg:bottom-0.5 lg:cursor-nesw-resize",
  }[corner];

  return (
    <>
    <button ref={handle} type="button" aria-label={label} aria-describedby="map-panel-drag-help" title={label}
      className="grid h-10 w-11 shrink-0 touch-none cursor-grab select-none place-items-center rounded-lg text-[color:var(--fleet-muted)] hover:bg-[var(--fleet-quiet)] active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-[var(--fleet-focus)]"
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0) return;
        if (!start(event.pointerId, event.clientX, event.clientY)) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        onActivate();
      }}
      onPointerMove={(event) => follow(event.pointerId, event.clientX, event.clientY)}
      onLostPointerCapture={(event) => end(event.pointerId)}
      onKeyDown={(event) => {
        if (!moveByKey(event.key)) return;
        event.preventDefault();
        onActivate();
      }}>
      <svg aria-hidden="true" width="16" height="18" viewBox="0 0 16 18" fill="currentColor">
        <circle cx="5.5" cy="4" r="1.25" /><circle cx="10.5" cy="4" r="1.25" />
        <circle cx="5.5" cy="9" r="1.25" /><circle cx="10.5" cy="9" r="1.25" />
        <circle cx="5.5" cy="14" r="1.25" /><circle cx="10.5" cy="14" r="1.25" />
      </svg>
    </button>
    {expanded && (
      <button type="button" aria-label={label.replace("ย้าย", "ปรับขนาด")} title="ลากเพื่อปรับขนาดแผง"
        aria-describedby="map-panel-resize-help"
        className={`absolute z-10 grid touch-none select-none place-items-center rounded-lg bg-[var(--fleet-surface)] text-[color:var(--fleet-muted)] hover:text-[color:var(--fleet-accent)] focus-visible:outline-2 focus-visible:outline-[var(--fleet-focus)] ${corner === "bottom-right" ? "size-6" : "size-8"} ${resizeCorner}`}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0 || !beginResize(event.pointerId, event.clientX, event.clientY)) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          onActivate();
        }}
        onPointerMove={(event) => {
          const current = resize.current;
          if (current?.pointerId !== event.pointerId) return;
          resizeBy({ x: event.clientX - current.start.x, y: event.clientY - current.start.y });
        }}
        onLostPointerCapture={(event) => endResize(event.pointerId)}
        onKeyDown={(event) => {
          if (event.key === "Home") {
            event.preventDefault();
            onSizeChange(undefined);
            onPositionChange(origin);
          } else if (keyboardOffsets[event.key] && beginResize(-1, 0, 0)) {
            event.preventDefault();
            onActivate();
            resizeBy(keyboardOffsets[event.key]);
            endResize(-1);
          }
        }}>
        <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className={corner === "top-right" ? "-rotate-90" : corner === "left" ? "rotate-180 lg:rotate-90" : ""}>
          <path d="M7 17 17 7m-5 11 6-6" />
        </svg>
      </button>
    )}
    </>
  );
}

export function MapPanelCollapse({ panelName, controls, expanded, onToggle }: {
  panelName: string;
  controls: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const label = `${expanded ? "ย่อ" : "ขยาย"}แผง${panelName}`;
  return (
    <button type="button" aria-label={label} title={label} aria-expanded={expanded} aria-controls={controls} onClick={onToggle}
      className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg text-[color:var(--fleet-muted)] hover:bg-[var(--fleet-quiet)] focus-visible:outline-2 focus-visible:outline-[var(--fleet-focus)]">
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d={expanded ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} />
      </svg>
    </button>
  );
}
