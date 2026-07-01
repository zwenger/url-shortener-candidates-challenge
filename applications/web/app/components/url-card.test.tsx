import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UrlCard } from "./url-card";

const SHORT_URL = "http://localhost:3000/s/abc123";

describe("UrlCard", () => {
  it("renders a valid createdAt/lastClickedAt as formatted dates", () => {
    render(
      <UrlCard
        shortUrl={SHORT_URL}
        entry={{
          code: "abc123",
          longUrl: "https://example.com",
          clickCount: 2,
          lastClickedAt: new Date("2026-01-01T00:00:00.000Z"),
          createdAt: new Date("2025-12-31T00:00:00.000Z"),
        }}
      />,
    );

    expect(screen.getByText(/created:/i)).not.toHaveTextContent("—");
    expect(screen.getByText(/last click:/i)).not.toHaveTextContent("—");
  });

  it("exposes a copy-to-clipboard control and a link for the short URL", () => {
    render(
      <UrlCard
        shortUrl={SHORT_URL}
        entry={{
          code: "abc123",
          longUrl: "https://example.com",
          clickCount: 0,
          lastClickedAt: null,
          createdAt: new Date("2025-12-31T00:00:00.000Z"),
        }}
      />,
    );

    expect(
      screen.getByRole("button", { name: /copy to clipboard/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: SHORT_URL })).toHaveAttribute(
      "href",
      SHORT_URL,
    );
  });

  it('falls back to "—" instead of "Invalid Date" or crashing when createdAt is malformed', () => {
    expect(() =>
      render(
        <UrlCard
          shortUrl={SHORT_URL}
          entry={{
            code: "abc123",
            longUrl: "https://example.com",
            clickCount: 0,
            lastClickedAt: null,
            createdAt: "not-a-real-date",
          }}
        />,
      ),
    ).not.toThrow();

    expect(screen.getByText(/created: —/i)).toBeInTheDocument();
    expect(screen.queryByText(/invalid date/i)).not.toBeInTheDocument();
  });

  it('falls back to "—" when lastClickedAt is a malformed value', () => {
    render(
      <UrlCard
        shortUrl={SHORT_URL}
        entry={{
          code: "abc123",
          longUrl: "https://example.com",
          clickCount: 1,
          lastClickedAt: "garbage",
          createdAt: new Date("2025-12-31T00:00:00.000Z"),
        }}
      />,
    );

    expect(screen.getByText(/last click: —/i)).toBeInTheDocument();
  });

  it('shows "Never" (not "—") when lastClickedAt is null', () => {
    render(
      <UrlCard
        shortUrl={SHORT_URL}
        entry={{
          code: "abc123",
          longUrl: "https://example.com",
          clickCount: 0,
          lastClickedAt: null,
          createdAt: new Date("2025-12-31T00:00:00.000Z"),
        }}
      />,
    );

    expect(screen.getByText(/last click: never/i)).toBeInTheDocument();
  });
});
