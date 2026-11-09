import { Suspense } from "react";
import { InAppWebView } from "@/components/settings/InAppWebView";

export default function InAppWebViewPage() {
  return (
    <Suspense>
      <InAppWebView />
    </Suspense>
  );
}
