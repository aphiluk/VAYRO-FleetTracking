import type { DriverJob, RouteCoordinate } from "./driver-demo";

export const demoDriveDurationMs = 75_000;
type Maneuver = "straight" | "left" | "right" | "arrived";

export type DriverNavigation = {
  position: RouteCoordinate;
  bearing: number;
  maneuver: Maneuver;
  maneuverDistanceKm: number;
  remainingKm: number;
  remainingMinutes: number;
};

type RouteSegment = {
  from: RouteCoordinate;
  to: RouteCoordinate;
  length: number;
  end: number;
  bearing: number;
};

function timeInMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function buildDemoNavigation(job: DriverJob) {
  const route = [job.pickup.coordinate, ...job.via, job.delivery.coordinate];
  const segments: RouteSegment[] = [];
  let length = 0;
  for (let index = 1; index < route.length; index++) {
    const from = route[index - 1];
    const to = route[index];
    // Use local longitudinal scaling to weight the synthetic route segments.
    const east = (to[0] - from[0]) * Math.cos(((from[1] + to[1]) / 2) * Math.PI / 180);
    const north = to[1] - from[1];
    const segmentLength = Math.hypot(east, north);
    if (segmentLength === 0) continue;
    length += segmentLength;
    segments.push({ from, to, length: segmentLength, end: length, bearing: Math.atan2(east, north) * 180 / Math.PI });
  }
  const tripMinutes = (timeInMinutes(job.delivery.time) - timeInMinutes(job.pickup.time) + 1440) % 1440;
  return { segments, length, tripMinutes, distanceKm: job.distanceKm, destination: job.delivery.coordinate };
}

export function sampleDemoNavigation(route: ReturnType<typeof buildDemoNavigation>, elapsedMs: number): DriverNavigation {
  const progress = Math.min(1, Math.max(0, elapsedMs / demoDriveDurationMs));
  const lastSegment = route.segments.at(-1);
  if (progress === 1 || !lastSegment) {
    return { position: route.destination, bearing: lastSegment?.bearing ?? 0, maneuver: "arrived", maneuverDistanceKm: 0, remainingKm: 0, remainingMinutes: 0 };
  }

  const travelled = progress * route.length;
  const nextIndex = route.segments.findIndex((segment) => segment.end > travelled);
  const index = nextIndex === -1 ? route.segments.length - 1 : nextIndex;
  const segment = route.segments[index];
  const ratio = Math.min(1, 1 - (segment.end - travelled) / segment.length);
  const position: RouteCoordinate = [
    segment.from[0] + (segment.to[0] - segment.from[0]) * ratio,
    segment.from[1] + (segment.to[1] - segment.from[1]) * ratio,
  ];

  let maneuver: Maneuver = "straight";
  let nextPoint = route.length;
  for (let step = index; step < route.segments.length - 1; step++) {
    const delta = (route.segments[step + 1].bearing - route.segments[step].bearing + 540) % 360 - 180;
    if (Math.abs(delta) < 25) continue;
    maneuver = delta > 0 ? "right" : "left";
    nextPoint = route.segments[step].end;
    break;
  }

  return {
    position,
    bearing: segment.bearing,
    maneuver,
    maneuverDistanceKm: (nextPoint - travelled) / route.length * route.distanceKm,
    remainingKm: (1 - progress) * route.distanceKm,
    remainingMinutes: Math.ceil((1 - progress) * route.tripMinutes),
  };
}
