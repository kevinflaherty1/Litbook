/** Parse a `window.YTD.<name>.partN = [...]` file. */
export function parseYtd<T>(source: string): T[] {
  const start = source.indexOf("=");
  if (start === -1) throw new Error("Not a Twitter archive data file");
  return JSON.parse(
    source
      .slice(start + 1)
      .trim()
      .replace(/;$/, ""),
  ) as T[];
}
