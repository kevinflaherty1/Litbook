import { describe, expect, it } from "vitest";

import { assetUploadSchema, formatBytes, guessAssetType, submittedAssetsSchema } from "@/schemas/assets";

const token = "t".repeat(43);

describe("guest file kinds", () => {
  it("accepts each kind's types and sizes", () => {
    expect(
      assetUploadSchema.safeParse({ token, kind: "media_kit", contentType: "application/pdf", size: 1000 })
        .success,
    ).toBe(true);
    expect(
      assetUploadSchema.safeParse({ token, kind: "media_kit", contentType: "image/png", size: 1000 }).success,
    ).toBe(false);
    expect(
      assetUploadSchema.safeParse({
        token,
        kind: "intro_audio",
        contentType: "audio/mpeg",
        size: 51 * 1024 * 1024,
      }).success,
    ).toBe(false);
  });

  it("guesses audio types from the extension when the browser doesn't say", () => {
    expect(guessAssetType("intro_audio", { type: "", name: "intro.M4A" })).toBe("audio/mp4");
    expect(guessAssetType("intro_audio", { type: "audio/mpeg", name: "x" })).toBe("audio/mpeg");
    expect(guessAssetType("media_kit", { type: "", name: "kit.docx" })).toBeNull();
  });

  it("parses submitted files, including removals", () => {
    expect(submittedAssetsSchema.parse(undefined)).toEqual({});
    expect(
      submittedAssetsSchema.parse({
        media_kit: null,
        company_logo: { path: "a/b/c.png", fileName: " logo.png " },
      }),
    ).toEqual({ media_kit: null, company_logo: { path: "a/b/c.png", fileName: "logo.png" } });
    expect(submittedAssetsSchema.safeParse({ video: null }).success).toBe(false);
  });

  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
