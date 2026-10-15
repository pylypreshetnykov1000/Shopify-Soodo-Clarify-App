import { Link, useLocation } from "react-router";
import type { ReactNode } from "react";
import { CountUp, Toast } from "./motion";

/** Links keep Shopify's embedded query parameters so App Bridge stays connected. */
export function useAppHref(to: string) {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const retained = new URLSearchParams();
  for (const key of ["shop", "host", "embedded"])
    if (params.has(key)) retained.set(key, params.get(key)!);
  const [path, hash] = to.split("#");
  return `${path}${retained.size ? `${path.includes("?") ? "&" : "?"}${retained}` : ""}${hash ? `#${hash}` : ""}`;
}
export function AppLink({
  to,
  children,
  className,
  current,
  label,
}: {
  to: string;
  children: ReactNode;
  className?: string;
  current?: boolean;
  label?: string;
}) {
  return (
    <Link
      to={useAppHref(to)}
      className={className}
      aria-current={current ? "page" : undefined}
      aria-label={label}
      prefetch="intent"
      viewTransition
    >
      {children}
    </Link>
  );
}
export function ExternalLink({
  href,
  children,
  className = "text-link",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <Icon name="external" size={12} />
    </a>
  );
}
export function Notice({
  result,
  tone,
  children,
}: {
  result?: { ok: boolean; message: string } | null;
  tone?: "info" | "success" | "error";
  children?: ReactNode;
}) {
  if (!result && !children) return null;
  const kind = tone ?? (result ? (result.ok ? "success" : "error") : "info");
  // Success is transient feedback; errors and guidance stay in place.
  if (result?.ok && !tone) return <Toast key={toastKey(result)} message={result.message} />;
  return (
    <div
      className={`notice ${kind}`}
      role={kind === "error" ? "alert" : "status"}
      key={result?.message}
    >
      <Icon name={kind === "success" ? "check" : kind === "error" ? "alert" : "info"} size={16} />
      <div>{result?.message ?? children}</div>
    </div>
  );
}
const toastKeys = new WeakMap<object, number>();
let toastCount = 0;
function toastKey(result: object) {
  if (!toastKeys.has(result)) toastKeys.set(result, ++toastCount);
  return toastKeys.get(result);
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "critical" | "info";
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export const PRIORITY_LABEL = { high: "High", medium: "Medium", low: "Low" } as const;
export function Mark({
  kind,
  label,
}: {
  kind: "high" | "medium" | "low" | "pass" | "unknown";
  label?: string;
}) {
  return (
    <span
      className={`mark ${kind}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
export function Priority({ level }: { level: "high" | "medium" | "low" }) {
  return (
    <span className="priority">
      <Mark kind={level} />
      {PRIORITY_LABEL[level]} priority
    </span>
  );
}
export const scoreTone = (score: number) =>
  score >= 80 ? "" : score >= 50 ? "medium" : "high";
export function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div
      className={`meter ${scoreTone(value)}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label={label}
    >
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
export function Dial({ value, label }: { value: number; label: string }) {
  const radius = 27;
  const circumference = 2 * Math.PI * radius;
  return (
    <div
      className={`dial ${scoreTone(value)}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label={label}
    >
      <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
        <circle className="track" cx="32" cy="32" r={radius} />
        <circle
          className="value"
          cx="32"
          cy="32"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 100)}
          style={{ ["--circumference" as string]: circumference }}
        />
      </svg>
      <span>
        <CountUp value={value} />
      </span>
    </div>
  );
}
export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}
export function Thumb({
  image,
  large,
}: {
  image: { url: string } | null;
  large?: boolean;
}) {
  return (
    <span className={`thumb${large ? " large" : ""}`}>
      {image ? (
        <img src={image.url} alt="" loading="lazy" width={large ? 56 : 38} height={large ? 56 : 38} />
      ) : (
        <Icon name="box" size={large ? 22 : 17} />
      )}
    </span>
  );
}
export function formatDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)} UTC`;
}
const ICONS = {
  grid: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" />
    </>
  ),
  box: <path d="m12 3 8.5 4.5v9L12 21l-8.5-4.5v-9zM3.5 7.5 12 12l8.5-4.5M12 12v9" />,
  list: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  history: <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6M3.5 4v4.5H8M12 7.5V12l3 2" />,
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  back: <path d="M19 12H5m5 5-5-5 5-5" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5.5M12 16.5h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.5h.01" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 5 5" />
    </>
  ),
  refresh: <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4h-4" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5S9.6 5.9 12 3.5" />
    </>
  ),
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  pause: <path d="M9 6v12M15 6v12" />,
} as const;
export type IconName = keyof typeof ICONS;
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      className={name === "chevron" ? "chevron" : undefined}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}
