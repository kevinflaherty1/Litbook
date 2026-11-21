// JavaScript injected into the Instagram WebView.
//
// These are plain strings on purpose: Hermes compiles app code to bytecode,
// so Function.prototype.toString() cannot be used to ship a function into the
// page. Every script posts JSON messages tagged with SOURCE back to React
// Native through window.ReactNativeWebView.postMessage and ends with `true;`
// (react-native-webview requires the injected expression to return a value).

export const SOURCE = "reel-text-harvester";

export type HarvestOptions = {
  /** Milliseconds between scroll steps; slower is gentler on Instagram. */
  stepMs: number;
  /** Consecutive idle steps (no new links, page no taller) before finishing. */
  idleSteps: number;
  /** Stop after this many posts. */
  maxItems: number;
};

export const DEFAULT_HARVEST: HarvestOptions = { stepMs: 1400, idleSteps: 6, maxItems: 2000 };

export type BridgeMessage =
  | { source: typeof SOURCE; type: "harvest:progress"; count: number }
  | { source: typeof SOURCE; type: "harvest:done"; hrefs: string[]; reason: "end" | "stopped" | "limit"; title: string }
  | { source: typeof SOURCE; type: "harvest:error"; message: string }
  | { source: typeof SOURCE; type: "media:result"; reqId: string; status: number; body: string }
  | { source: typeof SOURCE; type: "media:error"; reqId: string; message: string };

export function parseBridgeMessage(data: string): BridgeMessage | null {
  try {
    const msg = JSON.parse(data);
    if (!msg || msg.source !== SOURCE || typeof msg.type !== "string") return null;
    switch (msg.type) {
      case "harvest:progress":
        return typeof msg.count === "number" ? msg : null;
      case "harvest:done":
        return Array.isArray(msg.hrefs) && msg.hrefs.every((h: unknown) => typeof h === "string") ? msg : null;
      case "harvest:error":
        return typeof msg.message === "string" ? msg : null;
      case "media:result":
        return typeof msg.reqId === "string" && typeof msg.status === "number" && typeof msg.body === "string"
          ? msg
          : null;
      case "media:error":
        return typeof msg.reqId === "string" ? msg : null;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * Auto-scrolls a saved-collection grid and collects every post/reel link in
 * page order. Links are kept cumulatively, so Instagram recycling off-screen
 * grid rows does not lose any.
 */
export function harvestScript(options: Partial<HarvestOptions> = {}): string {
  const opts = { ...DEFAULT_HARVEST, ...options };
  return `(function () {
  var SOURCE = ${JSON.stringify(SOURCE)};
  var opts = ${JSON.stringify(opts)};
  function post(msg) {
    msg.source = SOURCE;
    window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }
  if (window.__rthHarvest && window.__rthHarvest.running) {
    post({ type: "harvest:progress", count: window.__rthHarvest.links.length });
    return;
  }
  var state = { running: true, links: [], seen: {} };
  window.__rthHarvest = state;
  window.__rthStop = false;
  var POST = /\\/(?:p|reel|reels|tv)\\/([A-Za-z0-9_-]{5,})/;
  var idle = 0;
  var lastHeight = 0;

  function collect() {
    var added = 0;
    var anchors = document.querySelectorAll("a[href]");
    for (var i = 0; i < anchors.length; i++) {
      var href = anchors[i].getAttribute("href") || "";
      var m = POST.exec(href);
      if (m && !state.seen[m[1]]) {
        state.seen[m[1]] = true;
        state.links.push(href);
        added++;
      }
    }
    return added;
  }

  function finish(reason) {
    state.running = false;
    post({ type: "harvest:done", hrefs: state.links, reason: reason, title: document.title });
  }

  function step() {
    try {
      if (window.__rthStop) return finish("stopped");
      var added = collect();
      if (state.links.length >= opts.maxItems) return finish("limit");
      var el = document.scrollingElement || document.documentElement;
      var height = el.scrollHeight;
      if (added === 0 && height === lastHeight) idle++;
      else idle = 0;
      lastHeight = height;
      post({ type: "harvest:progress", count: state.links.length });
      if (idle >= opts.idleSteps) return finish("end");
      if (idle > 0) {
        // Already at the bottom: scrolling there again fires no scroll event,
        // so back up one screen and come down again to re-trigger loading.
        window.scrollBy(0, -window.innerHeight);
        setTimeout(function () {
          window.scrollTo(0, el.scrollHeight);
          setTimeout(step, opts.stepMs);
        }, Math.min(300, opts.stepMs / 2));
        return;
      }
      window.scrollTo(0, height);
      el.scrollTop = height;
      setTimeout(step, opts.stepMs);
    } catch (e) {
      state.running = false;
      post({ type: "harvest:error", message: String(e && e.message || e) });
    }
  }
  step();
})();
true;`;
}

export const STOP_HARVEST_SCRIPT = "window.__rthStop = true; true;";

/** Instagram web client's public app id; the API rejects requests without it. */
const IG_WEB_APP_ID = "936619743392459";

/**
 * Fetches /api/v1/media/<id>/info/ from inside the logged-in page, so the
 * request carries the user's own session cookies and nothing leaves the
 * device except the request Instagram's own site would make. If the id
 * derived from the shortcode is rejected, it reads the real media id from the
 * post page and retries once.
 */
export function mediaInfoScript(reqId: string, mediaId: string, shortcode: string): string {
  return `(function () {
  var SOURCE = ${JSON.stringify(SOURCE)};
  var reqId = ${JSON.stringify(reqId)};
  var headers = { "X-IG-App-ID": ${JSON.stringify(IG_WEB_APP_ID)}, "X-Requested-With": "XMLHttpRequest" };
  function post(msg) {
    msg.source = SOURCE;
    msg.reqId = reqId;
    window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }
  function info(id) {
    return fetch("/api/v1/media/" + encodeURIComponent(id) + "/info/", { headers: headers, credentials: "include" });
  }
  info(${JSON.stringify(mediaId)})
    .then(function (res) {
      if (res.ok || (res.status !== 400 && res.status !== 404)) return res;
      return fetch("/p/" + encodeURIComponent(${JSON.stringify(shortcode)}) + "/", { credentials: "include" })
        .then(function (page) { return page.text(); })
        .then(function (html) {
          var m = /"media_id"\\s*:\\s*"(\\d+)"/.exec(html);
          return m ? info(m[1]) : res;
        });
    })
    .then(function (res) {
      return res.text().then(function (body) { post({ type: "media:result", status: res.status, body: body }); });
    })
    .catch(function (e) { post({ type: "media:error", message: String(e && e.message || e) }); });
})();
true;`;
}
