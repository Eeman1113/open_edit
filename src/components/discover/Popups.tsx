"use client";

// Discover overlays: the follow suggestion (after a few likes) and a creator's "more" menu (share, hide, report).
import { useEffect, useState } from "react";
import { Button, Dialog, Icon, ListRow, Sheet, cx, toast } from "@/components/ui";
import { Avatar } from "./Discover";
import { closeFollowPopup, confirmFollowPopup, setBlocked, useFollowPopup } from "./store";

export function FollowPopupHost() {
  const p = useFollowPopup();
  useEffect(() => {
    if (p?.kind !== "done") return;
    toast(`You’re following ${p.post.username}`, { icon: "check-circle", tone: "ok" });
    closeFollowPopup();
  }, [p]);
  const ask = p?.kind === "ask" ? p.post : null;
  return (
    <Sheet open={!!ask} onClose={closeFollowPopup}>
      {ask && (
        <div className="flex flex-col items-center px-6 pb-4 pt-2 text-center">
          <Avatar author={{ id: ask.userId, name: ask.username, profileImage: ask.profileImage }} size={72} />
          <p className="mt-4 font-display text-[18px] font-semibold">You seem to like {ask.username}’s looks</p>
          <p className="mt-1.5 text-[14px] text-fg-2">Follow to see their new filters first. Follows are kept only on this device.</p>
          <div className="mt-5 flex w-full gap-2">
            <Button variant="secondary" block onClick={closeFollowPopup}>Not now</Button>
            <Button block icon="plus" onClick={() => confirmFollowPopup(ask)}>Follow</Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

const REASONS = [
  "Sexual or explicit content",
  "Violence or disturbing content",
  "Spam or scams",
  "Advertising",
  "Asking for personal information",
  "Copyright or rights violation",
  "Something else",
];

/** A creator's menu. `initial` lets a screen open a specific step. */
export function UserMoreSheet({ userId, official, onClose, onShare, onBlocked, initial = "sheet" }: {
  userId: string;
  official: boolean;
  onClose: () => void;
  onShare: () => void;
  onBlocked: () => void;
  initial?: "sheet" | "block" | "blocked" | "report" | "reported";
}) {
  const [step, setStep] = useState(initial);
  const [reason, setReason] = useState<number | null>(null);
  return (
    <>
      <Sheet open={step === "sheet"} onClose={onClose} title="More">
        <div className="pb-2">
          <ListRow icon="share" title="Share profile" onClick={() => { onClose(); onShare(); }} />
          {!official && <ListRow icon="block" title="Hide this creator" subtitle="You won’t see their looks on this device." onClick={() => setStep("block")} />}
          <ListRow icon="flag" title="Report" danger onClick={() => setStep("report")} />
        </div>
      </Sheet>
      <Dialog
        open={step === "block"}
        onClose={onClose}
        icon="block"
        destructive
        title="Hide this creator?"
        confirm="Hide"
        onConfirm={() => { setBlocked(userId); onClose(); onBlocked(); toast("Creator hidden", { icon: "block" }); }}
      >
        Their looks will no longer appear in Discover on this device. You can undo this by clearing local data in Settings.
      </Dialog>
      <Sheet open={step === "report"} onClose={onClose} title="Report">
        <div className="px-4 pb-2">
          <p className="mb-3 text-[14px] text-fg-2">What’s wrong with this creator’s content? Reports are anonymous.</p>
          {REASONS.map((r, i) => (
            <button key={r} type="button" onClick={() => setReason(i)} className={cx("mb-1.5 flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-[15px]", reason === i ? "bg-accent-soft text-accent" : "bg-raised")}>
              <span className="flex-1">{r}</span>
              {reason === i && <Icon name="check" size={18} />}
            </button>
          ))}
          <Button block className="mt-3" variant="danger" disabled={reason === null} onClick={() => setStep("reported")}>Send report</Button>
        </div>
      </Sheet>
      <Dialog open={step === "reported"} onClose={onClose} icon="check-circle" title="Thanks for the report">
        We’ll take a look. Reporting helps keep Discover friendly.
      </Dialog>
    </>
  );
}
