import { Suspense } from "react";
import { AiStyleScreen } from "@/components/aistyle/AiStyleScreen";

// /aistyle[?id=<gallery photo id>]: art styles for a photo.
export default function AiStylePage() {
  return (
    <Suspense>
      <AiStyleScreen />
    </Suspense>
  );
}
