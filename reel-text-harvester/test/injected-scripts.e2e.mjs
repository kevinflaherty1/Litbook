// Runs the injected WebView scripts in real Chromium against a fake
// Instagram-like page, with window.ReactNativeWebView stubbed.
//
//   node test/injected-scripts.e2e.mjs
//
// Needs Playwright with a Chromium build (`npm i -D playwright && npx playwright install chromium`
// if it is not already available globally).
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { harvestScript, mediaInfoScript, parseBridgeMessage, STOP_HARVEST_SCRIPT } from "../src/lib/injected/scripts.ts";

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require("playwright");
} catch {
  const { execSync } = await import("node:child_process");
  const globalRoot = execSync("npm root -g").toString().trim();
  playwright = require(`${globalRoot}/playwright`);
}

const ORIGIN = "https://www.instagram.com";
const TOTAL_POSTS = 50;

// A grid that loads 12 posts per scroll and, like Instagram, keeps only the
// last 24 in the DOM (virtualized rows).
const GRID_PAGE = `<!doctype html><html><head><title>Meal Prep • Instagram</title>
<style>a{display:block;height:300px;border:1px solid #ccc}</style></head><body><div id="grid"></div>
<script>
  var loaded = 0, total = ${TOTAL_POSTS};
  function code(i) { return "C" + String(i).padStart(10, "0"); }
  function more() {
    var grid = document.getElementById("grid");
    for (var n = 0; n < 12 && loaded < total; n++, loaded++) {
      var a = document.createElement("a");
      a.href = (loaded % 3 === 0 ? "/reel/" : "/p/") + code(loaded) + "/";
      grid.appendChild(a);
    }
    while (grid.children.length > 24) grid.removeChild(grid.firstChild);
    var spacer = document.getElementById("spacer") || document.body.appendChild(Object.assign(document.createElement("div"), { id: "spacer" }));
    spacer.style.height = (loaded < total ? 2000 : 0) + "px";
  }
  more();
  window.addEventListener("scroll", function () {
    if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 50) setTimeout(more, 200);
  });
</script></body></html>`;

async function withPage(fn) {
  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage();
    const messages = [];
    await page.exposeFunction("__rnPost", (data) => messages.push(data));
    await page.addInitScript(() => {
      window.ReactNativeWebView = { postMessage: (d) => window.__rnPost(d) };
    });
    await fn(page, messages);
  } finally {
    await browser.close();
  }
}

async function waitFor(messages, predicate, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const hit = messages.map(parseBridgeMessage).find((m) => m && predicate(m));
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("Timed out waiting for message; got: " + messages.slice(-3).join("\n"));
}

// 1. Harvest collects every post across virtualized rows, in order.
await withPage(async (page, messages) => {
  await page.route(`${ORIGIN}/me/saved/meal-prep/1/`, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: GRID_PAGE }));
  await page.goto(`${ORIGIN}/me/saved/meal-prep/1/`);
  await page.evaluate(harvestScript({ stepMs: 150, idleSteps: 4 }));
  const done = await waitFor(messages, (m) => m.type === "harvest:done");
  assert.equal(done.reason, "end");
  assert.equal(done.title, "Meal Prep • Instagram");
  assert.equal(done.hrefs.length, TOTAL_POSTS);
  assert.equal(done.hrefs[0], "/reel/C0000000000/");
  assert.equal(done.hrefs[49], "/p/C0000000049/");
  assert.ok(messages.some((m) => parseBridgeMessage(m)?.type === "harvest:progress"));
  console.log("ok - harvest collects all", TOTAL_POSTS, "posts from a virtualized grid");
});

// 2. Stop ends the harvest early with what was collected so far.
await withPage(async (page, messages) => {
  await page.route(`${ORIGIN}/me/saved/meal-prep/1/`, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: GRID_PAGE }));
  await page.goto(`${ORIGIN}/me/saved/meal-prep/1/`);
  await page.evaluate(harvestScript({ stepMs: 400, idleSteps: 4 }));
  await waitFor(messages, (m) => m.type === "harvest:progress");
  await page.evaluate(STOP_HARVEST_SCRIPT);
  const done = await waitFor(messages, (m) => m.type === "harvest:done");
  assert.equal(done.reason, "stopped");
  assert.ok(done.hrefs.length > 0 && done.hrefs.length < TOTAL_POSTS);
  console.log("ok - stop ends harvest early with", done.hrefs.length, "posts");
});

// 3. Media lookup sends the app-id header and falls back to the post page's media_id.
await withPage(async (page, messages) => {
  const seenHeaders = [];
  await page.route(`${ORIGIN}/`, (r) => r.fulfill({ contentType: "text/html", body: "<html></html>" }));
  await page.route(`${ORIGIN}/api/v1/media/111/info/`, (r) => {
    seenHeaders.push(r.request().headers()["x-ig-app-id"]);
    return r.fulfill({ status: 404, body: "{}" });
  });
  await page.route(`${ORIGIN}/p/CODE1/`, (r) =>
    r.fulfill({ contentType: "text/html", body: '<script>{"media_id":"222","x":1}</script>' }),
  );
  await page.route(`${ORIGIN}/api/v1/media/222/info/`, (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [{ pk: "222" }], status: "ok" }) }),
  );
  await page.goto(`${ORIGIN}/`);
  await page.evaluate(mediaInfoScript("req-1", "111", "CODE1"));
  const res = await waitFor(messages, (m) => m.type === "media:result");
  assert.equal(res.reqId, "req-1");
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.body).items[0].pk, "222");
  assert.deepEqual(seenHeaders, ["936619743392459"]);
  console.log("ok - media lookup falls back to the page's media_id");
});

// 4. Messages from anything else on the page are ignored.
assert.equal(parseBridgeMessage('{"type":"harvest:done","hrefs":[]}'), null);
assert.equal(parseBridgeMessage("not json"), null);
assert.equal(parseBridgeMessage(JSON.stringify({ source: "reel-text-harvester", type: "harvest:done", hrefs: [1] })), null);
console.log("ok - foreign or malformed messages are rejected");
