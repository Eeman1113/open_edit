"use client";

// AR filter tab (EPContent.STICKER_ADD → EPStickerFragment, fragment_edit_photo_sticker_content.xml +
// fragment_edit_photo_sticker_list_main.xml / fragment_edit_photo_sticker_list.xml / item_edit_photo_sticker_item.xml).
// Categories: the camera's local starter set (src/data/camera/stickers.ts, same sticker JSON as the camera) and the
// server overview, which is unreachable offline and keeps the original loading → network-error page with Retry
// (same split as the camera StickerPanel). The picked sticker is rendered on the photo by the face engine in IMAGE
// mode (faceEngine.ts FaceStage → FacePipeline stickers), in the preview and in the full-resolution SAVE.
import { useEffect, useRef, useState } from "react";
import { d } from "@/components/ui/legacy-drawable";
import { useBackHandler } from "@/lib/back";
import { LOCAL_STICKER_CATEGORIES, fetchStickerCatalog, type Sticker, type StickerCategory } from "@/data/camera/stickers";
import { useEdit } from "../ctx";
import type { Doc } from "../model";
import { ControlRow, EmptyState, Img, TitleBar } from "../ui";
import { detectFaces, ensureFaceAssets, preloadStickerPreview } from "../tools/portrait/faceEngine";

const AR_ERROR = "You are not connected to a network. Please check your network settings and try again.";
/** Server overview placeholder (its categories are unknown offline): CategoryTabAdapter's error drawable. */
const SERVER_CATEGORY: StickerCategory = { id: -1, icon: "sticker_navigation_error", grayIcon: "sticker_navigation_error_off", stickers: [], server: true };

/** progressBarStyleSmall (16dp, white indeterminate). */
function SmallSpinner({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} style={{ animation: "b612-ar-spin 1s linear infinite" }}>
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeDasharray="28 41" strokeLinecap="round" />
    </svg>
  );
}

/** EditContentLoadingView (view_edit_content_loading.xml): 13dp white text over a 16dp spinner. */
function ContentLoading({ text, space = 0 }: { text: string; space?: number }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center">
      <span className="text-white" style={{ fontSize: 13, lineHeight: "15px" }}>{text}</span>
      <span style={{ marginTop: space }}><SmallSpinner /></span>
    </div>
  );
}

/** StickerDownloadProgressView (20dp): #40ffffff ring + rotating white arc while the resources load. */
function DownloadProgress() {
  const r = 8.5, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 20 20" width={20} height={20}>
      <circle cx="10" cy="10" r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
      <circle cx="10" cy="10" r={r} fill="none" stroke="#ffffff" strokeWidth="1.5" strokeDasharray={`${(c * 300) / 360} ${c}`} style={{ transformOrigin: "10px 10px", animation: "b612-ar-spin 1s linear infinite" }} />
    </svg>
  );
}

const withSticker = (d0: Doc, id: number | null): Doc => ({
  ...d0,
  beauty: { ...d0.beauty, face: { ...(d0.beauty.face ?? { f: {} }), sticker: id } },
});

export function ArFilterPanel({ onExit }: { onExit: () => void }) {
  const { doc, setLive, commit, setOriginal, bases } = useEdit();
  // the doc as it was when the page opened: ✓ commits the pick onto it, ✕ drops it
  const [saved] = useState(doc);
  const savedId = saved.beauty.face?.sticker ?? null;
  const [selectedId, setSelectedId] = useState<number | null>(savedId);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [catIdx, setCatIdx] = useState(0);
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [serverCats, setServerCats] = useState<StickerCategory[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [width, setWidth] = useState(360);
  const rootRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  // StickerOverview load (server categories); offline it fails and only their pages show the error page.
  useEffect(() => {
    let alive = true;
    fetchStickerCatalog()
      .then((c) => { if (alive) { setServerCats(c); setPhase("ready"); } })
      .catch(() => { if (alive) setPhase("error"); });
    return () => { alive = false; };
  }, [attempt]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // face detection starts with the page (the sticker needs the landmarks of the photo)
  useEffect(() => {
    const base = bases.current[saved.base];
    if (base) void detectFaces(base).catch(() => undefined);
  }, [bases, saved.base]);

  const cats: StickerCategory[] = [...LOCAL_STICKER_CATEGORIES, ...(serverCats.length ? serverCats : [SERVER_CATEGORY])];
  const cat = cats[Math.min(catIdx, cats.length - 1)];
  const pagePhase = cat.server ? phase : "ready";
  // fragment_edit_photo_sticker_list: columns = min(10, screenWidth / 70dp)
  const cols = Math.max(1, Math.min(10, Math.floor(width / 70)));

  const apply = (id: number | null) => {
    const n = ++seq.current;
    setSelectedId(id);
    if (id == null) {
      setLoadingId(null);
      setLive(savedId == null ? null : withSticker(saved, null));
      return;
    }
    setLoadingId(id);
    const base = bases.current[saved.base];
    const next = withSticker(saved, id);
    void Promise.all([
      base ? detectFaces(base) : Promise.resolve({ faces: [] }),
      preloadStickerPreview(id),
      ensureFaceAssets(next.beauty.face),
    ]).then(() => {
      if (n !== seq.current) return;
      setLoadingId(null);
      setLive(next);
    }).catch(() => { if (n === seq.current) setLoadingId(null); });
  };

  const onSelect = (s: Sticker) => apply(s.id === selectedId ? null : s.id);
  const close = () => { seq.current++; setLive(null); onExit(); };
  const confirm = () => {
    seq.current++;
    if (selectedId !== savedId && loadingId == null) commit(withSticker(saved, selectedId));
    else setLive(null);
    onExit();
  };

  // back = ✕ (EPStickerFragment.onBackPressed: drops the pick and closes the page)
  useBackHandler(close);

  return (
    <>
      {/* container_control (54dp): btn_original at the right */}
      <ControlRow bottom={52 + 255} onOriginal={setOriginal}>
        <span className="flex-1" />
      </ControlRow>
      {/* list page container_feature: 255dp, #E6171717, above the 52dp bottom bar */}
      <div ref={rootRef} data-ar-panel className="absolute inset-x-0" style={{ bottom: 52, height: 255, background: "rgba(23,23,23,0.9)" }}>
        {/* header (guide_option 43dp): btn_sticker_off + container_category (btn_search over list_category) */}
        <div className="absolute inset-x-0 top-0 flex items-center" style={{ height: 43 }}>
          <button type="button" onClick={() => apply(null)} className="relative flex h-full flex-none items-center" style={{ width: 49.5 }} aria-label="none">
            <Img name="icon_sticker_none" size={35} style={{ marginLeft: 6 }} />
            <span className="absolute right-0" style={{ width: 1, height: 18, background: "rgba(255,255,255,0.15)" }} />
          </button>
          <div className="relative flex h-full min-w-0 flex-1 items-center">
            {/* list_category: paddingStart 47.5 (room for btn_search), paddingEnd 8, LinearItemDecoration 5dp */}
            <div className="no-scrollbar flex h-full min-w-0 flex-1 items-center overflow-x-auto" style={{ paddingLeft: 47.5, paddingRight: 8, gap: 5 }}>
              {cats.map((c, i) => {
                const on = c === cat;
                const icon = (on ? c.icon : c.grayIcon ?? c.icon) ?? "sticker_default_category";
                return (
                  <button key={c.id} type="button" data-cat={c.id} onClick={() => setCatIdx(i)} className="flex h-full flex-none items-center justify-center" style={{ width: 35 }}>
                    <img src={d(icon)} alt="" style={{ width: 35, height: 35, objectFit: "contain", opacity: on || c.grayIcon !== c.icon ? 1 : 0.4 }} draggable={false} />
                  </button>
                );
              })}
            </div>
            <button type="button" className="absolute flex-none" style={{ left: 7.5 }} aria-label="Search">
              <Img name="icon_sticker_tab_search" size={35} />
            </button>
          </div>
        </div>

        {/* pager_sticker (below guide_option) */}
        <div className="absolute inset-x-0 bottom-0" style={{ top: 43 }} key={`${cat.id}|${attempt}`}>
          {pagePhase === "ready" && (cat.stickers.length ? (
            <div className="no-scrollbar h-full overflow-y-auto" style={{ padding: "4.5px 6px" }}>
              <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                {cat.stickers.map((s) => {
                  const selected = s.id === selectedId;
                  return (
                    <div key={s.id} className="flex justify-center">
                      {/* item_edit_photo_sticker_item: 63dp square, 54dp fitCenter thumbnail, view_selected ring, 20dp progress */}
                      <button type="button" data-sticker={s.id} onClick={() => onSelect(s)} className="relative flex-none" style={{ width: 63, height: 63 }}>
                        <img src={s.thumbnail.includes("/") ? s.thumbnail : d(s.thumbnail)} alt="" className="absolute" style={{ left: 4.5, top: 4.5, width: 54, height: 54, objectFit: "contain" }} draggable={false} />
                        {selected && <img src={d("icon_edit_sticker_select")} alt="" className="absolute inset-0" style={{ width: 63, height: 63 }} draggable={false} />}
                        {loadingId === s.id && <span className="absolute" style={{ right: 4.5 + 2, bottom: 4.5 + 2, width: 20, height: 20 }}><DownloadProgress /></span>}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <EmptyState text="There is no registered sticker." />
          ))}
          {pagePhase === "loading" && <ContentLoading text="Downloading stickers…" />}
          {pagePhase === "error" && <EmptyState text={AR_ERROR} onRetry={() => { setPhase("loading"); setAttempt((a) => a + 1); }} />}
        </div>
      </div>
      <TitleBar title="AR filter" onClose={close} onConfirm={confirm} />
      <style>{`@keyframes b612-ar-spin { to { transform: rotate(360deg) } }`}</style>
    </>
  );
}
