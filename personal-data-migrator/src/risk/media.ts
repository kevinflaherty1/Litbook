import { open } from "node:fs/promises";

/*
 * Location metadata embedded in media files. Platforms usually strip this on
 * upload, but the copies in your export (and in the vault) are often the
 * originals, and re-uploading somewhere that doesn't strip it publishes the
 * exact spot the photo was taken.
 *
 * Parsers are bounds-checked against the buffer at every read and only look at
 * the first HEAD_BYTES of the file (videos: also the tail, where `moov` often
 * sits), so a malformed or hostile file can't cause out-of-range reads or
 * unbounded work.
 */

const HEAD_BYTES = 256 * 1024;
const TAIL_BYTES = 1024 * 1024;

async function readHeadTail(file: string, tail: boolean): Promise<Buffer> {
  const fh = await open(file, "r");
  try {
    const { size } = await fh.stat();
    const head = Buffer.alloc(Math.min(size, HEAD_BYTES));
    await fh.read(head, 0, head.length, 0);
    if (!tail || size <= HEAD_BYTES) return head;
    const tailBuf = Buffer.alloc(Math.min(size - HEAD_BYTES, TAIL_BYTES));
    await fh.read(tailBuf, 0, tailBuf.length, size - tailBuf.length);
    return Buffer.concat([head, tailBuf]);
  } finally {
    await fh.close();
  }
}

/** True when a JPEG's EXIF block has a GPS IFD containing a latitude or longitude. */
export function jpegHasGps(buf: Buffer): boolean {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return false;
  let off = 2;
  while (off + 4 <= buf.length) {
    if (buf[off] !== 0xff) return false;
    const marker = buf[off + 1]!;
    if (marker === 0xda || marker === 0xd9) return false; // start of scan / end: no more metadata
    const len = buf.readUInt16BE(off + 2);
    if (len < 2) return false;
    const segStart = off + 4;
    const segEnd = Math.min(off + 2 + len, buf.length);
    if (
      marker === 0xe1 &&
      segEnd - segStart > 14 &&
      buf.toString("latin1", segStart, segStart + 6) === "Exif\0\0"
    ) {
      return tiffHasGps(buf.subarray(segStart + 6, segEnd));
    }
    off += 2 + len;
  }
  return false;
}

function tiffHasGps(t: Buffer): boolean {
  if (t.length < 8) return false;
  const le = t.toString("latin1", 0, 2) === "II";
  if (!le && t.toString("latin1", 0, 2) !== "MM") return false;
  const u16 = (o: number) => (o + 2 <= t.length ? (le ? t.readUInt16LE(o) : t.readUInt16BE(o)) : -1);
  const u32 = (o: number) => (o + 4 <= t.length ? (le ? t.readUInt32LE(o) : t.readUInt32BE(o)) : -1);
  if (u16(2) !== 42) return false;

  const findTag = (ifd: number, tags: number[]): number | undefined => {
    const count = u16(ifd);
    if (count < 0 || count > 1000) return undefined;
    for (let i = 0; i < count; i++) {
      const entry = ifd + 2 + i * 12;
      const tag = u16(entry);
      if (tag < 0) return undefined;
      if (tags.includes(tag)) return entry;
    }
    return undefined;
  };

  const ifd0 = u32(4);
  if (ifd0 < 8) return false;
  const gpsEntry = findTag(ifd0, [0x8825]); // GPSInfo pointer
  if (gpsEntry === undefined) return false;
  const gpsIfd = u32(gpsEntry + 8);
  if (gpsIfd < 8 || gpsIfd >= t.length) return false;
  return findTag(gpsIfd, [0x0002, 0x0004]) !== undefined; // GPSLatitude / GPSLongitude
}

/** QuickTime/MP4 location: the `©xyz` user-data atom or Apple's ISO 6709 location key. */
export function videoHasLocation(buf: Buffer): boolean {
  return (
    buf.includes(Buffer.from([0xa9, 0x78, 0x79, 0x7a])) || // ©xyz
    buf.includes("com.apple.quicktime.location.ISO6709")
  );
}

export async function mediaHasLocation(file: string, kind: string, mimeType?: string): Promise<boolean> {
  const isJpeg = mimeType === "image/jpeg" || /\.jpe?g$/i.test(file);
  if (kind === "image" && isJpeg) return jpegHasGps(await readHeadTail(file, false));
  if (kind === "video") return videoHasLocation(await readHeadTail(file, true));
  return false;
}
