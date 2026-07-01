import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";

const CONFIRMATION_DURATION_MS = 2000;

export interface CopyButtonProps {
  value: string;
}

/**
 * Copies `value` to the clipboard on click and shows a transient "Copied"
 * confirmation, per the "Copy affordance gives feedback" spec scenario.
 */
export function CopyButton({ value }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), CONFIRMATION_DURATION_MS);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={copied ? "Copied to clipboard" : "Copy to clipboard"}
      onClick={handleClick}
    >
      {copied ? (
        <>
          <Check className="size-4" aria-hidden="true" />
          <span className="sr-only">Copied</span>
        </>
      ) : (
        <Copy className="size-4" aria-hidden="true" />
      )}
    </Button>
  );
}
