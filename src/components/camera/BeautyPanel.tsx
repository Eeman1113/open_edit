"use client";

// Camera beauty drawer with three sections:
//   Beauty     skin and face basics (Face style, Skin tone sub-pages)
//   Fine-tune  per-feature shaping (Catchlight and Nose sub-pages)
//   Makeup     categories, each opening a palette of looks
// Selecting an item shows its slider above the drawer; "Compare" (press and hold) shows the picture without beauty.
import { useState } from "react";
import { Dialog, Icon, IconButton, Slider, SLIDER_HEIGHT, Tabs, cx, type IconName } from "@/components/ui";
import {
  ADVANCED_TAB, ALL_ITEMS, BEAUTY_TAB, EYE_LIGHTS, FACE_SHAPES, MAKEUP_CATEGORIES, MAKEUP_TAB, NOSE_3D, SKIN_TONES,
  defaultBeautyState, type BeautyItem, type BeautyState, type BeautyTab, type MakeupCategory,
} from "@/data/camera/beauty";

export { beautyRenderParams, defaultBeautyState, type BeautyState } from "@/data/camera/beauty";

export const BEAUTY_PANEL_H = 214;

const TABS: { id: BeautyTab; label: string }[] = [
  { id: "BEAUTY", label: "Beauty" },
  { id: "ADVANCED_BEAUTY", label: "Fine-tune" },
  { id: "MAKEUP", label: "Makeup" },
];

/** Glyph for an item, picked from its key. */
const RULES: [RegExp, IconName][] = [
  [/^face$|shape/, "face"], [/smooth|balance/, "droplet"], [/clear|clarity|detail/, "focus"], [/toneup|bright/, "exposure"],
  [/skintone|tone|contour|blush/, "palette"], [/teeth|smile|lip|mouth|philtrum|cupid|plump|correction/, "smile"],
  [/eyelight|light/, "sparkles"], [/eye|pupil|plim|span|inner|under|corner|lash|liner|shadow/, "eye"], [/wrinkle/, "wave"],
  [/body/, "portrait"], [/head/, "user"], [/enlarge|size/, "zoom"], [/hair|volume/, "hair"], [/nose|alar|bridge|tip|radix|root/, "shapes"],
  [/brow|forehead|glabella|lift/, "minus"], [/short|length|position/, "ratio"], [/mark/, "record-dot"],
  [/slim|narrow|jaw|chin|cheek|temple|vshape|sculpt/, "face"],
];
const iconFor = (key: string): IconName => RULES.find(([re]) => re.test(key))?.[1] ?? "beauty";

type Sub = null | "face" | "skintone" | "eyelight" | "3dnose" | `makeup:${string}`;

interface Props {
  state: BeautyState;
  /**
   * key: an item key (slider value), or "faceShape" / "faceShapePower" / "skinTone" / "eyeLight" / "tab",
   * "makeup:<category>" (look id), "beautyMarkFlip", or "reset:<tab>".
   */
  onChange: (key: string, value: number | string | boolean) => void;
  onClose: () => void;
  /** Compare: true while held. */
  onOriginal?: (pressed: boolean) => void;
}

export function BeautyPanel({ state, onChange, onClose, onOriginal }: Props) {
  const [selected, setSelected] = useState<Record<BeautyTab | "3dnose", string | null>>({ BEAUTY: "smooth", ADVANCED_BEAUTY: null, MAKEUP: null, "3dnose": null });
  const [sub, setSub] = useState<Sub>(null);
  const [resetTab, setResetTab] = useState<BeautyTab | null>(null);

  const tab = state.tab;
  const list = tab === "BEAUTY" ? BEAUTY_TAB : tab === "ADVANCED_BEAUTY" ? ADVANCED_TAB : MAKEUP_TAB;
  const selKey = selected[tab];
  const defaults = defaultBeautyState();
  const makeupCat: MakeupCategory | undefined = sub?.startsWith("makeup:") ? MAKEUP_CATEGORIES.find((c) => `makeup:${c.key}` === sub) : undefined;
  const lookOf = (c: MakeupCategory) => state.makeup?.[c.key] ?? c.defContent;

  // ---- slider for the current selection ----
  let slider: { value: number; def: number; bipolar: boolean; key: string; label: string } | null = null;
  const forItem = (it: BeautyItem) => ({ value: state.values[it.key] ?? 0, def: defaults.values[it.key] ?? 0, bipolar: !!it.fullDuplex, key: it.key, label: it.label });
  if (sub === "skintone") {
    if (state.skinTone !== "none") slider = { value: state.values.skintone, def: defaults.values.skintone, bipolar: false, key: "skintone", label: "Skin tone" };
  } else if (sub === "face") {
    if (state.faceShape !== "original") slider = { value: state.faceShapePower, def: defaults.faceShapePower, bipolar: false, key: "faceShapePower", label: "Face style" };
  } else if (sub === "eyelight") {
    if ((state.eyeLight ?? "none") !== "none") slider = { value: state.values.eyelight, def: defaults.values.eyelight, bipolar: false, key: "eyelight", label: "Catchlight" };
  } else if (sub === "3dnose") {
    const it = NOSE_3D.find((x) => x.key === selected["3dnose"]);
    if (it) slider = forItem(it);
  } else if (makeupCat) {
    if (lookOf(makeupCat) !== "none") slider = { value: state.values[makeupCat.key] ?? makeupCat.def, def: makeupCat.def, bipolar: false, key: makeupCat.key, label: makeupCat.label };
  } else if (tab !== "MAKEUP") {
    const it = list.find((x) => x.key === selKey);
    if (it && !it.sub) slider = forItem(it);
  }

  const near = (a?: number, b?: number) => Math.abs((a ?? 0) - (b ?? 0)) <= 0.005;
  const modified = (it: BeautyItem): boolean => {
    if (tab === "MAKEUP") {
      const c = MAKEUP_CATEGORIES.find((x) => x.key === it.key)!;
      return lookOf(c) !== c.defContent || !near(state.values[c.key], c.def);
    }
    if (it.sub === "face") return state.faceShape !== defaults.faceShape || !near(state.faceShapePower, defaults.faceShapePower);
    if (it.sub === "skintone") return state.skinTone !== "none" || !near(state.values.skintone, defaults.values.skintone);
    if (it.sub === "eyelight") return (state.eyeLight ?? "none") !== "none";
    if (it.sub === "3dnose") return NOSE_3D.some((n) => !near(state.values[n.key], defaults.values[n.key]));
    return !near(state.values[it.key], defaults.values[it.key]);
  };

  const onItem = (it: BeautyItem) => {
    if (tab === "MAKEUP") return setSub(`makeup:${it.key}`);
    if (it.sub) setSelected((s) => ({ ...s, [tab]: it.key }));
    if (it.sub) return setSub(it.sub);
    setSelected((s) => ({ ...s, [tab]: it.key }));
  };

  /** Round icon tile with a label; accent when selected, dot when changed from the default. */
  const tile = (key: string, label: string, opts: { on: boolean; dot?: boolean; arrow?: boolean; onClick: () => void; icon?: IconName }) => (
    <button key={key} type="button" data-beauty={key} onClick={opts.onClick} className="oe-press flex w-[60px] shrink-0 flex-col items-center gap-1.5">
      <span className={cx("relative flex h-[50px] w-[50px] items-center justify-center rounded-full transition-colors", opts.on ? "bg-accent text-on-accent" : "bg-raised text-fg")}>
        <Icon name={opts.icon ?? iconFor(key)} size={22} />
        {opts.arrow && <Icon name="chevron-right" size={12} stroke={2.5} className="absolute -right-0.5 bottom-0.5 rounded-full bg-panel p-px text-fg-2" />}
        {opts.dot && <span className="absolute -top-0.5 right-1 h-2 w-2 rounded-full bg-accent ring-2 ring-panel" />}
      </span>
      <span className={cx("w-full truncate text-center text-[11px] font-medium", opts.on ? "text-fg" : "text-fg-3")}>{label}</span>
    </button>
  );

  /** Colour swatch tile for looks (skin tone, catchlight, makeup). */
  const swatch = (key: string, label: string, bg: string, on: boolean, onClick: () => void, attr?: string) => (
    <button key={key} type="button" data-item={attr} onClick={onClick} className="oe-press flex w-[60px] shrink-0 flex-col items-center gap-1.5">
      <span className={cx("relative flex h-[50px] w-[50px] items-center justify-center rounded-md ring-offset-2 ring-offset-panel", on && "ring-2 ring-accent")} style={{ background: key === "none" ? undefined : bg }}>
        {key === "none" && <span className="absolute inset-0 flex items-center justify-center rounded-md bg-raised text-fg-2"><Icon name="block" size={22} /></span>}
        {on && key !== "none" && <Icon name="check" size={20} stroke={2.5} className="text-white drop-shadow" />}
      </span>
      <span className={cx("w-full truncate text-center text-[11px] font-medium", on ? "text-fg" : "text-fg-3")}>{label}</span>
    </button>
  );

  const subTitle = sub === "face" ? "Face style" : sub === "skintone" ? "Skin tone" : sub === "eyelight" ? "Catchlight" : sub === "3dnose" ? "Nose" : makeupCat?.label;

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {/* slider + compare */}
      <div className="pointer-events-auto absolute inset-x-0 flex items-end gap-2 px-3" style={{ bottom: BEAUTY_PANEL_H + 6 }}>
        <div className="min-w-0 flex-1">
          {slider && (
            <Slider
              key={slider.key}
              aria-label={slider.label}
              value={slider.value}
              def={slider.def}
              bipolar={slider.bipolar}
              min={0}
              max={slider.bipolar ? 2 : 1}
              label="always"
              tone="overlay"
              onChange={(v) => onChange(slider!.key, v)}
              onCommit={(v) => onChange(slider!.key, Math.round(v * 100) / 100)}
            />
          )}
        </div>
        <button
          type="button"
          aria-label="Compare (hold to see without beauty)"
          className="flex h-[38px] touch-none items-center gap-1.5 rounded-full bg-glass px-3 text-[12px] font-semibold text-white backdrop-blur-md active:bg-accent active:text-on-accent"
          style={{ marginBottom: (SLIDER_HEIGHT - 38) / 2 }}
          onPointerDown={(e) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ } onOriginal?.(true); }}
          onPointerUp={() => onOriginal?.(false)}
          onPointerCancel={() => onOriginal?.(false)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <Icon name="original" size={16} /> Compare
        </button>
      </div>

      <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col rounded-t-xl bg-panel/95 backdrop-blur-xl" style={{ height: BEAUTY_PANEL_H }}>
        <div className="flex h-12 shrink-0 items-center gap-2 px-2">
          <IconButton icon={sub ? "back" : "chevron-down"} label={sub ? "Back" : "Close beauty"} size={36} iconSize={22} className="text-fg-2" onClick={() => (sub ? setSub(null) : onClose())} />
          {sub ? (
            <span className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold">{subTitle}</span>
          ) : (
            <Tabs look="segment" className="min-w-0 flex-1" items={TABS} value={tab} onChange={(t) => onChange("tab", t)} />
          )}
          {makeupCat?.flip ? (
            <IconButton icon="mirror" label="Mirror" size={36} iconSize={20} active={!!state.beautyMarkFlip} onClick={() => onChange("beautyMarkFlip", !state.beautyMarkFlip)} />
          ) : !sub ? (
            <IconButton icon="reset" label="Reset" size={36} iconSize={20} className="text-fg-2" onClick={() => setResetTab(tab)} />
          ) : <span className="w-9" />}
        </div>

        <div className="no-scrollbar flex flex-1 items-start gap-1.5 overflow-x-auto px-3 pt-3">
          {!sub && list.map((it) => tile(it.key, it.label, { on: tab !== "MAKEUP" && it.key === selKey && !it.sub, dot: modified(it), arrow: !!it.sub || tab === "MAKEUP", onClick: () => onItem(it) }))}
          {sub === "face" && FACE_SHAPES.map((f) => tile(f.key, f.label, { on: state.faceShape === f.key, icon: f.key === "original" ? "block" : "face", onClick: () => onChange("faceShape", f.key) }))}
          {sub === "skintone" && SKIN_TONES.map((t) => swatch(t.key, t.label, t.bg, state.skinTone === t.key, () => onChange("skinTone", t.key)))}
          {sub === "eyelight" && EYE_LIGHTS.map((t) => swatch(t.key, t.label, t.key === "none" ? t.bg : `radial-gradient(circle at 35% 35%, #fff 0 12%, ${t.bg} 13% 100%)`, (state.eyeLight ?? "none") === t.key, () => onChange("eyeLight", t.key), `ei:${t.key}`))}
          {sub === "3dnose" && NOSE_3D.map((it) => tile(it.key, it.label, { on: selected["3dnose"] === it.key, dot: !near(state.values[it.key], defaults.values[it.key]), onClick: () => setSelected((s) => ({ ...s, "3dnose": it.key })) }))}
          {makeupCat && makeupCat.contents.map((ct, i) => swatch(ct.key, ct.key === "none" ? "None" : ct.label || `Look ${i}`, ct.bg ?? makeupCat.bg, lookOf(makeupCat) === ct.key, () => onChange(`makeup:${makeupCat.key}`, ct.key), `${makeupCat.key}:${ct.key}`))}
        </div>
      </div>

      <Dialog
        open={!!resetTab}
        onClose={() => setResetTab(null)}
        icon="reset"
        title={resetTab === "MAKEUP" ? "Reset makeup?" : resetTab === "ADVANCED_BEAUTY" ? "Reset fine-tuning?" : "Reset beauty?"}
        confirm="Reset"
        onConfirm={() => { if (resetTab) onChange(`reset:${resetTab}`, 0); setSub(null); }}
      >
        Everything in this section goes back to its starting value.
      </Dialog>
    </div>
  );
}

/** Reducer for BeautyPanel.onChange: use it as the parent's state handler. */
export function applyBeautyChange(s: BeautyState, key: string, value: number | string | boolean): BeautyState {
  if (key === "tab") return { ...s, tab: value as BeautyTab };
  if (key === "faceShape") return { ...s, faceShape: String(value) };
  if (key === "faceShapePower") return { ...s, faceShapePower: Number(value) };
  if (key === "skinTone") return { ...s, skinTone: String(value) };
  if (key === "eyeLight") return { ...s, eyeLight: String(value) };
  if (key === "beautyMarkFlip") return { ...s, beautyMarkFlip: !!value };
  if (key.startsWith("makeup:")) return { ...s, makeup: { ...(s.makeup ?? {}), [key.slice(7)]: String(value) } };
  if (key.startsWith("reset:")) {
    const tab = key.slice(6) as BeautyTab;
    const def = defaultBeautyState();
    const items = tab === "BEAUTY" ? BEAUTY_TAB : tab === "ADVANCED_BEAUTY" ? [...ADVANCED_TAB, ...NOSE_3D] : MAKEUP_TAB;
    const values = { ...s.values };
    for (const it of items) if (it.key in def.values) values[it.key] = def.values[it.key];
    if (tab === "BEAUTY") return { ...s, values, faceShape: def.faceShape, faceShapePower: def.faceShapePower, skinTone: def.skinTone };
    if (tab === "ADVANCED_BEAUTY") return { ...s, values, eyeLight: def.eyeLight };
    return { ...s, values, makeup: def.makeup, beautyMarkFlip: false };
  }
  return { ...s, values: { ...s.values, [key]: Number(value) } };
}

/** Restores a persisted state on top of the current defaults (unknown keys dropped). */
export function restoreBeautyState(saved: Partial<BeautyState> | null): BeautyState {
  const def = defaultBeautyState();
  if (!saved) return def;
  const keys = new Set(ALL_ITEMS().map((x) => x.key));
  const values = { ...def.values };
  for (const [k, v] of Object.entries(saved.values ?? {})) if (keys.has(k) && typeof v === "number") values[k] = v;
  return { ...def, ...saved, values, makeup: { ...def.makeup, ...(saved.makeup ?? {}) } };
}
