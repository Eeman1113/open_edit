"use client";

// Server-only tabs. Their content comes from B612 servers (recommendation overview, Kuru effect / AR
// sticker packages), which the web port cannot reach: the panel shells render with their empty /
// network-error states and no fake content.
import { useState } from "react";
import { useEdit } from "../ctx";
import { NETWORK_ERROR } from "../model";
import { ControlRow, EmptyState, Img, TitleBar } from "../ui";

/** fragment_edit_photo_recommend_content.xml: control row + an (empty) transparent feature list. */
export function RecommendPanel() {
  const { undo, redo, setOriginal } = useEdit();
  return (
    <>
      <ControlRow undo={undo} redo={redo} onOriginal={setOriginal} />
      <div className="absolute inset-x-0" style={{ bottom: 52, height: 134 }}>
        <EmptyState text={NETWORK_ERROR} />
      </div>
    </>
  );
}

/** Effects (EPEffectStickerFragment) / AR filter (EPStickerFragment) list page shell. */
export function StickerServerPanel({ kind, onExit }: { kind: "effect" | "ar"; onExit: () => void }) {
  const { setOriginal } = useEdit();
  const [retry, setRetry] = useState(0);
  const errorText = kind === "ar"
    ? "You are not connected to a network. Please check your network settings and try again."
    : NETWORK_ERROR;
  return (
    <>
      <ControlRow bottom={52 + 255} onOriginal={setOriginal}>
        {kind === "ar" && <span className="flex-1" />}
      </ControlRow>
      {/* list page container_feature: 255dp, #E6171717, above the 52dp bottom bar */}
      <div className="absolute inset-x-0" style={{ bottom: 52, height: 255, background: "rgba(23,23,23,0.9)" }}>
        <div className="absolute inset-x-0 top-0 flex items-center" style={{ height: 43 }}>
          <button type="button" className="relative flex h-full flex-none items-center" style={{ width: 49.5 }}>
            <Img name="icon_sticker_none" size={35} style={{ marginLeft: 6 }} />
            <span className="absolute right-0" style={{ width: 1, height: 18, background: "rgba(255,255,255,0.15)" }} />
          </button>
          {kind === "ar" && (
            <button type="button" className="flex-none" style={{ marginLeft: 7.5 }} aria-label="Search">
              <Img name="icon_sticker_tab_search" size={35} />
            </button>
          )}
          <div className="flex-1" style={{ paddingLeft: 7.5, paddingRight: 8 }} />
        </div>
        <div className="absolute inset-x-0 bottom-0" style={{ top: 43 }} key={retry}>
          <EmptyState text={errorText} onRetry={() => setRetry((n) => n + 1)} />
        </div>
      </div>
      <TitleBar title={kind === "ar" ? "AR filter" : "Effects"} onClose={onExit} onConfirm={onExit} />
    </>
  );
}
