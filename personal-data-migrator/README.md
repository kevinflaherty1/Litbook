# personal-data-migrator (prototype)

Take your data out of one social platform, keep it **on your own device**, and reshape it into
ready-to-post drafts for another platform.

```
 platform export ──▶ importer ──▶ common data model ──▶ local vault ──▶ transformer ──▶ drafts for target
 (Instagram/X/Reddit)            (src/model/types.ts)   (on disk)      (one per target)  (+ warnings)
```

Every importer writes the **common data model** and every transformer reads it. Adding a platform
means one importer and/or one transformer, not a converter for every pair of platforms.

Nothing goes over the network. The tool reads the archive you downloaded yourself (each platform's
"Download your data" feature) and writes plain JSON to a local folder.

## Quick start

Requires Node 22.6+. There are no runtime dependencies or build step; Node runs the TypeScript directly.

```sh
cd personal-data-migrator

# 1. Import an unzipped export (the platform is auto-detected)
./bin/pdm.js import ~/Downloads/instagram-sam.outdoors-2026-10-01

# 2. See what's stored
./bin/pdm.js list
./bin/pdm.js show latest

# 3. Make drafts for another platform
./bin/pdm.js transform latest --to twitter
./bin/pdm.js transform latest --to reddit --subreddit hiking --attribution
```

To try it without real data, point `import` at `test/fixtures/instagram`, `test/fixtures/twitter` or
`test/fixtures/reddit`, and pass `--vault /tmp/pdm-demo` to keep the demo out of your real vault.

```sh
npm test            # 52 tests, node:test
npm run typecheck   # needs `npm install` for typescript and @types/node
```

## Common data model

Defined in [`src/model/types.ts`](src/model/types.ts) and versioned with `SCHEMA_VERSION`.

| Entity       | What it is                                  | Notes                                                                    |
| ------------ | ------------------------------------------- | ------------------------------------------------------------------------ |
| `Bundle`     | Everything from one export of one account   | Unit of storage. Has `importWarnings` for anything the importer skipped. |
| `Profile`    | Handle, display name, bio, website          |                                                                          |
| `Post`       | Something you published at the top level    | Tweet, Instagram post or reel, Reddit submission                         |
| `Comment`    | A reply you wrote on someone else's content | Replies to other people on X land here, not in `posts`                   |
| `Connection` | A follower or account you follow            | X archives give numeric ids only (`handle: "id:123"`)                    |
| `MediaAsset` | A photo, video, GIF or audio file           | Stored once per unique file (keyed by `sha256`); posts point to it by id |

Rules the model follows:

- **Plain text and extracted entities, not markup.** `Post.text` is what you wrote. Hashtags,
  mentions and URLs are pulled into `entities`, and each transformer writes text in its target's
  format. Reddit posts are the one exception: their markdown is kept as-is and flattened only on
  output.
- **Nothing is dropped.** Data only one platform has goes in `extensions[platform]`, for example
  Instagram's post/reel kind or Reddit gildings.
- **Threads.** Posts in an X self-reply thread share a `threadId`. Transformers merge a thread into
  one logical post, so a 5-tweet thread becomes one Reddit post instead of five.
- **Stable ids.** Each record's local id comes from the platform's own id, or from a content hash
  when the platform has none (Instagram). Importing the same export twice gives the same ids.
- **Privacy.** Data that has no use for migration is never read in. For example, the IP addresses
  in Reddit exports are discarded.

## Importers

Each one reads the platform's official export after you unzip it. Files are found by name, not by a
fixed path, because platforms move them between export versions.

| Platform  | Files read                                                                                                              | Notes                                                                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Instagram | `personal_information.json`, `posts_N.json`, `reels.json`, `post_comments_N.json`, `followers_N.json`, `following.json` | Fixes Meta's double-encoded UTF-8 ("Ã©" → "é"). Single-photo posts keep their caption on the media item.                                      |
| X/Twitter | `account.js`, `profile.js`, `tweets.js` / `tweet.js` (+ `-partN`), `tweets_media/`, `follower.js`, `following.js`       | Reads the `window.YTD… =` wrapper, swaps `t.co` links for the real URLs, removes media links, decodes HTML entities, marks `RT @` as reposts. |
| Reddit    | `posts.csv`, `comments.csv`, `statistics.csv`                                                                           | Has a CSV parser that handles quoted fields with line breaks. The export has no media files, so image posts link to the remote image.         |

## Local vault

```
~/.local/share/personal-data-migrator/     ($PDM_VAULT or --vault to override)
  index.json                               one summary row per bundle
  bundles/<platform>-<handle>-<time>.json  a Bundle in the common model
  media/ab/<sha256>.<ext>                  each file stored once, by content hash
  plans/<bundle>-to-<target>.json          transformer output
```

Data is stored as plain JSON so you can still read it without this tool. Folders are created with
permissions 0700 and files with 0600. Writes go to a temp file and are then renamed into place, so
a crash can't leave a half-written file. Imports refuse media paths that point outside the export
folder.

## Transformers

Each post becomes a `TransformResult`:

- `ready`: valid for the target as-is
- `needs_review`: valid, but the tool made a judgement call (a generated title, dropped hashtags, …)
- `skipped`: can't be posted on the target. `reason` says why.

Every change that loses or alters content is listed in `warnings`.

| Target    | Limits enforced                                                                                                    | Content changes                                                                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| X/Twitter | 280 characters counted X's way (links = 23, CJK and emoji = 2), 4 images per tweet, videos/GIFs in their own tweet | Long text becomes a numbered thread split between words. Extra media goes in follow-up tweets. An Instagram block of trailing hashtags is cut to 3. Reddit markdown is converted to plain text.                     |
| Reddit    | Title required, at most 300 characters. Body at most 40,000. One video, or a gallery of up to 20 images.           | Writes a title from the first sentence when the post has none. Escapes markdown so a line starting with `#tag` doesn't turn into a heading. Removes hashtag blocks. Picks self, link, image, gallery or video post. |
| Instagram | At least one photo or video. Caption at most 2,200 characters. 5 hashtags. Carousel of up to 20 items.             | Text-only posts are skipped. A single video becomes a reel. Links are written out in the caption because they can't be tapped. Alt text is kept. GIFs are flagged for conversion to MP4.                            |

For every target:

- Reposts of other people's content are skipped unless you pass `--include-reposts`.
- `--attribution` adds an "Originally posted on X · date" line.
- **@mentions are flagged, never rewritten.** `@alice` on Instagram may not be `@alice` on X.

## Not built yet (prototype scope)

- Publishing through each platform's API. Drafts are the hand-off point.
- Downloading media that exists only as a link (Reddit images), and converting GIFs to MP4.
- Bluesky, Mastodon, Threads, TikTok. Each one needs one importer and/or one transformer.
- Reading `.zip` files directly (unzip the export first for now).
- Encrypting the vault at rest.
