import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";

export const colors = {
  bg: "#f6f6f8",
  card: "#ffffff",
  text: "#111114",
  muted: "#6b6b76",
  border: "#e3e3e8",
  accent: "#d62976",
  ok: "#1f8a4c",
  warn: "#b26a00",
  bad: "#c62828",
};

export function Button({
  title,
  onPress,
  kind = "primary",
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        kind === "primary" && styles.primary,
        kind === "secondary" && styles.secondary,
        kind === "danger" && styles.danger,
        (pressed || disabled) && { opacity: 0.6 },
        style,
      ]}
    >
      <Text style={[styles.buttonText, kind !== "primary" && { color: kind === "danger" ? colors.bad : colors.text }]}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }]} />
    </View>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => (
        <Pressable
          key={String(o.value)}
          onPress={() => onChange(o.value)}
          style={[styles.segment, o.value === value && styles.segmentOn]}
          accessibilityRole="button"
          accessibilityState={{ selected: o.value === value }}
        >
          <Text style={[styles.segmentText, o.value === value && { color: "#fff" }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: "center" },
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  danger: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.bad },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden" },
  fill: { height: 6, backgroundColor: colors.accent },
  segmented: { flexDirection: "row", borderRadius: 8, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  segment: { flex: 1, paddingVertical: 8, alignItems: "center", backgroundColor: colors.card },
  segmentOn: { backgroundColor: colors.text },
  segmentText: { fontSize: 14, color: colors.text, fontWeight: "500" },
});
