import { useId } from "react";
import type { MapVehicle } from "../_data/map-vehicle";

export const vehicleColors: Record<MapVehicle["status"], string> = {
  moving: "#63bb38",
  parked: "#edac41",
  offline: "#94a3b8",
  current: "#60a5fa",
  delayed: "#94a3b8",
};

const schematicWidth = 900;
const schematicHeight = 540;
const river = "M94-40C118 38 238 62 225 120S160 158 194 221 330 232 325 288 234 346 242 401 371 466 384 518L396 590";
const majorRoads = [
  "M-20 326C117 308 229 311 348 318S622 346 932 251",
  "M399-10C427 103 421 160 416 239S487 374 480 557",
  "M670-10C643 73 615 129 622 180S729 311 736 558",
  "M-12 122C205 94 296 149 437 155S738 123 916 143",
  "M5 468C175 450 304 457 433 470S681 416 915 443",
  "M-5 214C94 220 154 261 251 252S409 193 543 220 739 250 918 194",
  "M298-15C300 87 340 144 341 244S358 457 303 555",
  "M804-15C755 144 841 201 824 317S818 456 848 563",
];
const minorRoads = [
  "M18 0Q31 160 72 319T46 545", "M99 0Q82 189 110 326T124 550",
  "M157 0Q170 120 131 271T174 550", "M244 0Q267 135 250 249T211 550",
  "M362 0Q347 112 376 281T371 550", "M470 0Q478 168 498 304T532 550",
  "M538 0Q533 169 558 327T609 550", "M588 0Q561 129 589 265T668 550",
  "M716 0Q660 137 698 279T795 550", "M875 0Q864 168 864 350T883 550",
  "M0 43Q239 36 465 58T912 53", "M0 80Q194 52 452 113T912 80",
  "M0 178Q250 154 475 186T910 179", "M0 259Q248 229 487 265T910 235",
  "M0 291Q243 275 479 293T910 283", "M0 365Q237 341 464 365T912 329",
  "M0 398Q235 374 492 399T910 369", "M0 435Q234 418 470 438T910 411",
  "M0 502Q235 480 491 511T910 478", "M0 530Q223 509 451 537T911 513",
];

function project([longitude, latitude]: [number, number]) {
  return [
    ((longitude - 100.468) / 0.165) * schematicWidth,
    ((13.865 - latitude) / 0.197) * schematicHeight,
  ];
}

type FleetMapSchematicProps = {
  vehicles: MapVehicle[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  theme: "light" | "dark";
};

export default function FleetMapSchematic({ vehicles, selectedId, onSelect, theme }: FleetMapSchematicProps) {
  const cityGridId = useId();
  const isDark = theme === "dark";
  const selectedRoute = vehicles.find(({ id }) => id === selectedId)?.route;
  const roadEdge = isDark ? "#3a4351" : "#cbd4e0";
  const roadFill = isDark ? "#495465" : "#f8f9fb";

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ backgroundColor: isDark ? "#242a33" : "#e7ecf2" }}>
      <svg className="absolute inset-0 size-full" viewBox={`0 0 ${schematicWidth} ${schematicHeight}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <pattern id={cityGridId} width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M0 24V0H24" fill="none" stroke={roadEdge} strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${cityGridId})`} />
        <path d="M387 207L409 203 412 233 390 237ZM582 382L626 378 640 418 594 429ZM61 360L118 346 131 371 81 390ZM712 27L778 22 779 67 735 78Z" fill={isDark ? "#25483c" : "#c9dfc5"} />
        {minorRoads.map((path) => <path key={path} d={path} fill="none" stroke={roadFill} strokeWidth="1.6" />)}
        <path d={river} fill="none" stroke={isDark ? "#234a60" : "#b0d6e8"} strokeWidth="35" />
        {majorRoads.map((path) => <path key={`${path}-edge`} d={path} fill="none" stroke={roadEdge} strokeWidth="6" />)}
        {majorRoads.map((path) => <path key={path} d={path} fill="none" stroke={roadFill} strokeWidth="3" />)}
        {selectedRoute && selectedRoute.length > 1 && (
          <polyline points={selectedRoute.map((position) => project(position).join(",")).join(" ")} fill="none" stroke={"var(--fleet-signal)"} strokeWidth="3" strokeLinejoin="round" strokeDasharray="6 4" />
        )}
      </svg>
      <span className="pointer-events-none absolute left-[48%] top-[48%] -translate-x-1/2 whitespace-nowrap text-sm font-bold" style={{ color: isDark ? "#b7bfcc" : "#535d6b" }}>กรุงเทพมหานคร</span>
      {vehicles.map((vehicle) => {
        const [x, y] = project(vehicle.position);
        const selected = vehicle.id === selectedId;
        return (
          <button
            key={vehicle.id}
            type="button"
            className="absolute grid size-10 -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fleet-focus)]"
            style={{ left: `${x / schematicWidth * 100}%`, top: `${y / schematicHeight * 100}%`, zIndex: selected ? 2 : 1 }}
            aria-label={`เลือก ${vehicle.name} ${vehicle.plate}`}
            aria-pressed={selected}
            onClick={() => onSelect(vehicle.id)}
          >
            <span className="grid size-7 place-items-center rounded-full border-2 border-white text-[13px] font-black text-[#1a2820] shadow-md" style={{ backgroundColor: vehicleColors[vehicle.status] }}>
              <span aria-hidden="true" style={{ rotate: vehicle.status === "moving" ? `${vehicle.heading}deg` : undefined }}>{vehicle.status === "moving" ? "↑" : "•"}</span>
            </span>
            {selected && <span className="absolute bottom-full whitespace-nowrap rounded-md border border-[var(--fleet-line)] bg-[var(--fleet-surface)] px-2 py-1 font-mono text-xs font-bold text-[color:var(--fleet-text)] shadow-md">{vehicle.id}</span>}
          </button>
        );
      })}
    </div>
  );
}
