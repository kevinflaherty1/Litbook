/**
 * Writes a sample X/Twitter export that contains risky data, for trying the
 * risk scanner by hand:  npm run sample:risky -- <output-dir>
 *
 * Secret-shaped values are assembled at runtime so none sits in the repo as a
 * literal (and they are well-known test values: Visa test card, AWS's
 * documented example key, a 555 phone number).
 */
import { cp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const out = process.argv[2];
if (!out) {
  console.error("usage: npm run sample:risky -- <output-dir>");
  process.exit(1);
}
const dir = path.resolve(out);
const base = fileURLToPath(new URL("../test/fixtures/twitter", import.meta.url));
await cp(base, dir, { recursive: true, errorOnExist: false });

const card = ["4111", "1111", "1111", "1111"].join(" ");
const awsKey = "AKIA" + "IOSFODNN7" + "EXAMPLE";
const email = "sam.rivera" + "@" + "example.com";

const tweet = (id: string, text: string) => ({
  tweet: {
    id_str: id,
    created_at: "Fri Mar 08 10:00:00 +0000 2024",
    full_text: text,
    favorite_count: "0",
    retweet_count: "0",
    entities: {},
  },
});

const tweetsFile = path.join(dir, "data/tweets.js");
const existing = JSON.parse((await readFile(tweetsFile, "utf8")).replace(/^[^=]*=/, ""));
const tweets = [
  ...existing,
  tweet("2001", `lol my new card came ${card} don't steal it`),
  tweet("2002", `deploy key ${awsKey} oops`),
  tweet("2003", `call me (555) 867-5309 or mail ${email}`),
  tweet("2004", "wifi password is hunter2hunter2 for the party"),
  tweet("2005", `same card again ${card.replace(/ /g, "-")}`),
];
await writeFile(tweetsFile, `window.YTD.tweets.part0 = ${JSON.stringify(tweets, null, 2)}`);
// Files the importer skips but the scanner should warn about.
await writeFile(path.join(dir, "data/direct-messages.js"), "window.YTD.direct_messages.part0 = []");
await writeFile(path.join(dir, "data/ip-audit.js"), "window.YTD.ip_audit.part0 = []");

console.log(`Risky sample export written to ${dir}`);
