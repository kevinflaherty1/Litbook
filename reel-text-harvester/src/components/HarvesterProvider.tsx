import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { mediaInfoScript, parseBridgeMessage } from "@/lib/injected/scripts";
import type { MediaBridge } from "@/lib/pipeline";
import { JobRunner } from "@/lib/runner";
import { JobStore } from "@/lib/store";

// A 1x1 hidden WebView on instagram.com does the media lookups. It shares the
// cookie jar with the visible browser (WKWebsiteDataStore on iOS, the global
// CookieManager on Android), so once the user logs in there, requests from
// here carry their session. It loads robots.txt: same origin, no app JS.
const BRIDGE_URL = "https://www.instagram.com/robots.txt";
const REQUEST_TIMEOUT_MS = 30_000;

type Pending = { resolve: (v: { status: number; body: string }) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

class WebViewBridge implements MediaBridge {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  private webView: WebView<{}> | null = null;
  private pending = new Map<string, Pending>();
  private ready: Promise<void>;
  private markReady!: () => void;
  private counter = 0;

  constructor() {
    this.ready = new Promise((r) => (this.markReady = r));
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  attach = (webView: WebView<{}> | null) => {
    this.webView = webView;
  };

  onLoad = () => this.markReady();

  onMessage = (event: WebViewMessageEvent) => {
    const msg = parseBridgeMessage(event.nativeEvent.data);
    if (!msg || (msg.type !== "media:result" && msg.type !== "media:error")) return;
    const waiting = this.pending.get(msg.reqId);
    if (!waiting) return;
    this.pending.delete(msg.reqId);
    clearTimeout(waiting.timer);
    if (msg.type === "media:result") waiting.resolve({ status: msg.status, body: msg.body });
    else waiting.reject(new Error(`Network error: ${msg.message}`));
  };

  async fetchMediaInfo(mediaId: string, shortcode: string) {
    let waited: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      this.ready,
      new Promise((_, reject) => {
        waited = setTimeout(() => reject(new Error("Could not reach instagram.com")), REQUEST_TIMEOUT_MS);
      }),
    ]).finally(() => clearTimeout(waited));
    const reqId = `r${++this.counter}`;
    return new Promise<{ status: number; body: string }>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        reject(new Error("Timed out talking to Instagram"));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(reqId, { resolve, reject, timer });
      if (!this.webView) {
        this.pending.delete(reqId);
        clearTimeout(timer);
        reject(new Error("Instagram bridge is not ready"));
        return;
      }
      this.webView.injectJavaScript(mediaInfoScript(reqId, mediaId, shortcode));
    });
  }
}

type Harvester = { store: JobStore; runner: JobRunner };

const HarvesterContext = createContext<Harvester | null>(null);

export function HarvesterProvider({ children }: { children: ReactNode }) {
  // Created once; plain objects with their own state, not React state.
  const [{ bridge, harvester }] = useState(() => {
    const bridge = new WebViewBridge();
    const store = new JobStore();
    store.load();
    return { bridge, harvester: { store, runner: new JobRunner(store, bridge) } as Harvester };
  });

  return (
    <HarvesterContext.Provider value={harvester}>
      {children}
      <View style={styles.hidden} pointerEvents="none">
        <WebView
          ref={(w) => bridge.attach(w)}
          source={{ uri: BRIDGE_URL }}
          onLoadEnd={bridge.onLoad}
          onMessage={bridge.onMessage}
          sharedCookiesEnabled
          javaScriptEnabled
        />
      </View>
    </HarvesterContext.Provider>
  );
}

export function useHarvester(): Harvester {
  const value = useContext(HarvesterContext);
  if (!value) throw new Error("useHarvester must be used inside HarvesterProvider");
  return value;
}

export function useJobs() {
  const { store } = useHarvester();
  return useSyncExternalStore(store.subscribe, store.list);
}

export function useJob(id: string | undefined) {
  const jobs = useJobs();
  return jobs.find((j) => j.id === id);
}

const styles = StyleSheet.create({
  hidden: { position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden", left: -10, top: -10 },
});
