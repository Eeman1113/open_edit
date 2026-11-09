"use client";

// Art styles: turn a photo into a painting-like image. Styles come from the content API (/api/aistyle) or, without
// one, the built-in list. Every style is a recipe that runs on the device (src/lib/artstyle.ts): the photo never
// leaves the browser.
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, Icon, IconButton, Spinner, Thumb, cx, toast, useGoBack } from "@/components/ui";
import { PhotoPicker } from "@/components/ai/PhotoPicker";
import { ART_STYLES } from "@/data/content/artStyles";
import { renderArtStyle } from "@/lib/artstyle";
import { asset } from "@/lib/base";
import type { ArtStyle } from "@/lib/content/types";
import { cleanArtStyles } from "@/lib/content/validate";
import { getPhoto, savePhoto } from "@/lib/store";

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = url;
  });
}

export function AiStyleScreen() {
  const router = useRouter();
  const sp = useSearchParams();
  const back = useGoBack("/ai");
  const id = sp.get("id");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [styles, setStyles] = useState<ArtStyle[] | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; blob: Blob; w: number; h: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const img = useRef<HTMLImageElement | null>(null);
  const job = useRef(0);

  useEffect(() => {
    if (!id) return;
    let url: string | null = null;
    void getPhoto(id).then((p) => { if (p) { url = URL.createObjectURL(p.blob); setPhotoUrl(url); } });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [id]);

  // Catalogue: the content API, else the built-in styles (e.g. on static hosting without route handlers).
  useEffect(() => {
    let alive = true;
    fetch(asset("/api/aistyle"))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: unknown) => cleanArtStyles(j, window.location.href))
      .then((s) => alive && setStyles(s.length ? s : ART_STYLES), () => alive && setStyles(ART_STYLES));
    return () => { alive = false; };
  }, []);

  // Small previews of every style on the chosen photo.
  useEffect(() => {
    if (!photoUrl || !styles) return;
    let alive = true;
    void (async () => {
      const im = await loadImage(photoUrl).catch(() => null);
      if (!im || !alive) return;
      img.current = im;
      for (const s of styles) {
        await nextFrame();
        if (!alive) return;
        const url = renderArtStyle(im, s, 144).toDataURL("image/jpeg", 0.8);
        setPreviews((p) => ({ ...p, [s.id]: url }));
      }
    })();
    return () => { alive = false; };
  }, [photoUrl, styles]);

  // Drop the previous result when it is replaced or the screen closes.
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  const reset = () => { job.current++; setActive(null); setResult(null); setSaved(false); setBusy(false); };

  const apply = async (s: ArtStyle) => {
    if (!photoUrl) return setPicker(true);
    if (active === s.id) return reset();
    const my = ++job.current;
    setActive(s.id); setBusy(true); setSaved(false);
    await nextFrame();
    try {
      const im = img.current ?? (await loadImage(photoUrl));
      const canvas = renderArtStyle(im, s, 1600);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92));
      if (my !== job.current) return;
      if (!blob) throw new Error("encode");
      setResult({ url: URL.createObjectURL(blob), blob, w: canvas.width, h: canvas.height });
    } catch {
      if (my === job.current) { toast("This style couldn’t be applied.", { icon: "alert" }); setActive(null); }
    } finally {
      if (my === job.current) setBusy(false);
    }
  };

  const save = async () => {
    if (!result || saved) return;
    try {
      await savePhoto(result.blob, result.w, result.h);
      setSaved(true);
      toast("Saved to your gallery", { icon: "check" });
    } catch {
      toast("Couldn’t save the photo.", { icon: "alert" });
    }
  };

  const shown = result?.url ?? photoUrl;

  return (
    <div className="absolute inset-0 flex flex-col bg-bg">
      <div className="flex h-14 shrink-0 items-center gap-2 px-2 pt-[env(safe-area-inset-top)]">
        <IconButton icon="close" label="Close" onClick={back} />
        <h1 className="flex-1 font-display text-[17px] font-semibold">Art styles</h1>
        {photoUrl && <IconButton icon="gallery" label="Choose another photo" onClick={() => setPicker(true)} />}
        {result && <Button size="sm" icon={saved ? "check" : undefined} disabled={saved} onClick={() => void save()}>{saved ? "Saved" : "Save"}</Button>}
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-6">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt={result ? "Photo with the art style applied" : "Selected photo"} className="max-h-full max-w-full rounded-lg object-contain" />
        ) : (
          <div className="flex flex-col items-center text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-xl bg-accent-soft text-accent"><Icon name="palette" size={36} /></span>
            <p className="mt-5 font-display text-[20px] font-bold">Turn a photo into art</p>
            <p className="mt-1.5 text-[14px] text-fg-2">Choose a photo, then pick a style. It all happens on your device.</p>
            <Button className="mt-6" icon="image" onClick={() => setPicker(true)}>Choose a photo</Button>
          </div>
        )}
        {busy && <div className="absolute inset-0 flex items-center justify-center"><span className="flex items-center gap-2 rounded-full bg-glass px-4 py-2 text-[14px] backdrop-blur"><Spinner size={16} /> Painting…</span></div>}
      </div>

      <div className="min-h-[164px] shrink-0 rounded-t-xl bg-panel px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-4">
        <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-3">Styles</p>
        {styles === null ? (
          <div className="flex items-center justify-center gap-2 py-6 text-fg-2"><Spinner size={18} /> Loading styles…</div>
        ) : (
          <div className="no-scrollbar flex gap-3 overflow-x-auto">
            {styles.map((s) => (
              <button key={s.id} type="button" data-style={s.id} aria-pressed={active === s.id} title={s.about} onClick={() => void apply(s)} className="oe-press flex w-[72px] shrink-0 flex-col items-center gap-1.5">
                <Thumb src={previews[s.id] ?? s.thumbnail} seed={s.id} label={s.name.slice(0, 2)} className={cx("h-[72px] w-[72px] rounded-md ring-offset-2 ring-offset-panel", active === s.id && "ring-2 ring-accent")} />
                <span className={cx("w-full truncate text-center text-[12px]", active === s.id ? "text-fg" : "text-fg-2")}>{s.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <PhotoPicker open={picker} title="Choose a photo" onClose={() => setPicker(false)} onPick={(pid) => { setPicker(false); reset(); setPreviews({}); router.replace(`/aistyle?id=${encodeURIComponent(pid)}`); }} />
    </div>
  );
}
