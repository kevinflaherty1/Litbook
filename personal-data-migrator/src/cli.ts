import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { detectPlatform } from "./importers/index.ts";
import { PLATFORMS, isPlatform, type Platform } from "./model/types.ts";
import { exportBookmarks, type BookmarkFormat } from "./exporters/bookmarks.ts";
import { importExport, scanAndSave } from "./pipeline.ts";
import { renderReport, safeTerminal, useColor } from "./risk/render.ts";
import type { RiskReport, Severity } from "./risk/types.ts";
import { Vault } from "./store/vault.ts";
import { transformBundle, type Draft } from "./transformers/index.ts";

const HELP = `pdm — personal data migrator

Usage:
  pdm import <export-dir> [--from <platform>] [--handle <name>]
      Read an unzipped "download your data" export into the local vault,
      then scan it for high-risk data.
  pdm list
      Show imported bundles.
  pdm show <bundle-id|latest>
      Summarize a bundle.
  pdm scan <bundle-id|latest> [--min-severity high|medium|low] [--json]
      Show sensitive data found in a bundle, masked and highlighted.
  pdm scan <bundle-id|latest> --ack <finding-id>[,<finding-id>...]
      Mark findings as reviewed so they stop blocking transforms.
  pdm export-saved <bundle-id|latest> [--format html|csv|json] [--out <file>]
      Export likes, saves, upvotes and collections as bookmarks.
      html (default) imports into any browser; collections become folders.
        --include-downvotes   also export downvoted items
  pdm transform <bundle-id|latest> --to <platform> [options]
      Convert a bundle's posts into drafts for another platform.
        --subreddit <name>    target subreddit for --to reddit
        --attribution         add an "Originally posted on ..." line
        --no-number           don't add 1/N counters to tweet threads
        --include-reposts     also convert reposts of other people's posts
        --allow-risky         produce drafts for posts with high-risk findings
                              (default: blocked, draft text withheld)
        --out <file>          where to write the plan (default: <vault>/plans/)
  pdm remove <bundle-id>

Global:
  --vault <dir>   vault location (default $PDM_VAULT or ~/.local/share/personal-data-migrator)

Platforms: ${PLATFORMS.join(", ")}
`;

function fail(message: string): never {
  console.error(`error: ${safeTerminal(message)}`);
  process.exit(1);
}

function platformArg(value: string | undefined, flag: string): Platform | undefined {
  if (value === undefined) return undefined;
  if (!isPlatform(value)) fail(`${flag} must be one of ${PLATFORMS.join(", ")}`);
  return value;
}

async function resolveBundleId(vault: Vault, ref: string | undefined): Promise<string> {
  if (!ref) fail("missing bundle id (or 'latest')");
  if (ref !== "latest") return ref;
  const latest = await vault.latest();
  if (!latest) fail("vault is empty; run `pdm import` first");
  return latest.id;
}

function riskSummaryLine(report: RiskReport): string {
  const { high, medium, low } = report.summary;
  if (!high && !medium && !low) return "  Risk scan: nothing sensitive found.";
  return `  ⚠ Risk scan: ${high} high, ${medium} medium, ${low} low → run \`pdm scan ${report.bundleId}\``;
}

function severityArg(value: string | undefined): Severity {
  if (value === undefined) return "low";
  if (value !== "high" && value !== "medium" && value !== "low")
    fail("--min-severity must be high, medium or low");
  return value;
}

function previewDraft(draft: Draft): string {
  const indent = (s: string) => safeTerminal(s).replace(/^/gm, "    ");
  switch (draft.platform) {
    case "twitter":
      return draft.tweets
        .map((t, i) =>
          indent(`[${i + 1}] ${t.text}${t.mediaIds.length ? `  (+${t.mediaIds.length} media)` : ""}`),
        )
        .join("\n");
    case "reddit":
      return indent(
        `r/${draft.subreddit ?? "?"} · ${draft.kind}\n${draft.title}${draft.body ? `\n${draft.body.slice(0, 200)}` : ""}`,
      );
    case "instagram":
      return indent(`${draft.kind} · ${draft.mediaIds.length} media\n${draft.caption.slice(0, 200)}`);
  }
}

async function main(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      vault: { type: "string" },
      from: { type: "string" },
      to: { type: "string" },
      handle: { type: "string" },
      subreddit: { type: "string" },
      attribution: { type: "boolean" },
      "no-number": { type: "boolean" },
      "include-reposts": { type: "boolean" },
      "allow-risky": { type: "boolean" },
      "min-severity": { type: "string" },
      json: { type: "boolean" },
      format: { type: "string" },
      "include-downvotes": { type: "boolean" },
      ack: { type: "string" },
      out: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [command, arg] = positionals;
  if (values.help || !command) {
    console.log(HELP);
    return;
  }
  const vault = new Vault(values.vault ? path.resolve(values.vault) : undefined);

  switch (command) {
    case "import": {
      if (!arg) fail("missing export directory");
      const dir = path.resolve(arg);
      const platform = platformArg(values.from, "--from") ?? (await detectPlatform(dir));
      if (!platform) fail("couldn't tell which platform this export is from; pass --from");
      const { bundle, report } = await importExport(vault, platform, dir, { handle: values.handle });
      console.log(`Imported ${platform} export for @${safeTerminal(bundle.profile.handle)} → ${bundle.id}`);
      console.log(
        `  ${bundle.posts.length} posts, ${bundle.comments.length} comments, ` +
          `${bundle.connections.length} connections, ${Object.keys(bundle.media).length} media`,
      );
      for (const w of bundle.importWarnings) console.log(`  ! ${safeTerminal(w)}`);
      console.log(`  stored in ${vault.root}`);
      console.log(riskSummaryLine(report));
      return;
    }
    case "scan": {
      const bundle = await vault.load(await resolveBundleId(vault, arg));
      if (values.ack) {
        const ids = values.ack
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const known = new Set(((await vault.loadRiskReport(bundle.id))?.findings ?? []).map((f) => f.id));
        const unknown = ids.filter((id) => !known.has(id));
        if (unknown.length) fail(`no such finding in ${bundle.id}: ${unknown.join(", ")}`);
        await vault.acknowledge(ids);
        console.log(`Acknowledged ${ids.length} finding(s); they no longer block transforms.`);
      }
      // Always re-scan so detector updates and acknowledgements are reflected.
      const report = await scanAndSave(vault, bundle);
      if (values.json) console.log(JSON.stringify(report, null, 2));
      else console.log(renderReport(report, { color: useColor() }, severityArg(values["min-severity"])));
      return;
    }
    case "list": {
      const bundles = await vault.list();
      if (!bundles.length) return console.log(`No bundles in ${vault.root}`);
      for (const b of bundles) {
        console.log(
          `${b.id}  ${b.source.padEnd(9)} @${b.handle}  ${b.counts.posts} posts, ${b.counts.comments} comments, ${b.counts.media} media`,
        );
      }
      return;
    }
    case "show": {
      const bundle = await vault.load(await resolveBundleId(vault, arg));
      const { profile } = bundle;
      console.log(
        safeTerminal(
          `${bundle.id}\n  ${profile.platform} @${profile.handle}${profile.displayName ? ` (${profile.displayName})` : ""}`,
        ),
      );
      if (profile.bio) console.log(`  bio: ${safeTerminal(profile.bio)}`);
      const dates = bundle.posts.map((p) => p.createdAt).sort();
      console.log(
        `  posts: ${bundle.posts.length}${dates.length ? ` (${dates[0]!.slice(0, 10)} → ${dates.at(-1)!.slice(0, 10)})` : ""}`,
      );
      console.log(`  comments: ${bundle.comments.length}`);
      console.log(`  connections: ${bundle.connections.length}`);
      console.log(`  media: ${Object.keys(bundle.media).length}`);
      const saved = bundle.saved ?? [];
      const count = (pred: (k: (typeof saved)[number]) => boolean) => saved.filter(pred).length;
      console.log(
        `  saved: ${count((s) => s.kind === "like")} likes, ${count((s) => s.kind === "save")} saves, ` +
          `${count((s) => s.kind === "vote")} votes, ${bundle.collections?.length ?? 0} collections`,
      );
      for (const w of bundle.importWarnings) console.log(`  ! ${safeTerminal(w)}`);
      const report = await vault.loadRiskReport(bundle.id);
      if (report) console.log(riskSummaryLine(report));
      return;
    }
    case "transform": {
      const target = platformArg(values.to, "--to") ?? fail("--to is required");
      const bundle = await vault.load(await resolveBundleId(vault, arg));
      const report = await scanAndSave(vault, bundle);
      const plan = transformBundle(
        bundle,
        target,
        {
          subreddit: values.subreddit,
          attribution: values.attribution,
          numberThreads: !values["no-number"],
          includeReposts: values["include-reposts"],
          allowRisky: values["allow-risky"],
        },
        new Date(),
        report,
      );
      const out = values.out
        ? path.resolve(values.out)
        : path.join(vault.root, "plans", `${bundle.id}-to-${target}.json`);
      await mkdir(path.dirname(out), { recursive: true, mode: 0o700 });
      await writeFile(out, JSON.stringify(plan, null, 2), { mode: 0o600 });

      console.log(`${plan.from} → ${plan.to}: ${plan.results.length} items`);
      console.log(
        `  ready ${plan.summary.ready} · needs review ${plan.summary.needs_review} · ` +
          `skipped ${plan.summary.skipped} · blocked ${plan.summary.blocked}`,
      );
      for (const r of plan.results.slice(0, 5)) {
        console.log(`\n  ${r.status.toUpperCase()}  ${r.postIds.join(", ")}`);
        if (r.draft) console.log(previewDraft(r.draft));
        if (r.reason) console.log(`    ${r.status}: ${safeTerminal(r.reason)}`);
        for (const w of r.warnings) console.log(`    ! ${safeTerminal(w)}`);
      }
      if (plan.results.length > 5) console.log(`\n  … ${plan.results.length - 5} more`);
      if (plan.summary.blocked && !values["allow-risky"]) {
        console.log(
          `\n${plan.summary.blocked} post(s) blocked for high-risk data; their text is not in the plan.`,
        );
      }
      console.log(`\nPlan written to ${out}`);
      return;
    }
    case "export-saved": {
      const bundle = await vault.load(await resolveBundleId(vault, arg));
      const format = (values.format ?? "html") as BookmarkFormat;
      if (!["html", "csv", "json"].includes(format)) fail("--format must be html, csv or json");
      const result = exportBookmarks(bundle, format, { includeDownvotes: values["include-downvotes"] });
      const out = values.out
        ? path.resolve(values.out)
        : path.join(vault.root, "exports", `${bundle.id}-saved.${format}`);
      await mkdir(path.dirname(out), { recursive: true, mode: 0o700 });
      await writeFile(out, result.content, { mode: 0o600 });
      console.log(`Exported ${result.exported} saved items to ${out}`);
      if (result.droppedUnsafe)
        console.log(`  ! ${result.droppedUnsafe} skipped: missing or non-http(s) link`);
      if (!bundle.saved)
        console.log("  (bundle was imported before likes/saves were supported; re-import it)");
      return;
    }
    case "remove": {
      if (!arg) fail("missing bundle id");
      await vault.remove(arg);
      console.log(`Removed ${arg}`);
      return;
    }
    default:
      fail(`unknown command '${command}'\n\n${HELP}`);
  }
}

main(process.argv.slice(2)).catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)));
