# Design: Clean UI (Slice 5)

## Technical Approach

Presentation-only slice on `applications/web`. Vendor a minimal shadcn/ui set manually
into `~/components/ui/*` (the CLI assumes Tailwind 3), map shadcn's token contract onto
Tailwind 4's CSS-first `@theme` in `app.css`, and drive light/dark via a `class` on
`<html>`. Restructure `_index.tsx` JSX only (action/loader/headers/rate-limit/CSP untouched)
and add `urls.tsx` (loader → `engine.listUrls()`, card list). Colors are the canonical
Kanagawa Dragon (dark) / Lotus (light) palettes. Satisfies delta specs `web-ui` and
modified `url-listing`; stays strictly within Slice 5 (no backend, no pagination).

## Architecture Decisions

| Decision | Alternatives rejected | Rationale |
|---|---|---|
| **Manual-vendor shadcn into `~/components/ui`; no CLI, no `tailwind.config.js`** | Run `shadcn init`; use Radix directly; hand-roll | CLI writes a Tailwind-3 `tailwind.config.js` + preflight that fights our Tailwind-4 CSS-first `@theme`. Vendoring gives the reviewer-visible "reusable component library" signal (#792) without a config regression. |
| **Map shadcn tokens as CSS vars in `app.css`, bind via `@theme inline`** | Hardcode Kanagawa hex in component classes; JS config | shadcn components reference `bg-background`, `text-foreground`, `border-border`, etc. In Tailwind 4 those utilities exist only if `--color-background` etc. are declared in `@theme`. `@theme inline` lets the `--color-*` tokens resolve to raw `--background` vars that flip per theme — single source, both themes, zero component edits. |
| **Theme via `class="dark"` on `<html>`, set by a tiny inline `<script nonce>` before paint** | `prefers-color-scheme` only; cookie+SSR class; React state post-hydration | Toggle + persistence needs a class. To avoid FOUC the class must exist before first paint; a nonce'd inline script (CSP already allows `Scripts` nonce) reads `localStorage`/`matchMedia` synchronously in `<head>`. React-state-only flashes; cookie approach adds a loader round-trip we don't need. |
| **`cn()` = `clsx` + `tailwind-merge` in `~/lib/utils.ts`** | Bare template strings | Standard shadcn helper; lets variant classes be overridden predictably. Two tiny deps. |
| **Card list for `/urls` (not table)** | Responsive table | LOCKED (#839) + mobile-first: cards stack single-column on phones, no horizontal scroll. |
| **Format Dates in the component, not the loader** | Serialize pre-formatted strings in loader | RR v7 serializes `Date`→string across the SSR boundary; typed `loaderData` rehydrates as `string`. Parse with `new Date(value)` + `Intl.DateTimeFormat` in the card for locale-correct, testable rendering. |
| **Errors/pending from `useActionData` + `useNavigation`** | `useFetcher` | Form is a full document POST; `useNavigation().state === "submitting"` gives the pending state and `useActionData` the typed 400/429 message — no behavior change to the action. |

## Kanagawa Tokens (verified against rebelot/kanagawa.nvim colors.lua)

`:root` = Lotus (light): `--background #f2ecbc`, `--foreground #545464`, `--card #e7dba0`,
`--muted #e7dba0`/`--muted-foreground #8a8980`, `--primary #5d57a3`, `--border #d5cea3`,
`--destructive #c84053`, `--ring #6693bf`.
`.dark` = Dragon: `--background #181616`, `--foreground #c5c9c5`, `--card #282727`,
`--muted #282727`/`--muted-foreground #a6a69c`, `--primary #8ba4b0`, `--border #393836`,
`--destructive #c4746e`, `--ring #8ba4b0`. (Full mapping in tasks. Core tokens VERIFIED against rebelot/kanagawa.nvim colors.lua: dragonBlack3 #181616, dragonWhite #c5c9c5, lotusWhite3 #f2ecbc, lotusInk1 #545464.)

## Data Flow

    /       GET  loader → { baseUrl }
            POST action (UNCHANGED) → { shortenedUrl } | { error, status } → inline alert / Copy button
    /urls   GET  loader → engine.listUrls() → ShortenedUrl[] (createdAt desc, Dates serialized)
                 → <UrlCard> map | empty state
    <html class="dark?"> ← nonce'd inline script (localStorage/matchMedia) ← ThemeToggle writes localStorage + toggles class

## File Changes

| File | Action | Description |
|---|---|---|
| `app/components/ui/{button,input,label,card}.tsx` | Create | Vendored shadcn primitives |
| `app/components/theme-toggle.tsx` | Create | Client toggle: flips `<html>.dark`, persists to `localStorage` |
| `app/components/copy-button.tsx` | Create | `navigator.clipboard.writeText` + transient "Copied" feedback |
| `app/components/url-card.tsx` | Create | One listing row: code/link, truncated destination (title attr), clickCount, lastClickedAt, createdAt |
| `app/lib/utils.ts` | Create | `cn()` (clsx + tailwind-merge) |
| `app/routes/urls.tsx` | Create | Loader → `engine.listUrls()`; card list + empty state; nav to `/` |
| `app/routes/_index.tsx` | Modify | JSX only — Input/Label/Button, inline error alert, pending state, created-URL + CopyButton, nav to `/urls`. **action/loader/headers/rate-limit UNCHANGED** |
| `app/app.css` | Modify | Add shadcn token vars for `:root`+`.dark`, `@theme inline` color bindings; keep `@import "tailwindcss"` |
| `app/root.tsx` | Modify | Add nonce'd theme-init `<script>` in `<head>` + app shell/nav. **Keep nonce on Links/Scripts/ScrollRestoration** |
| `components.json`, `package.json` | New/Modify | shadcn manifest + deps: `class-variance-authority`, `clsx`, `tailwind-merge`, `@radix-ui/react-label`, `lucide-react` |

## Interfaces / Contracts

```ts
// engine (existing, Slice 2) — consumed read-only by the /urls loader
listUrls(): Promise<ShortenedUrl[]> // ordered createdAt desc
type ShortenedUrl = { code: string; longUrl: string; clickCount: number;
  lastClickedAt: Date | null; createdAt: Date };
// After SSR serialization the loader data types are string for the two Date fields.
```

## Layout (mobile-first)

Single-column, `min-h-screen`, container `mx-auto w-full max-w-md px-4` scaling to
`sm:max-w-xl md:max-w-2xl`, vertical spacing `gap-4 sm:gap-6`. Interactive targets
`h-11`/`min-h-11` (≥44px touch). Form: stacked Label→Input→Button full-width on mobile,
Button inline `sm:` up. `/urls`: cards stack; grid stays 1-col (readability over density).

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Route (`urls.tsx`) | List renders code/dest/clicks/dates; empty state when `[]` | RR test harness / RTL, stub `engine.listUrls` |
| Route (`_index.tsx`) | 400 & 429 → correct inline message; created URL shows Copy | `useActionData` shapes; assert text, not styling |
| Component | CopyButton calls `clipboard.writeText` + shows feedback | RTL, mock `navigator.clipboard` |
| Manual/Docker | Theme flip no-FOUC, CSP intact, responsive | `pnpm build` + Docker serve; not unit-tested for pixels |

Strict TDD: behavior tests (list/empty, error mapping, copy) RED→GREEN. Presentational
styling and theme visuals verified manually — no pixel unit tests.

## Migration / Rollout

No migration. Chained PR touching only `applications/web`; revert restores prior UI,
engine/server untouched.

## Open Questions

- [ ] Confirm Lotus is the intended light pairing and the exact Kanagawa hex mapping (assumed canonical; flagged in #839).
- [ ] `lucide-react` acceptable for the theme/copy icons, or inline SVG to keep deps minimal?
