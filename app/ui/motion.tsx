import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

// Layout effects run before paint in the browser; on the server they are skipped.
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Counts from the previous value (0 on first mount) to the new one. The
 * server renders the final number, so the page is correct without scripts.
 */
export function CountUp({ value, duration = 700 }: { value: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef<number | null>(null);
  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const from = previous.current ?? 0;
    previous.current = value;
    if (from === value || prefersReducedMotion()) {
      element.textContent = String(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      element.textContent = String(Math.round(from + (value - from) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    element.textContent = String(from);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return (
    <span ref={ref} className="num">
      {value}
    </span>
  );
}

/** Height-animated region. Closed content is inert, so it cannot take focus. */
export function Collapsible({
  open,
  id,
  children,
  className = "",
}: {
  open: boolean;
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useIsomorphicLayoutEffect(() => {
    if (ref.current) ref.current.inert = !open;
  }, [open]);
  return (
    <div ref={ref} id={id} className={`collapse${open ? " open" : ""} ${className}`}>
      <div className="collapse-inner">{children}</div>
    </div>
  );
}

export type Tab = { id: string; label: string; count?: string | number };
/** Tabs with a sliding indicator and arrow-key navigation. */
export function Tabs({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: Tab[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  const list = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  useIsomorphicLayoutEffect(() => {
    const place = () => {
      const active = list.current?.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!active || !indicator.current) return;
      indicator.current.style.width = `${active.offsetWidth}px`;
      indicator.current.style.transform = `translateX(${active.offsetLeft}px)`;
    };
    place();
    // Enable the slide only after the first placement, so it never animates in from 0.
    const frame = requestAnimationFrame(() => indicator.current?.classList.add("ready"));
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", place);
    };
  }, [value, tabs]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = tabs.findIndex((t) => t.id === value);
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    onChange(tabs[next].id);
    list.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label={label} ref={list}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`tab-${tab.id}`}
          aria-selected={tab.id === value}
          aria-controls={`panel-${tab.id}`}
          tabIndex={tab.id === value ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={onKeyDown}
        >
          {tab.label}
          {tab.count !== undefined && <span className="tab-count">{tab.count}</span>}
        </button>
      ))}
      <span className="tab-indicator" ref={indicator} aria-hidden="true" />
    </div>
  );
}
export function TabPanel({ id, active, children }: { id: string; active: boolean; children: ReactNode }) {
  return (
    <div
      role="tabpanel"
      id={`panel-${id}`}
      aria-labelledby={`tab-${id}`}
      hidden={!active}
      className="tab-panel"
    >
      {active && children}
    </div>
  );
}

/**
 * Success feedback as a toast: it slides in, never shifts the layout, and
 * leaves after a few seconds. Hovering keeps it open.
 */
export function Toast({ message }: { message: string }) {
  const [region, setRegion] = useState<HTMLElement | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const paused = useRef(false);
  useEffect(() => {
    let element = document.getElementById("toast-region");
    if (!element) {
      element = document.createElement("div");
      element.id = "toast-region";
      document.body.appendChild(element);
    }
    const target = element;
    const frame = requestAnimationFrame(() => setRegion(target));
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (!region) return;
    const timer = setInterval(() => {
      if (!paused.current) setLeaving(true);
    }, 5_000);
    return () => clearInterval(timer);
  }, [region]);
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setGone(true), prefersReducedMotion() ? 0 : 200);
    return () => clearTimeout(timer);
  }, [leaving]);
  if (!region || gone) return null;
  return createPortal(
    <div
      className={`toast notice success${leaving ? " leaving" : ""}`}
      role="status"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="m5 12.5 4.5 4.5L19 7.5" />
      </svg>
      <span>{message}</span>
      <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => setLeaving(true)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </div>,
    region,
  );
}

export type StepState = "done" | "current" | "todo";
/** A horizontal progress tracker for multi-step flows. */
export function Steps({
  steps,
  label,
}: {
  steps: { title: string; detail?: ReactNode; state: StepState }[];
  label: string;
}) {
  return (
    <ol className="steps-track" aria-label={label}>
      {steps.map((step, index) => (
        <li key={step.title} className={step.state} aria-current={step.state === "current" ? "step" : undefined}>
          <span className="step-dot" aria-hidden="true">
            {step.state === "done" ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            ) : (
              index + 1
            )}
          </span>
          <span className="step-text">
            <strong>{step.title}</strong>
            {step.detail && <small>{step.detail}</small>}
          </span>
          <span className="sr-only">
            {step.state === "done" ? "(done)" : step.state === "current" ? "(current step)" : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}
