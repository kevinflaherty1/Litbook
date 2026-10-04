"use client";

import { createContext, useContext } from "react";

const NonceContext = createContext<string | undefined>(undefined);

/** Makes this request's CSP nonce available to client components (e.g. InlineScript). */
export function NonceProvider({ nonce, children }: { nonce: string | undefined; children: React.ReactNode }) {
  return <NonceContext value={nonce}>{children}</NonceContext>;
}

export function useNonce() {
  return useContext(NonceContext);
}
