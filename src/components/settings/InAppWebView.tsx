"use client";

// /settings/web?url=<https url>&title=<title>: an external link handed to the app (from a feed card or QR code).
// Open_Edit does not embed outside websites; this page shows where the link goes and opens it in the browser.
import { useSearchParams } from "next/navigation";
import { Button, EmptyState, Screen, TopBar, useGoBack } from "@/components/ui";

export function InAppWebView() {
  const params = useSearchParams();
  const back = useGoBack("/my");
  let url: URL | null = null;
  try { url = new URL(params.get("url") ?? ""); } catch { url = null; }
  const safe = url && url.protocol === "https:" ? url : null;
  const title = params.get("title") || safe?.hostname || "Link";
  return (
    <Screen>
      <TopBar title={title} onBack={back} />
      {safe ? (
        <EmptyState
          icon="external"
          title="This opens outside Open_Edit"
          body={<span className="break-all">{safe.href}</span>}
          action={<Button icon="external" onClick={() => window.open(safe.href, "_blank", "noopener,noreferrer")}>Open in browser</Button>}
        />
      ) : (
        <EmptyState icon="alert" title="This link can’t be opened" body="Only secure (https) links are supported." />
      )}
    </Screen>
  );
}
