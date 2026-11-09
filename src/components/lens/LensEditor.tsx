"use client";

// Look creator ("Create a look", from Discover and Me): build a reusable camera look out of stickers, face
// transforms, makeup, filters, effects and more, previewed live on your camera or on a photo. Asset lists come from
// the content API; without one each list shows a friendly empty state.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Dialog, EmptyState, Icon, IconButton, Sheet, Spinner, Tabs, cx, type IconName } from "@/components/ui";
import { PhotoPicker } from "@/components/ai/PhotoPicker";
import { asset } from "@/lib/base";
import { getPhoto } from "@/lib/store";

type Menu = { id: string; icon: IconName; label: string };
export const MENUS: Menu[] = [
  { id: "sticker", icon: "sticker", label: "Stickers" },
  { id: "accessory", icon: "shapes", label: "Accessories" },
  { id: "transform", icon: "face", label: "Face shape" },
  { id: "makeup", icon: "beauty", label: "Makeup" },
  { id: "filter", icon: "filter", label: "Filters" },
  { id: "effect", icon: "effects", label: "Effects" },
  { id: "cutout", icon: "cutout", label: "Cutout" },
  { id: "facepaint", icon: "palette", label: "Face paint" },
  { id: "brush", icon: "hair", label: "Brush" },
  { id: "text", icon: "text", label: "Text" },
  { id: "beauty", icon: "smile", label: "Beauty" },
  { id: "template", icon: "frame", label: "Templates" },
  { id: "music", icon: "music", label: "Music" },
  { id: "background", icon: "image", label: "Background" },
  { id: "adjust", icon: "edit", label: "Adjust" },
];

/** Loads a list from the content API (/api/looks/<kind>); renders loading / empty / error views. */
export function useContentCatalog(kind: string | null, query = ""): { view: ReactNode } {
  const [state, setState] = useState<"loading" | "error" | { items: { id: string; name: string }[] }>("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (kind == null) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- new request per open / retry
    setState("loading");
    fetch(asset(`/api/looks/${kind}${query ? `?q=${encodeURIComponent(query)}` : ""}`))
      .then((r) => (r.ok ? (r.json() as Promise<{ items?: { id: string; name: string }[] }>) : Promise.reject(new Error(String(r.status)))))
      .then((j) => alive && setState({ items: j.items ?? [] }), () => alive && setState("error"));
    return () => { alive = false; };
  }, [kind, query, attempt]);
  const view = state === "loading"
    ? <div className="flex h-full items-center justify-center"><Spinner /></div>
    : state === "error"
      ? <EmptyState icon="offline" title="No asset library connected" body="This build doesn’t include an online library for looks. A site admin can connect one." action={<Button size="sm" variant="secondary" icon="reset" onClick={() => setAttempt((a) => a + 1)}>Try again</Button>} />
      : state.items.length
        ? <div className="grid grid-cols-4 gap-2 p-4">{state.items.map((it) => <div key={it.id} className="aspect-square rounded-md bg-raised p-1 text-[11px]">{it.name}</div>)}</div>
        : <EmptyState icon="empty" title="Nothing here yet" />;
  return { view };
}

export function LensEditor() {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<"camera" | "photo">("camera");
  const [camReady, setCamReady] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [dialog, setDialog] = useState<"reset" | "cancel" | "guide" | null>(null);
  const list = useContentCatalog(menu?.id ?? null);
  const modified = false; // nothing can be applied until an asset library is connected

  useEffect(() => {
    if (mode !== "camera") return;
    let stream: MediaStream | null = null, cancelled = false;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        const v = video.current;
        if (v) { v.srcObject = s; v.play().catch(() => {}); }
      })
      .catch(() => setCamReady(false));
    return () => { cancelled = true; stream?.getTracks().forEach((t) => t.stop()); setCamReady(false); };
  }, [mode]);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);

  const finish = () => (window.history.length > 1 ? router.back() : router.replace("/discover"));
  const close = () => { if (menu) return setMenu(null); if (modified) setDialog("cancel"); else finish(); };

  return (
    <div className="absolute inset-0 z-50 flex flex-col overflow-hidden bg-bg">
      <div className="flex h-14 shrink-0 items-center gap-2 px-2 pt-[env(safe-area-inset-top)]">
        <IconButton icon="close" label="Close" onClick={close} />
        <button type="button" onClick={() => router.push("/lens/title")} className="flex min-w-0 flex-1 items-center justify-center gap-1.5 font-display text-[16px] font-semibold">
          <span className="truncate">New look</span><Icon name="pencil" size={14} className="text-fg-3" />
        </button>
        <Button size="sm" disabled={!modified}>Save</Button>
      </div>

      <div className="relative mx-3 min-h-0 flex-1 overflow-hidden rounded-xl bg-black">
        {mode === "camera" ? (
          <video ref={video} muted playsInline onPlaying={() => setCamReady(true)} className="h-full w-full object-cover" style={{ transform: "scaleX(-1)", opacity: camReady ? 1 : 0 }} />
        ) : photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="Preview photo" className="h-full w-full object-cover" />
        ) : (
          <EmptyState icon="image" title="Preview on a photo" action={<Button size="sm" icon="image" onClick={() => setPicker(true)}>Choose a photo</Button>} />
        )}
        {mode === "camera" && !camReady && <div className="absolute inset-0 flex items-center justify-center"><Spinner /></div>}
        <div className="absolute right-3 top-3 flex flex-col gap-2">
          <Tabs look="segment" tone="overlay" items={[{ id: "camera", label: <Icon name="camera" size={16} label="Camera" /> }, { id: "photo", label: <Icon name="image" size={16} label="Photo" /> }]} value={mode} onChange={(m) => { setMode(m); if (m === "photo" && !photo) setPicker(true); }} />
          {mode === "photo" && photo && <IconButton icon="gallery" label="Change photo" variant="glass" size={36} iconSize={18} className="self-end" onClick={() => setPicker(true)} />}
        </div>
        <div className="absolute inset-x-3 bottom-3 flex justify-between">
          <Button size="sm" variant="glass" icon="info" className="rounded-full" onClick={() => setDialog("guide")}>How it works</Button>
          <Button size="sm" variant="glass" icon="reset" className="rounded-full" onClick={() => setDialog("reset")}>Reset</Button>
        </div>
      </div>

      <div className="no-scrollbar flex shrink-0 gap-1 overflow-x-auto px-3 pb-[max(14px,env(safe-area-inset-bottom))] pt-3">
        <button type="button" aria-label="Layers" className="oe-press flex w-[64px] shrink-0 flex-col items-center gap-1.5">
          <span className="flex h-12 w-12 items-center justify-center rounded-md bg-raised"><Icon name="layers" size={22} /></span>
          <span className="text-[11px] text-fg-3">Layers</span>
        </button>
        {MENUS.map((m) => (
          <button key={m.id} type="button" onClick={() => setMenu(m)} className="oe-press flex w-[64px] shrink-0 flex-col items-center gap-1.5">
            <span className={cx("flex h-12 w-12 items-center justify-center rounded-md", menu?.id === m.id ? "bg-accent text-on-accent" : "bg-raised")}><Icon name={m.icon} size={22} /></span>
            <span className={cx("w-full truncate text-center text-[11px]", menu?.id === m.id ? "text-fg" : "text-fg-3")}>{m.label}</span>
          </button>
        ))}
      </div>

      <Sheet open={!!menu} onClose={() => setMenu(null)} title={menu?.label} action={<Button size="sm" variant="secondary" icon="search" onClick={() => router.push(`/lens/store?menu=${menu?.id ?? ""}`)}>Search</Button>}>
        <div className="h-[240px]">{list.view}</div>
      </Sheet>

      <PhotoPicker open={picker} title="Preview photo" onClose={() => setPicker(false)} onPick={(id) => { setPicker(false); void getPhoto(id).then((p) => p && setPhoto(URL.createObjectURL(p.blob))); }} />

      <Dialog open={dialog === "reset"} onClose={() => setDialog(null)} icon="reset" title="Reset this look?" confirm="Reset">Everything you added will be removed.</Dialog>
      <Dialog open={dialog === "cancel"} onClose={() => setDialog(null)} icon="alert" destructive title="Discard this look?" confirm="Discard" onConfirm={finish}>Your changes won’t be saved.</Dialog>
      <Dialog open={dialog === "guide"} onClose={() => setDialog(null)} icon="idea" title="How looks work">
        Pick a category below, add stickers, makeup, filters or effects, and see them live on your face. Save the look to use it in the camera.
      </Dialog>
    </div>
  );
}
