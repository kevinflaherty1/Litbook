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
npm test            # 80 tests, node:test
npm run typecheck   # needs `npm install` for typescript and @types/node
```

## Testing

```sh
npm test                                   # automated suite (node:test), no install needed
npm run sample:risky -- /tmp/risky-export  # generate an export containing risky data

V="--vault /tmp/pdm-demo"                  # keep demo data out of your real vault
./bin/pdm.js import test/fixtures/instagram $V      # clean sample: "nothing sensitive found"
./bin/pdm.js transform latest --to twitter $V       # drafts + warnings
./bin/pdm.js export-saved latest $V                 # likes/saves/collections → bookmarks.html
./bin/pdm.js import /tmp/risky-export $V            # "⚠ Risk scan: 5 high, 3 medium"
./bin/pdm.js scan latest $V                         # masked, highlighted findings
./bin/pdm.js transform latest --to reddit --subreddit test $V   # risky posts: blocked
./bin/pdm.js scan latest --ack <finding-id> $V      # unblock one reviewed finding
rm -rf /tmp/pdm-demo /tmp/risky-export
```

With your own data, request your archive from the platform, unzip it, and run `import` on the folder.

## Common data model

Defined in [`src/model/types.ts`](src/model/types.ts) and versioned with `SCHEMA_VERSION`.

| Entity       | What it is                                                  | Notes                                                                                              |
| ------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `Bundle`     | Everything from one export of one account                   | Unit of storage. Has `importWarnings` for anything the importer skipped.                           |
| `Profile`    | Handle, display name, bio, website                          |                                                                                                    |
| `Post`       | Something you published at the top level                    | Tweet, Instagram post or reel, Reddit submission                                                   |
| `Comment`    | A reply you wrote on someone else's content                 | Replies to other people on X land here, not in `posts`                                             |
| `Connection` | A follower or account you follow                            | X archives give numeric ids only (`handle: "id:123"`)                                              |
| `MediaAsset` | A photo, video, GIF or audio file                           | Stored once per unique file (keyed by `sha256`); posts point to it by id                           |
| `SavedItem`  | Someone else's post or comment you liked, saved or voted on | Kept as a link (plus text, author and date when the export has them). Filed under collection names |
| `Collection` | A named folder of saved items (Instagram collections)       | Lists its items in the platform's order                                                            |

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

### Likes, saves and collections

| Platform  | Files read                                                                              | Notes                                                                                    |
| --------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Instagram | `liked_posts.json`, `liked_comments.json`, `saved_posts.json`, `saved_collections.json` | A saved post that's also in collections is stored once, tagged with each collection name |
| X/Twitter | `like.js`                                                                               | Includes the liked tweet's text. X archives don't include bookmarks                      |
| Reddit    | `saved_posts.csv`, `saved_comments.csv`, `post_votes.csv`, `comment_votes.csv`          | Votes you later removed (`none`) are skipped                                             |

You can't re-post someone else's content, so these migrate as **bookmarks** rather than drafts:

```sh
./bin/pdm.js export-saved latest                     # bookmarks.html: import into any browser, Raindrop, Pocket…
./bin/pdm.js export-saved latest --format csv        # spreadsheet
./bin/pdm.js export-saved latest --format json
./bin/pdm.js export-saved latest --include-downvotes # downvotes are left out by default
```

In the HTML file, likes, saves and upvotes each get a folder, and every collection becomes a subfolder of Saved.
Saved items are other people's content, so the export treats every field as untrusted: text is HTML-escaped, only
`http(s)` links are written (no `javascript:` or `data:` URLs), and CSV cells that a spreadsheet would run as a formula
(`=`, `+`, `-`, `@`) get a leading `'`. Saved links are also risk-scanned, because a bookmarked link can carry a login
or reset token.

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

## Risk scanning

Every import is scanned for data that's dangerous to have public or to re-post. `pdm scan` shows the results:

```sh
./bin/pdm.js scan latest                      # all findings, highlighted in context
./bin/pdm.js scan latest --min-severity high
./bin/pdm.js scan latest --json               # machine-readable, still masked
./bin/pdm.js scan latest --ack 3f83f9707d19   # reviewed it, it's fine: stop blocking
```

```
▲ HIGH  payment card number
    post twitter:post:2001 · text · 2024-03-08
    lol my new card came »card ending 1111« dont steal it
    → Call the card issuer and ask for a replacement card.
    id d16552756d33
```

| Severity | What's detected                                                                                                                                                                                                                                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High     | Payment card numbers (Luhn-checked), IBANs (mod-97-checked), US SSNs, private keys, AWS/GitHub/Slack/Stripe/Google keys, "password is …", tokens in URLs, **GPS coordinates inside photo/video metadata**, followers-only or private posts (re-posting makes them public), DMs/contacts/device tokens left in the raw export |
| Medium   | Phone numbers, email addresses, street addresses, GPS coordinates in text, dates of birth, session tokens (JWTs), login-IP and account files in the raw export                                                                                                                                                               |

**How it affects transforms:** a post with an unacknowledged high-risk finding is `blocked`. Its draft text is left out
of the plan file entirely, so it can't be copy-pasted and published by accident. Acknowledge the specific finding with
`--ack`, or pass `--allow-risky` to `transform`. Medium findings don't block, but they force `needs_review` and show up
as warnings.

### How the scanner protects the data it finds

- **Raw values are never stored or printed.** A finding holds a masked rendering ("card ending 1111", "AKIA••••
  (20 chars)"), a redacted excerpt, and a fingerprint. Every sensitive value in an excerpt is masked, not just the
  one the finding is about. If the excerpt's edge would cut through a value, the excerpt is widened so the whole
  value gets masked. Tests check that no raw value appears in the report file, the terminal output or the plan.
- **Fingerprints use a secret key.** A plain hash of a phone number or SSN can be reversed by trying every possible
  number. Fingerprints are instead keyed with a random 32-byte secret stored at `<vault>/.secret-key` (0600, created
  so two processes can't each make a different one). They group repeats ("same value appears 2×") but are useless
  outside your vault.
- **Text from the export can't control your terminal.** Before anything is printed, escape sequences, control
  characters and bidi overrides (characters that can make text display in a different order) are removed. A crafted
  post can't rewrite the screen or hide a line.
- **File parsing is defensive.** The EXIF/MP4 parsers read only the start (and, for video, the end) of each file and
  check every offset. The tests feed them truncated and random data. Coordinates are detected but never extracted.
  The detector patterns avoid catastrophic backtracking.
- **Everything stays local.** Reports and acknowledgements live in `<vault>/risk/` with 0600 permissions. No network
  access.

Add a detector by adding one entry to `TEXT_DETECTORS` in [`src/risk/detectors.ts`](src/risk/detectors.ts): a pattern,
an optional validator, a mask function and advice text.

## Not built yet (prototype scope)

- Publishing through each platform's API. Drafts are the hand-off point.
- Downloading media that exists only as a link (Reddit images), and converting GIFs to MP4.
- Bluesky, Mastodon, Threads, TikTok. Each one needs one importer and/or one transformer.
- Reading `.zip` files directly (unzip the export first for now).
- Encrypting the vault at rest.
- Removing EXIF/GPS metadata from flagged media automatically (right now it's only flagged).
