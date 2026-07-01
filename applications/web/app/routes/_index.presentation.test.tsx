import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import Index, { action, loader } from "./_index";

// Presentation-level tests for the `/` route component only. The action's
// business logic (rate limiting, typed error mapping) is covered by
// `_index.abuse-prevention.e2e.test.ts` and MUST NOT be modified here.
// These tests assert rendered text/structure, not styling.
//
// `Index` is typed against React Router's generated `Route.ComponentProps`
// (which encodes the full root+index match chain), while `createRoutesStub`
// expects its generic `RouteComponentType` — a deliberate cast, not a type
// error, since the stub supplies the required shape (loaderData/actionData)
// at runtime via `hydrationData` below.
type StubComponent = (props: {
  loaderData: unknown;
  actionData: unknown;
}) => React.JSX.Element;

function renderIndexRoute({ actionData }: { actionData?: unknown } = {}) {
  const Stub = createRoutesStub([
    {
      path: "/",
      id: "index",
      Component: Index as unknown as StubComponent,
      loader: () => ({ baseUrl: "http://localhost/s/" }),
      HydrateFallback: () => null,
    },
  ]);

  const utils = render(
    <Stub
      initialEntries={["/"]}
      hydrationData={
        actionData !== undefined
          ? {
              loaderData: { index: { baseUrl: "http://localhost/s/" } },
              actionData: { index: actionData },
            }
          : { loaderData: { index: { baseUrl: "http://localhost/s/" } } }
      }
    />,
  );

  return utils;
}

describe("/ route presentation", () => {
  it("renders an accessible labeled URL input and a reachable submit button", async () => {
    renderIndexRoute();

    const input = await screen.findByLabelText(/url/i);
    expect(input).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /shorten/i })).toBeEnabled();
  });

  it("renders a 400 inline error message from actionData", async () => {
    renderIndexRoute({
      actionData: { error: "Please enter a valid URL" },
    });

    expect(
      await screen.findByText("Please enter a valid URL"),
    ).toBeInTheDocument();
  });

  it("renders a 429 inline error message distinguishable from the 400 case", async () => {
    renderIndexRoute({
      actionData: {
        error: "Too many requests, please try again in a minute",
      },
    });

    expect(
      await screen.findByText(/try again in a minute/i),
    ).toBeInTheDocument();
  });

  it("renders the created short URL and a copy control on success", async () => {
    renderIndexRoute({
      actionData: { shortenedUrl: "http://localhost/s/abc123" },
    });

    expect(
      await screen.findByText("http://localhost/s/abc123"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
  });
});

describe("/ route exports", () => {
  it("still exports the unmodified action and loader", () => {
    expect(typeof action).toBe("function");
    expect(typeof loader).toBe("function");
  });
});
