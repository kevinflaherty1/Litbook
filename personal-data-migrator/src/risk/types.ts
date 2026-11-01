/*
 * Risk findings: sensitive data spotted in an export.
 *
 * Security contract — enforced by construction and by tests:
 *  - A Finding never contains the raw sensitive value. It carries a masked
 *    rendering (`masked`), a redacted excerpt for context, and a keyed
 *    fingerprint (HMAC-SHA256 with a per-vault secret) so repeats of the same
 *    value can be grouped without the value being recoverable. A plain hash
 *    would not be enough: a phone number or SSN has few enough possibilities
 *    to brute-force.
 *  - Excerpts redact every sensitive match they overlap, not just the one the
 *    finding is about, so context can't leak a neighbouring secret.
 *  - Reports are written owner-only and are never sent anywhere.
 */

export type Severity = "high" | "medium" | "low";

export const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

export type RiskCategory =
  | "financial"
  | "government_id"
  | "credential"
  | "contact"
  | "location"
  | "personal"
  | "privacy"
  | "private_messages";

export interface RiskLocation {
  record: "post" | "comment" | "profile" | "media" | "saved" | "export_file";
  /** Local record id, media id, or export-relative file path. */
  recordId: string;
  field: string;
  createdAt?: string;
}

/** Redacted context around a match, split so a UI can highlight `match`. */
export interface Excerpt {
  before: string;
  match: string;
  after: string;
}

export interface Finding {
  /** Stable across re-scans: derived from detector, location and fingerprint. */
  id: string;
  detector: string;
  label: string;
  category: RiskCategory;
  severity: Severity;
  location: RiskLocation;
  /** Safe-to-display rendering of the value, e.g. "card ending 1111". */
  masked: string;
  excerpt?: Excerpt;
  /** Keyed hash of the normalized value; equal fingerprints mean the same value. */
  fingerprint?: string;
  advice: string;
  /** User reviewed this and marked it as fine. Acknowledged findings don't block. */
  acknowledged?: boolean;
}

export interface RiskReport {
  bundleId: string;
  scannedAt: string;
  summary: Record<Severity, number>;
  findings: Finding[];
}
