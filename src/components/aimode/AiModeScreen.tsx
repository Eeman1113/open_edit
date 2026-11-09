"use client";

// /aimode?tool=<id>: an app link into the AI tools (from Home cards or QR codes). It opens the AI tab with the
// tool's photo picker already showing. Open_Edit does not embed any web service here.
import { useSearchParams } from "next/navigation";
import { AiTab } from "@/components/ai/AiTab";

export function AiModeScreen() {
  const sp = useSearchParams();
  return <AiTab initialTool={sp.get("tool") ?? undefined} />;
}
