"use client";

// Saved page for a collage: the shared Saved page with the finished image.
import { SavedImage, SavedPage } from "@/components/edit/SavedPage";

export function CollageConfirm({ url, blob, initialShare, onClose, onBack }: { url: string; blob: Blob; initialShare: boolean; onClose: () => void; onBack: () => void }) {
  return <SavedPage blob={blob} media={<SavedImage url={url} />} initialShare={initialShare} note="Your collage is in the gallery." onClose={onClose} onDone={onBack} />;
}
