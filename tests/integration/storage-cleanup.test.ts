import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { removeStoragePrefix } from "@/lib/storage";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});
const bucket = admin.storage.from("guest-assets");
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function upload(path: string) {
  const { error } = await bucket.upload(path, PNG, { contentType: "image/png" });
  if (error) throw error;
}

describe("removeStoragePrefix", () => {
  it("removes nested files under a prefix and nothing else", async () => {
    const org = randomUUID();
    const [a, b] = [randomUUID(), randomUUID()];
    const other = randomUUID();
    await Promise.all([
      upload(`${org}/${a}/1.png`),
      upload(`${org}/${a}/2.png`),
      upload(`${org}/${b}/1.png`),
      upload(`${other}/${a}/keep.png`),
    ]);

    await removeStoragePrefix(`${org}/${a}/`);
    expect((await bucket.list(`${org}/${a}`)).data).toEqual([]);
    expect((await bucket.list(`${org}/${b}`)).data).toHaveLength(1);

    await removeStoragePrefix(`${org}/`);
    expect((await bucket.list(org)).data).toEqual([]);
    expect((await bucket.list(`${other}/${a}`)).data).toHaveLength(1);

    await removeStoragePrefix(`${other}/`);
  });
});
