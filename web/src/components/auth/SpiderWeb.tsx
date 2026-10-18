/**
 * The sign-in hero: one web, one node per property on the outer ring, signals travelling
 * inward to Spider at the centre. Geometry is computed once at module load (deterministic,
 * so server and client render the same markup). Motion lives in globals.css (`.web-*`) and
 * stops under prefers-reduced-motion.
 */
const C = 300;
const SPOKES = 16;
const RINGS = [62, 118, 178, 244];
const r2 = (n: number) => Math.round(n * 100) / 100;
const angle = (i: number) => (i / SPOKES) * Math.PI * 2 - Math.PI / 2;
const at = (r: number, a: number) =>
  [r2(C + r * Math.cos(a)), r2(C + r * Math.sin(a))] as const;

const spokes = Array.from({ length: SPOKES }, (_, i) => {
  const [x, y] = at(RINGS[RINGS.length - 1] + 26, angle(i));
  return `M${x} ${y}L${C} ${C}`;
});

// each ring sags between spokes like real silk: quadratic curve pulled toward the centre
const rings = RINGS.map((r) => {
  let d = "";
  for (let i = 0; i < SPOKES; i++) {
    const [x1, y1] = at(r, angle(i));
    const [x2, y2] = at(r, angle(i + 1));
    const [cx, cy] = at(r * 0.9, angle(i + 0.5));
    d += `${i === 0 ? `M${x1} ${y1}` : ""}Q${cx} ${cy} ${x2} ${y2}`;
  }
  return `${d}Z`;
});

const nodes = Array.from({ length: SPOKES }, (_, i) =>
  at(RINGS[RINGS.length - 1], angle(i)),
);

// a handful of spokes carry a signal, staggered so it never pulses in unison
const PULSES = [
  { spoke: 1, delay: 2.2, dur: 3.4 },
  { spoke: 4, delay: 3.1, dur: 4.1 },
  { spoke: 7, delay: 2.6, dur: 3.7 },
  { spoke: 10, delay: 4.0, dur: 3.2 },
  { spoke: 12, delay: 3.5, dur: 4.4 },
  { spoke: 15, delay: 2.9, dur: 3.9 },
];

const vars = (v: Record<string, string>) => v as React.CSSProperties;

export function SpiderWeb({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 600" className={className} aria-hidden fill="none">
      <defs>
        <radialGradient id="web-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--auth-signal)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--auth-signal)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g stroke="var(--auth-thread)" strokeWidth="1" strokeLinecap="round">
        {spokes.map((d, i) => (
          <path
            key={`s${i}`}
            d={d}
            pathLength={1}
            className="web-thread"
            style={vars({ "--d": `${0.03 * i}s` })}
          />
        ))}
        {rings.map((d, i) => (
          <path
            key={`r${i}`}
            d={d}
            pathLength={1}
            className="web-thread"
            style={vars({ "--d": `${0.5 + 0.18 * i}s` })}
          />
        ))}
      </g>
      <g stroke="var(--auth-signal)" strokeWidth="2" strokeLinecap="round">
        {PULSES.map((p) => (
          <path
            key={p.spoke}
            d={spokes[p.spoke]}
            pathLength={1}
            className="web-pulse"
            style={vars({ "--d": `${p.delay}s`, "--t": `${p.dur}s` })}
          />
        ))}
      </g>
      {nodes.map(([x, y], i) => (
        <circle
          key={`n${i}`}
          cx={x}
          cy={y}
          r={i % 5 === 0 ? 4 : 2.6}
          fill={i % 5 === 0 ? "var(--auth-signal)" : "var(--auth-node)"}
          className="web-node"
          style={vars({ "--d": `${1.3 + 0.04 * i}s` })}
        />
      ))}
      <circle cx={C} cy={C} r="54" fill="url(#web-core)" className="web-core" />
      <circle
        cx={C}
        cy={C}
        r="7"
        fill="var(--auth-signal)"
        className="web-node"
        style={vars({ "--d": "1.2s" })}
      />
    </svg>
  );
}

/** Small brand mark: the same web, reduced to three rings and eight spokes. */
export function SpiderMark({ className = "h-7 w-7" }: { className?: string }) {
  const s = 8;
  const pt = (r: number, i: number) => {
    const a = (i / s) * Math.PI * 2 - Math.PI / 2;
    return `${r2(16 + r * Math.cos(a))} ${r2(16 + r * Math.sin(a))}`;
  };
  const ring = (r: number) =>
    `M${Array.from({ length: s }, (_, i) => pt(r, i)).join("L")}Z`;
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden fill="none">
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
      <g stroke="white" strokeWidth="1.2" strokeLinejoin="round" opacity="0.95">
        {Array.from({ length: s }, (_, i) => (
          <path key={i} d={`M16 16L${pt(12, i)}`} opacity="0.55" />
        ))}
        <path d={ring(5)} />
        <path d={ring(9.5)} opacity="0.7" />
      </g>
      <circle cx="16" cy="16" r="2" fill="white" />
    </svg>
  );
}
