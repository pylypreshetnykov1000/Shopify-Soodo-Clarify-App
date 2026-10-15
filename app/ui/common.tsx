import { Link, useLocation } from "react-router";
import type { ReactNode } from "react";
export function AppLink({
  to,
  children,
  className,
  current,
}: {
  to: string;
  children: ReactNode;
  className?: string;
  current?: boolean;
}) {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const retained = new URLSearchParams();
  for (const key of ["shop", "host", "embedded"])
    if (params.has(key)) retained.set(key, params.get(key)!);
  const [path, hash] = to.split("#");
  return (
    <Link
      to={`${path}${retained.size ? `${path.includes("?") ? "&" : "?"}${retained}` : ""}${hash ? `#${hash}` : ""}`}
      className={className}
      aria-current={current ? "page" : undefined}
    >
      {children}
    </Link>
  );
}
export function Notice({
  result,
}: {
  result?: { ok: boolean; message: string };
}) {
  return result ? (
    <div
      className={`notice ${result.ok ? "success" : "error"}`}
      role={result.ok ? "status" : "alert"}
    >
      {result.message}
    </div>
  ) : null;
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Icon({
  name,
  size = 20,
}: {
  name:
    | "grid"
    | "box"
    | "history"
    | "settings"
    | "arrow"
    | "check"
    | "spark"
    | "search"
    | "leaf";
  size?: number;
}) {
  const paths = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    box: <path d="m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5M12 13v9M7 5.8l9 5" />,
    history: <path d="M3 10a9 9 0 1 1 2 8M3 4v6h6M12 7v5l3 2" />,
    settings: (
      <>
        <path d="M4 7h16M4 17h16" />
        <circle cx="9" cy="7" r="3" />
        <circle cx="15" cy="17" r="3" />
      </>
    ),
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    check: <path d="m5 12 4 4L19 6" />,
    spark: (
      <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z" />
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    leaf: <path d="M20 4C8 2 2 9 6 16c7 5 15-2 14-12ZM4 21l11-11" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
