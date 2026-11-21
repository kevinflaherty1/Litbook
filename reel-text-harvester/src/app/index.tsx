import { router } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { useJobs } from "@/components/HarvesterProvider";
import { Button, Card, colors, ProgressBar } from "@/components/ui";
import { jobCounts, type Job } from "@/lib/types";

function stateLabel(job: Job): string {
  const c = jobCounts(job);
  if (job.state === "running") return `Working · ${c.done + c.failed + c.skipped}/${c.total}`;
  if (job.state === "paused") return `Paused · ${c.done}/${c.total} done`;
  if (job.state === "done") return `${c.done} done${c.failed ? ` · ${c.failed} failed` : ""}`;
  return `Waiting · ${c.total} posts`;
}

export default function Home() {
  const jobs = useJobs();
  return (
    <View style={styles.screen}>
      <FlatList
        data={jobs}
        keyExtractor={(j) => j.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 8 }}>
            <Button title="Open Instagram and pick a collection" onPress={() => router.push("/browse")} />
            <Text style={styles.hint}>
              Log in inside the app, open one of your Saved collections, and the app collects every post in it.
              Text is read on this phone: on-screen captions with OCR, and optionally speech with Whisper.
            </Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>No collections yet.</Text>}
        renderItem={({ item: job }) => {
          const c = jobCounts(job);
          return (
            <Pressable onPress={() => router.push(`/job/${job.id}`)}>
              <Card style={{ gap: 8 }}>
                <Text style={styles.title}>{job.collection.name}</Text>
                <ProgressBar value={c.total ? (c.total - c.pending) / c.total : 0} />
                <Text style={styles.meta}>{stateLabel(job)}</Text>
              </Card>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 16, gap: 10 },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  empty: { color: colors.muted, textAlign: "center", marginTop: 32 },
  title: { fontSize: 16, fontWeight: "600", color: colors.text },
  meta: { fontSize: 13, color: colors.muted },
});
