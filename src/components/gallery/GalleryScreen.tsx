"use client";

// Gallery: everything saved in this browser (IndexedDB). Two modes:
//  - normal: browse, import, open the viewer, edit (photos → photo editor, videos → video editor)
//  - collage (?mode=collage): pick 2–9 photos, then continue to the collage editor
// Albums filter the grid; ?tab=video opens on the Videos tab.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Dialog, EmptyState, Icon, IconButton, Spinner, Tabs, cx, toast } from "@/components/ui";
import { useBackHandler } from "@/lib/back";
import { PHOTOS_EVENT, deletePhoto, download, groupAlbums, importFiles, isGifPhoto, isVideoPhoto, listPhotos, type Photo } from "@/lib/store";
import { GalleryCell, Thumb } from "./parts";
import { GalleryViewer } from "./GalleryViewer";
import { LayoutBalloon, isLayoutTooltipNew, markLayoutTooltipSeen } from "./LayoutBalloon";
import { SelectViewer } from "./SelectViewer";

type Mode = "normal" | "collage";
type Tab = "all" | "video";
const COLLAGE_MIN = 2;
const COLLAGE_MAX = 9;
const DEV = process.env.NODE_ENV !== "production";
const NO_URLS = new Map<string, string>();

/* ------------------------------------------------------------------ grid page */

/** Photo grid with a quick-scroll handle on the right edge (appears while scrolling, fades after a second). */
function GridPage({ items, urls, zoom, emptyText, bottomInset, onTap, onZoom, active, pickCount }: {
  items: Photo[] | null;
  urls: Map<string, string>;
  zoom: boolean;
  emptyText: string;
  bottomInset: number;
  onTap: (p: Photo) => void;
  onZoom: (p: Photo) => void;
  active: boolean;
  pickCount?: (id: string) => number;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [sc, setSc] = useState({ show: false, fading: false, y: 0, pressed: false });
  const hideT = useRef<number | undefined>(undefined);
  const dragging = useRef(false);
  const THUMB = 36;
  const EDGE = 6;

  useEffect(() => () => window.clearTimeout(hideT.current), []);
  useEffect(() => {
    if (!active) list.current?.scrollTo({ top: list.current.scrollTop });
  }, [active]);

  const rowH = () => {
    const el = list.current!;
    return (el.clientWidth - 4) / 3 + 2;
  };
  const scheduleHide = () => {
    window.clearTimeout(hideT.current);
    hideT.current = window.setTimeout(() => setSc((s) => (dragging.current ? s : { ...s, show: false, fading: true })), 1000);
  };
  const onScroll = () => {
    const el = list.current;
    if (!el || !items?.length) return;
    const H = el.clientHeight;
    const r = rowH();
    const n = items.length;
    const first = Math.floor(el.scrollTop / r) * 3;
    const visible = (Math.ceil((el.scrollTop + H) / r) - Math.floor(el.scrollTop / r)) * 3;
    if (!dragging.current && n - visible > 0) {
      const y = Math.min(Math.max((H * first) / (n - visible), EDGE), H - THUMB - EDGE);
      setSc((s) => ({ ...s, show: true, fading: false, y }));
    } else if (!dragging.current) {
      setSc((s) => ({ ...s, show: n - visible > 0 }));
    }
    scheduleHide();
  };
  const dragTo = (clientY: number) => {
    const el = list.current;
    if (!el || !items?.length) return;
    const rect = el.getBoundingClientRect();
    const f = clientY - rect.top;
    const H = el.clientHeight;
    const y = Math.min(Math.max(f - THUMB / 2, EDGE), H - THUMB - EDGE);
    let pos = Math.floor((f / H) * items.length);
    pos = Math.min(Math.max(pos, 0), items.length - 1);
    el.scrollTop = Math.floor(pos / 3) * rowH();
    setSc((s) => ({ ...s, y, show: true, fading: false, pressed: true }));
  };

  const empty = items !== null && items.length === 0;
  return (
    <div className="relative h-full w-full flex-none" style={{ scrollSnapAlign: "start" }}>
      <div ref={list} onScroll={onScroll} className="no-scrollbar absolute inset-0 overflow-y-auto" style={{ overscrollBehavior: "contain" }}>
        {!empty && items && (
          <div className="grid grid-cols-3 gap-0.5">
            {items.map((p, i) => (
              <GalleryCell key={`${p.id}-${i}`} photo={p} url={urls.get(p.id)} zoom={zoom} picked={pickCount?.(p.id)} onClick={() => onTap(p)} onZoom={() => onZoom(p)} />
            ))}
          </div>
        )}
        {!empty && <div style={{ height: bottomInset }} />}
      </div>
      {empty && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ paddingBottom: bottomInset }}>
          <EmptyState icon="gallery" title={emptyText} body="Shots you save from the camera and files you import appear here." />
        </div>
      )}
      <div
        className="absolute right-0 top-0 bottom-0"
        style={{ width: 24, touchAction: "none", pointerEvents: sc.show ? "auto" : "none" }}
        onPointerDown={(e) => {
          if (!sc.show) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          dragging.current = true;
          window.clearTimeout(hideT.current);
          dragTo(e.clientY);
        }}
        onPointerMove={(e) => dragging.current && dragTo(e.clientY)}
        onPointerUp={() => {
          dragging.current = false;
          setSc((s) => ({ ...s, pressed: false }));
          scheduleHide();
        }}
        onPointerCancel={() => {
          dragging.current = false;
          setSc((s) => ({ ...s, pressed: false }));
          scheduleHide();
        }}
      >
        <div style={{ opacity: sc.show ? 1 : 0, transition: sc.show ? "none" : sc.fading ? "opacity 200ms" : "none" }}>
          <span className={cx("absolute right-1 flex h-9 w-3 items-center justify-center rounded-full shadow", sc.pressed ? "bg-accent" : "bg-fg/80")} style={{ top: 0, transform: `translateY(${sc.y}px)` }} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ screen */

export function GalleryScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const mode: Mode = params.get("mode") === "collage" ? "collage" : "normal";
  const collage = mode === "collage";

  const [data, setData] = useState<{ photos: Photo[]; urls: Map<string, string> } | null>(null);
  const urlRef = useRef(new Map<string, string>());
  const [album, setAlbum] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(() => (params.get("tab") === "video" ? "video" : "all"));
  const [tabPos, setTabPos] = useState(0); // 0..1 viewpager scroll position (indicator)
  const [folder, setFolder] = useState<"closed" | "opening" | "open" | "closing">("closed");
  const [busy, setBusy] = useState(false);
  const showToast = (t: string) => toast(t, { icon: "alert" });
  const showLimitToast = (t: string) => toast(t, { icon: "info" });
  const [selView, setSelView] = useState<{ id: string; items: Photo[] } | null>(null);
  // first visit: hint on the Collage button
  const [tip, setTip] = useState(false);
  const layoutRef = useRef<HTMLSpanElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [alert, setAlert] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ id: string; items: Photo[] } | null>(null);
  const [del, setDel] = useState<Photo | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const [leaving, setLeaving] = useState(false);
  const [bottomH, setBottomH] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const pagerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);

  // object URLs are reused across reloads and revoked when a photo leaves the store
  const reload = useCallback(() => {
    listPhotos().catch(() => [] as Photo[]).then((ps) => {
      const prev = urlRef.current, next = new Map<string, string>();
      for (const p of ps) next.set(p.id, prev.get(p.id) ?? URL.createObjectURL(p.blob));
      for (const [id, u] of prev) if (!next.has(id)) URL.revokeObjectURL(u);
      urlRef.current = next;
      setData({ photos: ps, urls: next });
    });
  }, []);
  useEffect(() => {
    reload();
    window.addEventListener(PHOTOS_EVENT, reload);
    const map = urlRef;
    return () => {
      window.removeEventListener(PHOTOS_EVENT, reload);
      for (const u of map.current.values()) URL.revokeObjectURL(u);
      map.current = new Map();
    };
  }, [reload]);


  // bottom bar height → grid bottom padding
  useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBottomH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const selectTab = (t: Tab, smooth = true) => {
    setTab(t);
    const el = pagerRef.current;
    if (el) el.scrollTo({ left: t === "all" ? 0 : el.clientWidth, behavior: smooth ? "smooth" : "auto" });
  };

  /* --- dev-only states for headless checks (?__seed=1, ?__state=folder|viewer|video|delete|alert|picks) */
  const devDone = useRef(false);
  useEffect(() => {
    if (!DEV || !data || devDone.current) return;
    devDone.current = true;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("__seed") && data.photos.length === 0) {
      void import("./devSeed").then((m) => m.seedSamples());
      return;
    }
    const st = sp.get("__state");
    const firstImg = data.photos.find((p) => !isVideoPhoto(p));
    const firstVid = data.photos.find(isVideoPhoto);
    window.setTimeout(() => {
      if (st === "folder") setFolder("open");
      if (st === "viewer" && firstImg) setViewer({ id: firstImg.id, items: data.photos });
      if (st === "video" && firstVid) setViewer({ id: firstVid.id, items: data.photos });
      if (st === "delete" && firstImg) setDel(firstImg);
      if (st === "alert") setAlert("This file type isn’t supported.");
      if (st === "videos") selectTab("video", false);
      if (st === "picks") setPicks(data.photos.filter((p) => !isVideoPhoto(p) && !isGifPhoto(p)).slice(0, 3).map((p) => p.id));
      if (st === "select" && firstImg) setSelView({ id: firstImg.id, items: data.photos.filter((p) => !isVideoPhoto(p) && !isGifPhoto(p)) });
      if (st === "limit") showLimitToast("You can pick up to 9 photos.");
      if (st === "scroll") pagerRef.current?.querySelector<HTMLDivElement>(".overflow-y-auto")?.scrollBy({ top: 200 });
    }, 50);
  }, [data]);

  /* --- data views */
  const all = useMemo(() => data?.photos ?? [], [data]);
  const urls = data?.urls ?? NO_URLS;
  // collage picks still photos only
  const valid = useCallback((p: Photo) => (collage ? !isVideoPhoto(p) && !isGifPhoto(p) : true), [collage]);
  const albums = useMemo(() => groupAlbums(all, valid), [all, valid]);
  const inAlbum = useMemo(() => all.filter((p) => valid(p) && (album === null || p.album === album)), [all, valid, album]);
  const videos = useMemo(() => inAlbum.filter(isVideoPhoto), [inAlbum]);
  const byId = useMemo(() => new Map(all.map((p) => [p.id, p])), [all]);
  const pickItems = useMemo(() => picks.map((id) => byId.get(id)).filter((p): p is Photo => !!p), [picks, byId]);
  const folderOpen = folder === "open" || folder === "opening";

  /* --- album picker: slides down from the title */
  const openFolders = (open: boolean) => {
    if (albums.length === 0) return;
    if (open) {
      setFolder("opening");
      window.setTimeout(() => setFolder("open"), 20);
    } else if (folderOpen) {
      setFolder("closing");
      window.setTimeout(() => setFolder("closed"), 300);
    }
  };
  const folderH = 72 * albums.length + 16;

  /* --- navigation */
  const finish = () => {
    setLeaving(true);
    window.setTimeout(() => {
      if (window.history.length > 1) router.back();
      else router.push("/");
    }, 200);
  };
  const onBack = () => {
    if (folderOpen) return openFolders(false);
    if (selView) return setSelView(null);
    if (viewer) return setViewer(null);
    finish();
  };
  // the viewers register their own handlers above this one
  useBackHandler(onBack, !viewer && !selView);

  /* --- item actions */
  const openEditor = (p: Photo) => {
    if (isVideoPhoto(p)) {
      router.push(`/video-edit?id=${encodeURIComponent(p.id)}`);
      return;
    }
    router.push(`/edit?id=${encodeURIComponent(p.id)}`);
  };
  const onTap = (p: Photo) => {
    if (!collage) return openEditor(p);
    // the same photo may be picked more than once
    if (picks.length >= COLLAGE_MAX) return showLimitToast("You can pick up to 9 photos.");
    setPicks((s) => [...s, p.id]);
    window.setTimeout(() => trayRef.current?.scrollTo({ left: trayRef.current.scrollWidth, behavior: "smooth" }), 50);
  };
  // the zoom corner opens the viewer (normal) or the pick viewer (collage)
  const onZoom = (p: Photo, items: Photo[]) => (collage ? setSelView({ id: p.id, items }) : setViewer({ id: p.id, items }));

  useEffect(() => {
    if (collage) return;
    const dev = DEV && new URLSearchParams(window.location.search).get("__state") === "tooltip";
    const id = window.setTimeout(() => setTip(dev || isLayoutTooltipNew()), 0);
    const hide = window.setTimeout(() => setTip(false), 5000);
    return () => { window.clearTimeout(id); window.clearTimeout(hide); };
  }, [collage]);
  const openLayout = () => router.push("/gallery?mode=collage");

  const onShare = async (p: Photo) => {
    const ext = p.blob.type.split("/")[1]?.replace("jpeg", "jpg").replace("quicktime", "mov") || "jpg";
    const file = new File([p.blob], `OpenEdit_${p.id.slice(0, 8)}.${ext}`, { type: p.blob.type });
    try {
      if (navigator.canShare?.({ files: [file] })) return void (await navigator.share({ files: [file] }));
    } catch {
      return;
    }
    download(p.blob, file.name);
  };

  const onImport = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true);
    let failed = 0;
    try {
      await importFiles(files, () => failed++);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
    if (failed) showToast(failed === 1 ? "One file couldn’t be opened." : `${failed} files couldn’t be opened.`);
  };

  const title = album ?? (collage ? "Pick photos" : "All photos");
  const viewerItems = viewer ? viewer.items.filter((p) => byId.has(p.id)) : [];
  const pickCount = (id: string) => { const n = picks.filter((x) => x === id).length; return n ? picks.lastIndexOf(id) + 1 : 0; };

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 flex flex-col overflow-hidden bg-bg"
      style={{ animation: "oe-sheet-in 220ms var(--oe-ease)", transform: leaving ? "translateY(100%)" : "none", transition: "transform 200ms var(--oe-ease)" }}
    >
      <input ref={fileRef} type="file" accept="image/*,video/*,.heic,.heif" multiple hidden onChange={(e) => void onImport(e.target.files)} />

      <header className="relative z-20 flex h-14 shrink-0 items-center gap-1 bg-bg px-2 pt-[env(safe-area-inset-top)]">
        <IconButton icon="close" label="Close" onClick={finish} />
        <button type="button" onClick={() => openFolders(!folderOpen)} className="flex min-w-0 flex-1 items-center justify-center gap-1 font-display text-[17px] font-semibold" aria-expanded={folderOpen}>
          <span className="truncate">{title}</span>
          {albums.length > 0 && <Icon name="chevron-down" size={18} className="shrink-0 text-fg-3 transition-transform" style={{ transform: folderOpen ? "rotate(180deg)" : undefined }} />}
        </button>
        {!collage ? (
          <span ref={layoutRef}>
            <Button size="sm" variant="secondary" icon="collage" onClick={() => { if (tip) { markLayoutTooltipSeen(); setTip(false); } openLayout(); }}>Collage</Button>
          </span>
        ) : <span className="w-10" />}
      </header>

      {!collage && (
        <div className="relative z-10 shrink-0 px-4 pb-2">
          <Tabs look="segment" items={[{ id: "all" as Tab, label: "All" }, { id: "video" as Tab, label: "Videos" }]} value={Math.round(tabPos) === 1 ? "video" : "all"} onChange={(t) => selectTab(t)} />
        </div>
      )}

      <div
        ref={pagerRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const pos = el.scrollLeft / Math.max(1, el.clientWidth);
          setTabPos(pos);
          const t: Tab = pos > 0.5 ? "video" : "all";
          if (t !== tab) setTab(t);
        }}
        className="no-scrollbar relative flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
        style={{ overscrollBehaviorX: "contain" }}
      >
        <GridPage items={data ? inAlbum : null} urls={urls} zoom emptyText={collage ? "No photos to pick" : "No photos yet"} bottomInset={bottomH} onTap={onTap} onZoom={(p) => onZoom(p, inAlbum)} active={tab === "all"} pickCount={collage ? pickCount : undefined} />
        {!collage && <GridPage items={data ? videos : null} urls={urls} zoom emptyText="No videos yet" bottomInset={bottomH} onTap={onTap} onZoom={(p) => onZoom(p, videos)} active={tab === "video"} />}
      </div>

      <div ref={bottomRef} className="absolute inset-x-0 bottom-0 z-10">
        {!collage ? (
          <div className="flex justify-center bg-gradient-to-t from-bg via-bg/85 to-transparent px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-8">
            <Button size="lg" icon="upload" className="rounded-full shadow-xl" onClick={() => fileRef.current?.click()}>Import photos</Button>
          </div>
        ) : (
          <div className="rounded-t-xl bg-panel pb-[max(12px,env(safe-area-inset-bottom))] shadow-2xl">
            <div className="flex items-center gap-2 px-4 pt-3">
              <p className="min-w-0 flex-1 text-[14px] text-fg-2"><span className="font-semibold text-fg">{picks.length}</span> of 2–9 photos</p>
              <Button size="sm" variant="secondary" icon="upload" onClick={() => fileRef.current?.click()}>Import</Button>
              <Button size="sm" iconRight="arrow-right" disabled={picks.length < COLLAGE_MIN} onClick={() => router.push(`/collage?ids=${picks.map(encodeURIComponent).join(",")}`)}>Next</Button>
            </div>
            {pickItems.length > 0 && (
              <div ref={trayRef} className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-4">
                {pickItems.map((p, i) => (
                  <div key={i} className="relative h-16 w-16 flex-none overflow-hidden rounded-sm bg-raised">
                    <Thumb photo={p} url={urls.get(p.id)} />
                    <button type="button" aria-label="Remove" onClick={() => setPicks((s) => s.filter((_, j) => j !== i))} className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white">
                      <Icon name="close" size={12} stroke={2.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {folder !== "closed" && (
        <>
          <div className="absolute inset-x-0 bottom-0 z-10 bg-scrim transition-opacity duration-300" style={{ top: 56, opacity: folder === "open" ? 1 : 0 }} onClick={() => openFolders(false)} />
          <div className="absolute inset-x-0 z-10 overflow-hidden" style={{ top: 56, height: `min(calc(85% - 56px), ${folderH}px)` }}>
            <div className="no-scrollbar h-full overflow-y-auto rounded-b-xl bg-panel py-2" style={{ transform: folder === "open" ? "none" : "translateY(-100%)", transition: "transform 300ms var(--oe-ease)" }}>
              {albums.map((a) => (
                <button
                  key={a.name ?? "__all"}
                  type="button"
                  onClick={() => { setAlbum(a.name); openFolders(false); pagerRef.current?.querySelectorAll<HTMLDivElement>(".overflow-y-auto").forEach((el) => el.scrollTo({ top: 0 })); }}
                  className={cx("flex w-full items-center gap-3 px-4 py-2 text-left active:bg-raised", album === a.name && "text-accent")}
                >
                  <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-sm bg-raised">{a.cover && <Thumb photo={a.cover} url={urls.get(a.cover.id)} />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{a.name ?? "All photos"}</span>
                    <span className="text-[13px] text-fg-3">{a.count}</span>
                  </span>
                  {album === a.name && <Icon name="check" size={18} />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {!collage && tip && <LayoutBalloon anchor={layoutRef} root={rootRef} onClick={() => { markLayoutTooltipSeen(); setTip(false); openLayout(); }} />}

      {selView && <SelectViewer items={selView.items.filter((p) => byId.has(p.id))} urls={urls} startId={selView.id} onBack={() => setSelView(null)} onSelect={onTap} />}
      {viewer && <GalleryViewer items={viewerItems} urls={urls} startId={viewer.id} onBack={() => setViewer(null)} onShare={(p) => void onShare(p)} onEdit={openEditor} onDelete={setDel} />}

      <Dialog
        open={!!del}
        onClose={() => setDel(null)}
        icon="trash"
        destructive
        title={del && isVideoPhoto(del) ? "Delete this video?" : "Delete this photo?"}
        confirm="Delete"
        onConfirm={() => { const p = del; if (!p) return; setPicks((s) => s.filter((id) => id !== p.id)); void deletePhoto(p.id); }}
      >
        It will be removed from this browser.
      </Dialog>
      <Dialog open={!!alert} onClose={() => setAlert(null)} icon="alert" title="Can’t open this file">{alert}</Dialog>
      {busy && <div className="absolute inset-0 z-[70] flex items-center justify-center bg-scrim"><span className="flex items-center gap-2 rounded-md bg-panel px-4 py-3 text-[14px]"><Spinner size={18} /> Importing…</span></div>}
    </div>
  );
}
