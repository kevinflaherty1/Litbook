import type { Platform, SensitiveExportFile } from "../model/types.ts";

/*
 * Files in a platform export that this tool deliberately does NOT import, but
 * which still sit in the export folder/zip on disk. They're often the most
 * sensitive part of the archive (DMs, uploaded address books, login IPs,
 * device tokens), so the user should know to delete the raw export once it's
 * imported.
 */

interface Rule {
  pattern: RegExp;
  kind: string;
  severity: SensitiveExportFile["severity"];
}

const RULES: Record<Platform, Rule[]> = {
  instagram: [
    { pattern: /(^|\/)messages\/inbox\//, kind: "direct messages", severity: "high" },
    {
      pattern: /synced_contacts\.json$|(^|\/)contacts\//,
      kind: "phone contacts you uploaded",
      severity: "high",
    },
    {
      pattern: /login_activity\.json$|logout_activity\.json$/,
      kind: "login IP addresses and devices",
      severity: "medium",
    },
    { pattern: /devices\.json$|camera_information\.json$/, kind: "device identifiers", severity: "medium" },
    { pattern: /signup_information\.json$/, kind: "sign-up email, phone and IP", severity: "medium" },
    { pattern: /password_change_activity\.json$/, kind: "password change history", severity: "medium" },
    {
      pattern: /locations_of_interest\.json$|account_based_in\.json$/,
      kind: "inferred home location",
      severity: "medium",
    },
  ],
  twitter: [
    { pattern: /direct-messages(-group)?(-part\d+)?\.js$/, kind: "direct messages", severity: "high" },
    {
      pattern: /(^|\/)direct_messages_(group_)?media\//,
      kind: "media sent in direct messages",
      severity: "high",
    },
    { pattern: /(^|\/)contact\.js$/, kind: "address book you uploaded", severity: "high" },
    { pattern: /device-token\.js$/, kind: "app session tokens", severity: "high" },
    { pattern: /ip-audit\.js$/, kind: "login IP addresses", severity: "medium" },
    {
      pattern: /phone-number\.js$|email-address-change\.js$/,
      kind: "account phone and email",
      severity: "medium",
    },
    { pattern: /ageinfo\.js$/, kind: "date of birth", severity: "medium" },
    { pattern: /connected-application\.js$/, kind: "connected apps", severity: "low" },
  ],
  reddit: [
    {
      pattern: /(^|\/)(messages|chat_history|message_headers)\.csv$/,
      kind: "private messages and chats",
      severity: "high",
    },
    { pattern: /ip_logs\.csv$/, kind: "login IP addresses", severity: "medium" },
    { pattern: /birthdate\.csv$/, kind: "date of birth", severity: "medium" },
    {
      pattern: /linked_identities\.csv$|linked_phone_number\.csv$/,
      kind: "linked accounts and phone",
      severity: "medium",
    },
    { pattern: /(payouts|purchases|subscriptions)\.csv$/, kind: "payment history", severity: "medium" },
  ],
};

/** Match an export's file list against known-sensitive files for that platform. */
export function inventorySensitiveFiles(platform: Platform, files: string[]): SensitiveExportFile[] {
  // One entry per kind, so hundreds of DM thread files show up as one line.
  const out = new Map<string, SensitiveExportFile>();
  for (const file of files) {
    const rule = RULES[platform].find((r) => r.pattern.test(file));
    if (!rule) continue;
    const existing = out.get(rule.kind);
    if (existing) existing.fileCount++;
    else out.set(rule.kind, { path: file, kind: rule.kind, severity: rule.severity, fileCount: 1 });
  }
  return [...out.values()];
}
