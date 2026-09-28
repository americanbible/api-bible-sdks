/**
 * Whether this is a production build, for gating the provider's dev-only
 * warnings.
 *
 * Bundlers (Vite, webpack, Next.js, …) replace the literal `process.env.NODE_ENV`
 * at build time but define no `process` global in the browser — so a
 * `typeof process !== 'undefined'` guard would silence the warnings in every
 * browser dev build. The try/catch keeps the expression replaceable and only
 * catches the ReferenceError of an unbundled environment, which is treated as
 * development (the warnings are guardrails; better seen than missed).
 */
export function isProduction(): boolean {
  try {
    return process.env.NODE_ENV === 'production';
  } catch {
    return false;
  }
}
