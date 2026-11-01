import type { Finding, RiskReport, Severity } from "./types.ts";

/**
 * Strip control characters (incl. ANSI escapes and bidi overrides) from text
 * that came out of an export before it reaches a terminal. Exported content
 * is untrusted: a crafted post could otherwise rewrite the screen, hide a
 * line, or reorder what the user sees.
 */
export function safeTerminal(text: string): string {
  return text
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "") // CSI sequences
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, "") // OSC sequences
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "")
    .replace(/[‪-‮⁦-⁩]/g, "");
}

export interface RenderOptions {
  color: boolean;
}

export function useColor(stream: NodeJS.WriteStream = process.stdout): boolean {
  return !!stream.isTTY && !process.env["NO_COLOR"] && process.env["TERM"] !== "dumb";
}

const SGR = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  red: "\u001b[31m",
  yellow: "\u001b[33m",
  cyan: "\u001b[36m",
  inverse: "\u001b[7m",
};
const SEVERITY_STYLE: Record<Severity, string> = { high: SGR.red, medium: SGR.yellow, low: SGR.cyan };
const SEVERITY_ICON: Record<Severity, string> = { high: "▲ HIGH", medium: "● MEDIUM", low: "○ LOW" };

function paint(text: string, style: string, opts: RenderOptions): string {
  return opts.color ? `${style}${text}${SGR.reset}` : text;
}

/** The excerpt with the masked match highlighted (inverse video, or »…« without color). */
export function highlightExcerpt(f: Finding, opts: RenderOptions): string | undefined {
  if (!f.excerpt) return undefined;
  const { before, match, after } = f.excerpt;
  const hl = opts.color
    ? `${SGR.bold}${SEVERITY_STYLE[f.severity]}${SGR.inverse} ${safeTerminal(match)} ${SGR.reset}`
    : `»${safeTerminal(match)}«`;
  return `${safeTerminal(before)}${hl}${safeTerminal(after)}`;
}

export function renderFinding(f: Finding, repeats: number, opts: RenderOptions): string[] {
  const where = `${f.location.record} ${f.location.recordId} · ${f.location.field}${
    f.location.createdAt ? ` · ${f.location.createdAt.slice(0, 10)}` : ""
  }`;
  const head = `${paint(SEVERITY_ICON[f.severity], SGR.bold + SEVERITY_STYLE[f.severity], opts)}  ${f.label}${
    repeats > 1 ? paint(`  (same value appears ${repeats}×)`, SGR.dim, opts) : ""
  }${f.acknowledged ? paint("  [acknowledged]", SGR.dim, opts) : ""}`;
  const lines = [head, `    ${paint(safeTerminal(where), SGR.dim, opts)}`];
  const excerpt = highlightExcerpt(f, opts);
  lines.push(`    ${excerpt ?? safeTerminal(f.masked)}`);
  lines.push(`    → ${f.advice}`);
  lines.push(`    ${paint(`id ${f.id}`, SGR.dim, opts)}`);
  return lines;
}

export function renderReport(report: RiskReport, opts: RenderOptions, minSeverity: Severity = "low"): string {
  const rank = { high: 3, medium: 2, low: 1 };
  const shown = report.findings.filter((f) => rank[f.severity] >= rank[minSeverity]);
  const repeats = new Map<string, number>();
  for (const f of report.findings)
    if (f.fingerprint) repeats.set(f.fingerprint, (repeats.get(f.fingerprint) ?? 0) + 1);

  const { high, medium, low } = report.summary;
  const out = [
    `Risk scan of ${report.bundleId}`,
    `  ${paint(`${high} high`, SGR.red, opts)} · ${paint(`${medium} medium`, SGR.yellow, opts)} · ${low} low` +
      (report.findings.some((f) => f.acknowledged) ? `  (acknowledged findings not counted)` : ""),
    `  Values are masked; the raw data stays only in your local vault.`,
    "",
  ];
  if (!shown.length) out.push("  Nothing found.");
  for (const f of shown)
    out.push(...renderFinding(f, f.fingerprint ? (repeats.get(f.fingerprint) ?? 1) : 1, opts), "");
  return out.join("\n");
}
