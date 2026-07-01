import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import Urls from "./urls";

// Render-level assertions for the `/urls` route component, complementing
// the loader-data assertions in `urls.test.ts`: confirms the empty state
// renders instead of an empty list, and that a populated result renders one
// card per entry with visible code/destination/click-count text. Structural
// only — not pixel/layout assertions (see Test Strategy in web-ui spec).

type StubComponent = (props: { loaderData: unknown }) => React.JSX.Element;

function renderUrlsRoute(entries: unknown[]) {
  const Stub = createRoutesStub([
    {
      path: "/urls",
      id: "urls",
      Component: Urls as unknown as StubComponent,
      loader: () => entries,
      HydrateFallback: () => null,
    },
  ]);

  return render(
    <Stub
      initialEntries={["/urls"]}
      hydrationData={{ loaderData: { urls: entries } }}
    />,
  );
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
  });
});
