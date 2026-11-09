import { Suspense } from "react";
import { SchemeRouter } from "@/components/scheme/SchemeRouter";

// App links: /s?url=<encoded openedit://page?params>
export default function SchemePage() {
  return (
    <Suspense>
      <SchemeRouter />
    </Suspense>
  );
}
