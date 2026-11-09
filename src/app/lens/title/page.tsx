import { Suspense } from "react";
import { LensTitleEdit } from "@/components/lens/LensSubScreens";

// Look creator
export default function LensTitlePage() {
  return (
    <Suspense>
      <LensTitleEdit />
    </Suspense>
  );
}
