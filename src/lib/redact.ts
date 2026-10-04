/** Paths whose last segment is a credential (guest portal, team invites). */
const TOKEN_PATHS = /^\/(submit|invite)\/[^/?#]+/;

/** Removes tokens and query strings from a path before it's logged. */
export function redactPath(path: string) {
  return path.split(/[?#]/)[0].replace(TOKEN_PATHS, "/$1/[token]");
}
