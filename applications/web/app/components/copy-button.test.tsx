import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyButton } from "./copy-button";

describe("CopyButton", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a button", () => {
    render(<CopyButton value="https://short.example/abc123" />);

    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("calls navigator.clipboard.writeText with the given value on click", async () => {
    // userEvent.setup() installs its own Clipboard stub on navigator.clipboard
    // (jsdom has no native implementation), overwriting anything defined
    // beforehand — so the spy must be attached to the stub AFTER setup().
    const user = userEvent.setup();
    const writeTextSpy = vi.spyOn(navigator.clipboard, "writeText");
    render(<CopyButton value="https://short.example/abc123" />);

    await user.click(screen.getByRole("button"));

    expect(writeTextSpy).toHaveBeenCalledWith("https://short.example/abc123");
  });

  it("shows a transient visible confirmation after copying", async () => {
    const user = userEvent.setup();
    render(<CopyButton value="https://short.example/abc123" />);

    await user.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(screen.getByText(/copied/i)).toBeInTheDocument();
    });
  });
});
