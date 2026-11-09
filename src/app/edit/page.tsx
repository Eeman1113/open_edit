import { Suspense } from "react";
import { EditClient } from "@/components/edit/EditClient";

// EPActivity / EditPhotoFragment: /edit?id=<photoId>. The id is read on the client (useSearchParams)
// inside a Suspense boundary so the route shell can still be prerendered.
export default function EditPage() {
  return (
    <Suspense fallback={<div className="absolute inset-0 bg-black" />}>
      <EditClient />
    </Suspense>
  );
}
