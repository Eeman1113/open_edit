"use client";

// EPPortraitFragment. Face tools run on the web face engine (tools/portrait/faceEngine.ts, MediaPipe IMAGE mode).
// Auto Skin: Skin / Smoother / Clarity / Brighten are global pixel passes; the other items are per face
// (FaceGuideLayout selection). Skin Tone uses the decoded skintone skin/bg LUTs.
import { useRef, useState } from "react";
import { useEdit } from "../ctx";
import { AUTO_SKIN, PORTRAIT, SKIN_TONES, type Beauty } from "../model";
import { ControlRow, EditSeekBar, FeatureButton, FeatureList, Img, ThumbItem, TitleBar } from "../ui";
import { ensureFaceAssets, ONE_TOUCH } from "../tools/portrait/faceEngine";
import { useFaceGuide } from "../tools/portrait/faceUi";

export function PortraitPanel() {
  const { undo, redo, setOriginal, openSub, doc } = useEdit();
  const b = doc.beauty;
  return (
    <>
      <ControlRow undo={undo} redo={redo} onOriginal={setOriginal} />
      <div className="absolute inset-x-0" style={{ bottom: 52, height: 134 }}>
        <FeatureList count={PORTRAIT.length}>
          {PORTRAIT.map((p) => (
            <FeatureButton
              key={p.key} icon={p.icon} label={p.label}
              selected={(p.key === "RETOUCH_AUTO" && (b.smooth > 0 || b.smoother > 0 || b.clear > 0 || b.coolWarm !== 0 || b.tanLight !== 0)) || (p.key === "SKINTONE" && !!b.skinTone)}
              onClick={() => {
                if (p.key === "RETOUCH_AUTO") openSub("autoskin");
                else if (p.key === "SKINTONE") openSub("skintone");
                else openSub(`x:${p.key}`);
              }}
            />
          ))}
        </FeatureList>
      </div>
    </>
  );
}

/** Two gradient rows: Cool <-> Warm, Tan <-> Light (option_edit_photo_retouch_auto_skin_tone.xml, 98dp). */
function ToneRows({ b, onChange, onRelease, labelSize = 12.5 }: { b: Beauty; onChange: (k: "coolWarm" | "tanLight", v: number) => void; onRelease: () => void; labelSize?: number }) {
  const row = (k: "coolWarm" | "tanLight", l: string, r: string, grad: string[]) => (
    <div className="flex items-center" style={{ height: 49 }}>
      <span className="truncate text-white" style={{ marginLeft: 20, maxWidth: 50, width: 50, fontSize: labelSize }}>{l}</span>
      <EditSeekBar style={{ margin: "0 24px" }} value={b[k]} min={-1} max={1} def={0} gradient={grad} onChange={(v) => onChange(k, v)} onRelease={onRelease} />
      <span className="truncate text-right text-white" style={{ marginRight: 20, maxWidth: 50, width: 50, fontSize: labelSize }}>{r}</span>
    </div>
  );
  return (
    <div className="absolute inset-x-0" style={{ bottom: 186, height: 98, background: "rgba(0,0,0,0.4)" }}>
      {row("coolWarm", "Cool", "Warm", ["#83CCFA", "#FFA68E"])}
      {row("tanLight", "Tan", "Light", ["#9A6942", "#FFE5CE"])}
    </div>
  );
}

/** EPSettingButton: 39x24 track (r12, #333333 off / #0bd4d2 on), 9.5dp white thumb, 2.5dp inset. */
function SettingSwitch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="relative flex-none" style={{ width: 39, height: 24, borderRadius: 12, background: on ? "#0bd4d2" : "#333333", marginLeft: 10, transition: "background 200ms" }} aria-pressed={on}>
      <span className="absolute rounded-full bg-white" style={{ top: 2.5, width: 19, height: 19, left: on ? 39 - 2.5 - 19 : 2.5, transition: "left 200ms" }} />
    </button>
  );
}

/** Auto Skin items applied per face by the face engine (everything except the global Skin / Smoother / Clarity / Brighten). */
const FACE_SKIN = new Set(["onetouch", "blemish", "balance", "conceal", "wrinkle", "oilremover", "skintexture", "vibrance", "glow", "details", "clarity", "eyewhiten", "eyedetails", "eyebag", "plim", "teeth"]);

export function AutoSkinPanel() {
  const { doc, setLive, commit, openSub, setOriginal } = useEdit();
  const guide = useFaceGuide({ banner: "BEAUTY" });
  const sel = guide.sel;
  const [beauty, setBeauty] = useState<Beauty>(doc.beauty);
  const [item, setItemState] = useState<string | null>(null);
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
  const optionH = !it ? 0 : it.row === "tone" ? 98 : it.row === "toggle" ? 0 : 54;
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
    // One touch deactivates when one of its sliders moves away from the preset
    if (skin.onetouch && it.key in ONE_TOUCH) next.onetouch = 0;
    setSkin(next);
  };
  const tap = (k: string) => {
    if (isFace(k) && sel < 0) { guide.noFace(); return; }
    if (k === "onetouch") {
      // w78.C26497e: ON = blemish auto-remove + Pore 0.3, Wrinkles 0.3, Details 0.2, Eye bags 0.3, Whiten 0.2, others reset
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
      <ControlRow bottom={186 + optionH + guide.bannerH} onOriginal={setOriginal} />
      {it && it.row !== "tone" && it.row !== "toggle" && (
        <div className="absolute inset-x-0 z-20 flex items-center justify-center" style={{ bottom: 186 + guide.bannerH, height: 54, background: "rgba(0,0,0,0.4)" }}>
          {it.row === "blemish" ? (
            <>
              <span className="text-white" style={{ fontSize: 13 }}>Apply</span>
              <SettingSwitch on={!!skin.blemish} onClick={() => setSkin({ ...skin, blemish: skin.blemish ? 0 : 1, onetouch: 0 })} />
            </>
          ) : (
            <EditSeekBar key={`${sel}|${it.key}`} style={{ margin: "0 68px" }} value={value} min={0} max={1} def={0} flashKey={flash} onChange={setValue} />
          )}
        </div>
      )}
      {it?.row === "tone" && <ToneRows b={beauty} onChange={(k, v) => apply({ ...beauty, [k]: v })} onRelease={() => undefined} />}
      <div className="absolute inset-x-0 bottom-0 bg-black" style={{ height: 186 }}>
        <FeatureList count={AUTO_SKIN.length}>
          {AUTO_SKIN.map((x) => (
            <FeatureButton
              key={x.key}
              icon={x.key === "onetouch" ? (skin.onetouch ? "beauty_icon_onetouch_on" : "beauty_icon_onetouch_off") : `beauty_icon_${x.key}`}
              tint={x.key !== "onetouch" || !skin.onetouch}
              label={x.label}
              selected={item === x.key}
              modified={x.key === "onetouch" ? false : isMod(x.key)}
              onClick={() => tap(x.key)}
            />
          ))}
        </FeatureList>
        <TitleBar title="Auto Skin" onClose={() => { seq.current++; setLive(null); openSub(null); }} onConfirm={() => { seq.current++; commit({ ...doc, beauty }); openSub(null); }} />
      </div>
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
      <ControlRow onOriginal={setOriginal}>
        {beauty.skinTone && (
          <EditSeekBar
            style={{ marginLeft: 68, marginRight: 24 }}
            value={beauty.skinToneValue} min={0} max={1} def={0.4} flashKey={flash}
            onChange={(v) => apply({ ...beauty, skinToneValue: v })}
          />
        )}
      </ControlRow>
      <div className="absolute inset-x-0 bottom-0 bg-black" style={{ height: 186 }}>
        <div className="no-scrollbar absolute inset-x-0 flex overflow-x-auto" style={{ top: 36, padding: "0 15px", gap: 4 }}>
          <ThumbItem label="None" bg="#242424" text="#CCCCCC" none selected={!beauty.skinTone} onClick={() => apply({ ...beauty, skinTone: null })} />
          {SKIN_TONES.map((t) => (
            <ThumbItem
              key={t.key} label={t.label} bg={t.color} icon={`skintone_icon_${t.key}`}
              selected={beauty.skinTone === t.key}
              onClick={() => { apply({ ...beauty, skinTone: t.key, skinToneValue: beauty.skinTone === t.key ? beauty.skinToneValue : 0.4 }); setFlash((n) => n + 1); }}
            />
          ))}
        </div>
        <TitleBar onClose={() => { setLive(null); openSub(null); }} onConfirm={() => { commit({ ...doc, beauty }); openSub(null); }}>
          <span>Skin Tone</span>
          <Img name="icon_common_list_guide" size={21} style={{ marginLeft: 2 }} />
        </TitleBar>
      </div>
    </>
  );
}
