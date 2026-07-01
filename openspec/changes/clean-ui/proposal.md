# Proposal: Clean UI (Slice 5)

## Intent

The Frontend requirements are core, not optional (CHALLENGE_DESCRIPTION lines 38-44; Engram #792). The current `_index` is a deliberately-ugly page and no view lists URLs with statistics. Slice 5 replaces the UI with a clean, modern, consistently-styled interface using reusable components, surfaces the shorten form's typed errors and loading states properly, displays created short URLs conveniently, and adds the listing view backed by the already-built `engine.listUrls()` (Slice 2 built the use case but deliberately wired no route — #813 #4).

## Scope

### In Scope
- shadcn/ui setup for Tailwind 4 + RR v7 + pnpm monorepo (manual vendoring, `~/components/ui`).
- Redesigned shorten form on `/`: inline mapping of typed errors (400 invalid/blocked, 429 rate-limited), submit loading state via `useNavigation`.
- Convenient display of the created short URL with copy-to-clipboard + feedback.
- New listing route (`/urls`) with a loader calling `engine.listUrls()`; renders code, destination, click count, last-clicked, created; empty + loading states.
- Accessibility basics (labels, focus, semantics) and responsive layout.
- Route-level tests: listing renders stats/empty; form error states map correctly.

### Out of Scope
- New backend capabilities (engine is complete).
- List pagination (deferred, #813 #3), auth/ownership, analytics charts, observability/metrics.

## Capabilities

### New Capabilities
- None (no new domain capability; UI consumes existing use cases).

### Modified Capabilities
- `url-listing`: remove the "no listing route exists" constraint; require an HTTP route + loader that renders the stats listing UI.

## Approach

- Vendor shadcn/ui components manually into `~/components/ui` (Button, Input, Card/Table, etc.), Tailwind 4 CSS-first config already present in `app.css`. Class-based styling only — respects existing CSP (`style-src 'unsafe-inline'`, nonce on `Links`/`Scripts`). No new inline `<script>`.
- `/` keeps its existing `action`/`loader`/`headers`/rate-limit intact; only the JSX is restructured into components. Errors read from `useActionData`; loading from `useNavigation`.
- `/urls`: loader serializes `listUrls()` rows (Date → serialized), rendered as table or card list.
- Shared layout/theme primitives extracted for consistency across both routes.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `applications/web/app/routes/_index.tsx` | Modified | Restructure JSX only; preserve action/rate-limit/error mapping |
| `applications/web/app/routes/urls.tsx` | New | Listing route + loader consuming `engine.listUrls()` |
| `applications/web/app/components/ui/*` | New | Vendored shadcn primitives |
| `applications/web/app/app.css` | Modified | shadcn tokens/theme vars if needed |
| `applications/web/components.json`, `package.json` | New/Modified | shadcn config + deps (Radix, cva, clsx) |
| `applications/web/app/root.tsx` | Possibly modified | Nav/layout shell; keep nonce wiring |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| shadcn CLI assumes Tailwind 3 config | Med | Vendor components manually; keep Tailwind 4 CSS-first `@theme` |
| CSP breakage from injected inline scripts/styles | Med | Class-based only; no inline `<script>`; keep nonce on `Links`/`Scripts` |
| Regressing Slice 4 action (rate limit/error mapping) | Med | Change JSX only; keep action/headers untouched; route tests assert error states |
| Custom Express static serving breaks | Low | No server changes; verify build + Docker serve |

## Rollback Plan

Slice is a chained PR touching only `applications/web`. Revert the PR to restore the prior UI; engine and server untouched, so redirect/shorten behavior is unaffected.

## Dependencies

- `engine.listUrls()` (Slice 2) — present.
- shadcn/ui deps (Radix primitives, class-variance-authority, clsx, tailwind-merge).

## Success Criteria

- [ ] Clean, consistent, responsive UI replaces the ugly page; reusable components in `~/components/ui`.
- [ ] Shorten form shows inline errors for 400/429 and a submit loading state.
- [ ] Created short URL displayed with working copy-to-clipboard.
- [ ] `/urls` lists all URLs with code, destination, clicks, last-clicked, created; handles empty state.
- [ ] Slice 4 action behavior (rate limit + error mapping) unchanged; build + Docker serve verified.
- [ ] Route-level tests pass for listing and form error mapping.

## Proposal question round

These are genuine tradeoffs to lock before spec/design:

1. **Component strategy**: shadcn/ui (Radix + Tailwind, manually vendored) vs. Radix primitives directly vs. hand-rolled Tailwind components? shadcn matches the challenge suggestion and reads best for reviewers; hand-rolled is lighter but less "reusable component library" signal.
2. **Page layout**: single page (form + list on `/`) vs. separate `/urls` listing route? Separate route keeps `/` focused and matches the "view for listing" wording; single page is fewer files.
3. **Stats list presentation**: responsive table vs. card list? Table reads denser/more dashboard-like; cards are friendlier on mobile.
4. **Copy affordance**: include copy-to-clipboard + toast feedback, or keep minimal (plain link)? Clipboard API is a small footprint but adds a client component + toast primitive.
5. **Theming**: light-only vs. light+dark? `app.css` already has a dark-mode hook; supporting both is a modest signal boost but more token wiring.

## Assumptions (pending confirmation)

- shadcn/ui, manually vendored (Q1).
- Separate `/urls` listing route (Q2).
- Responsive table for stats (Q3).
- Copy-to-clipboard with lightweight feedback (Q4).
- Light+dark theme, leveraging the existing `app.css` hook (Q5).
