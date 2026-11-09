"use client";

// Saved page for a video: the shared Saved page with the video looping, plus the share sheet used by the editor's
// Share button.
import { SavedPage, SavedVideo, ShareSheet } from "@/components/edit/SavedPage";
import { STR } from "./model";

export function SaveConfirm({ url, blob, onClose, onBack }: { url: string; blob: Blob; onClose: () => void; onBack: () => void }) {
  return <SavedPage blob={blob} media={<SavedVideo url={url} />} title={STR.saved} onClose={onClose} onDone={onBack} />;
}

export function ShareBar({ open, blob, onClose }: { open: boolean; blob: Blob | null; onClose: () => void }) {
  return <ShareSheet open={open} blob={blob} onClose={onClose} />;
}
