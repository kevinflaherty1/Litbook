import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { HarvesterProvider } from "@/components/HarvesterProvider";

export default function RootLayout() {
  return (
    <HarvesterProvider>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="index" options={{ title: "Can We Please" }} />
        <Stack.Screen name="browse" options={{ title: "Pick a collection" }} />
        <Stack.Screen name="job/[id]" options={{ title: "Collection" }} />
      </Stack>
    </HarvesterProvider>
  );
}
