/**
 * Server-only application config resolved from the environment at the web
 * app's composition boundary — NOT inside the engine library, which must
 * stay env-free (a library that reads `process.env` at import time is
 * impossible to configure per-consumer and leaks the runtime boundary into
 * the domain). `PUBLIC_URL` is the externally reachable origin used to build
 * absolute short URLs (`${publicUrl}/s/${code}`).
 *
 * `undefined` when unset; callers apply their own fallback (routes render
 * "-" or a root-relative path) — behavior preserved from the previous
 * engine-level `baseUrl` export.
 */
export const publicUrl: string | undefined = process.env.PUBLIC_URL;
