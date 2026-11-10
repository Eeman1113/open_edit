"use client";

// Effects tab of the video editor: the photo editor's effect strip (src/components/edit/panels/Effects.tsx) with an
// intensity slider that floats above the dock. The effect runs on every frame in the preview and in the export;
// moving effects (rain, snow, tape, dust...) animate with the clip.
import { useState } from "react";
import { EffectStrip, useEffectThumbs } from "@/components/edit/panels/Effects";
import { FilterName } from "@/components/edit/panels/Filter";
import { EditSeekBar } from "@/components/edit/ui";
import { effectById } from "@/lib/gl/effects";

type Fx = { id: string; amount: number } | null;

export function VideoEffectsPanel({ value, onChange, onCommit, snapshot, thumbKey, sliderBottom, panelBottom, panelH }: {
  value: Fx;
  onChange: (v: Fx) => void;
  onCommit: (v: Fx) => void;
  /** Current frame for the tile previews. */
  snapshot: () => HTMLCanvasElement | null;
  /** Changes when the tile previews should be redrawn (clip, rotation). */
  thumbKey: unknown;
  /** Top of the dock (px from the bottom of the editor): the slider floats above it. */
  sliderBottom: number;
  /** The panel area inside the dock. */
  panelBottom: number; panelH: number;
}) {
  const [slider, setSlider] = useState(true);
  const [name, setName] = useState({ text: "", n: 0 });
  const thumbs = useEffectThumbs(snapshot, thumbKey);
  const def = effectById(value?.id);
  return (
    <>
      <FilterName name={name.text} n={name.n} bottom={sliderBottom + 56} />
      {slider && value && def && (
        <div className="absolute inset-x-3 z-20 flex h-[52px] items-center gap-3 rounded-lg bg-panel/90 px-3 shadow-lg ring-1 ring-line backdrop-blur-md" style={{ bottom: sliderBottom + 8 }}>
          <span className="w-16 flex-none text-[13px] font-medium text-fg-2">Intensity</span>
          <EditSeekBar value={value.amount} def={def.amount} onChange={(a) => onChange({ ...value, amount: a })} onRelease={(a) => onCommit({ ...value, amount: a })} />
        </div>
      )}
      <div className="absolute inset-x-0 z-20 pt-3" style={{ bottom: panelBottom, height: panelH }}>
        <EffectStrip
          value={value?.id ?? null}
          thumbs={thumbs}
          sliderOn={slider}
          onToggleSlider={() => setSlider((s) => !s)}
          onPick={(id) => {
            const d = effectById(id);
            onCommit(d ? { id: d.id, amount: d.amount } : null);
            if (d) { setSlider(true); setName((o) => ({ text: d.name, n: o.n + 1 })); }
          }}
        />
      </div>
    </>
  );
}
