"use client";

// Art styles: turn a photo into a painting-like image. Styles come from the content API (/api/aistyle, configured
// on the server); without one the page explains that and points to the on-device AI tools instead.
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, EmptyState, Icon, IconButton, Spinner, Thumb, useGoBack } from "@/components/ui";
import { PhotoPicker } from "@/components/ai/PhotoPicker";
import { asset } from "@/lib/base";
import { getPhoto } from "@/lib/store";

interface Style { id: string; name: string; thumbnail?: string }

export function AiStyleScreen() {
  const router = useRouter();
  const sp = useSearchParams();
  const back = useGoBack("/ai");
  const id = sp.get("id");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [styles, setStyles] = useState<Style[] | null | "error">(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!id) return;
    let url: string | null = null;
    void getPhoto(id).then((p) => { if (p) { url = URL.createObjectURL(p.blob); setPhotoUrl(url); } });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [id]);

  useEffect(() => {
    let alive = true;
    fetch(asset("/api/aistyle"))
      .then((r) => (r.ok ? (r.json() as Promise<{ styles?: Style[] }>) : Promise.reject(new Error(String(r.status)))))
      .then((j) => alive && setStyles(j.styles ?? []), () => alive && setStyles("error"));
    return () => { alive = false; };
  }, [attempt]);

  return (
    <div className="absolute inset-0 flex flex-col bg-bg">
      <div className="flex h-14 shrink-0 items-center gap-2 px-2 pt-[env(safe-area-inset-top)]">
        <IconButton icon="close" label="Close" onClick={back} />
        <h1 className="flex-1 font-display text-[17px] font-semibold">Art styles</h1>
        {photoUrl && <IconButton icon="gallery" label="Choose another photo" onClick={() => setPicker(true)} />}
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-6">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="Selected photo" className="max-h-full max-w-full rounded-lg object-contain" />
        ) : (
          <div className="flex flex-col items-center text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-xl bg-accent-soft text-accent"><Icon name="palette" size={36} /></span>
            <p className="mt-5 font-display text-[20px] font-bold">Turn a photo into art</p>
            <p className="mt-1.5 text-[14px] text-fg-2">Choose a photo, then pick a style.</p>
            <Button className="mt-6" icon="image" onClick={() => setPicker(true)}>Choose a photo</Button>
          </div>
        )}
      </div>

      <div className="min-h-[164px] shrink-0 rounded-t-xl bg-panel px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-4">
        <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-3">Styles</p>
        {styles === null && <div className="flex items-center justify-center gap-2 py-6 text-fg-2"><Spinner size={18} /> Loading styles…</div>}
        {styles === "error" && (
          <EmptyState
            icon="offline"
            title="Styles aren’t available"
            body="This build has no art-style service connected. The on-device AI tools still work."
            action={<div className="flex gap-2"><Button size="sm" variant="secondary" icon="reset" onClick={() => { setStyles(null); setAttempt((a) => a + 1); }}>Try again</Button><Button size="sm" icon="ai" onClick={() => router.push("/ai")}>AI tools</Button></div>}
          />
        )}
        {Array.isArray(styles) && (styles.length ? (
          <div className="no-scrollbar flex gap-3 overflow-x-auto">
            {styles.map((s) => (
              <button key={s.id} type="button" disabled={!photoUrl} className="flex w-[72px] shrink-0 flex-col items-center gap-1.5 disabled:opacity-40">
                <Thumb src={s.thumbnail} seed={s.id} label={s.name.slice(0, 2)} className="h-[72px] w-[72px] rounded-md" />
                <span className="w-full truncate text-center text-[12px] text-fg-2">{s.name}</span>
              </button>
            ))}
          </div>
        ) : <EmptyState icon="palette" title="No styles yet" />)}
      </div>
      <PhotoPicker open={picker} title="Choose a photo" onClose={() => setPicker(false)} onPick={(pid) => { setPicker(false); router.replace(`/aistyle?id=${encodeURIComponent(pid)}`); }} />
    </div>
  );
}
