"use client";

// Look creator sub-pages: the asset search, the look name and its tags.
import { useEffect, useState } from "react";
import { Button, Icon, TopBar, useGoBack } from "@/components/ui";
import { useContentCatalog, useLookDraft } from "./LensEditor";
import { useBackHandler } from "@/lib/back";

const TITLE_MAX = 30;
export const LOOK_TITLE_KEY = "oe.look.title";
export const LOOK_TAGS_KEY = "oe.look.tags";

/** Search the look creator's catalogue; picking an entry adds it to the look being made. */
export function AssetStore() {
  const back = useGoBack("/lens");
  useBackHandler(back);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const { toggle, isPicked } = useLookDraft();
  const list = useContentCatalog("store", search, { onPick: toggle, isPicked });
  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-bg">
      <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-[max(10px,env(safe-area-inset-top))]">
        <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-panel px-4">
          <Icon name="search" size={18} className="text-fg-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setSearch(q.trim())} placeholder="Search stickers and effects" enterKeyHint="search" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-fg-3" />
          {q && <button type="button" aria-label="Clear" onClick={() => setQ("")} className="text-fg-3"><Icon name="x-circle" size={18} /></button>}
        </label>
        <Button variant="ghost" size="sm" onClick={back}>Cancel</Button>
      </div>
      <div className="relative min-h-0 flex-1">{list.view}</div>
    </div>
  );
}

function useSessionText(key: string) {
  const [text, setText] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the draft once
    try { setText(sessionStorage.getItem(key) ?? ""); } catch { /* storage blocked */ }
  }, [key]);
  const save = (v: string) => { try { sessionStorage.setItem(key, v); } catch { /* storage blocked */ } };
  return [text, setText, save] as const;
}

/** Name the look. */
export function LensTitleEdit() {
  const back = useGoBack("/lens");
  const [text, setText, save] = useSessionText(LOOK_TITLE_KEY);
  const done = () => { if (text.trim()) { save(text.trim()); back(); } };
  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-bg">
      <TopBar title="Name your look" onBack={back} actions={<Button size="sm" disabled={!text.trim()} onClick={done}>Done</Button>} />
      <div className="px-5 pt-10">
        <input
          autoFocus
          value={text}
          maxLength={TITLE_MAX}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && done()}
          placeholder="Look name"
          className="w-full border-b-2 border-line bg-transparent pb-2 font-display text-[26px] font-bold outline-none placeholder:text-fg-3 focus:border-accent"
        />
        <p className="mt-2 text-right text-[12px] text-fg-3">{text.length}/{TITLE_MAX}</p>
      </div>
    </div>
  );
}

/** Tag the look (#words separated by spaces). */
export function LensAddHashTag() {
  const back = useGoBack("/lens");
  const [text, setText, save] = useSessionText(LOOK_TAGS_KEY);
  const tags = text.split(/[\s,#]+/).filter(Boolean);
  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-bg">
      <TopBar title="Add tags" onBack={back} actions={<Button size="sm" onClick={() => { save(text.trim()); back(); }}>Done</Button>} />
      <div className="px-5 pt-6">
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="#selfie #warm #film" className="w-full resize-none rounded-md bg-panel p-4 text-[16px] outline-none placeholder:text-fg-3" />
        <div className="mt-3 flex flex-wrap gap-1.5">{tags.map((t) => <span key={t} className="rounded-full bg-accent-soft px-3 py-1 text-[13px] font-medium text-accent">#{t}</span>)}</div>
      </div>
    </div>
  );
}
