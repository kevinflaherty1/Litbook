import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";

export type Guide = {
  slug: string;
  title: string;
  description: string;
  updated: string; // YYYY-MM-DD
  hasAffiliateLinks: boolean;
  html: string;
};

const dir = path.join(process.cwd(), "content", "guides");

// Minimal front matter parser: a leading block of `key: value` lines between `---` fences.
function parse(file: string): Omit<Guide, "slug" | "html"> & { body: string } {
  const raw = fs.readFileSync(file, "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`Missing front matter in ${file}`);
  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  for (const key of ["title", "description", "updated"]) {
    if (!meta[key]) throw new Error(`Missing "${key}" in ${file}`);
  }
  return {
    title: meta.title,
    description: meta.description,
    updated: meta.updated,
    hasAffiliateLinks: meta.affiliate === "true",
    body: match[2],
  };
}

// Affiliate links (/go/...) get rel="sponsored nofollow"; other external links open safely.
const renderer = new marked.Renderer();
renderer.link = ({ href, text }) => {
  if (href.startsWith("/go/")) {
    return `<a href="${href}" rel="sponsored nofollow" target="_blank">${text}</a>`;
  }
  if (/^https?:\/\//.test(href)) {
    return `<a href="${href}" rel="noopener" target="_blank">${text}</a>`;
  }
  return `<a href="${href}">${text}</a>`;
};

export function getGuideSlugs(): string[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

export function getGuide(slug: string): Guide | null {
  const file = path.join(dir, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const { body, ...meta } = parse(file);
  return { slug, ...meta, html: marked.parse(body, { renderer, async: false }) as string };
}

export function getAllGuides(): Guide[] {
  return getGuideSlugs()
    .map((s) => getGuide(s)!)
    .sort((a, b) => b.updated.localeCompare(a.updated));
}
