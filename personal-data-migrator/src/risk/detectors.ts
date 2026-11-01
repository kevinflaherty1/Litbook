import type { RiskCategory, Severity } from "./types.ts";

/*
 * Text detectors. Each pairs a regex with an optional validator (Luhn,
 * mod-97, range checks) to cut false positives, and a mask function that
 * renders the value safely. Patterns avoid nested quantifiers so they run in
 * linear time on hostile input.
 */

export interface TextDetector {
  id: string;
  label: string;
  category: RiskCategory;
  severity: Severity;
  pattern: RegExp;
  /** Return false to discard a regex hit. */
  validate?: (value: string) => boolean;
  /** Canonical form used for fingerprinting (so "4111 1111…" == "4111-1111…"). */
  normalize?: (value: string) => string;
  mask: (value: string) => string;
  advice: string;
}

export interface TextMatch {
  detector: TextDetector;
  start: number;
  end: number;
  value: string;
}

const digits = (s: string) => s.replace(/\D/g, "");
const dots = (n: number) => "•".repeat(Math.max(3, Math.min(n, 8)));

/** Show only the type and length: for secrets, even a prefix can help an attacker. */
const maskSecret = (prefix: number) => (v: string) =>
  `${v.slice(0, prefix)}${dots(v.length - prefix)} (${v.length} chars)`;

export function luhn(value: string): boolean {
  const d = digits(value);
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return d.length >= 13 && sum % 10 === 0;
}

export function ibanValid(value: string): boolean {
  const s = value.replace(/\s/g, "").toUpperCase();
  if (s.length < 15 || s.length > 34) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const code = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const c of code) rem = (rem * 10 + Number(c)) % 97;
  }
  return rem === 1;
}

function coordsValid(value: string): boolean {
  const [lat, lon] = value.split(/,\s*/).map(Number);
  return lat !== undefined && lon !== undefined && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

export const TEXT_DETECTORS: TextDetector[] = [
  // ── credentials ────────────────────────────────────────────────────────────
  {
    id: "private_key",
    label: "private key",
    category: "credential",
    severity: "high",
    pattern: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----[\s\S]{0,8000}?-----END (?:[A-Z]+ )?PRIVATE KEY-----/g,
    mask: () => "-----BEGIN PRIVATE KEY----- ••• (redacted)",
    advice: "A private key was posted. Treat it as compromised: revoke and replace it.",
  },
  {
    id: "aws_access_key",
    label: "AWS access key",
    category: "credential",
    severity: "high",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    mask: maskSecret(4),
    advice: "Rotate this key in AWS IAM; it has been public since it was posted.",
  },
  {
    id: "github_token",
    label: "GitHub token",
    category: "credential",
    severity: "high",
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})\b/g,
    mask: maskSecret(4),
    advice: "Revoke this token in GitHub settings.",
  },
  {
    id: "slack_token",
    label: "Slack token",
    category: "credential",
    severity: "high",
    pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,200}\b/g,
    mask: maskSecret(5),
    advice: "Revoke this token in your Slack app settings.",
  },
  {
    id: "stripe_key",
    label: "Stripe secret key",
    category: "credential",
    severity: "high",
    pattern: /\b[rs]k_live_[A-Za-z0-9]{16,247}\b/g,
    mask: maskSecret(8),
    advice: "Roll this key in the Stripe dashboard.",
  },
  {
    id: "google_api_key",
    label: "Google API key",
    category: "credential",
    severity: "high",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    mask: maskSecret(4),
    advice: "Delete or restrict this key in Google Cloud console.",
  },
  {
    id: "password_disclosure",
    label: "password",
    category: "credential",
    severity: "high",
    pattern: /\b(?:password|passwd|pwd|passcode|wifi pass(?:word)?)\s*(?:is|=|:)\s*\S{4,128}/gi,
    mask: (v) => `${v.replace(/\s*(?:is|=|:)\s*\S+$/i, "")}: ${dots(8)}`,
    advice: "Change this password anywhere you use it.",
  },
  {
    id: "url_credential",
    label: "credential in a URL",
    category: "credential",
    severity: "high",
    pattern: /[?&](?:access_token|auth|token|api_?key|key|sig|signature|password|secret)=[^&\s#]{8,512}/gi,
    mask: (v) => `${v.slice(0, v.indexOf("=") + 1)}${dots(8)}`,
    advice: "This link embeds a token. Strip the query string before sharing it again.",
  },
  {
    id: "jwt",
    label: "session token (JWT)",
    category: "credential",
    severity: "medium",
    pattern: /\beyJ[A-Za-z0-9_-]{8,2048}\.eyJ[A-Za-z0-9_-]{8,4096}\.[A-Za-z0-9_-]{8,1024}\b/g,
    mask: maskSecret(3),
    advice: "A login/session token was posted; sign out of that service everywhere.",
  },
  // ── financial / government ids ─────────────────────────────────────────────
  {
    id: "credit_card",
    label: "payment card number",
    category: "financial",
    severity: "high",
    pattern: /\b(?:4\d{3}|5[1-5]\d{2}|2[2-7]\d{2}|3[47]\d{2}|6(?:011|5\d{2}))(?:[ -]?\d{3,4}){2,4}\b/g,
    validate: (v) => digits(v).length >= 13 && digits(v).length <= 19 && luhn(v),
    normalize: digits,
    mask: (v) => `card ending ${digits(v).slice(-4)}`,
    advice: "Call the card issuer and ask for a replacement card.",
  },
  {
    id: "iban",
    label: "bank account (IBAN)",
    category: "financial",
    severity: "high",
    pattern: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b/g,
    validate: ibanValid,
    normalize: (v) => v.replace(/\s/g, "").toUpperCase(),
    mask: (v) => `${v.slice(0, 2)}•• •••• ${v.replace(/\s/g, "").slice(-4)}`,
    advice: "Watch the account for fraudulent debits.",
  },
  {
    id: "us_ssn",
    label: "US Social Security number",
    category: "government_id",
    severity: "high",
    pattern: /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g,
    normalize: digits,
    mask: (v) => `•••-••-${v.slice(-4)}`,
    advice: "Consider a credit freeze with the three US credit bureaus.",
  },
  // ── contact / personal ─────────────────────────────────────────────────────
  {
    id: "email",
    label: "email address",
    category: "contact",
    severity: "medium",
    pattern: /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,4}\.[A-Za-z]{2,24}\b/g,
    normalize: (v) => v.toLowerCase(),
    mask: (v) => {
      const [user = "", domain = ""] = v.split("@");
      const tld = domain.slice(domain.lastIndexOf("."));
      return `${user[0] ?? ""}•••@${domain[0] ?? ""}•••${tld}`;
    },
    advice: "Public email addresses attract spam and phishing; consider removing it.",
  },
  {
    id: "phone",
    label: "phone number",
    category: "contact",
    severity: "medium",
    // Needs separators or a leading + so tweet ids and timestamps don't match,
    // and must not be bordered by further digit groups (card-shaped numbers).
    pattern:
      /(?<![\w+])(?<!\d[ .-])(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)[ .-]?|\d{2,4}[ .-])\d{3,4}[ .-]\d{3,4}\b(?![ .-]?\d)/g,
    validate: (v) => digits(v).length >= 10 && digits(v).length <= 15,
    normalize: digits,
    mask: (v) => `phone ending ${digits(v).slice(-2)}`,
    advice: "Posting a phone number invites spam and SIM-swap attacks; consider removing it.",
  },
  {
    id: "street_address",
    label: "street address",
    category: "location",
    severity: "medium",
    pattern:
      /\b\d{1,5} (?:[A-Z][a-z]{1,20} ){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl|Terrace|Crescent)\b\.?/g,
    mask: (v) => `••• ${v.split(" ").at(-1)}`,
    advice: "An address can reveal where you live; check whether it's your home.",
  },
  {
    id: "coordinates",
    label: "precise GPS coordinates",
    category: "location",
    severity: "medium",
    pattern: /(?<![\d.])-?\d{1,2}\.\d{4,8}, ?-?\d{1,3}\.\d{4,8}(?![\d.])/g,
    validate: coordsValid,
    mask: () => "lat/long (redacted)",
    advice: "Coordinates this precise pinpoint a building.",
  },
  {
    id: "date_of_birth",
    label: "date of birth",
    category: "personal",
    severity: "medium",
    pattern:
      /\b(?:DOB|date of birth|born on|my birthday is)\b[:\s]{0,3}(?:\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}|[A-Z][a-z]{2,8} \d{1,2},? \d{4}|\d{1,2} [A-Z][a-z]{2,8},? \d{4})/gi,
    mask: (v) => `${v.replace(/[:\s]*[\d/.,-].*$/, "")}: ${dots(6)}`,
    advice: "Birth date is a common identity-verification question.",
  },
];

/** Find every detector hit in `text`, with overlapping lower-severity hits dropped. */
export function findMatches(text: string, detectors: TextDetector[] = TEXT_DETECTORS): TextMatch[] {
  const hits: TextMatch[] = [];
  for (const detector of detectors) {
    detector.pattern.lastIndex = 0;
    for (const m of text.matchAll(detector.pattern)) {
      const value = m[0];
      if (detector.validate && !detector.validate(value)) continue;
      hits.push({ detector, start: m.index, end: m.index + value.length, value });
    }
  }
  // Prefer the most specific/severe match for any overlapping span
  // (e.g. a URL credential containing something email-shaped).
  const rank = { high: 3, medium: 2, low: 1 } as const;
  hits.sort(
    (a, b) => rank[b.detector.severity] - rank[a.detector.severity] || b.end - b.start - (a.end - a.start),
  );
  const kept: TextMatch[] = [];
  for (const h of hits) {
    if (!kept.some((k) => h.start < k.end && k.start < h.end)) kept.push(h);
  }
  return kept.sort((a, b) => a.start - b.start);
}
