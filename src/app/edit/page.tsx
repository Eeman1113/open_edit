import { Suspense } from "react";
import { EditClient } from "@/components/edit/EditClient";

// Photo editor: /edit?id=<photo id>[&tool=<tool>]. The query is read on the client inside a Suspense boundary so the
// route shell can still be prerendered.
export default function EditPage() {
  return (
    <Suspense fallback={<div className="absolute inset-0 bg-bg" />}>
      <EditClient />
    </Suspense>
  );
}
