import { importers, type ImportOptions } from "./importers/index.ts";
import type { Bundle, Platform } from "./model/types.ts";
import { inventorySensitiveFiles } from "./risk/export-files.ts";
import { scanBundle } from "./risk/scan.ts";
import type { RiskReport } from "./risk/types.ts";
import type { Vault } from "./store/vault.ts";
import { listFiles } from "./util/fs.ts";

/** Scan a stored bundle with the vault's key and acknowledgements, and save the report. */
export async function scanAndSave(vault: Vault, bundle: Bundle): Promise<RiskReport> {
  const report = await scanBundle(bundle, {
    key: await vault.secretKey(),
    mediaFile: (asset) => vault.mediaPath(asset),
    acknowledged: await vault.acknowledged(),
  });
  await vault.saveRiskReport(report);
  return report;
}

/** Import an export into the vault and risk-scan it in one step. */
export async function importExport(
  vault: Vault,
  platform: Platform,
  exportDir: string,
  options: ImportOptions = {},
  now?: Date,
): Promise<{ bundle: Bundle; report: RiskReport }> {
  const imported = await importers[platform].import(exportDir, options);
  imported.sensitiveExportFiles = inventorySensitiveFiles(platform, await listFiles(exportDir));
  const bundle = await vault.save(imported, exportDir, now);
  return { bundle, report: await scanAndSave(vault, bundle) };
}
