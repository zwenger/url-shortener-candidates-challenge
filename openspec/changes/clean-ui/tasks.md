# Tasks: Clean UI (Slice 5)

Presentation-only slice on `applications/web`. Final slice — no backend/engine changes.
Order: setup → theming → no-FOUC toggle → vendored components → route JSX → tests → verification.
Strict TDD is ACTIVE (runner: `pnpm test`) for logic-bearing units (loaders, action-error
mapping, CopyButton behavior) — write the failing test first, then the minimal
implementation. Presentational/pixel assertions are explicitly OUT of scope per the Test
Strategy contract in `specs/web-ui/spec.md`.

Legend: `[P]` = can run in parallel with sibling `[P]` tasks in the same group (no file
overlap). Unmarked tasks are sequential (depend on a prior task's output).

---

## 1. Deps + setup

- [x] 1.1 Add dependencies to `applications/web/package.json`:
  `class-variance-authority`, `clsx`, `tailwind-merge`, `@radix-ui/react-label`,
  `lucide-react` (runtime deps); `@testing-library/react`, `@testing-library/jest-dom`,
  `@testing-library/user-event` (devDependencies — required for the CopyButton RTL test;
  none of these exist anywhere in the monorepo yet). Run `pnpm install` at the repo root.
  — *Satisfies: design.md "File Changes" (`package.json`); enables all component tasks below.*
- [x] 1.2 Create `applications/web/app/lib/utils.ts` exporting `cn()` = `clsx` + `tailwind-merge`.
  — *Satisfies: design.md decision "`cn()` = `clsx` + `tailwind-merge`".*
- [x] 1.3 [P] Create `applications/web/components.json` (shadcn manifest: style, rsc:false,
  tsx:true, aliases `~/components`, `~/lib/utils`, `~/components/ui`) — documentation/tooling
  manifest only, no CLI run (Tailwind-3 assumption rejected per design.md).
  — *Satisfies: design.md "File Changes" (`components.json`).*
- [x] 1.4 [P] Confirm `~/components/*` and `~/lib/*` resolve via the existing `~/*` →
  `./app/*` path alias in `tsconfig.json` / `vite-tsconfig-paths` (no new alias needed —
  verify only, e.g. a throwaway import compiles under `tsc`).
  — *Satisfies: design.md; prerequisite for all `~/components/...` imports below.*

## 2. Theming (`app.css`)

- [x] 2.1 In `applications/web/app/app.css`, define CSS custom properties on `:root`
  (Kanagawa Lotus / light) and `.dark` (Kanagawa Dragon) for the full shadcn token set:
  `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`,
  `--popover-foreground`, `--primary`, `--primary-foreground`, `--secondary`,
  `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`,
  `--accent-foreground`, `--destructive`, `--destructive-foreground`, `--border`,
  `--input`, `--ring`. Use the VERIFIED core values from design.md (`--background
  #f2ecbc`, `--foreground #545464`, `--card #e7dba0`, `--muted #e7dba0`/`--muted-foreground
  #8a8980`, `--primary #5d57a3`, `--border #d5cea3`, `--destructive #c84053`, `--ring
  #6693bf` for `:root`; `--background #181616`, `--foreground #c5c9c5`, `--card #282727`,
  `--muted #282727`/`--muted-foreground #a6a69c`, `--primary #8ba4b0`, `--border #393836`,
  `--destructive #c4746e`, `--ring #8ba4b0` for `.dark`); derive the remaining
  (secondary/accent/popover/input/foreground-on-color) tokens consistently from the same
  two palettes — do not introduce new, unverified hex values outside the Lotus/Dragon set.
  — *Satisfies: `web-ui` spec "Light and Dark Theming"; design.md Kanagawa Tokens table.*
- [x] 2.2 Wire `@theme inline` in `app.css` mapping `--color-background: var(--background)`,
  `--color-foreground: var(--foreground)`, etc. for every token in 2.1, so Tailwind 4
  utilities (`bg-background`, `text-foreground`, `border-border`, `ring-ring`, ...) resolve.
  Keep `@import "tailwindcss"` as the first line. Remove or reconcile the old
  `bg-white dark:bg-gray-950` rule on `html, body` now that `bg-background` covers it.
  — *Satisfies: `web-ui` spec "Light and Dark Theming" scenario "no missing tokens".*
  — Depends on: 2.1.

## 3. No-FOUC theme toggle

- [x] 3.1 In `applications/web/app/root.tsx`, add a nonce'd inline `<script>` in `<head>`
  (after `<Links nonce={nonce} />`) that reads `localStorage.theme` (fallback:
  `matchMedia("(prefers-color-scheme: dark)")`) and sets `document.documentElement.classList`
  synchronously before paint. MUST receive the same `nonce` prop/value already used by
  `<Links>`/`<Scripts>`/`<ScrollRestoration>` — do not weaken or bypass the existing CSP
  nonce wiring. Guard for the `nonce === undefined` hydration-fallback path (existing pattern
  in `root.tsx`).
  — *Satisfies: `web-ui` spec (dark/light rendering, no visible flash — implied by
  "Light and Dark Theming"); design.md decision "Theme via `class=\"dark\"`... nonce'd inline
  script"; regression guard for spec scenario "CSP nonce still applied to Links and Scripts".*
- [x] 3.2 Create `applications/web/app/components/theme-toggle.tsx`: client component that
  toggles `document.documentElement.classList` and persists the choice to
  `localStorage.theme`. Accessible control (button with `aria-label`, keyboard-reachable).
  — *Satisfies: `web-ui` spec "Accessibility Basics"; design.md "File Changes"
  (`theme-toggle.tsx`).*
  — Depends on: 3.1 (shares the same class/localStorage contract).

## 4. Vendored shadcn components [P after 1.1–1.2]

- [x] 4.1 [P] Create `applications/web/app/components/ui/button.tsx` (cva variants,
  Tailwind-4 tokens from Section 2, `~44px`/`h-11` touch target for default size).
  — *Satisfies: `web-ui` spec "Shorten Form Uses Reusable Components"; design.md "File
  Changes".*
- [x] 4.2 [P] Create `applications/web/app/components/ui/input.tsx` (token-based, focus-visible
  ring using `--ring`).
  — *Satisfies: `web-ui` spec "Shorten Form Uses Reusable Components", "Accessibility
  Basics" (visible focus state).*
- [x] 4.3 [P] Create `applications/web/app/components/ui/label.tsx` (wraps
  `@radix-ui/react-label`).
  — *Satisfies: `web-ui` spec "Shorten Form Uses Reusable Components" scenario "labeled
  input".*
- [x] 4.4 [P] Create `applications/web/app/components/ui/card.tsx` (Card/CardHeader/
  CardContent/CardFooter primitives, token-based).
  — *Satisfies: `web-ui` spec "Shorten Form Uses Reusable Components"; `url-listing` spec
  "mobile-first card list".*
  — Depends on: 1.1, 1.2, 2.1, 2.2 (needs `cn()` + resolved tokens).

## 5. Copy button and URL card (TDD: test first)

- [x] 5.1 RED: write `applications/web/app/components/copy-button.tsx.test.tsx` (or
  `copy-button.test.tsx`) asserting: renders a button; on click calls
  `navigator.clipboard.writeText` with the given value (mock `navigator.clipboard`); shows a
  transient visible confirmation (e.g. text/icon swap) after the click. Use
  `@testing-library/react` + `@testing-library/user-event`. Confirm it fails (component
  doesn't exist yet).
  — *Satisfies: `web-ui` spec "Success Display With Copy-to-Clipboard" scenario "Copy
  affordance gives feedback".*
- [x] 5.2 GREEN: implement `applications/web/app/components/copy-button.tsx`
  (`navigator.clipboard.writeText` + transient "Copied" state via local `useState`/timeout).
  Make 5.1 pass.
  — *Satisfies: same as 5.1; design.md "File Changes" (`copy-button.tsx`).*
  — Depends on: 5.1, 4.1 (built on the vendored `Button`).
- [x] 5.3 Create `applications/web/app/components/url-card.tsx`: renders one
  `ShortenedUrl`-shaped entry (code/short link, destination `longUrl` truncated with a
  `title` attribute for the full value, `clickCount`, `lastClickedAt` formatted or "Never",
  `createdAt` formatted) using `Intl.DateTimeFormat`/`new Date(value)` parsed in the
  component (not the loader). No test required in isolation — covered by the `urls.tsx`
  route test in 7.1.
  — *Satisfies: `url-listing` spec scenarios "returns all URLs newest first" (rendering),
  "never-clicked URL... default stats", "Date fields serialize correctly across SSR";
  design.md decision "Format Dates in the component, not the loader".*
  — Depends on: 4.4 (Card primitive).

## 6. `/` redesign — JSX only

- [x] 6.1 RED: extend/add `applications/web/app/routes/_index.presentation.test.tsx` (new
  test file, separate from the existing `_index.abuse-prevention.e2e.test.ts` which MUST NOT
  be modified) asserting the rendered component: shows an accessible labeled URL input and a
  reachable submit button; shows a pending/disabled submit control when
  `useNavigation().state === "submitting"` (mock via test harness / MemoryRouter with a
  deferred action, or directly test the presentational sub-parts if full-route rendering is
  impractical); given `actionData = { error: "..." }` renders that message inline; given
  `actionData = { error: "..." }` at 429 renders a message distinguishable from the 400 case
  (e.g. assert on the retry-later text your copy will use); given
  `actionData = { shortenedUrl: "..." }` renders the URL and a `CopyButton`. Confirm RED.
  — *Satisfies: `web-ui` spec "Shorten Form Uses Reusable Components", "Submission Loading
  State", "Success Display With Copy-to-Clipboard", "Inline Error Feedback Maps Typed Action
  Errors" (all scenarios).*
  — Depends on: 4.1–4.4, 5.2, 5.3 (components to compose).
- [x] 6.2 GREEN: restructure `applications/web/app/routes/_index.tsx` JSX only —
  `Label` + `Input` + `Button` inside `Form`, mobile-first stacked layout (container
  `mx-auto w-full max-w-md px-4 sm:max-w-xl md:max-w-2xl`, `gap-4 sm:gap-6`), pending state
  from `useNavigation()`, inline error alert distinguishing 400 vs 429 text from
  `useActionData()`, created-URL display with `CopyButton`, a nav link to `/urls`.
  **Do NOT modify `action`, `loader`, `headers`, `SHORTEN_RATE_LIMIT`, `shortenRateLimiter`,
  `shortenSchema`, or any error-mapping/status-code logic** — only the `Index` default
  export's JSX and its imports change. Make 6.1 pass; confirm
  `_index.abuse-prevention.e2e.test.ts` still passes unmodified (regression check).
  — *Satisfies: same as 6.1; `web-ui` spec "Existing Action Behavior Is Unchanged".*
  — Depends on: 6.1.

## 7. `/urls` route (new)

- [x] 7.1 RED: write `applications/web/app/routes/urls.test.ts` — unit-test the `loader`
  directly (same pattern as `_index.abuse-prevention.e2e.test.ts`: `vi.mock("~/lib/engine.server")`
  with a test engine over `InMemoryUrlRepository`). Assert: loader returns entries ordered
  `createdAt` descending with `code`, `longUrl`, `clickCount`, `lastClickedAt`, `createdAt`;
  loader returns `[]` when the repository is empty; a never-clicked URL has `clickCount: 0`
  and `lastClickedAt: null`. Confirm RED (no `urls.tsx` yet).
  — *Satisfies: `url-listing` spec scenarios "Loader returns all URLs newest first", "Empty
  repository...", "A never-clicked URL is listed with default stats".*
- [x] 7.2 GREEN: create `applications/web/app/routes/urls.tsx` — `loader` calls
  `engine.listUrls()`; default component renders a mobile-first single-column card list
  (one `UrlCard` per entry) or an empty-state message when the array is empty; nav link back
  to `/`. Register the route in `applications/web/app/routes.ts`
  (`route("urls", "routes/urls.tsx")`). Make 7.1 pass.
  — *Satisfies: `url-listing` spec "Listing Is Exposed Through an HTTP Route" (all
  scenarios); design.md "File Changes" (`urls.tsx`).*
  — Depends on: 7.1, 5.3 (UrlCard).
- [x] 7.3 Add a companion render-level assertion (can extend 7.1/7.2's test file or a
  sibling `.test.tsx`) that empty data renders the empty-state text/element instead of an
  empty list, and that a populated loader result renders one card per entry with visible
  code/destination/click-count text — keeps the "renders a card list, not a table" and
  "empty state" scenarios test-covered at the render level, not just loader-data level.
  — *Satisfies: `url-listing` spec scenarios "Empty repository renders an empty state",
  "Card list is mobile-first and responsive" (structural assertion only, not pixel layout).*
  — Depends on: 7.2.

## 8. Verification

- [x] 8.1 Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` from the repo root (or
  scoped to `applications/web`) — all green. Fix any type errors from new shadcn
  components/cva variants before proceeding.
  — *Satisfies: Slice 0 Test Strategy Contract (automated gate before Docker/manual checks).*
  — Depends on: all of Sections 1–7.
- [x] 8.2 CRITICAL — Docker regression + visual check: `docker compose up --build`, then
  manually confirm in a browser: (a) `/` renders the redesigned form and shortens a URL
  end-to-end; (b) `/urls` lists the created entry with correct stats after visiting `/s/:code`
  once; (c) theme toggle flips `light`⇄`dark` with **no flash of unstyled/wrong-theme content**
  on reload (hard-refresh test, not just client toggle); (d) inspect the rendered `<head>`—
  the CSP nonce on `Links`/`Scripts`/`ScrollRestoration` matches the nonce on the new
  theme-init `<script>` (regression from Slice 4's CSP wiring); (e) re-verify Slice 4
  behaviors still work through the new UI: successful shorten, 429 rate-limit message after
  exceeding the limit, SSRF-blocked host (e.g. `http://127.0.0.1/`) shows the 400 inline
  message; (f) resize/DevTools-emulate a narrow (375px) viewport and confirm `/` and `/urls`
  are single-column, touch-friendly, and horizontal-scroll-free.
  — *Satisfies: `web-ui` spec "Existing Action Behavior Is Unchanged" (both scenarios);
  Test Strategy contract "Pure-presentational styling... verified manually and via
  Docker-served build review".*
  — Depends on: 8.1.
- [x] 8.3 Update `Dockerfile` if the new dependencies (Section 1.1) or `components.json`
  require any build-step changes (e.g. confirm `pnpm install` in the image picks up the new
  packages); re-run 8.2 if the Dockerfile changes.
  — *Satisfies: deployability of this slice; the working tree already shows `Dockerfile` as
  modified — reconcile with this slice's dependency additions rather than leaving unrelated
  drift.*

---

## Review Workload Forecast

- **Estimated changed/added lines**: ~750–950.
  - New files (~550–700 lines): `ui/button.tsx` (~40), `ui/input.tsx` (~25), `ui/label.tsx`
    (~20), `ui/card.tsx` (~50), `theme-toggle.tsx` (~35), `copy-button.tsx` (~40),
    `url-card.tsx` (~60), `lib/utils.ts` (~10), `urls.tsx` (~70), `components.json` (~15),
    plus 4–5 new test files (~250–350 combined: `copy-button.test.tsx`, `urls.test.ts`,
    `_index.presentation.test.tsx`, url-card/urls render assertions).
  - Modified files (~150–200 lines net diff): `_index.tsx` (full JSX rewrite, ~90 changed
    lines), `app.css` (~50–70 new token/theme lines), `root.tsx` (~15–20 for the nonce'd
    script), `routes.ts` (+1), `package.json` (+8 deps).
- **400-line budget risk**: **High**. This slice adds a component library (5 new UI
  primitives + 3 feature components), a new route, a full route rewrite, and 4+ new test
  files — comfortably 2x the 400-line single-PR budget even with generous rounding down.
- **Chained PRs recommended**: **Yes.** Natural split points, each independently
  reviewable and each leaving `main` in a working state:
  1. **PR 1 — Foundation**: deps, `cn()`, `components.json`, `app.css` tokens, vendored
     `ui/{button,input,label,card}.tsx` (Sections 1–2, 4). No route changes; pure addition,
     lowest risk, easy to review as "design system plumbing."
  2. **PR 2 — Theme toggle**: nonce'd script in `root.tsx` + `theme-toggle.tsx` (Section 3).
     Isolated, highest-scrutiny file (`root.tsx`, CSP-adjacent) — small and focused so a
     reviewer can scrutinize the nonce wiring in isolation from unrelated UI noise.
  3. **PR 3 — `/` redesign**: `copy-button.tsx`, `_index.tsx` JSX rewrite + its new test file
     (Sections 5 partial, 6). Depends on PR 1 (components) and benefits from PR 2 merged
     first (toggle visible on the page) but does not strictly require it.
  4. **PR 4 — `/urls` route**: `url-card.tsx`, `urls.tsx`, `routes.ts` registration, tests
     (Sections 5 partial, 7). Depends on PR 1 (Card).
  5. **PR 5 — Verification/Docker**: any `Dockerfile` reconciliation + the full manual
     regression pass (Section 8), run once all above are merged.
- **Decision needed before apply**: **Yes.** Confirm with the user (per the cached
  `delivery_strategy`) whether to: (a) proceed as 5 chained PRs per the split above, (b)
  proceed as a single `size:exception` PR given this is explicitly the final slice of the
  challenge, or (c) collapse to fewer PRs (e.g. merge PR 1+2, and PR 3+4) if the reviewer
  prioritizes fewer round-trips over per-concern isolation. `sdd-apply` MUST NOT choose this
  unilaterally — surface it before starting implementation.
