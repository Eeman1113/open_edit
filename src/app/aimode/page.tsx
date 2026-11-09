import { Suspense } from "react";
import { AiModeScreen } from "@/components/aimode/AiModeScreen";

// /aimode?tool=<id>: opens the AI tools with a tool preselected.
export default function AiModePage() {
  return (
    <Suspense>
      <AiModeScreen />
    </Suspense>
  );
}
