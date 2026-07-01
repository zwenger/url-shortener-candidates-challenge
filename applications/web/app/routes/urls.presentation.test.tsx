import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import Urls, { ErrorBoundary, MAX_RENDERED_URLS } from "./urls";

// Render-level assertions for the `/urls` route component, complementing
// the loader-data assertions in `urls.test.ts`: confirms the empty state
// renders instead of an empty list, and that a populated result renders one
// card per entry with visible code/destination/click-count text. Structural
// only — not pixel/layout assertions (see Test Strategy in web-ui spec).

type StubComponent = (props: { loaderData: unknown }) => React.JSX.Element;

function renderUrlsRoute(entries: unknown[]) {
  const loaderData = { entries, baseUrl: "http://localhost:3000" };
  const Stub = createRoutesStub([
    {
      path: "/urls",
      id: "urls",
      Component: Urls as unknown as StubComponent,
      loader: () => loaderData,
      HydrateFallback: () => null,
    },
  ]);

  return render(
    <Stub
      initialEntries={["/urls"]}
      hydrationData={{ loaderData: { urls: loaderData } }}
    />,
  );
}

function makeEntry(index: number) {
  return {
    code: `code${index}`,
    longUrl: `https://example.com/${index}`,
    clickCount: 0,
    lastClickedAt: null,
    createdAt: new Date("2025-12-31T00:00:00.000Z"),
  };
}

describe("/urls route presentation", () => {
  it("renders an empty-state message instead of an empty card list", async () => {
    renderUrlsRoute([]);

    expect(
      await screen.findByText(/no shortened urls yet/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("renders one card per entry with visible code, destination, and click-count text", async () => {
    renderUrlsRoute([
      {
        code: "abc123",
        longUrl: "https://example.com/first",
        clickCount: 3,
        lastClickedAt: new Date("2026-01-01T00:00:00.000Z"),
        createdAt: new Date("2025-12-31T00:00:00.000Z"),
      },
      {
        code: "def456",
        longUrl: "https://example.com/second",
        clickCount: 0,
        lastClickedAt: null,
        createdAt: new Date("2025-12-30T00:00:00.000Z"),
      },
    ]);

    expect(await screen.findByText("abc123")).toBeInTheDocument();
    expect(screen.getByText("def456")).toBeInTheDocument();
    expect(screen.getByText("https://example.com/first")).toBeInTheDocument();
    expect(screen.getByText("https://example.com/second")).toBeInTheDocument();
    expect(screen.getByText(/clicks: 3/i)).toBeInTheDocument();
    expect(screen.getByText(/clicks: 0/i)).toBeInTheDocument();
    expect(screen.getByText(/never/i)).toBeInTheDocument();

    // Each card exposes a copy-to-clipboard control for its short URL, and the
    // absolute short URL is shown as a link.
    expect(
      screen.getAllByRole("button", { name: /copy to clipboard/i }),
    ).toHaveLength(2);
    expect(
      screen.getByText("http://localhost:3000/s/abc123"),
    ).toBeInTheDocument();
  });

  it("renders the card list as a semantic list", async () => {
    renderUrlsRoute([
      {
        code: "abc123",
        longUrl: "https://example.com/first",
        clickCount: 3,
        lastClickedAt: new Date("2026-01-01T00:00:00.000Z"),
        createdAt: new Date("2025-12-31T00:00:00.000Z"),
      },
    ]);

    const list = await screen.findByRole("list");
    expect(list).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it(`caps rendered rows at ${MAX_RENDERED_URLS} and shows a "Showing N of M" note when exceeded`, async () => {
    const entries = Array.from({ length: MAX_RENDERED_URLS + 25 }, (_, i) =>
      makeEntry(i),
    );

    renderUrlsRoute(entries);

    expect(await screen.findAllByRole("listitem")).toHaveLength(
      MAX_RENDERED_URLS,
    );
    expect(
      screen.getByText(
        new RegExp(`showing ${MAX_RENDERED_URLS} of ${entries.length}`, "i"),
      ),
    ).toBeInTheDocument();
  });

  it("does not show a cap note when entries are within the cap", async () => {
    renderUrlsRoute([makeEntry(0), makeEntry(1)]);

    await screen.findAllByRole("listitem");
    expect(screen.queryByText(/showing \d+ of \d+/i)).not.toBeInTheDocument();
  });
});

describe("/urls route ErrorBoundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderThrowingUrlsRoute() {
    const Stub = createRoutesStub([
      {
        path: "/urls",
        id: "urls",
        Component: Urls as unknown as StubComponent,
        ErrorBoundary,
        loader: () => {
          throw new Error("listUrls failed");
        },
      },
    ]);

    return render(<Stub initialEntries={["/urls"]} />);
  }

  it("shows a friendly message and a link back to / instead of the generic root fallback", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    renderThrowingUrlsRoute();

    expect(
      await screen.findByRole("heading", { name: /couldn.?t load/i }),
    ).toBeInTheDocument();
    const backLink = screen.getByRole("link", {
      name: /back to shorten|home/i,
    });
    expect(backLink).toHaveAttribute("href", "/");
  });

  it("logs the failure for observability", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    renderThrowingUrlsRoute();

    await screen.findByRole("heading", { name: /couldn.?t load/i });
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
