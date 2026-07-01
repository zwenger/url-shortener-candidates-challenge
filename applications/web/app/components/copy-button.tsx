import { AlertTriangle, Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";

const CONFIRMATION_DURATION_MS = 2000;

type CopyState = "idle" | "copied" | "failed";

export interface CopyButtonProps {
  value: string;
}

/**
 * Copies `value` to the clipboard on click and shows a transient "Copied"
 * confirmation, per the "Copy affordance gives feedback" spec scenario.
 *
 * `navigator.clipboard` is undefined in insecure contexts (non-HTTPS,
 * non-localhost) and `writeText` can reject (permission denied, browser
 * quirk). Both paths are feature-detected/caught here so a copy failure
 * never surfaces as an unhandled promise rejection — it degrades to a
 * visible "Copy failed" state instead, leaving the URL itself still
 * visible elsewhere on the card for manual copying.
 */
export function CopyButton({ value }: CopyButtonProps) {
  const [state, setState] = useState<CopyState>("idle");

  async function handleClick() {
    if (!navigator.clipboard?.writeText) {
      setState("failed");
      setTimeout(() => setState("idle"), CONFIRMATION_DURATION_MS);
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), CONFIRMATION_DURATION_MS);
  }

  const label =
    state === "copied"
      ? "Copied to clipboard"
      : state === "failed"
        ? "Copy failed"
        : "Copy to clipboard";

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={label}
      onClick={handleClick}
    >
      {state === "copied" ? (
        <>
          <Check className="size-4" aria-hidden="true" />
          <span className="sr-only">Copied</span>
        </>
      ) : state === "failed" ? (
        <>
          <AlertTriangle className="size-4" aria-hidden="true" />
          <span className="sr-only">Copy failed</span>
        </>
      ) : (
        <Copy className="size-4" aria-hidden="true" />
      )}
    </Button>
  );
}
