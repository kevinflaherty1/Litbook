import { router } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from "react-native-webview";

import { useHarvester } from "@/components/HarvesterProvider";
import { Button, colors, Segmented } from "@/components/ui";
import { harvestScript, parseBridgeMessage, STOP_HARVEST_SCRIPT } from "@/lib/injected/scripts";
import { parseCollectionUrl, uniqueShortcodes, type CollectionRef } from "@/lib/shortcode";
import { MODEL_SIZE_MB, isModelDownloaded } from "@/lib/speech";
import { NO_MARGINS } from "@/lib/textMerge";
import type { Job } from "@/lib/types";

const START_URL = "https://www.instagram.com/";

type Phase =
  | { kind: "browsing" }
  | { kind: "harvesting"; collection: CollectionRef; count: number }
  | { kind: "ready"; collection: CollectionRef; shortcodes: string[]; reason: string }
  | { kind: "error"; message: string };

export default function Browse() {
  const { store, runner } = useHarvester();
  // WebView<{}>: the default generic (undefined) makes its props `never` in TS 6.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  const webView = useRef<WebView<{}>>(null);
  const [url, setUrl] = useState(START_URL);
  const [phase, setPhase] = useState<Phase>({ kind: "browsing" });
  const [fps, setFps] = useState(1);
  const [speech, setSpeech] = useState(false);

  const collection = parseCollectionUrl(url);

  function startHarvest() {
    if (!collection) return;
    setPhase({ kind: "harvesting", collection, count: 0 });
    webView.current?.injectJavaScript(harvestScript());
  }

  function onMessage(event: WebViewMessageEvent) {
    const msg = parseBridgeMessage(event.nativeEvent.data);
    if (!msg) return;
    setPhase((p) => {
      if (p.kind !== "harvesting") return p;
      if (msg.type === "harvest:progress") return { ...p, count: msg.count };
      if (msg.type === "harvest:error") return { kind: "error", message: msg.message };
      if (msg.type === "harvest:done") {
        const shortcodes = uniqueShortcodes(msg.hrefs);
        if (!shortcodes.length) {
          return { kind: "error", message: "No posts found. Is the collection empty, or still loading?" };
        }
        return { kind: "ready", collection: p.collection, shortcodes, reason: msg.reason };
      }
      return p;
    });
  }

  function createJob(p: Extract<Phase, { kind: "ready" }>) {
    const job: Job = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      collection: p.collection,
      createdAt: Date.now(),
      options: { fps, maxFrames: 120, speech, language: "auto", margins: NO_MARGINS },
      state: "idle",
      items: p.shortcodes.map((shortcode) => ({ shortcode, status: "queued", ocr: [], transcript: null })),
    };
    store.put(job);
    runner.start(job.id);
    router.replace(`/job/${job.id}`);
  }

  return (
    <View style={styles.screen}>
      <WebView
        ref={webView}
        source={{ uri: START_URL }}
        onNavigationStateChange={(nav: WebViewNavigation) => {
          setUrl(nav.url);
          // Leaving the collection mid-harvest: stop scrolling whatever page comes next.
          if (phase.kind === "harvesting" && parseCollectionUrl(nav.url)?.url !== phase.collection.url) {
            webView.current?.injectJavaScript(STOP_HARVEST_SCRIPT);
          }
        }}
        onMessage={onMessage}
        sharedCookiesEnabled
        javaScriptEnabled
        allowsBackForwardNavigationGestures
        style={{ flex: 1 }}
      />
      <View style={styles.panel}>
        {phase.kind === "browsing" &&
          (collection ? (
            <Button title={`Harvest “${collection.name}”`} onPress={startHarvest} />
          ) : (
            <Text style={styles.hint}>Log in, then go to your profile → Saved → open a collection.</Text>
          ))}

        {phase.kind === "harvesting" && (
          <View style={styles.row}>
            <Text style={[styles.text, { flex: 1 }]}>
              Scrolling “{phase.collection.name}” · {phase.count} posts found
            </Text>
            <Button
              title="Stop"
              kind="secondary"
              onPress={() => webView.current?.injectJavaScript(STOP_HARVEST_SCRIPT)}
            />
          </View>
        )}

        {phase.kind === "ready" && (
          <View style={{ gap: 12 }}>
            <Text style={styles.text}>
              {phase.shortcodes.length} posts in “{phase.collection.name}”
              {phase.reason === "stopped" ? " (stopped early)" : phase.reason === "limit" ? " (limit reached)" : ""}
            </Text>
            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Frames per second for on-screen text</Text>
              <Segmented
                options={[
                  { label: "0.5 (faster)", value: 0.5 },
                  { label: "1", value: 1 },
                  { label: "2 (thorough)", value: 2 },
                ]}
                value={fps}
                onChange={setFps}
              />
            </View>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.text}>Transcribe speech</Text>
                <Text style={styles.hint}>
                  {isModelDownloaded() ? "Whisper model ready" : `Downloads a ${MODEL_SIZE_MB} MB Whisper model once`}
                  {" · slower"}
                </Text>
              </View>
              <Switch value={speech} onValueChange={setSpeech} />
            </View>
            <View style={styles.row}>
              <Button title="Back" kind="secondary" onPress={() => setPhase({ kind: "browsing" })} />
              <Button title="Start extracting" onPress={() => createJob(phase)} style={{ flex: 1 }} />
            </View>
          </View>
        )}

        {phase.kind === "error" && (
          <View style={styles.row}>
            <Text style={[styles.text, { flex: 1, color: colors.bad }]}>{phase.message}</Text>
            <Button title="OK" kind="secondary" onPress={() => setPhase({ kind: "browsing" })} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  panel: {
    padding: 14,
    paddingBottom: 28,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 10,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  text: { fontSize: 15, color: colors.text },
  label: { fontSize: 13, color: colors.muted },
  hint: { fontSize: 13, color: colors.muted },
});
