export default function RouteVisual() {
  return (
    <div
      className="relative mx-auto mt-4 h-[clamp(13rem,28vh,20rem)] w-full max-w-[40rem] overflow-hidden rounded-[var(--fleet-radius)] soft-inset border border-[var(--fleet-line)] bg-[linear-gradient(145deg,#f8f9fb,#e5eaf1)]"
      aria-hidden="true"
    >
      <div className="absolute inset-x-4 top-4 z-10 flex justify-between font-mono text-[9px] font-semibold tracking-[.14em] text-[color:var(--fleet-muted)]">
        <span>NETWORK VIEW</span>
        <span>01 — 04</span>
      </div>
      <div className="absolute inset-x-0 bottom-0 top-[15%] bg-[linear-gradient(rgba(106,124,148,0.17)_1px,transparent_1px),linear-gradient(90deg,rgba(106,124,148,0.17)_1px,transparent_1px)] bg-[size:2.2rem_2.2rem] [mask-image:linear-gradient(to_bottom,transparent,white_25%,white_75%,transparent)] [transform:perspective(500px)_rotateX(58deg)_scale(1.5)] [transform-origin:center_bottom]" />
      <svg
        className="absolute inset-0 size-full overflow-visible"
        viewBox="0 0 660 410"
        fill="none"
      >
        <defs>
          <linearGradient
            id="auth-route-flow"
            x1="0%"
            x2="100%"
            y1="0%"
            y2="0%"
          >
            <stop stopColor="var(--fleet-signal)" />
            <stop offset="1" stopColor="var(--fleet-accent)" />
          </linearGradient>
        </defs>
        <path
          className="stroke-[var(--fleet-signal)]/10 [stroke-width:13]"
          d="M82 291 191 232 286 275 385 218 472 255 578 193"
        />
        <path
          stroke="url(#auth-route-flow)"
          className="[stroke-dasharray:5_8] [stroke-linecap:round] [stroke-width:2] motion-safe:animate-[route-flow_8s_linear_infinite]"
          d="M82 291 191 232 286 275 385 218 472 255 578 193"
        />
        <path
          className="stroke-[#71839a]/70 [stroke-dasharray:3_8] [stroke-linecap:round] [stroke-width:1]"
          d="m191 232 18-90 106-56 92 37-22 95m-99 57 38 73 109 22 39-59"
        />
        <path
          className="stroke-[#71839a]/70 [stroke-dasharray:3_8] [stroke-linecap:round] [stroke-width:1]"
          d="m385 218 49-95 110-13 34 83"
        />
        <ellipse
          cx="324"
          cy="332"
          rx="38"
          ry="11"
          fill="var(--fleet-signal)"
          fillOpacity=".12"
        />
        <g
          className="motion-safe:animate-[truck-float_4.5s_ease-in-out_infinite]"
          transform="translate(298 282)"
        >
          <path d="m0 10 28-16 44 14-28 17L0 10Z" fill="var(--fleet-signal)" />
          <path d="M0 10v23l44 16V25L0 10Z" fill="#ae3646" />
          <path d="m44 25 28-17v23L44 49V25Z" fill="#f89595" />
          <path d="m8 9 20-11 29 10-20 12L8 9Z" fill="#4b586b" />
          <path d="m8 33 9 3v7l-9-3v-7Zm31 11 9 3v7l-9-3v-7Z" fill="#383f4a" />
        </g>
        {[
          { x: 82, y: 291 },
          { x: 191, y: 232 },
          { x: 286, y: 275 },
          { x: 385, y: 218 },
          { x: 472, y: 255 },
          { x: 578, y: 193 },
        ].map((point, index) => (
          <g key={index}>
            <circle
              cx={point.x}
              cy={point.y}
              r={index === 3 ? 13 : 8}
              fill="var(--fleet-signal)"
              fillOpacity={index === 3 ? ".14" : ".1"}
            />
            <circle
              cx={point.x}
              cy={point.y}
              r={index === 3 ? 4 : 3}
              fill={index === 3 ? "var(--fleet-accent)" : "#7a899d"}
            />
          </g>
        ))}
        <circle
          className="origin-center stroke-[var(--fleet-signal)] [stroke-width:1] motion-safe:animate-[destination-pulse_2.8s_ease-out_infinite]"
          cx="578"
          cy="193"
          r="16"
        />
      </svg>
      <div className="absolute bottom-4 left-4 flex items-center gap-2 font-mono text-[9px] font-semibold tracking-[.1em] text-[color:var(--fleet-text)]">
        <span className="size-1.5 rounded-full bg-[var(--fleet-signal)]" />{" "}
        ROUTE NETWORK{" "}
        <b className="ml-1 font-medium text-[color:var(--fleet-muted)]">TH</b>
      </div>
      <div className="absolute bottom-4 right-4 font-mono text-[9px] text-[color:var(--fleet-muted)]">
        13°45&apos;N&nbsp;&nbsp; 100°31&apos;E
      </div>
    </div>
  );
}
