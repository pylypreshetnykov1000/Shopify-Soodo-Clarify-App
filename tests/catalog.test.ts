import { test } from "node:test";
import assert from "node:assert/strict";
import { audit, plainText } from "../app/core/catalog";
import { buildDraft, fingerprint } from "../app/services/drafts.server";
import { demoProducts } from "../app/core/demo";

test("audit uses explicit source facts and never guesses from marketing copy", () => {
  assert.equal(audit(demoProducts[0]).score, 40);
  assert.equal(audit(demoProducts[3]).score, 0);
  assert.equal(audit(demoProducts[2]).score, 100);
});
test("conflicting metafields and labelled description are blocked", () => {
  const p = { ...demoProducts[0], descriptionHtml: "<p>Weight: 400 g</p>" };
  assert.deepEqual(audit(p).conflicts, ["weight"]);
  assert.throws(() => buildDraft(p, {}), /Conflicting/);
});
test("draft escapes merchant content, preserves original HTML and records sources", () => {
  const draft = buildDraft(demoProducts[0], { use: '<script>alert("x")</script>' });
  assert.ok(draft.afterHtml.startsWith(demoProducts[0].descriptionHtml));
  assert.ok(!draft.afterHtml.includes("<script>"));
  assert.ok(draft.afterHtml.includes("&lt;script&gt;"));
  assert.equal(draft.facts.find(f => f.key === "use")?.source, "Merchant supplied and confirmed");
  assert.match(draft.facts.find(f => f.key === "material")!.source, /Metafield/);
});
test("source facts cannot be silently overwritten", () => {
  assert.throws(() => buildDraft(demoProducts[0], { material: "Leather" }), /already has a source/);
});
test("empty or oversized drafts are rejected", () => {
  assert.throws(() => buildDraft(demoProducts[3], {}), /at least one/);
  assert.throws(() => buildDraft(demoProducts[3], { care: "x".repeat(501) }), /500/);
});
test("repeated draft generation replaces only the app section", () => {
  const first = buildDraft(demoProducts[0], { care: "Hand wash" });
  const next = { ...demoProducts[0], descriptionHtml: first.afterHtml };
  assert.throws(() => buildDraft(next, {}), /already published/);
  const second = buildDraft(next, { dimensions: "Regular fit" });
  assert.equal(second.afterHtml.match(/data-soodo-specs/g)?.length, 1);
  assert.equal(audit({ ...next, descriptionHtml: second.afterHtml }).score, 80);
});
test("fingerprint is stable across metafield order, detects factual edits", () => {
  const p = demoProducts[0];
  assert.equal(fingerprint(p), fingerprint({ ...p, metafields: [...p.metafields].reverse() }));
  assert.notEqual(fingerprint(p), fingerprint({ ...p, descriptionHtml: "New content" }));
});
test("preview strips executable markup", () => {
  assert.equal(plainText('<script>bad()</script><p>Safe</p>'), "Safe");
});
test("list facts are readable and unsupported JSON is never published as a raw specification", () => {
  const p = { ...demoProducts[3], metafields: [
    { namespace: "custom", key: "material", type: "list.single_line_text_field", value: '["Nylon","Polyester"]' },
    { namespace: "custom", key: "weight", type: "weight", value: '{"value":300,"unit":"GRAMS"}' },
  ] };
  assert.equal(audit(p).facts[0].value, "Nylon, Polyester");
  assert.equal(audit(p).facts.length, 1);
  assert.ok(!buildDraft(p, {}).afterHtml.includes("GRAMS"));
});
test("empty labelled fields cannot consume a following specification", () => {
  const product = { ...demoProducts[3], descriptionHtml: "<p>Material:</p><p>Weight: 400 g</p>" };
  const report = audit(product);
  assert.ok(!report.facts.some(f => f.key === "material"));
  assert.equal(report.facts.find(f => f.key === "weight")?.value, "400 g");
});
test("HTML entities decode once and keep sourced facts consistent", () => {
  assert.equal(plainText("<p>&amp;lt; &apos; &#xD7; &#39;</p>"), "&lt; ' × '");
  const product = { ...demoProducts[3], descriptionHtml: "<p>Material: Cotton &amp; linen</p>" };
  const draft = buildDraft(product, {});
  assert.equal(audit({ ...product, descriptionHtml: draft.afterHtml }).conflicts.length, 0);
});
test("drafts preserve original description whitespace", () => {
  const product = { ...demoProducts[0], descriptionHtml: "  <p>Original</p>\n\n" };
  assert.ok(buildDraft(product, {}).afterHtml.startsWith(product.descriptionHtml));
});
test("normalized app blocks are replaced without deleting nested or adjacent merchant HTML", () => {
  const product = { ...demoProducts[3], descriptionHtml: "<p>Original</p><div class='specs' data-soodo-specs='v1'><div><p>Material: Nylon</p></div></div><p>Keep me</p>" };
  const draft = buildDraft(product, { care: "Hand wash" });
  assert.equal(draft.afterHtml.match(/data-soodo-specs/g)?.length, 1);
  assert.ok(draft.afterHtml.includes("<p>Keep me</p>"));
});
