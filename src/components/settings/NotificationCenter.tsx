"use client";

// Inbox: news and activity for this browser. Open_Edit has no server-side accounts, so the inbox starts empty.
import Link from "next/link";
import { useState } from "react";
import { EmptyState, Icon, ScrollBody, Screen, Tabs, TopBar, useGoBack } from "@/components/ui";

type Tab = "all" | "news" | "activity";

export function NotificationCenter() {
  const back = useGoBack("/");
  const [tab, setTab] = useState<Tab>("all");
  return (
    <Screen>
      <TopBar title="Inbox" onBack={back} actions={<Link href="/settings/notification/setting" aria-label="Notification settings" className="flex h-10 w-10 items-center justify-center"><Icon name="settings" size={22} /></Link>} />
      <Tabs className="shrink-0 border-b border-line" items={[{ id: "all", label: "All" }, { id: "news", label: "News" }, { id: "activity", label: "Activity" }]} value={tab} onChange={setTab} />
      <ScrollBody>
        <EmptyState icon="bell" title="Nothing new" body={tab === "activity" ? "Likes and follows from this device will appear here." : "News about filters and features will show up here."} />
      </ScrollBody>
    </Screen>
  );
}
