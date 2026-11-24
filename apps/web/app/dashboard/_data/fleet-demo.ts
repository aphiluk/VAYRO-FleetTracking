type Position = [longitude: number, latitude: number];

export type VehicleStatus = "moving" | "parked" | "offline";
export type VehicleCategory = "truck" | "car" | "motorcycle";
export type VehicleUsage = "working" | "ready" | "unused" | "unknown";

export const vehicleCategoryLabels: Record<VehicleCategory, string> = {
  truck: "รถบรรทุก",
  car: "รถยนต์",
  motorcycle: "มอเตอร์ไซค์",
};

export type FleetVehicle = {
  id: string;
  plate: string;
  name: string;
  driver: string;
  kind: string;
  category: VehicleCategory;
  area: string;
  status: VehicleStatus;
  usage: VehicleUsage;
  position: Position;
  heading: number;
  speed: number;
  updatedAt: number;
  route: Position[];
};

type VehicleIdentity = Pick<
  FleetVehicle,
  "id" | "plate" | "name" | "driver" | "kind" | "category" | "area" | "usage"
>;

type MovingVehicle = VehicleIdentity & {
  status: "moving";
  route: Position[];
  segments: RouteSegment[];
  routeLength: number;
  phase: number;
  speed: number;
};

type StationaryVehicle = VehicleIdentity & {
  status: "parked" | "offline";
  position: Position;
  heading: number;
};

type RouteSegment = {
  from: Position;
  to: Position;
  length: number;
  heading: number;
};

export const DEMO_CENTER: Position = [100.536, 13.752];

const METERS_PER_DEGREE = 111_195;
const RADIANS_PER_DEGREE = Math.PI / 180;
const OFFLINE_AGE_MS = 14 * 60 * 1_000;

function movingVehicle(
  identity: VehicleIdentity,
  path: [Position, Position, ...Position[]],
  speed: number,
  phase: number,
): MovingVehicle {
  const route = [...path, path[0]];
  const segments = route.slice(1).map((to, index) => {
    const from = route[index];
    const latitude = ((from[1] + to[1]) / 2) * RADIANS_PER_DEGREE;
    const east = (to[0] - from[0]) * Math.cos(latitude) * METERS_PER_DEGREE;
    const north = (to[1] - from[1]) * METERS_PER_DEGREE;

    return {
      from,
      to,
      length: Math.hypot(east, north),
      heading: (Math.atan2(east, north) / RADIANS_PER_DEGREE + 360) % 360,
    };
  });

  return {
    ...identity,
    status: "moving",
    route,
    segments,
    routeLength: segments.reduce(
      (length, segment) => length + segment.length,
      0,
    ),
    speed,
    phase,
  };
}

// These fictional loops provide repeatable motion around Bangkok. They are not navigation routes.
const movingFleet = [
  movingVehicle(
    {
      id: "VY-101",
      plate: "71-3042 กทม.",
      name: "รถขนส่ง 01",
      driver: "ธนา วงศ์ดี",
      kind: "รถบรรทุก 6 ล้อ",
      category: "truck",
      area: "สาทร",
      usage: "working",
    },
    [
      [100.5218, 13.7217],
      [100.5268, 13.7208],
      [100.5353, 13.7238],
      [100.5404, 13.7269],
      [100.537, 13.7339],
      [100.5274, 13.7291],
      [100.5185, 13.7277],
    ],
    38,
    0.31,
  ),
  movingVehicle(
    {
      id: "VY-102",
      plate: "กข 8156 กทม.",
      name: "รถขนส่ง 02",
      driver: "ปกรณ์ ใจดี",
      kind: "รถยนต์",
      category: "car",
      area: "ห้วยขวาง",
      usage: "working",
    },
    [
      [100.5633, 13.7704],
      [100.5712, 13.7667],
      [100.5804, 13.7653],
      [100.5831, 13.7723],
      [100.5751, 13.7761],
      [100.5667, 13.7785],
    ],
    42,
    0.15,
  ),
  movingVehicle(
    {
      id: "VY-103",
      plate: "1 กข 2904 กทม.",
      name: "รถขนส่ง 03",
      driver: "วิทยา ศรีทอง",
      kind: "มอเตอร์ไซค์",
      category: "motorcycle",
      area: "พระโขนง",
      usage: "working",
    },
    [
      [100.5907, 13.704],
      [100.5956, 13.6982],
      [100.6023, 13.6929],
      [100.608, 13.6967],
      [100.6035, 13.7046],
      [100.597, 13.7102],
    ],
    46,
    0.41,
  ),
  movingVehicle(
    {
      id: "VY-104",
      plate: "กจ 6128 กทม.",
      name: "รถขนส่ง 04",
      driver: "ศุภชัย แสงทอง",
      kind: "รถยนต์",
      category: "car",
      area: "บางซื่อ",
      usage: "working",
    },
    [
      [100.527, 13.8074],
      [100.5343, 13.8041],
      [100.5412, 13.8025],
      [100.5443, 13.8096],
      [100.5385, 13.8164],
      [100.5298, 13.8153],
    ],
    36,
    0.7,
  ),
  movingVehicle(
    {
      id: "VY-105",
      plate: "74-3721 กทม.",
      name: "รถขนส่ง 05",
      driver: "กิตติ พูลผล",
      kind: "รถบรรทุก 4 ล้อ",
      category: "truck",
      area: "ป้อมปราบศัตรูพ่าย",
      usage: "working",
    },
    [
      [100.4971, 13.7517],
      [100.5048, 13.751],
      [100.5114, 13.7503],
      [100.51, 13.7447],
      [100.5037, 13.746],
      [100.4965, 13.7468],
    ],
    30,
    0.55,
  ),
];

const stationaryFleet: StationaryVehicle[] = [
  {
    id: "VY-106",
    plate: "75-1640 กทม.",
    name: "รถขนส่ง 06",
    driver: "พีรพล ทองดี",
    kind: "รถบรรทุก 6 ล้อ",
    category: "truck",
    area: "คลองเตย",
    status: "parked",
    usage: "ready",
    position: [100.5648, 13.7107],
    heading: 68,
  },
  {
    id: "VY-107",
    plate: "2 กข 5803 กทม.",
    name: "รถขนส่ง 07",
    driver: "ณัฐพล เมืองดี",
    kind: "มอเตอร์ไซค์",
    category: "motorcycle",
    area: "พระราม 9",
    status: "parked",
    usage: "unused",
    position: [100.5759, 13.7495],
    heading: 122,
  },
  {
    id: "VY-108",
    plate: "กฉ 9061 นนทบุรี",
    name: "รถขนส่ง 08",
    driver: "สมชาย บุญมา",
    kind: "รถยนต์",
    category: "car",
    area: "เมืองนนทบุรี",
    status: "offline",
    usage: "unknown",
    position: [100.5068, 13.842],
    heading: 248,
  },
];

function getMovingPose(
  vehicle: MovingVehicle,
  elapsedSeconds: number,
): Pick<FleetVehicle, "position" | "heading"> {
  const { route, routeLength, phase, segments, speed } = vehicle;
  let remaining =
    (routeLength * phase + (speed / 3.6) * elapsedSeconds) % routeLength;

  for (const { from, to, length, heading } of segments) {
    if (remaining < length) {
      const fraction = remaining / length;
      return {
        position: [
          from[0] + (to[0] - from[0]) * fraction,
          from[1] + (to[1] - from[1]) * fraction,
        ],
        heading,
      };
    }
    remaining -= length;
  }

  return { position: route[0], heading: segments[0].heading };
}

export function getDemoFleet(
  elapsedSeconds: number,
  now: number,
): FleetVehicle[] {
  const elapsed = Number.isFinite(elapsedSeconds)
    ? Math.max(0, elapsedSeconds)
    : 0;

  return [
    ...movingFleet.map(({ segments, routeLength, phase, ...vehicle }) => ({
      ...vehicle,
      ...getMovingPose({ ...vehicle, segments, routeLength, phase }, elapsed),
      updatedAt: now,
    })),
    ...stationaryFleet.map((vehicle) => ({
      ...vehicle,
      speed: 0,
      updatedAt:
        vehicle.status === "offline"
          ? now - Math.round(elapsed * 1_000) - OFFLINE_AGE_MS
          : now,
      route: [],
    })),
  ];
}
