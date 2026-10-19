// Builds the standalone user guide (docs/guide) and its PDF from the same
// content the in-app help uses (app/core/guide.ts).
//   npm run guide:build      (after npm run guide:capture when screens change)
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { CHAPTERS, FAQ, GLOSSARY, WORKFLOW, type GuideChapter } from "../../app/core/guide";

const root = new URL("../../", import.meta.url);
const path = (relative: string) => new URL(relative, root).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const css = readFileSync(path("scripts/guide/guide.css"), "utf8");
const escape = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const file = (image: string) => image.replace(/^\/guide\//, "");

function chapterHtml(c: GuideChapter, src: (image: string) => string) {
  const plates = c.plates
    .map(
      (p) => `
    <div class="plate">
      <figure class="shot"><img src="${src(p.image)}" alt="${escape(p.alt)}" width="${p.width}" height="${p.height}"><figcaption>${escape(p.caption)}</figcaption></figure>
      <ol class="legend">${p.legend
        .map((l, i) => `<li><span class="c">${i + 1}</span><div><b>${escape(l.title)}</b><span>${escape(l.text)}</span></div></li>`)
        .join("")}</ol>
    </div>`,
    )
    .join("");
  const notes = (c.notes ?? [])
    .map((n) => `<div class="note${n.kind === "tip" ? " tip" : ""}"><b>${escape(n.title)}</b>${escape(n.text)}</div>`)
    .join("");
  return `
<section class="wrap chapter" id="${c.id}" aria-labelledby="${c.id}-title">
  <div class="chapter-head"><span class="chapter-num">${c.number}</span><span class="chapter-kicker">${escape(c.kicker)}</span><h2 id="${c.id}-title">${escape(c.title)}</h2></div>
  <p class="why">${escape(c.why)}</p>${plates}${notes}
</section>`;
}

function page(src: (image: string) => string) {
  const toc = [
    `<li><a href="#how"><span class="n">—</span><span>How Soodo works</span></a></li>`,
    ...CHAPTERS.map((c) => `<li><a href="#${c.id}"><span class="n">${c.number}</span><span>${escape(c.title)}</span></a></li>`),
    `<li><a href="#faq"><span class="n">?</span><span>Troubleshooting</span></a></li>`,
    `<li><a href="#glossary"><span class="n">A–Z</span><span>Glossary</span></a></li>`,
  ].join("");
  return `<title>Soodo GEO Guide</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,500..800&family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&family=IBM+Plex+Mono:wght@500;600&display=swap">
<style>
${css}</style>
<header class="cover">
  <div class="wrap">
    <div>
      <div class="brandline">
        <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="3" fill="#fff"/><circle cx="11" cy="13" r="5.5" fill="none" stroke="#184a38" stroke-width="2.2"/><circle cx="17.2" cy="6.8" r="2.2" fill="#2f9b6b"/></svg>
        Soodo <span class="tag">GEO</span>
      </div>
      <h1>User guide</h1>
      <p class="lede">How to get your products found by search engines and AI shopping assistants, one screen at a time.</p>
      <div class="meta"><span>For store owners and staff</span><span>Shopify admin app</span><span>Edition · ${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span></div>
    </div>
    <div class="phone"><img src="${src("/guide/16-phone.jpg")}" alt="Soodo GEO Overview on a phone" width="780" height="2300"></div>
  </div>
</header>
<main>
<section class="wrap contents" aria-labelledby="toc-title"><h2 id="toc-title">Contents</h2><ol class="toc">${toc}</ol></section>
<section class="wrap intro" id="how" aria-labelledby="how-title">
  <div>
    <h2 id="how-title">How Soodo works</h2>
    <p>Google, ChatGPT, Perplexity and other assistants recommend products they can read and trust. Soodo checks each of your products the way those systems see them, then gives you a short list of fixes, most important first.</p>
    <p>Scanning and checking never change your store. Soodo writes only product descriptions and search listings, and only after you approve the exact wording. Every previous version is saved and can be restored.</p>
    <div class="scale" aria-label="Priority levels">
      <div><b><i style="background:#b4321f"></i>High</b><small>Fix first. Blocks discovery.</small></div>
      <div><b><i style="background:#9a6408"></i>Medium</b><small>Weakens how products are matched.</small></div>
      <div><b><i style="background:#5b6b7d"></i>Low</b><small>Polish once the rest is done.</small></div>
    </div>
  </div>
  <div>
    <h2>The workflow</h2>
    <ol class="flow">${WORKFLOW.map((s, i) => `<li><span class="dot">${i + 1}</span><div><strong>${escape(s.title)}</strong><span>${escape(s.text)}</span></div></li>`).join("")}</ol>
  </div>
</section>
${CHAPTERS.map((c) => chapterHtml(c, src)).join("")}
<section class="wrap chapter" id="faq" aria-labelledby="faq-title">
  <div class="chapter-head"><span class="chapter-num">?</span><span class="chapter-kicker">When something looks wrong</span><h2 id="faq-title">Troubleshooting</h2></div>
  <div class="faq">${FAQ.map((f, i) => `<details${i === 0 ? " open" : ""}><summary>${escape(f.question)}</summary><div class="a">${f.answer.map((a) => `<p>${escape(a)}</p>`).join("")}</div></details>`).join("")}</div>
</section>
<section class="wrap chapter" id="glossary" aria-labelledby="glossary-title">
  <div class="chapter-head"><span class="chapter-num">A–Z</span><span class="chapter-kicker">Terms used in the app</span><h2 id="glossary-title">Glossary</h2></div>
  <dl class="glossary">${GLOSSARY.map(([t, m]) => `<div><dt>${escape(t)}</dt><dd>${escape(m)}</dd></div>`).join("")}</dl>
</section>
</main>
<footer class="wrap">Soodo GEO user guide. Screenshots are from the demo store Trail Supply; your store shows your own products and orders. Scanning and checking never change your store, and every published change can be restored.</footer>
`;
}
const doc = (body: string) =>
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${body}\n</body>\n</html>\n`;

const images = path("public/guide");
const embedded = page((image) => `data:image/jpeg;base64,${readFileSync(`${images}/${file(image)}`).toString("base64")}`);
mkdirSync(path("docs/guide/images"), { recursive: true });
// docs/guide: an HTML page that references image files, plus the images.
for (const c of CHAPTERS) for (const p of c.plates) copyFileSync(`${images}/${file(p.image)}`, path(`docs/guide/images/${file(p.image)}`));
copyFileSync(`${images}/16-phone.jpg`, path("docs/guide/images/16-phone.jpg"));
writeFileSync(path("docs/guide/index.html"), doc(page((image) => `images/${file(image)}`)));
// A self-contained page (images embedded), handy for sharing.
const shareable = process.argv[2];
if (shareable) writeFileSync(shareable, embedded);

const browser = await chromium.launch();
const pdfPage = await browser.newPage();
await pdfPage.setContent(doc(embedded), { waitUntil: "load", timeout: 90_000 });
await pdfPage.evaluate(() => document.fonts.ready);
await pdfPage.waitForTimeout(1000);
await pdfPage.emulateMedia({ media: "print" });
const pdf = path("docs/guide/Soodo-GEO-User-Guide.pdf");
await pdfPage.pdf({ path: pdf, format: "A4", printBackground: true, preferCSSPageSize: true });
await browser.close();
copyFileSync(pdf, `${images}/Soodo-GEO-User-Guide.pdf`);
console.log("Guide built: docs/guide/index.html, PDF in docs/guide and public/guide");
