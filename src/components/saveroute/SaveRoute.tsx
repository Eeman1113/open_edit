"use client";

// Where saved shots go. The Open_Edit gallery (in this browser) always keeps a copy; optionally every save also
// downloads the file to the device's Downloads folder.
import { useSyncExternalStore } from "react";
import { Icon, ListGroup, ScrollBody, Screen, TopBar, cx, useGoBack } from "@/components/ui";

export type SaveRouteType = "GALLERY" | "DOWNLOAD";
const KEY = "oe.saveRoute";
const EVENT = "oe:saveRoute";

export function getSaveRoute(): SaveRouteType {
  try { return localStorage.getItem(KEY) === "DOWNLOAD" ? "DOWNLOAD" : "GALLERY"; } catch { return "GALLERY"; }
}
function setSaveRoute(v: SaveRouteType) {
  try { localStorage.setItem(KEY, v); } catch { /* storage blocked */ }
  window.dispatchEvent(new Event(EVENT));
}
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); };
};
export const useSaveRoute = () => useSyncExternalStore(subscribe, getSaveRoute, () => "GALLERY" as SaveRouteType);
export const saveRouteLabel = (r: SaveRouteType) => (r === "DOWNLOAD" ? "Gallery + Downloads" : "Gallery");

const OPTIONS: { id: SaveRouteType; title: string; desc: string }[] = [
  { id: "GALLERY", title: "Open_Edit gallery", desc: "Shots stay in this browser. Download or share them from the gallery any time." },
  { id: "DOWNLOAD", title: "Gallery and Downloads", desc: "Also download a copy of every shot to your device’s Downloads folder." },
];

export function SaveRoute() {
  const back = useGoBack("/settings");
  const route = useSaveRoute();
  return (
    <Screen>
      <TopBar title="Where photos are saved" onBack={back} />
      <ScrollBody className="pb-10">
        <ListGroup footer="Browsers store site data separately from your photo library. Clearing site data in the browser also clears the Open_Edit gallery.">
          {OPTIONS.map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={route === o.id} onClick={() => setSaveRoute(o.id)} className="flex w-full items-start gap-3 px-4 py-4 text-left active:bg-raised">
              <span className={cx("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2", route === o.id ? "border-accent bg-accent text-on-accent" : "border-fg-3")}>
                {route === o.id && <Icon name="check" size={12} stroke={3} />}
              </span>
              <span>
                <span className="block text-[15px] font-medium">{o.title}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-fg-3">{o.desc}</span>
              </span>
            </button>
          ))}
        </ListGroup>
      </ScrollBody>
    </Screen>
  );
}

/** Kept for the /settings/saveroute/set link: same screen. */
export const SetSaveRoute = SaveRoute;
