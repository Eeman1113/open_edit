"use client";

// Settings: capture options, beauty, saving, notifications, privacy & local data, and about.
import { useEffect, useState } from "react";
import { Dialog, ListGroup, ListRow, ScrollBody, Screen, Switch, Tabs, TopBar, clearLocalData, toast, useGoBack } from "@/components/ui";
import { SETTING_DEFAULTS, useSetting } from "@/lib/settings";
import { saveRouteLabel, useSaveRoute } from "@/components/saveroute/SaveRoute";

function useBool(key: keyof typeof SETTING_DEFAULTS) {
  return useSetting<boolean>(key, SETTING_DEFAULTS[key]);
}

/** Bytes used by this site in the browser (gallery, models, settings). */
export function useStorageEstimate() {
  const [bytes, setBytes] = useState<number | null>(null);
  useEffect(() => {
    void navigator.storage?.estimate?.().then((e) => setBytes(e.usage ?? 0)).catch(() => setBytes(null));
  }, []);
  return bytes;
}
export const formatBytes = (b: number) => (b < 1e6 ? `${Math.round(b / 1e3)} KB` : b < 1e9 ? `${(b / 1e6).toFixed(1)} MB` : `${(b / 1e9).toFixed(2)} GB`);

export function CameraSettings() {
  const back = useGoBack("/");
  const [hiRes, setHiRes] = useBool("highResolutionMode");
  const [mirror, setMirror] = useBool("isMirrorMode");
  const [blemish, setBlemish] = useBool("keyIsAntiBlemishMode");
  const [grid, setGrid] = useBool("gridPreviewMode");
  const [location, setLocation] = useBool("isUseLocationExif");
  const [mark, setMark] = useBool("isUseWatermark_v510");
  const [male, setMale] = useBool("optimizeMaleMakeupStatus");
  const [cleanup, setCleanup] = useBool("isUseStorageOptimization");
  const route = useSaveRoute();
  const used = useStorageEstimate();
  const [confirmClear, setConfirmClear] = useState(false);

  const toggleLocation = () => {
    if (location) return setLocation(false);
    if (!("geolocation" in navigator)) return toast("This browser can’t share your location.");
    navigator.geolocation.getCurrentPosition(() => setLocation(true), () => { setLocation(false); toast("Location permission was not granted."); }, { maximumAge: 600000, timeout: 15000 });
  };
  const share = async () => {
    const url = `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`;
    const text = "Open_Edit: a free, open-source camera and photo editor that runs in your browser.";
    try {
      if (navigator.share) await navigator.share({ text, url });
      else { await navigator.clipboard.writeText(`${text} ${url}`); toast("Link copied", { icon: "copy" }); }
    } catch { /* dismissed */ }
  };

  return (
    <Screen>
      <TopBar title="Settings" onBack={back} large />
      <ScrollBody className="pb-12">
        <ListGroup title="Capture" footer={hiRes ? "Full sensor resolution. Some phones play a shutter sound." : "Faster shots straight from the preview. Resolution may be lower on some devices."}>
          <div className="px-4 py-3">
            <Tabs look="segment" items={[{ id: "fast", label: "Fast" }, { id: "hi", label: "High resolution" }]} value={hiRes ? "hi" : "fast"} onChange={(v) => setHiRes(v === "hi")} />
          </div>
          <ListRow icon="mirror" title="Mirror front camera" subtitle="Save selfies the way you see them." trailing={<Switch checked={mirror} onChange={setMirror} label="Mirror front camera" />} />
          <ListRow icon="beauty" title="Smooth blemishes" trailing={<Switch checked={blemish} onChange={setBlemish} label="Smooth blemishes" />} />
          <ListRow icon="grid" title="Grid lines" trailing={<Switch checked={grid} onChange={setGrid} label="Grid lines" />} />
          <ListRow icon="globe" title="Add location to photos" trailing={<Switch checked={location} onChange={toggleLocation} label="Add location to photos" />} />
          <ListRow icon="logo" title="Watermark" subtitle="Adds a small Open_Edit mark to the corner." trailing={<Switch checked={mark} onChange={setMark} label="Watermark" />} />
        </ListGroup>

        <ListGroup title="Beauty and effects">
          <ListRow icon="face" title="Lighter makeup on male faces" trailing={<Switch checked={male} onChange={setMale} label="Lighter makeup on male faces" />} />
          <ListRow icon="storage" title="Tidy unused effects" subtitle="Remove downloaded effects you haven’t used for two weeks." trailing={<Switch checked={cleanup} onChange={setCleanup} label="Tidy unused effects" />} />
        </ListGroup>

        <ListGroup title="Saving and alerts">
          <ListRow icon="folder" title="Where photos are saved" value={saveRouteLabel(route)} href="/settings/saveroute" />
          <ListRow icon="bell" title="Notifications" href="/settings/notification/setting" />
        </ListGroup>

        <ListGroup title="Privacy" footer="Open_Edit has no accounts. Your photos, settings and history are stored only in this browser.">
          <ListRow icon="storage" title="Storage used" value={used == null ? "…" : formatBytes(used)} />
          <ListRow icon="trash" title="Clear local data" subtitle="Delete the gallery and settings and start a fresh session." danger onClick={() => setConfirmClear(true)} />
        </ListGroup>

        <ListGroup title="About">
          <ListRow icon="info" title="About Open_Edit" href="/settings/about" />
          <ListRow icon="share" title="Share Open_Edit" onClick={() => void share()} />
          <ListRow icon="code" title="Open-source licences" href="/settings/about/opensource" />
        </ListGroup>
      </ScrollBody>

      <Dialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        icon="trash"
        destructive
        title="Clear all local data?"
        confirm="Clear everything"
        onConfirm={() => void clearLocalData()}
      >
        This permanently deletes every photo and video in your Open_Edit gallery, your settings, favourites and search history from this browser. It can’t be undone.
      </Dialog>
    </Screen>
  );
}
