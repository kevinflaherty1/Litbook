import type { CSSProperties } from "react";

import { env } from "@/lib/env";

/** Public URL of a logo in the org-branding bucket. */
export function logoPublicUrl(path: string | null | undefined) {
  if (!path) return null;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/org-branding/${encoded}`;
}

/** WCAG relative luminance of a #rrggbb colour. */
export function relativeLuminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Black or white, whichever reads better on the given background. */
export function readableTextColor(hex: string) {
  const l = relativeLuminance(hex);
  // Contrast with white is 1.05 / (l + 0.05); with black, (l + 0.05) / 0.05.
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? "#ffffff" : "#000000";
}

/**
 * CSS variables that re-theme buttons, focus rings and checkboxes inside the
 * guest portal with the workspace's brand colour.
 */
export function brandStyle(color: string | null | undefined): CSSProperties | undefined {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return undefined;
  return {
    "--primary": color,
    "--primary-foreground": readableTextColor(color),
    "--ring": color,
  } as CSSProperties;
}
