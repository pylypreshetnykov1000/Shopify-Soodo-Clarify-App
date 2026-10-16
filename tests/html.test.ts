import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalHtml, sameHtml } from "../app/core/html";

test("HTML comparison ignores Shopify re-serialization but not content", () => {
  const sent = `<p>Original</p>\n<div data-soodo-specs="v1"><h3>Product specifications</h3><ul><li><strong>Care:</strong> Don&#39;t tumble dry</li></ul></div>`;
  // Same meaning: different quotes, entity form, attribute order and whitespace.
  const stored = `<p>Original</p><div  data-soodo-specs='v1' ><h3>Product specifications</h3>\n<ul>\n  <li><strong>Care:</strong> Don't tumble dry</li>\n</ul></div>`;
  assert.ok(sameHtml(sent, stored));
  assert.ok(sameHtml(`<p class="a" id="b">x</p>`, `<p id="b" class="a">x</p>`));
  // Different meaning is never treated as the same.
  assert.ok(!sameHtml(sent, stored.replace("tumble", "machine")));
  assert.ok(!sameHtml(`<p>a</p>`, `<p>a</p><p>b</p>`));
  assert.ok(!sameHtml(`<p>a</p>`, `<h2>a</h2>`));
  assert.ok(!sameHtml(`<p data-x="1">a</p>`, `<p data-x="2">a</p>`));
  assert.equal(canonicalHtml(""), "");
});
