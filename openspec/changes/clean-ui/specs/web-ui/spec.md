# Web UI Specification

## Purpose

Define the presentation-layer behavior for the shorten form (`/`) and the URL listing (`/urls`): a clean, mobile-first, accessible interface built from reusable shadcn/ui components, supporting light and dark themes, without altering the existing action/loader business logic from prior slices.

## Requirements

### Requirement: Shorten Form Uses Reusable Components and Mobile-First Layout

The system MUST render the `/` shorten form using reusable components from `~/components/ui` (e.g. `Button`, `Input`, `Card`, `Label`), with a labeled URL input, and MUST lay out the page mobile-first (single-column, touch-friendly targets on small viewports, enhancing progressively for larger screens).

#### Scenario: Form renders with a labeled input

- GIVEN a user loads `/`
- WHEN the page renders
- THEN a URL input is present with an associated accessible label
- AND a submit control is present and reachable via keyboard focus

### Requirement: Submission Loading State

The system MUST show a pending/loading state on the shorten form while the action request is in flight, derived from React Router's navigation/fetcher state (no new client-only request logic).

#### Scenario: Loading state shown during submission

- GIVEN a user submits the shorten form
- WHEN the action request is pending
- THEN the submit control reflects a pending/disabled state
- AND the pending state clears once the action responds

### Requirement: Success Display With Copy-to-Clipboard

On a successful shorten action, the system MUST display the created short URL and MUST provide a copy-to-clipboard affordance that gives visible feedback (e.g. a transient confirmation) when activated.

#### Scenario: Successful shorten shows the short URL

- GIVEN the shorten action returns `{ shortenedUrl }`
- WHEN the result renders
- THEN the created short URL is displayed as text and/or a link
- AND a copy-to-clipboard control is present next to it

#### Scenario: Copy affordance gives feedback

- GIVEN the created short URL is displayed
- WHEN the user activates the copy-to-clipboard control
- THEN the system shows a visible confirmation that the value was copied

### Requirement: Inline Error Feedback Maps Typed Action Errors

The system MUST render a clear inline error message when the shorten action returns an error payload, distinguishing at least: invalid URL or blocked host (400) and rate-limited (429). The system MUST NOT alter the action's existing status codes, headers, or error-mapping logic from Slice 4 — only how the returned error is displayed.

#### Scenario: 400 invalid/blocked URL shows inline message

- GIVEN the shorten action returns `{ error }` with status 400
- WHEN the result renders
- THEN an inline error message is shown near the form
- AND the message reflects the action's returned error text

#### Scenario: 429 rate-limited shows inline message

- GIVEN the shorten action returns `{ error }` with status 429
- WHEN the result renders
- THEN an inline error message is shown near the form
- AND the displayed message is distinguishable from the 400 case (e.g. mentions retrying later)

### Requirement: Light and Dark Theming

The system MUST support both a light theme (Kanagawa Lotus palette) and a dark theme (Kanagawa Dragon palette) using the existing dark-mode hook in `app.css`, applied consistently across `/` and `/urls`.

#### Scenario: Both themes render without missing tokens

- GIVEN the application is rendered in light mode and separately in dark mode
- WHEN each theme is active
- THEN all themed surfaces (form, cards, buttons) resolve a defined color token
- AND no unstyled/default-browser-style elements are visible in either mode

### Requirement: Accessibility Basics

The system MUST provide accessible labels for form inputs, visible focus states for interactive elements, and semantic HTML structure (e.g. `main`, `label`, `button`) across `/` and `/urls`.

#### Scenario: Keyboard navigation reaches all interactive controls

- GIVEN a user navigates `/` or `/urls` using only the keyboard
- WHEN they tab through the page
- THEN focus visibly lands on the URL input, submit button, and (on `/urls`) any interactive card controls in a logical order

### Requirement: Existing Action Behavior Is Unchanged

The system MUST preserve the shorten action's existing rate-limit (429 with `Retry-After`), typed-error mapping (`BlockedHostError` / `InvalidUrlError` → 400, `CodeGenerationExhaustedError` → 503), security headers, and CSP nonce wiring from prior slices. Only the JSX/presentation MUST change.

#### Scenario: Rate limit still returns 429 with Retry-After

- GIVEN a client exceeds the shorten rate limit
- WHEN they submit the form again
- THEN the action returns status 429 with a `Retry-After` header
- AND the UI surfaces this as the 429 inline message defined above

#### Scenario: CSP nonce still applied to Links and Scripts

- GIVEN any page renders under the updated UI
- WHEN the document `<head>` and `<body>` are inspected
- THEN `Links` and `Scripts` still carry the per-request nonce from `root.tsx`

## Test Strategy (per Slice 0 Test Strategy Contract)

- Route-level tests (`applications/web`) MUST cover: `/urls` loader returns the expected list shape and renders stats/empty state; `/` action error states (400, 429) surface distinguishable inline messages; loading/pending state is present during submission; successful shorten renders the short URL and a copy control.
- Pure-presentational styling (exact colors, spacing, theme token values) is NOT asserted in automated tests — it is verified manually and via Docker-served build review, per the mobile-first/theming decisions in `sdd/clean-ui/decisions`.
