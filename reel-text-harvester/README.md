# Reel Text Harvester (prototype)

Pick one of your own **Instagram Saved collections** on your phone and get the text out of every post in
it: on-screen captions (OCR on sampled video frames), the post caption, and optionally the spoken words
(Whisper). Everything runs **on the device**; there is no server.

```
 ┌─ Browse screen ───────────────┐      ┌─ Runner (one post at a time, 2.5–5 s apart) ─────────────────────┐
 │ WebView: you log in, open a   │      │ 1. resolve   hidden WebView → /api/v1/media/<id>/info/ (your     │
 │ collection, tap Harvest       │      │              session cookies) → video/image URLs, caption       │
 │   injected script auto-       │ ───▶ │ 2. download  CDN file → app cache                                 │
 │   scrolls the grid, collects  │ job  │ 3. frames    expo-video-thumbnails at 1 fps (cap 120/video)       │
 │   /p/ and /reel/ links        │      │ 4. OCR       ML Kit text recognition → merge repeats across frames│
 └───────────────────────────────┘      │ 5. speech    (opt.) native module → 16 kHz WAV → whisper.cpp      │
                                        │ 6. cleanup   delete video, frames, audio; save JSON to documents  │
                                        └───────────────────────────────────────────────────────────────────┘
```

Results are browsable in the app and exportable as Markdown or JSON through the share sheet.

## Running it

It uses native modules (ML Kit, whisper.cpp, a local audio module), so it needs a **development build**.
Expo Go will not work.

```sh
cd reel-text-harvester
npm install
npm run android        # expo run:android (needs Android Studio / SDK)
npm run ios            # expo run:ios (needs a Mac with Xcode)
# or build in the cloud without local tooling:
npx eas-cli@latest build --profile development --platform ios
```

Change `ios.bundleIdentifier` / `android.package` in `app.json` (currently `com.example.reeltextharvester`)
before you ship a build anywhere.

Checks:

```sh
npm run typecheck      # tsc
npm run lint           # expo lint
npm test               # vitest: shortcode/id maths, API parsing, frame schedule, OCR merging
npm run test:scripts   # runs the injected WebView scripts in headless Chromium against a fake grid
```

## Layout

| Path | What |
| --- | --- |
| `src/app/` | Screens (Expo Router): home list, `browse` (WebView + harvest), `job/[id]` (progress, results, export) |
| `src/components/HarvesterProvider.tsx` | Owns the job store, the runner, and the hidden 1×1 WebView used for API lookups |
| `src/lib/injected/scripts.ts` | JS injected into the WebView: grid auto-scroll harvester, media-info fetch |
| `src/lib/pipeline.ts` | Per-post work: resolve → download → frames → OCR → speech → cleanup |
| `src/lib/runner.ts` | Queue, pacing between posts, pause/resume, pauses the job on logout or rate limiting |
| `src/lib/textMerge.ts` | Folds the same caption read across many frames into one line; optional margin filter |
| `src/lib/store.ts` | One JSON file per job in app documents; interrupted runs resume where they stopped |
| `modules/audio-extract/` | Local Expo module (Swift: AVAssetReader, Kotlin: MediaExtractor + MediaCodec) that decodes a video's audio to 16 kHz mono WAV, the only format whisper.rn accepts |

## Design notes

- **Download, then OCR, not screen capture.** The file from Instagram's CDN has no app UI on it, so there
  are no buttons to crop out. `JobOptions.margins` can still drop text near the edges (e.g. a re-posted
  TikTok watermark); it defaults to keeping everything.
- **One OCR engine on both platforms.** ML Kit runs on iOS too, so there is one code path. Apple Vision
  (`VNRecognizeTextRequest`) is often a little better on iOS. Swapping it in means a second local Expo
  module with the same `recognize(uri) → lines with boxes` shape.
- **Repeat folding.** At 1 fps a caption that stays up for 4 s is read 4 times, with OCR noise and with
  type-on growth ("Step 1" → "Step 1: boil the pasta"). `OcrAccumulator` merges near-duplicates
  (≥ 0.8 similarity, or a growing prefix) and keeps the most common or most complete reading, with
  first/last-seen timestamps.
- **Session stays in the WebView.** API lookups run *inside* an instagram.com page through
  `injectJavaScript`, so they carry your own cookies, and the app never sees or stores your password or
  session token. The hidden bridge loads `instagram.com/robots.txt` (same origin, none of the site's
  JavaScript).
- **Speech is opt-in.** The first job with speech on downloads `ggml-base.bin` (~148 MB) from Hugging
  Face into app documents. After that, transcription is offline. Language is auto-detected.

## Things to know

- **Instagram's terms.** Automated collection from Instagram, even of your own saved posts, can break
  Instagram's Terms of Use and may get an account rate-limited, challenged, or restricted. The app goes
  slowly on purpose (a 1.4 s scroll cadence, 2.5–5 s between posts, one request per post). It pauses as
  soon as Instagram answers 429, 401/403, or asks you to log in. It is meant for your own collections,
  for personal use. Raising the pace raises the risk.
- **Undocumented endpoints.** `/api/v1/media/<id>/info/`, the `X-IG-App-ID` header, and the grid's link
  format are not public APIs and can change without notice. Each of them is isolated in
  `injected/scripts.ts` or `mediaInfo.ts`, and the parser fails per post with a message instead of
  crashing.
- **Keep the app open.** iOS suspends background apps, so the runner keeps the screen awake. A killed run
  resumes from the next unfinished post.
- **OCR script.** ML Kit is set to Latin. Other scripts (CJK, Devanagari) need the matching ML Kit model
  passed to `TextRecognition.recognize`.

## Status

What has been run:

- typecheck, lint, 32 unit tests
- the injected scripts in real Chromium: a 50-post virtualized grid, stopping early, the media-id fallback,
  and rejection of foreign messages
- Metro/Hermes production bundles for iOS and Android
- `expo prebuild` for Android (config plugins apply, and `audio-extract` is autolinked)

What has **not** been run yet: a native compile (the Swift and Kotlin in `modules/audio-extract` have
never been built), and any run on a real device against live Instagram. Do that first.
