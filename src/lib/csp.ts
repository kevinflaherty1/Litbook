/**
 * Content Security Policy for every page. Scripts need this request's nonce
 * ('strict-dynamic' then trusts what those scripts load). Styles allow
 * 'unsafe-inline' because Radix positions popovers with inline style
 * attributes. Supabase is allowed for headshot uploads and signed image URLs.
 */
export function buildCsp({
  nonce,
  supabaseUrl,
  isDev,
}: {
  nonce: string;
  supabaseUrl: string;
  isDev: boolean;
}) {
  const supabase = new URL(supabaseUrl).origin;
  const https = supabase.startsWith("https:");
  const directives = [
    "default-src 'self'",
    // React needs eval in development for better error stacks; never in production.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data: ${supabase}`,
    "font-src 'self'",
    `connect-src 'self' ${supabase}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ];
  return directives.join("; ");
}

export function generateNonce() {
  return btoa(crypto.randomUUID());
}
