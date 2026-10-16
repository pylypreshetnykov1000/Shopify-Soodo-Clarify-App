import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

/* Readiness charts. Plain SVG/HTML, sized to their container, following the
   app's chart spec: 2px line, ~10% area wash, hairline solid grid, endpoint
   label only, crosshair tooltip on hover and keyboard, and a table twin. */

export type TrendPoint = {
  day: string;
  readiness: number;
  ready: number;
  active: number;
  fixes: number;
};

const formatDay = (day: string, withYear = false) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });

function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.round(entry.contentRect.width)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const HEIGHT = 196;
const M = { top: 16, right: 40, bottom: 28, left: 34 };

export function TrendChart({
  points,
  label,
}: {
  points: TrendPoint[];
  label: string;
}) {
  const [wrap, width] = useWidth<HTMLDivElement>(640);
  const [active, setActive] = useState<number | null>(null);
  const plotW = Math.max(120, width - M.left - M.right);
  const plotH = HEIGHT - M.top - M.bottom;
  const times = points.map((p) => Date.parse(`${p.day}T00:00:00Z`));
  const t0 = times[0] ?? 0;
  const t1 = times[times.length - 1] ?? 0;
  const x = (i: number) =>
    M.left +
    (points.length < 2
      ? plotW / 2
      : ((times[i] - t0) / Math.max(1, t1 - t0)) * plotW);
  const y = (value: number) => M.top + (1 - value / 100) * plotH;
  const line = points
    .map(
      (p, i) =>
        `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.readiness).toFixed(1)}`,
    )
    .join("");
  const area =
    points.length > 1
      ? `${line}L${x(points.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`
      : "";
  const last = points.length - 1;
  const first = points[0];
  const end = points[last];

  const nearest = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left;
    let best = 0;
    for (let i = 1; i < points.length; i++)
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    return best;
  };
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) =>
    setActive(
      nearest(event.clientX, event.currentTarget.getBoundingClientRect()),
    );
  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (!points.length) return;
    const current = active ?? last;
    const next =
      event.key === "ArrowLeft"
        ? Math.max(0, current - 1)
        : event.key === "ArrowRight"
          ? Math.min(last, current + 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
  };
  const summary =
    points.length > 1
      ? `${label}: ${first.readiness} on ${formatDay(first.day)}, ${end.readiness} on ${formatDay(end.day)}.`
      : points.length
        ? `${label}: ${end.readiness} on ${formatDay(end.day)}.`
        : `${label}: no readings yet.`;
  const shown = active !== null ? points[active] : null;

  return (
    <div className="trend" ref={wrap}>
      <svg
        // Fluid until the container is measured: the viewBox scales the
        // drawing down instead of letting it overflow on small screens.
        width="100%"
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label={summary}
        tabIndex={points.length ? 0 : -1}
        onPointerMove={points.length ? onPointerMove : undefined}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive(last)}
        onBlur={() => setActive(null)}
        onKeyDown={onKeyDown}
      >
        {[0, 50, 100].map((tick) => (
          <g key={tick}>
            <line
              className="grid"
              x1={M.left}
              x2={M.left + plotW}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text
              className="tick"
              x={M.left - 8}
              y={y(tick)}
              dy="0.32em"
              textAnchor="end"
            >
              {tick}
            </text>
          </g>
        ))}
        {points.length > 1 && (
          <>
            <path className="trend-area" d={area} />
            <path className="trend-line" d={line} pathLength={1} />
            <text className="tick" x={x(0)} y={HEIGHT - 8} textAnchor="start">
              {formatDay(first.day)}
            </text>
            <text className="tick" x={x(last)} y={HEIGHT - 8} textAnchor="end">
              {formatDay(end.day)}
            </text>
          </>
        )}
        {end && (
          <>
            <circle
              className="trend-dot"
              cx={x(last)}
              cy={y(end.readiness)}
              r={5}
            />
            <text
              className="trend-end"
              x={x(last) + 10}
              y={y(end.readiness)}
              dy="0.32em"
            >
              {end.readiness}
            </text>
          </>
        )}
        {shown && active !== null && (
          <g className="crosshair" aria-hidden="true">
            <line x1={x(active)} x2={x(active)} y1={M.top} y2={M.top + plotH} />
            <circle
              className="trend-dot"
              cx={x(active)}
              cy={y(shown.readiness)}
              r={5}
            />
          </g>
        )}
      </svg>
      {shown && active !== null && (
        <div
          className="chart-tooltip"
          role="status"
          style={{
            left: Math.min(Math.max(x(active), 80), width - 80),
            top: Math.max(0, y(shown.readiness) - 64),
          }}
        >
          <strong>{formatDay(shown.day, true)}</strong>
          <span>
            Readiness <b>{shown.readiness}</b>
          </span>
          <span>
            {shown.ready} of {shown.active} fully ready · {shown.fixes} fixes
            open
          </span>
        </div>
      )}
      {/* A table ignores the 1px sr-only width, so a wrapper clips it instead. */}
      <div className="sr-only">
        <table>
          <caption>{label}</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Readiness</th>
              <th scope="col">Fully ready products</th>
              <th scope="col">Fixes open</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.day}>
                <td>{formatDay(p.day, true)}</td>
                <td>{p.readiness}</td>
                <td>
                  {p.ready} of {p.active}
                </td>
                <td>{p.fixes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Ordered readiness bands, darkest = strongest (validated ordinal ramp). */
export const BANDS = [
  {
    key: "strong",
    label: "Strong",
    range: "90–100",
    min: 90,
    color: "#1d5a44",
  },
  { key: "good", label: "Good", range: "70–89", min: 70, color: "#357659" },
  { key: "fair", label: "Fair", range: "50–69", min: 50, color: "#5f9c7d" },
  { key: "weak", label: "Weak", range: "0–49", min: 0, color: "#93bda7" },
] as const;

export function Distribution({ values }: { values: number[] }) {
  const counts = BANDS.map((band, i) => {
    const max = i === 0 ? 101 : BANDS[i - 1].min;
    return values.filter((v) => v >= band.min && v < max).length;
  });
  const top = Math.max(1, ...counts);
  return (
    <ul
      className="distribution-chart"
      aria-label="Active products by readiness band"
    >
      {BANDS.map((band, i) => (
        <li
          key={band.key}
          title={`${counts[i]} product${counts[i] === 1 ? "" : "s"} with readiness ${band.range}`}
        >
          <span className="band-label">
            <strong>{band.label}</strong>
            <small>{band.range}</small>
          </span>
          <span className="band-track">
            {counts[i] > 0 && (
              <span
                className="band-bar"
                // Leave room for the value label at the tip of the longest bar.
                style={{
                  width: `calc((100% - 36px) * ${counts[i] / top})`,
                  background: band.color,
                  animationDelay: `${i * 60}ms`,
                }}
              />
            )}
            <span className="band-value">{counts[i]}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
