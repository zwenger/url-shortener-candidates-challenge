import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges class names, resolving conflicting Tailwind utility classes
 * (e.g. `cn("p-2", "p-4")` -> `"p-4"`) via `tailwind-merge`. Standard
 * shadcn/ui helper.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
