import { describe, expect, it } from "vitest";
import { MediaInfoError, parseMediaInfo, pickRendition } from "./mediaInfo";

const video = (w: number, h: number) => ({ url: `https://cdn/v${w}.mp4`, width: w, height: h, type: 101 });

describe("pickRendition", () => {
  it("picks the short side closest to 720", () => {
    expect(pickRendition([video(1080, 1920), video(720, 1280), video(480, 852)])?.width).toBe(720);
    expect(pickRendition([video(1080, 1920), video(360, 640)])?.width).toBe(1080);
  });
  it("returns null for an empty list", () => expect(pickRendition([])).toBeNull());
});

describe("parseMediaInfo", () => {
  it("parses a reel", () => {
    const info = parseMediaInfo({
      status: "ok",
      items: [
        {
          pk: "3456789012345678901",
          code: "C9xYzAbCdEf",
          media_type: 2,
          taken_at: 1730000000,
          video_duration: 31.5,
          video_versions: [video(1080, 1920), video(720, 1280)],
          caption: { text: "Best pasta ever #recipe" },
          user: { username: "chef" },
        },
      ],
    });
    expect(info).toEqual({
      mediaId: "3456789012345678901",
      shortcode: "C9xYzAbCdEf",
      author: "chef",
      caption: "Best pasta ever #recipe",
      takenAt: 1730000000,
      parts: [{ kind: "video", url: "https://cdn/v720.mp4", width: 720, height: 1280, durationSec: 31.5 }],
    });
  });

  it("parses a carousel of a video and a photo, skipping unknown children", () => {
    const info = parseMediaInfo({
      items: [
        {
          pk: 1,
          media_type: 8,
          caption: null,
          carousel_media: [
            { media_type: 2, video_versions: [video(720, 1280)], video_duration: 5 },
            {
              media_type: 1,
              image_versions2: {
                candidates: [
                  { url: "https://cdn/i320.jpg", width: 320, height: 400 },
                  { url: "https://cdn/i1080.jpg", width: 1080, height: 1350 },
                ],
              },
            },
            { media_type: 99 },
          ],
        },
      ],
    });
    expect(info.caption).toBeNull();
    expect(info.parts.map((p) => [p.kind, p.url])).toEqual([
      ["video", "https://cdn/v720.mp4"],
      ["image", "https://cdn/i1080.jpg"],
    ]);
  });

  it("reports login failures and empty responses", () => {
    expect(() => parseMediaInfo({ status: "fail", message: "login_required" })).toThrow("login_required");
    expect(() => parseMediaInfo({ items: [] })).toThrow(MediaInfoError);
    expect(() => parseMediaInfo("<html>")).toThrow(MediaInfoError);
  });
});
