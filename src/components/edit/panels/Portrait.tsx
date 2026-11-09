"use client";

// Portrait tab and its two simplest pages. Face tools run on the web face engine (tools/portrait/faceEngine.ts).
// Auto retouch: Smooth / Extra smooth / Clarity / Skin tone are whole-photo passes; the other items are applied to the
// selected face. Skin tone presets use the skin / background lookup tables from the asset pack.
import { useRef, useState } from "react";
import { Switch } from "@/components/ui";
import { useEdit } from "../ctx";
import { AUTO_SKIN, PORTRAIT, SKIN_TONES, type Beauty, type FaceEdit } from "../model";
import { ChipRow, ControlRow, Dock, EditBar, EditSeekBar, FeatureButton, FeatureList, MENU, PanelArea, SliderRow, ThumbItem, ToolChip } from "../ui";
import { ensureFaceAssets, ONE_TOUCH } from "../tools/portrait/faceEngine";
import { useFaceGuide } from "../tools/portrait/faceUi";

const some = (o: Record<string | number, unknown> | undefined, f: (v: never) => boolean) => !!o && Object.values(o).some((v) => f(v as never));
const nz = (o?: Record<string, number>) => some(o, (v: number) => Math.abs(v) > 0.001);

/** Which Portrait pages hold edits (for the dots on the tiles). */
function edited(b: Beauty): Set<string> {
  const out = new Set<string>();
  if (b.smooth > 0 || b.smoother > 0 || b.clear > 0 || b.coolWarm !== 0 || b.tanLight !== 0) out.add("RETOUCH_AUTO");
  if (b.skinTone) out.add("SKINTONE");
  const fe: FaceEdit | undefined = b.face;
  if (!fe) return out;
  for (const v of Object.values(fe.f)) {
    if ((v.shape && v.shape.v > 0.001) || nz(v.re)) out.add("RESHAPE");
    if (nz(v.ratio)) out.add("FACE_RATIO");
    if (nz(v.r3d)) out.add("RESHAPE3D");
    if (v.mk && Object.keys(v.mk).length) out.add("MAKEUP");
    if (v.eye) out.add("EYELIGHT");
    if ((v.hv ?? 0) > 0.001) out.add("HAIRVOLUME");
    if (nz(v.skin)) out.add("RETOUCH_AUTO");
  }
  if (fe.liq) out.add("RETOUCH");
  if (nz(fe.body)) out.add("BODY");
  return out;
}

export function PortraitPanel() {
  const { undo, setOriginal, openSub, doc } = useEdit();
  const mod = edited(doc.beauty);
  return (
    <>
      <ControlRow undo={undo} onOriginal={setOriginal} />
      <PanelArea>
        <FeatureList>
          {PORTRAIT.map((p) => (
            <FeatureButton
              key={p.key} icon={p.icon} label={p.label} modified={mod.has(p.key)}
              onClick={() => {
                if (p.key === "RETOUCH_AUTO") openSub("autoskin");
                else if (p.key === "SKINTONE") openSub("skintone");
                else openSub(`x:${p.key}`);
              }}
            />
          ))}
        </FeatureList>
      </PanelArea>
    </>
  );
}

/** Cool ↔ Warm and Tan ↔ Light gradient sliders. */
export function ToneRows({ cw, tl, onChange, onRelease, defs = [0, 0] }: { cw: number; tl: number; onChange: (k: "cw" | "tl", v: number) => void; onRelease?: () => void; defs?: [number, number] }) {
  const row = (k: "cw" | "tl", l: string, r: string, grad: string[], v: number, def: number) => (
    <div className="flex items-center gap-3 px-4">
      <span className="w-10 flex-none text-[12px] font-medium text-fg-2">{l}</span>
      <EditSeekBar value={v} min={-1} max={1} def={def} gradient={grad} onChange={(x) => onChange(k, x)} onRelease={onRelease} />
      <span className="w-10 flex-none text-right text-[12px] font-medium text-fg-2">{r}</span>
    </div>
  );
  return (
    <div className="flex flex-col gap-1">
      {row("cw", "Cool", "Warm", ["#7FB7E8", "#F2A285"], cw, defs[0])}
      {row("tl", "Tan", "Light", ["#8E6544", "#F7E2CC"], tl, defs[1])}
    </div>
  );
}

/** Items applied per face by the face engine (the rest are whole-photo passes). */
const FACE_SKIN = new Set(["onetouch", "blemish", "balance", "conceal", "wrinkle", "oilremover", "skintexture", "vibrance", "glow", "details", "clarity", "eyewhiten", "eyedetails", "eyebag", "plim", "teeth"]);

export function AutoSkinPanel() {
  const { doc, setLive, commit, openSub, setOriginal } = useEdit();
  const guide = useFaceGuide({ banner: "BEAUTY" });
  const sel = guide.sel;
  const [beauty, setBeauty] = useState<Beauty>(doc.beauty);
  const [item, setItemState] = useState<string | null>("smooth");
  const [flash, setFlash] = useState(0);
  const seq = useRef(0);
  const it = AUTO_SKIN.find((i) => i.key === item);
  const apply = (b: Beauty) => {
    setBeauty(b);
    const n = ++seq.current;
    void ensureFaceAssets(b.face).then(() => { if (n === seq.current) setLive({ ...doc, beauty: b }); });
  };
  const fe = beauty.face ?? { f: {} };
  const skin = (sel >= 0 ? fe.f[sel]?.skin : undefined) ?? {};
  const setSkin = (next: Record<string, number>) => {
    if (sel < 0) return;
    apply({ ...beauty, face: { ...fe, f: { ...fe.f, [sel]: { ...fe.f[sel], skin: next } } } });
  };
  const isFace = (k: string) => FACE_SKIN.has(k);
  const isMod = (k: string) => {
    const x = AUTO_SKIN.find((i) => i.key === k)!;
    if (x.row === "tone") return beauty.coolWarm !== 0 || beauty.tanLight !== 0;
    if (x.web) return (beauty[x.web] as number) > 0;
    return (skin[k] ?? 0) > 0.001;
  };
  const value = it ? (it.web ? (beauty[it.web] as number) : skin[it.key] ?? 0) : 0;
  const setValue = (v: number) => {
    if (!it) return;
    if (it.web) { apply({ ...beauty, [it.web]: v }); return; }
    const next = { ...skin, [it.key]: v };
    // moving one of its sliders away from the preset turns Quick fix off
    if (skin.onetouch && it.key in ONE_TOUCH) next.onetouch = 0;
    setSkin(next);
  };
  const tap = (k: string) => {
    if (isFace(k) && sel < 0) { guide.noFace(); return; }
    if (k === "onetouch") {
      // Quick fix: automatic spot removal plus a light preset of the face items
      setSkin(skin.onetouch ? {} : { ...ONE_TOUCH, onetouch: 1 });
      setItemState(k);
      return;
    }
    setItemState(k);
    setFlash((n) => n + 1);
  };
  return (
    <>
      {guide.node}
      {guide.bannerNode}
      <ControlRow bottom={MENU + guide.bannerH} onOriginal={setOriginal} />
      <EditBar title="Retouch" onClose={() => { seq.current++; setLive(null); openSub(null); }} onConfirm={() => { seq.current++; commit({ ...doc, beauty }); openSub(null); }} />
      <Dock>
        <div className="flex h-full flex-col pt-4">
          <ChipRow className="flex-none">
            {AUTO_SKIN.map((x) => (
              <ToolChip
                key={x.key} label={x.label}
                selected={x.key === "onetouch" ? !!skin.onetouch : item === x.key}
                modified={x.key !== "onetouch" && isMod(x.key)}
                dim={isFace(x.key) && sel < 0 && sel !== -1}
                onClick={() => tap(x.key)}
              />
            ))}
          </ChipRow>
          <div className="flex flex-1 flex-col justify-center pb-3">
            {it?.row === "tone" && <ToneRows cw={beauty.coolWarm} tl={beauty.tanLight} onChange={(k, v) => apply({ ...beauty, [k === "cw" ? "coolWarm" : "tanLight"]: v })} />}
            {it?.row === "blemish" && (
              <div className="mx-4 flex items-center gap-3 rounded-md bg-raised px-4 py-3">
                <span className="flex-1 text-[14px]">Remove spots automatically</span>
                <Switch label="Remove spots" checked={!!skin.blemish} onChange={() => setSkin({ ...skin, blemish: skin.blemish ? 0 : 1, onetouch: 0 })} />
              </div>
            )}
            {it?.row === "toggle" && (
              <p className="px-6 text-center text-[13px] leading-snug text-fg-2">
                {skin.onetouch ? "Quick fix is on: spots, pores, lines and under-eyes are evened out. Tap it again to undo." : "Quick fix evens out spots, pores, lines and under-eyes in one tap."}
              </p>
            )}
            {it && !it.row && (
              <SliderRow label={it.label} value={Math.round(value * 100)}>
                <EditSeekBar key={`${sel}|${it.key}`} value={value} min={0} max={1} def={0} flashKey={flash} level={false} onChange={setValue} />
              </SliderRow>
            )}
          </div>
        </div>
      </Dock>
    </>
  );
}

export function SkinTonePanel() {
  const { doc, setLive, commit, openSub, setOriginal } = useEdit();
  const [beauty, setBeauty] = useState<Beauty>(doc.beauty);
  const [flash, setFlash] = useState(0);
  const apply = (b: Beauty) => { setBeauty(b); setLive({ ...doc, beauty: b }); };
  return (
    <>
      <ControlRow onOriginal={setOriginal} />
      <EditBar title="Skin tone" onClose={() => { setLive(null); openSub(null); }} onConfirm={() => { commit({ ...doc, beauty }); openSub(null); }} />
      <Dock>
        <div className="flex h-full flex-col justify-center gap-3 pb-2">
          <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pt-1" style={{ justifyContent: "safe center" }}>
            <ThumbItem size={56} label="None" none selected={!beauty.skinTone} onClick={() => apply({ ...beauty, skinTone: null })} />
            {SKIN_TONES.map((t) => (
              <ThumbItem
                key={t.key} size={56} label={t.label}
                bg={`radial-gradient(circle at 35% 30%, rgba(255,255,255,0.45), transparent 55%), ${t.color}`}
                selected={beauty.skinTone === t.key}
                onClick={() => { apply({ ...beauty, skinTone: t.key, skinToneValue: beauty.skinTone === t.key ? beauty.skinToneValue : 0.4 }); setFlash((n) => n + 1); }}
              />
            ))}
          </div>
          <SliderRow label="Strength" value={beauty.skinTone ? Math.round(beauty.skinToneValue * 100) : "–"}>
            <EditSeekBar value={beauty.skinToneValue} min={0} max={1} def={0.4} flashKey={flash} level={false} disabled={!beauty.skinTone} onChange={(v) => apply({ ...beauty, skinToneValue: v })} />
          </SliderRow>
        </div>
      </Dock>
    </>
  );
}
