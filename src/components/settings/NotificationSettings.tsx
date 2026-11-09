"use client";

// Notification preferences: browser permission plus two topics (stored in this browser).
import { useEffect, useState } from "react";
import { Button, ListGroup, ListRow, ScrollBody, Screen, Switch, TopBar, toast, useGoBack } from "@/components/ui";
import { useSetting } from "@/lib/settings";

type Perm = NotificationPermission | "unsupported";

export function NotificationSettings() {
  const back = useGoBack("/settings");
  const [perm, setPerm] = useState<Perm>("default");
  const [updates, setUpdates] = useSetting<boolean>("oe.notify.updates", true);
  const [activity, setActivity] = useSetting<boolean>("oe.notify.activity", true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the browser permission once
    setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);
  const ask = async () => {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p === "denied") toast("Notifications are blocked in your browser’s site settings.");
  };
  const on = perm === "granted";
  return (
    <Screen>
      <TopBar title="Notifications" onBack={back} />
      <ScrollBody className="pb-10">
        {!on && (
          <div className="mx-4 mt-3 rounded-lg bg-accent-soft p-4">
            <p className="font-display text-[16px] font-semibold text-accent">Notifications are off</p>
            <p className="mt-1 text-[13px] leading-relaxed text-fg-2">
              {perm === "unsupported" ? "This browser doesn’t support notifications." : perm === "denied" ? "Allow notifications for this site in your browser’s settings." : "Turn them on to hear about new filters and effects."}
            </p>
            {perm === "default" && <Button size="sm" className="mt-3" icon="bell" onClick={() => void ask()}>Turn on</Button>}
          </div>
        )}
        <ListGroup title="Topics">
          <ListRow icon="sparkles" title="New features and content" subtitle="New filters, effects and updates." trailing={<Switch checked={updates && on} disabled={!on} onChange={setUpdates} label="New features and content" />} />
          <ListRow icon="heart" title="Activity" subtitle="Reminders about looks you liked and creators you follow." trailing={<Switch checked={activity && on} disabled={!on} onChange={setActivity} label="Activity" />} />
        </ListGroup>
      </ScrollBody>
    </Screen>
  );
}
