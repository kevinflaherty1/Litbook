import { SCHEMA_VERSION, isPlatform, type Bundle } from "./types.ts";

/**
 * Structural checks for a bundle read back from disk. Not a full JSON-schema
 * validator — it catches the mistakes that would otherwise surface as confusing
 * errors deep inside a transformer.
 */
export function validateBundle(value: unknown): string[] {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null) return ["bundle is not an object"];
  const b = value as Partial<Bundle>;

  if (b.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`unsupported schemaVersion ${String(b.schemaVersion)} (expected ${SCHEMA_VERSION})`);
  }
  if (typeof b.source !== "string" || !isPlatform(b.source)) errors.push("source is not a known platform");
  if (!b.profile || typeof b.profile.handle !== "string") errors.push("profile.handle missing");
  if (!Array.isArray(b.posts)) errors.push("posts is not an array");
  if (!Array.isArray(b.comments)) errors.push("comments is not an array");
  if (!Array.isArray(b.connections)) errors.push("connections is not an array");
  if (typeof b.media !== "object" || b.media === null) errors.push("media is not an object");
  if (errors.length) return errors;

  const ids = new Set<string>();
  for (const [i, post] of b.posts!.entries()) {
    const where = `posts[${i}]`;
    if (typeof post.id !== "string" || !post.id) errors.push(`${where}.id missing`);
    else if (ids.has(post.id)) errors.push(`${where}.id duplicated: ${post.id}`);
    else ids.add(post.id);
    if (typeof post.text !== "string") errors.push(`${where}.text is not a string`);
    if (Number.isNaN(Date.parse(post.createdAt))) errors.push(`${where}.createdAt is not a date`);
    for (const mediaId of post.mediaIds ?? []) {
      if (!b.media![mediaId]) errors.push(`${where} references unknown media ${mediaId}`);
    }
  }
  return errors;
}
