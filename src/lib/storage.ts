import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type Bucket = "guest-assets" | "org-branding";

/**
 * Deletes every object under `prefix` (e.g. "<org>/" or "<org>/<booking>/").
 * Storage objects aren't removed by database cascades, so call this after
 * deleting the rows that owned them. Never throws; failures are logged.
 */
export async function removeStoragePrefix(prefix: string, bucket: Bucket = "guest-assets") {
  try {
    const paths = await listStoragePrefix(prefix, bucket);
    const storage = createAdminClient().storage.from(bucket);
    for (let i = 0; i < paths.length; i += 1000) {
      const { error } = await storage.remove(paths.slice(i, i + 1000));
      if (error) throw error;
    }
  } catch (error) {
    console.error("[storage] could not remove prefix", bucket, prefix, error);
  }
}

/** Every object key under `prefix`, walking sub-folders. Throws on failure. */
export async function listStoragePrefix(prefix: string, bucket: Bucket = "guest-assets") {
  const storage = createAdminClient().storage.from(bucket);
  const paths: string[] = [];
  const walk = async (folder: string) => {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await storage.list(folder, { limit: 1000, offset });
      if (error) throw error;
      for (const entry of data) {
        const path = folder ? `${folder}/${entry.name}` : entry.name;
        // Folders are listed without an id.
        if (entry.id) paths.push(path);
        else await walk(path);
      }
      if (data.length < 1000) break;
    }
  };
  await walk(prefix.replace(/\/+$/, ""));
  return paths;
}
