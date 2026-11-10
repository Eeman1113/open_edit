"use client";

// Effects tab: whole-image creative effects (light leak, film dust, glow, prism, tape, halftone, rain, snow...).
// The effects are shaders in src/lib/gl/effects.ts and run as the last pass of the renderer, so they show in the
// preview and in the full-size save. Group chips over a strip of tiles; each tile previews the effect on this photo.
// Tap an effect to apply it, tap it again to show or hide the intensity slider.
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { Renderer } from "@/lib/gl/renderer";
import { EFFECT_GROUPS, EFFECTS, effectById } from "@/lib/gl/effects";
import { useEdit } from "../ctx";
import { ChipRow, ControlRow, CTRL_H, EditSeekBar, MENU, PanelArea, ThumbItem, ToolChip } from "../ui";
import { FilterName } from "./Filter";

const THUMB = 112;
const ORDER = EFFECT_GROUPS.flatMap((g) => g.ids.map((id) => ({ group: g.id, def: effectById(id)! })));

/**
 * Tile previews: the source picture (square centre crop) run through every effect at its default intensity, in a
 * throwaway WebGL context. `key` changes when the picture does.
 */
export function useEffectThumbs(getSource: () => (CanvasImageSource & { width: number; height: number }) | null, key: unknown) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(async () => {
      const s = getSource();
      if (!s || !s.width || !s.height) return;
      const c = document.createElement("canvas");
      c.width = THUMB; c.height = THUMB;
      let r: Renderer;
      try { r = new Renderer(c); } catch { return; }
      try {
        await r.preloadEffects(EFFECTS.map((e) => e.id));
        if (!alive) return;
        // a small square copy first, so every effect renders from a cheap source
        const k = THUMB * 2 / Math.min(s.width, s.height);
        const sq = document.createElement("canvas");
        sq.width = THUMB * 2; sq.height = THUMB * 2;
        const g = sq.getContext("2d")!;
        g.imageSmoothingQuality = "high";
        g.drawImage(s, (sq.width - s.width * k) / 2, (sq.height - s.height * k) / 2, s.width * k, s.height * k);
        const out: Record<string, string> = {};
        for (const e of EFFECTS) {
          r.render(sq, sq.width, sq.height, { intensity: 0, smooth: 0, whiten: 0, fx: { id: e.id, amount: Math.max(0.75, e.amount), time: 0.6 } });
          out[e.id] = c.toDataURL("image/jpeg", 0.82);
        }
        if (alive) setThumbs(out);
      } finally {
        r.dispose();
      }
    }, 250);
    return () => { alive = false; window.clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return thumbs;
}

/** Effect picker shared by the photo and video editors: group chips and a strip of tiles with a None tile. */
export function EffectStrip({ value, thumbs, onPick, onToggleSlider, sliderOn, className }: {
  value: string | null; thumbs: Record<string, string>; onPick: (id: string | null) => void;
  onToggleSlider: () => void; sliderOn: boolean; className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(() => ORDER.find((o) => o.def.id === value)?.group ?? EFFECT_GROUPS[0].id);
  const programmatic = useRef(0);
  // list children: [None, ...ORDER]
  const scrollTo = (i: number, mode: "centre" | "start", smooth = true) => {
    const list = listRef.current, el = list?.children[i] as HTMLElement | undefined;
    if (!list || !el) return;
    programmatic.current = performance.now();
    list.scrollTo({ left: mode === "centre" ? el.offsetLeft + el.offsetWidth / 2 - list.clientWidth / 2 : el.offsetLeft - 16, behavior: smooth ? "smooth" : "auto" });
  };
  useEffect(() => {
    const i = ORDER.findIndex((o) => o.def.id === value);
    if (i >= 0) scrollTo(i + 1, "centre", false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onScroll = () => {
    if (performance.now() - programmatic.current < 600) return;
    const list = listRef.current;
    if (!list) return;
    const first = Array.from(list.children).findIndex((c) => (c as HTMLElement).offsetLeft + (c as HTMLElement).offsetWidth / 2 > list.scrollLeft + 16);
    const g = ORDER[Math.max(0, first - 1)]?.group;
    if (g && g !== active) setActive(g);
  };
  return (
    <div className={className}>
      <ChipRow className="h-10">
        {EFFECT_GROUPS.map((g) => (
          <ToolChip key={g.id} label={g.label} selected={active === g.id} onClick={() => { setActive(g.id); scrollTo(ORDER.findIndex((o) => o.group === g.id) + 1, "start"); }} />
        ))}
      </ChipRow>
      <div ref={listRef} onScroll={onScroll} className="no-scrollbar mt-1.5 flex gap-2.5 overflow-x-auto px-4 pb-1 pt-1">
        <ThumbItem size={56} label="None" none selected={!value} onClick={() => onPick(null)} />
        {ORDER.map((o, i) => {
          const sel = o.def.id === value;
          const groupStart = i > 0 && ORDER[i - 1].group !== o.group;
          return (
            <div key={o.def.id} className="flex flex-none" style={{ marginLeft: groupStart ? 10 : 0 }}>
              <ThumbItem
                size={56}
                label={o.def.name}
                src={thumbs[o.def.id]}
                bg={thumbs[o.def.id] ? undefined : "linear-gradient(135deg, var(--oe-raised), var(--oe-muted))"}
                iconNode={thumbs[o.def.id] ? undefined : <span className="absolute inset-0 flex items-center justify-center text-fg-3"><Icon name="sparkles" size={20} /></span>}
                selected={sel}
                onClick={() => {
                  if (sel) { onToggleSlider(); return; }
                  onPick(o.def.id);
                  setActive(o.group);
                  scrollTo(i + 1, "centre");
                }}
                badge={sel ? (
                  <span className="absolute left-1 bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-glass text-white backdrop-blur-md">
                    <Icon name={sliderOn ? "chevron-down" : "edit"} size={12} />
                  </span>
                ) : undefined}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function EffectsPanel() {
  const { doc, setLive, commit, setOriginal, undo, srcCanvas } = useEdit();
  const [sliderOn, setSliderOn] = useState(true);
  const [flash, setFlash] = useState(0);
  const [name, setName] = useState({ text: "", n: 0 });
  const thumbs = useEffectThumbs(srcCanvas, doc.base);
  const cur = doc.fx ?? null;
  const def = effectById(cur?.id);
  return (
    <>
      <FilterName name={name.text} n={name.n} bottom={MENU + CTRL_H} />
      <ControlRow undo={undo} onOriginal={setOriginal}>
        {cur && def && sliderOn && (
          <EditSeekBar
            value={cur.amount}
            def={def.amount}
            flashKey={flash}
            onChange={(v) => setLive({ ...doc, fx: { ...cur, amount: v } })}
            onRelease={(v) => commit({ ...doc, fx: { ...cur, amount: v } })}
          />
        )}
      </ControlRow>
      <PanelArea className="pt-2.5">
        <EffectStrip
          value={cur?.id ?? null}
          thumbs={thumbs}
          sliderOn={sliderOn}
          onToggleSlider={() => setSliderOn((v) => !v)}
          onPick={(id) => {
            const d = effectById(id);
            commit({ ...doc, fx: d ? { id: d.id, amount: d.amount } : null });
            if (d) {
              setSliderOn(true);
              setFlash((n) => n + 1);
              setName((o) => ({ text: d.name, n: o.n + 1 }));
            }
          }}
        />
      </PanelArea>
    </>
  );
}
