"use client";

// Look creator ("Create a look", from Discover and Me): combine an effect, a filter and a face style into a look,
// save it, and use it in the camera. The pieces come from the content API (/api/looks/<kind>, built in when no
// provider is configured); each one is a camera setting (?sticker= / ?filter= / ?beauty=), so a saved look opens the
// camera with all of them applied. Looks and the draft live in this browser only.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Dialog, EmptyState, Icon, IconButton, Sheet, Spinner, Tabs, Thumb, cx, toast, type IconName } from "@/components/ui";
import { PhotoPicker } from "@/components/ai/PhotoPicker";
import { apiJson } from "@/lib/content/api";
import type { CatalogItem } from "@/lib/content/types";
import { getPhoto } from "@/lib/store";
import { LOOK_TAGS_KEY, LOOK_TITLE_KEY } from "./LensSubScreens";
import { useBackHandler } from "@/lib/back";

type Menu = { id: string; icon: IconName; label: string };
/** Categories whose pieces can go into a look (each maps to a camera setting). */
export const MENUS: Menu[] = [
  { id: "sticker", icon: "sticker", label: "Stickers" },
  { id: "accessory", icon: "shapes", label: "Accessories" },
  { id: "facepaint", icon: "palette", label: "Face paint" },
  { id: "background", icon: "image", label: "Background" },
  { id: "transform", icon: "face", label: "Face shape" },
  { id: "filter", icon: "filter", label: "Filters" },
];

/** A look: at most one piece per camera setting. */
export type LookPart = "sticker" | "filter" | "beauty";
export interface LookPiece { value: string; name: string; thumb?: string }
export type Look = Partial<Record<LookPart, LookPiece>>;
export interface SavedLook { id: string; title: string; tags: string[]; look: Look; at: number }

const DRAFT_KEY = "oe.look.draft";
export const LOOKS_KEY = "oe.looks";
const PART_LABEL: Record<LookPart, string> = { sticker: "Effect", filter: "Filter", beauty: "Face style" };

/** The camera setting an entry stands for, read from its in-app link (`/?sticker=12`). */
export function lookPartOf(item: CatalogItem): { part: LookPart; value: string } | null {
  const m = item.href?.match(/^\/\?(sticker|filter|beauty)=([\w-]+)$/);
  return m ? { part: m[1] as LookPart, value: m[2] } : null;
}
/** Camera URL with every piece of the look applied. */
export const lookHref = (look: Look) => {
  const q = new URLSearchParams();
  for (const k of ["filter", "sticker", "beauty"] as LookPart[]) if (look[k]) q.set(k, look[k]!.value);
  return `/?${q.toString()}`;
};
const readJson = <T,>(store: () => Storage, key: string, fallback: T): T => {
  try { const v = store().getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
};
const writeJson = (store: () => Storage, key: string, v: unknown) => { try { store().setItem(key, JSON.stringify(v)); } catch { /* storage blocked */ } };
export const loadSavedLooks = () => readJson<SavedLook[]>(() => localStorage, LOOKS_KEY, []);

/** One catalogue entry: preview (or a seeded swatch) and name. With `onPick`, entries that map to a camera setting
 *  are added to the look; other entries open their link (collage templates) or are shown for reference. */
function CatalogTile({ item, picked, onPick }: { item: CatalogItem; picked?: boolean; onPick?: (item: CatalogItem) => void }) {
  const body = (
    <>
      <Thumb src={item.thumbnail} seed={item.id} label={item.name.slice(0, 2)} fit="contain" className={cx("aspect-square w-full rounded-md bg-raised", picked && "ring-2 ring-accent ring-offset-2 ring-offset-panel")} />
      <span className={cx("mt-1 block w-full truncate text-center text-[11px]", picked ? "text-fg" : "text-fg-2")}>{item.name}</span>
    </>
  );
  if (onPick && lookPartOf(item)) return <button type="button" data-item={item.id} aria-pressed={!!picked} onClick={() => onPick(item)} className="oe-press block min-w-0" title={item.name}>{body}</button>;
  return item.href
    ? <Link href={item.href} className="oe-press block min-w-0" title={item.name}>{body}</Link>
    : <div className="min-w-0" title={item.name}>{body}</div>;
}

/** Loads a list from the content API (/api/looks/<kind>); renders loading / empty / error views. */
export function useContentCatalog(kind: string | null, query = "", pick?: { onPick: (item: CatalogItem) => void; isPicked: (item: CatalogItem) => boolean }): { view: ReactNode } {
  const [state, setState] = useState<"loading" | "error" | { items: CatalogItem[] }>("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (kind == null) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- new request per open / retry
    setState("loading");
    apiJson<{ items?: CatalogItem[] }>(`/api/looks/${kind}${query ? `?q=${encodeURIComponent(query)}` : ""}`)
      .then((j) => alive && setState({ items: j.items ?? [] }), () => alive && setState("error"));
    return () => { alive = false; };
  }, [kind, query, attempt]);
  const view = state === "loading"
    ? <div className="flex h-full items-center justify-center"><Spinner /></div>
    : state === "error"
      ? <EmptyState icon="offline" title="Couldn’t load this list" body="Check your connection and try again." action={<Button size="sm" variant="secondary" icon="reset" onClick={() => setAttempt((a) => a + 1)}>Try again</Button>} />
      : state.items.length
        ? <div className="grid grid-cols-4 gap-x-2 gap-y-3 p-4">{state.items.map((it) => <CatalogTile key={it.id} item={it} picked={pick?.isPicked(it)} onPick={pick?.onPick} />)}</div>
        : <EmptyState icon="empty" title="Nothing here yet" />;
  return { view };
}

/** The look being made (kept for the session, so naming / searching and coming back keeps it). */
export function useLookDraft() {
  const [look, setLookState] = useState<Look>({});
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the draft once
    setLookState(readJson<Look>(() => sessionStorage, DRAFT_KEY, {}));
  }, []);
  const setLook = (l: Look) => { setLookState(l); writeJson(() => sessionStorage, DRAFT_KEY, l); };
  const toggle = (item: CatalogItem) => {
    const p = lookPartOf(item);
    if (!p) return;
    const cur = look[p.part];
    const next = { ...look };
    if (cur?.value === p.value) delete next[p.part];
    else next[p.part] = { value: p.value, name: item.name, thumb: item.thumbnail };
    setLook(next);
  };
  const isPicked = (item: CatalogItem) => { const p = lookPartOf(item); return !!p && look[p.part]?.value === p.value; };
  return { look, setLook, toggle, isPicked };
}

export function LensEditor() {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<"camera" | "photo">("camera");
  const [camReady, setCamReady] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [layers, setLayers] = useState(false);
  const [dialog, setDialog] = useState<"reset" | "cancel" | "guide" | null>(null);
  const { look, setLook, toggle, isPicked } = useLookDraft();
  const list = useContentCatalog(menu?.id ?? null, "", { onPick: toggle, isPicked });
  const [title, setTitle] = useState("");
  const [saved, setSaved] = useState<SavedLook[]>([]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the name and the saved looks once
    try { setTitle(sessionStorage.getItem(LOOK_TITLE_KEY) ?? ""); } catch { /* storage blocked */ }
    setSaved(loadSavedLooks());
  }, []);
  const parts = (Object.keys(PART_LABEL) as LookPart[]).filter((k) => look[k]);
  const modified = parts.length > 0;

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

  const clearDraft = () => {
    setLook({});
    try { sessionStorage.removeItem(LOOK_TITLE_KEY); sessionStorage.removeItem(LOOK_TAGS_KEY); } catch { /* storage blocked */ }
  };
  const finish = () => (window.history.length > 1 ? router.back() : router.replace("/discover"));
  const close = () => { if (menu) return setMenu(null); if (modified) setDialog("cancel"); else finish(); };
  useBackHandler(close);
  const save = () => {
    if (!modified) return;
    let tags: string[] = [];
    try { tags = (sessionStorage.getItem(LOOK_TAGS_KEY) ?? "").split(/[\s,#]+/).filter(Boolean); } catch { /* storage blocked */ }
    const entry: SavedLook = { id: `look-${Date.now().toString(36)}`, title: title.trim() || `Look ${saved.length + 1}`, tags, look, at: Date.now() };
    const all = [entry, ...saved].slice(0, 50);
    writeJson(() => localStorage, LOOKS_KEY, all);
    setSaved(all);
    clearDraft();
    toast(`“${entry.title}” saved`, { icon: "check", tone: "ok" });
    router.push(lookHref(entry.look));
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col overflow-hidden bg-bg">
      <div className="flex h-14 shrink-0 items-center gap-2 px-2 pt-[env(safe-area-inset-top)]">
        <IconButton icon="close" label="Close" onClick={close} />
        <button type="button" onClick={() => router.push("/lens/title")} className="flex min-w-0 flex-1 items-center justify-center gap-1.5 font-display text-[16px] font-semibold">
          <span className="truncate">{title || "New look"}</span><Icon name="pencil" size={14} className="text-fg-3" />
        </button>
        <Button size="sm" disabled={!modified} onClick={save}>Save</Button>
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
        {/* the pieces of the look, over the preview */}
        {modified && (
          <div className="absolute left-3 top-3 flex max-w-[60%] flex-col items-start gap-1.5" data-look-parts>
            {parts.map((k) => (
              <span key={k} className="flex max-w-full items-center gap-1.5 rounded-full bg-glass py-1 pl-1 pr-3 text-[12px] font-medium text-white backdrop-blur-md">
                <Thumb src={look[k]!.thumb} seed={look[k]!.value} className="h-6 w-6 flex-none rounded-full" />
                <span className="truncate">{PART_LABEL[k]}: {look[k]!.name}</span>
              </span>
            ))}
          </div>
        )}
        <div className="absolute inset-x-3 bottom-3 flex justify-between gap-2">
          <Button size="sm" variant="glass" icon="info" className="rounded-full" onClick={() => setDialog("guide")}>How it works</Button>
          {modified && <Button size="sm" variant="glass" icon="camera" className="rounded-full" onClick={() => router.push(lookHref(look))}>Try it</Button>}
          <Button size="sm" variant="glass" icon="reset" className="rounded-full" disabled={!modified} onClick={() => setDialog("reset")}>Reset</Button>
        </div>
      </div>

      <div className="no-scrollbar flex shrink-0 gap-1 overflow-x-auto px-3 pb-[max(14px,env(safe-area-inset-bottom))] pt-3">
        <button type="button" aria-label="Layers" onClick={() => setLayers(true)} className="oe-press relative flex w-[64px] shrink-0 flex-col items-center gap-1.5">
          <span className="relative flex h-12 w-12 items-center justify-center rounded-md bg-raised">
            <Icon name="layers" size={22} />
            {modified && <span className="tabular absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-on-accent">{parts.length}</span>}
          </span>
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
        <div className="h-[240px] overflow-y-auto">{list.view}</div>
      </Sheet>

      <Sheet open={layers} onClose={() => setLayers(false)} title="Layers">
        <div className="px-4 pb-4">
          {modified ? parts.map((k) => (
            <div key={k} className="flex items-center gap-3 border-b border-line py-2.5">
              <Thumb src={look[k]!.thumb} seed={look[k]!.value} className="h-10 w-10 flex-none rounded-sm" />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] text-fg-3">{PART_LABEL[k]}</span>
                <span className="block truncate text-[15px]">{look[k]!.name}</span>
              </span>
              <IconButton icon="trash" label={`Remove ${look[k]!.name}`} onClick={() => { const n = { ...look }; delete n[k]; setLook(n); }} />
            </div>
          )) : <p className="py-4 text-center text-[14px] text-fg-2">Nothing in this look yet. Pick an effect, a filter or a face shape below.</p>}
          {saved.length > 0 && (
            <>
              <p className="mb-1 mt-5 text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-3">Your looks</p>
              {saved.map((l) => (
                <Link key={l.id} href={lookHref(l.look)} className="oe-press flex items-center gap-3 border-b border-line py-2.5">
                  <Icon name="effects" size={20} className="text-accent" />
                  <span className="min-w-0 flex-1 truncate text-[15px]">{l.title}</span>
                  <span className="text-[12px] text-fg-3">Use</span>
                </Link>
              ))}
            </>
          )}
        </div>
      </Sheet>

      <PhotoPicker open={picker} title="Preview photo" onClose={() => setPicker(false)} onPick={(id) => { setPicker(false); void getPhoto(id).then((p) => p && setPhoto(URL.createObjectURL(p.blob))); }} />

      <Dialog open={dialog === "reset"} onClose={() => setDialog(null)} icon="reset" title="Reset this look?" confirm="Reset" onConfirm={() => { setLook({}); setDialog(null); }}>Everything you added will be removed.</Dialog>
      <Dialog open={dialog === "cancel"} onClose={() => setDialog(null)} icon="alert" destructive title="Discard this look?" confirm="Discard" onConfirm={() => { clearDraft(); finish(); }}>Your changes won’t be saved.</Dialog>
      <Dialog open={dialog === "guide"} onClose={() => setDialog(null)} icon="idea" title="How looks work">
        Pick an effect, a filter and a face shape from the lists below. Tap Try it to see them live in the camera, then Save to keep the look. Saved looks are under Layers.
      </Dialog>
    </div>
  );
}
