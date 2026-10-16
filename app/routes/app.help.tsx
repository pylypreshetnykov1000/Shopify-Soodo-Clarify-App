import type { LoaderFunctionArgs } from "react-router";
import { context } from "../services/context.server";
import { CHAPTERS, FAQ, GLOSSARY, GUIDE_PDF, WORKFLOW } from "../core/guide";
import { ChapterView } from "../ui/help";
import { Icon, Mark } from "../ui/common";

export async function loader({ request }: LoaderFunctionArgs) {
  // Authenticate like every other page; the guide itself is static.
  await context(request);
  return null;
}

export default function Help() {
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Help and guide</h1>
          <p>Every screen explained with pictures. Press ? on any page to open help for that screen.</p>
        </div>
        <div className="page-actions">
          <a className="button" href={GUIDE_PDF} target="_blank" rel="noopener noreferrer" download>
            <Icon name="external" size={14} />
            Download PDF
          </a>
        </div>
      </div>

      <div className="guide-layout">
        <nav className="guide-toc" aria-label="Guide contents">
          <a href="#how">How Soodo works</a>
          {CHAPTERS.map((c) => (
            <a href={`#${c.id}`} key={c.id}>
              <span className="num">{c.number}</span>
              {c.title}
            </a>
          ))}
          <a href="#faq">Troubleshooting</a>
          <a href="#glossary">Glossary</a>
        </nav>

        <div className="guide-content">
          <section className="panel guide-section" id="how" aria-labelledby="how-title">
            <div className="guide-intro">
              <div>
                <h2 id="how-title">How Soodo works</h2>
                <p>
                  Google, ChatGPT, Perplexity and other assistants recommend products they can read and trust. Soodo
                  checks each of your products the way those systems see them, then gives you a short list of fixes,
                  most important first.
                </p>
                <p>
                  Scanning and checking never change your store. The only thing Soodo writes is a product description,
                  and only after you approve the exact wording. Every previous version is saved and can be restored.
                </p>
                <ul className="guide-priorities" aria-label="Priority levels">
                  <li>
                    <Mark kind="high" /> <strong>High</strong> Fix first. Blocks discovery.
                  </li>
                  <li>
                    <Mark kind="medium" /> <strong>Medium</strong> Weakens how products are matched.
                  </li>
                  <li>
                    <Mark kind="low" /> <strong>Low</strong> Polish once the rest is done.
                  </li>
                </ul>
              </div>
              <ol className="guide-workflow" aria-label="The workflow">
                {WORKFLOW.map((step, i) => (
                  <li key={step.title}>
                    <span className="step-dot" aria-hidden="true">
                      {i + 1}
                    </span>
                    <div>
                      <strong>{step.title}</strong>
                      <p>{step.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {CHAPTERS.map((c) => (
            <section className="panel guide-section" id={c.id} key={c.id} aria-labelledby={`${c.id}-title`}>
              <header className="guide-chapter-head">
                <span className="guide-number" aria-hidden="true">
                  {c.number}
                </span>
                <div>
                  <span className="eyebrow">{c.kicker}</span>
                  <h2 id={`${c.id}-title`}>{c.title}</h2>
                </div>
              </header>
              <ChapterView data={c} headingLevel={3} />
            </section>
          ))}

          <section className="panel guide-section" id="faq" aria-labelledby="faq-title">
            <h2 id="faq-title">Troubleshooting</h2>
            <div className="guide-faq">
              {FAQ.map((item) => (
                <details key={item.question} className="help-faq">
                  <summary>{item.question}</summary>
                  {item.answer.map((paragraph) => (
                    <p key={paragraph.slice(0, 24)}>{paragraph}</p>
                  ))}
                </details>
              ))}
            </div>
          </section>

          <section className="panel guide-section" id="glossary" aria-labelledby="glossary-title">
            <h2 id="glossary-title">Glossary</h2>
            <dl className="guide-glossary">
              {GLOSSARY.map(([term, meaning]) => (
                <div key={term}>
                  <dt>{term}</dt>
                  <dd>{meaning}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </>
  );
}
