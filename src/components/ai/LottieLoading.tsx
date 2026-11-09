"use client";

// Small indeterminate loading indicator (kept under this name for existing callers; it is the design-system spinner).
import { Spinner } from "@/components/ui";

export function LottieLoading({ size = 40 }: { size?: number }) {
  return <Spinner size={size} className="text-fg-2" />;
}
