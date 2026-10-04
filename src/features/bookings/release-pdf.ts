import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

export type ReleaseRecord = {
  organization: string;
  episode: string;
  guestName: string;
  guestEmail: string | null;
  signedName: string;
  signedAt: string;
  version: number | null;
  text: string;
  ip: string | null;
  userAgent: string | null;
};

const PAGE = { width: 612, height: 792, margin: 56 }; // US Letter, 0.78in margins

/** The standard fonts only encode WinAnsi; replace anything else so drawing never throws. */
function sanitize(text: string) {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7e\xa0-\xff\n]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of sanitize(text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        // Break words longer than a whole line.
        let rest = word;
        while (font.widthOfTextAtSize(rest, size) > maxWidth) {
          let cut = rest.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--;
          lines.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        line = rest;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function buildReleasePdf(r: ReleaseRecord) {
  const doc = await PDFDocument.create();
  doc.setTitle(`Guest release: ${sanitize(r.guestName)}`);
  doc.setProducer("Litbook");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const width = PAGE.width - PAGE.margin * 2;

  let page = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - PAGE.margin;

  const write = (
    text: string,
    opts: { font?: PDFFont; size?: number; gap?: number; color?: number } = {},
  ) => {
    const font = opts.font ?? regular;
    const size = opts.size ?? 10;
    for (const line of wrap(text, font, size, width)) {
      if (y < PAGE.margin + size) {
        page = doc.addPage([PAGE.width, PAGE.height]);
        y = PAGE.height - PAGE.margin;
      }
      page.drawText(line, {
        x: PAGE.margin,
        y: y - size,
        size,
        font,
        color: rgb(opts.color ?? 0, opts.color ?? 0, opts.color ?? 0),
      });
      y -= size * 1.45;
    }
    y -= opts.gap ?? 0;
  };

  const signedAt = new Date(r.signedAt);
  write("Guest Release", { font: bold, size: 20, gap: 4 });
  write(`${r.organization}: ${r.episode}`, { size: 11, gap: 14, color: 0.35 });
  write(r.text, { size: 10.5, gap: 18 });

  write("Signature", { font: bold, size: 12, gap: 2 });
  write(r.signedName, { font: bold, size: 16, gap: 6 });
  const details = [
    ["Guest", r.guestEmail ? `${r.guestName} <${r.guestEmail}>` : r.guestName],
    ["Signed", `${signedAt.toISOString().replace("T", " ").slice(0, 19)} UTC`],
    ["Release version", r.version?.toString() ?? "-"],
    ["IP address", r.ip ?? "-"],
    ["Browser", r.userAgent ?? "-"],
  ];
  for (const [label, value] of details) write(`${label}: ${value}`, { size: 9, color: 0.3 });
  write("", { gap: 6 });
  write(
    "The guest agreed to the text above and typed their name as their signature through the Litbook guest portal. This record was generated from the stored submission.",
    { size: 8, color: 0.45 },
  );

  return doc.save();
}
