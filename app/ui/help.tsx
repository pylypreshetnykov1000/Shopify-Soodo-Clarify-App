import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router";
import {
  chapter,
  CHAPTERS,
  FAQ,
  GUIDE_PDF,
  RELATED,
  type GuideChapter,
  type GuideTopic,
} from "../core/guide";
import { AppLink, Icon } from "./common";

/** The help topic for a page, used by the "?" shortcut and as a default. */
export function topicForPath(pathname: string): GuideTopic {
  if (/^\/app\/products\/[^/]+/.test(pathname)) return "product";
  if (pathname.startsWith("/app/products")) return "products";
  if (pathname.startsWith("/app/visibility")) return "visibility";
  if (pathname.startsWith("/app/fixes")) return "fixes";
  if (pathname.startsWith("/app/history")) return "history";
  if (pathname.startsWith("/app/performance")) return "performance";
  if (pathname.startsWith("/app/settings")) return "settings";
  return "overview";
}

type HelpState = { open: (topic?: GuideTopic) => void };
const HelpContext = createContext<HelpState>({ open: () => {} });
export const useHelp = () => useContext(HelpContext);

/**
 * Hosts the help panel for the whole app. Any page can open it on a topic;
 * pressing "?" outside a text field opens it on the current page's topic.
 */
export function HelpProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [topic, setTopic] = useState<GuideTopic | null>(null);
  const open = useCallback(
    (next?: GuideTopic) => setTopic(next ?? topicForPath(pathname)),
    [pathname],
  );
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "?" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      setTopic(topicForPath(window.location.pathname));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const value = useMemo(() => ({ open }), [open]);
  const close = useCallback(() => setTopic(null), []);
  return (
    <HelpContext.Provider value={value}>
      {children}
      <HelpPanel topic={topic} onTopic={setTopic} onClose={close} />
    </HelpContext.Provider>
  );
}

export function HelpButton({ topic }: { topic?: GuideTopic }) {
  const { open } = useHelp();
  return (
    <button
      type="button"
      className="button quiet help-button"
      onClick={() => open(topic)}
      aria-haspopup="dialog"
      title="Help for this screen (press ?)"
    >
      <Icon name="help" size={16} />
      Help
    </button>
  );
}

/** A guide chapter: plates (annotated screenshot + numbered legend) and notes. */
export function ChapterView({ data, headingLevel = 2 }: { data: GuideChapter; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <>
      <p className="guide-why">{data.why}</p>
      {data.plates.map((plate) => (
        <div className="guide-plate" key={plate.image}>
          <figure>
            <a href={plate.image} target="_blank" rel="noopener noreferrer" className="guide-shot" title="Open full size">
              <img src={plate.image} alt={plate.alt} width={plate.width} height={plate.height} loading="lazy" />
            </a>
            <figcaption>{plate.caption}</figcaption>
          </figure>
          <ol className="guide-legend" aria-label={`Numbered parts of: ${plate.caption}`}>
            {plate.legend.map((item, i) => (
              <li key={item.title}>
                <span className="guide-callout" aria-hidden="true">
                  {i + 1}
                </span>
                <div>
                  <Heading className="guide-legend-title">
                    <span className="sr-only">{i + 1}. </span>
                    {item.title}
                  </Heading>
                  <p>{item.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ))}
      {data.notes?.map((note) => (
        <div className={`guide-note ${note.kind}`} key={note.title}>
          <strong>{note.title}</strong>
          <p>{note.text}</p>
        </div>
      ))}
    </>
  );
}

function HelpPanel({
  topic,
  onTopic,
  onClose,
}: {
  topic: GuideTopic | null;
  onTopic: (topic: GuideTopic) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  // Keep the last topic on screen while the panel animates out.
  const [shown, setShown] = useState<GuideTopic | null>(topic);
  if (topic && topic !== shown) setShown(topic);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (topic && !element.open) element.showModal();
    if (!topic && element.open) element.close();
    body.current?.scrollTo({ top: 0 });
  }, [topic]);

  const close = useCallback(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return onClose();
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      onClose();
    }, 180);
  }, [onClose]);
  // A click on the backdrop (the dialog element itself) closes the panel.
  // Keyboard users have Escape and the close button.
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const onClick = (event: MouseEvent) => {
      if (event.target === element) close();
    };
    element.addEventListener("click", onClick);
    return () => element.removeEventListener("click", onClick);
  }, [close]);
  const data = shown ? chapter(shown) : null;
  const faq = shown ? FAQ.filter((item) => item.topics.includes(shown)) : [];

  return (
    // Native dialog: focus moves inside, Escape closes, the page behind is inert.
    <dialog
      ref={dialog}
      className={`help-panel${closing ? " closing" : ""}`}
      aria-labelledby="help-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      {data && (
        <div className="help-inner">
          <header className="help-head">
            <div>
              <span className="eyebrow">
                Guide · {data.number} · {data.kicker}
              </span>
              <h2 id="help-title">{data.title}</h2>
            </div>
            <button type="button" className="button quiet help-close" onClick={close} aria-label="Close help">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </header>
          <div className="help-body" ref={body}>
            <ChapterView data={data} headingLevel={3} />
            {faq.length > 0 && (
              <section className="help-section" aria-labelledby="help-faq">
                <h3 id="help-faq">Common questions</h3>
                {faq.map((item) => (
                  <details key={item.question} className="help-faq">
                    <summary>{item.question}</summary>
                    {item.answer.map((paragraph) => (
                      <p key={paragraph.slice(0, 24)}>{paragraph}</p>
                    ))}
                  </details>
                ))}
              </section>
            )}
            <section className="help-section" aria-labelledby="help-related">
              <h3 id="help-related">Related</h3>
              <div className="help-related">
                {RELATED[data.id].map((id) => (
                  <button type="button" key={id} className="chip" onClick={() => onTopic(id)}>
                    {chapter(id).title}
                    <Icon name="arrow" size={13} />
                  </button>
                ))}
              </div>
              <label className="help-jump" htmlFor="help-topic">
                <span>All topics</span>
                <select
                  id="help-topic"
                  value={data.id}
                  onChange={(event) => onTopic(event.target.value as GuideTopic)}
                >
                  {CHAPTERS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.number} · {c.title}
                    </option>
                  ))}
                </select>
              </label>
            </section>
          </div>
          <footer className="help-foot">
            <AppLink to={`/app/help#${data.id}`} className="button" onClick={onClose}>
              Open full guide
            </AppLink>
            <a className="text-link" href={GUIDE_PDF} target="_blank" rel="noopener noreferrer" download>
              Download PDF
            </a>
          </footer>
        </div>
      )}
    </dialog>
  );
}
