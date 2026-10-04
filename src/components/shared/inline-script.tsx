/**
 * A <script> that runs during HTML parsing on full page loads, before React
 * hydrates. On the client it renders inert, which avoids React's dev warning.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
