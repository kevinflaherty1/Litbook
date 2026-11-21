import { File, Paths } from "expo-file-system";
import { router, Stack, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { useHarvester, useJob } from "@/components/HarvesterProvider";
import { Button, Card, colors, ProgressBar } from "@/components/ui";
import { toJson, toMarkdown } from "@/lib/exportJob";
import type { Job, JobItem } from "@/lib/types";
import { jobCounts } from "@/lib/types";

const STATUS_COLOR: Record<JobItem["status"], string> = {
  queued: colors.muted,
  working: colors.accent,
  done: colors.ok,
  failed: colors.bad,
  skipped: colors.warn,
};

async function share(job: Job, kind: "md" | "json") {
  const name = `${job.collection.slug}-${job.id}.${kind}`;
  const file = new File(Paths.cache, name);
  file.write(kind === "md" ? toMarkdown(job) : toJson(job));
  await Sharing.shareAsync(file.uri, {
    mimeType: kind === "md" ? "text/markdown" : "application/json",
    dialogTitle: job.collection.name,
  });
}

function ItemRow({ item }: { item: JobItem }) {
  const [open, setOpen] = useState(false);
  const statusText =
    item.status === "working" ? [item.stage, item.progress].filter(Boolean).join(" · ") || "working" : item.status;
  const lineCount = item.ocr.length;
  return (
    <Pressable onPress={() => setOpen((o) => !o)}>
      <Card style={{ gap: 6 }}>
        <View style={styles.row}>
          <Text style={[styles.itemTitle, { flex: 1 }]} numberOfLines={1}>
            {item.author ? `@${item.author}` : item.shortcode}
          </Text>
          <Text style={[styles.status, { color: STATUS_COLOR[item.status] }]}>{statusText}</Text>
        </View>
        {item.status === "done" && !open && (
          <Text style={styles.preview} numberOfLines={2}>
            {item.ocr.map((l) => l.text).join(" · ") || item.transcript || "No text found"}
          </Text>
        )}
        {item.error && <Text style={[styles.preview, { color: STATUS_COLOR[item.status] }]}>{item.error}</Text>}
        {open && (
          <View style={{ gap: 10, marginTop: 4 }}>
            {item.caption ? <Section title="Caption" body={item.caption} /> : null}
            <Section
              title={`On-screen text (${lineCount} line${lineCount === 1 ? "" : "s"})`}
              body={item.ocr.map((l) => l.text).join("\n") || "—"}
            />
            {item.transcript ? <Section title="Speech" body={item.transcript} /> : null}
          </View>
        )}
      </Card>
    </Pressable>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.body} selectable>
        {body}
      </Text>
    </View>
  );
}

export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);
  const { store, runner } = useHarvester();

  if (!job) {
    return (
      <View style={[styles.screen, { padding: 16 }]}>
        <Text style={styles.body}>This collection was deleted.</Text>
      </View>
    );
  }

  const c = jobCounts(job);
  const running = job.state === "running" || runner.isActive(job.id);

  function confirmDelete() {
    Alert.alert("Delete results?", `Remove “${job!.collection.name}” and its extracted text from this phone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          runner.pause(job!.id);
          store.remove(job!.id);
          router.back();
        },
      },
    ]);
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: job.collection.name }} />
      <FlatList
        data={job.items}
        keyExtractor={(i) => i.shortcode}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 6 }}>
            <ProgressBar value={c.total ? (c.total - c.pending) / c.total : 0} />
            <Text style={styles.meta}>
              {c.done} done · {c.failed} failed · {c.skipped} skipped · {c.pending} to go
            </Text>
            {job.note ? <Text style={styles.note}>{job.note}</Text> : null}
            {running ? (
              <Text style={styles.meta}>Keep the app open while it works; the screen stays on.</Text>
            ) : null}
            <View style={styles.row}>
              {running ? (
                <Button title="Pause" kind="secondary" onPress={() => runner.pause(job.id)} style={{ flex: 1 }} />
              ) : c.pending > 0 ? (
                <Button title="Resume" onPress={() => runner.start(job.id)} style={{ flex: 1 }} />
              ) : null}
              {!running && c.failed > 0 ? (
                <Button title={`Retry ${c.failed} failed`} kind="secondary" onPress={() => runner.retryFailed(job.id)} />
              ) : null}
            </View>
            <View style={styles.row}>
              <Button title="Share Markdown" kind="secondary" onPress={() => share(job, "md")} style={{ flex: 1 }} />
              <Button title="Share JSON" kind="secondary" onPress={() => share(job, "json")} style={{ flex: 1 }} />
            </View>
            <View style={styles.row}>
              <Button title="Open Instagram to log in" kind="secondary" onPress={() => router.push("/browse")} style={{ flex: 1 }} />
              <Button title="Delete" kind="danger" onPress={confirmDelete} />
            </View>
          </View>
        }
        renderItem={({ item }) => <ItemRow item={item} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 16, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  meta: { fontSize: 13, color: colors.muted },
  note: { fontSize: 14, color: colors.warn, backgroundColor: "#fff6e5", padding: 10, borderRadius: 8 },
  itemTitle: { fontSize: 15, fontWeight: "600", color: colors.text },
  status: { fontSize: 12, fontWeight: "600" },
  preview: { fontSize: 13, color: colors.muted },
  sectionTitle: { fontSize: 12, fontWeight: "700", color: colors.muted, textTransform: "uppercase" },
  body: { fontSize: 14, color: colors.text, lineHeight: 20 },
});
