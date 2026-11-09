"use client";

// Filters tab of the video editor: the same filter strip as the photo editor (groups, favourites, swatches), with a
// strength slider that floats above the dock.
import { useState } from "react";
import { ORIGINAL_KEY } from "@/lib/filters";
import { defStrength, FilterName, FilterStrip } from "@/components/edit/panels/Filter";
import { EditSeekBar } from "@/components/edit/ui";

export { defStrength };

export function VideoFilterPanel({ value, onChange, onCommit, sliderBottom, panelBottom, panelH }: {
  value: { key: string; strength: number };
  onChange: (v: { key: string; strength: number }) => void;
  onCommit: (v: { key: string; strength: number }) => void;
  /** Top of the dock (px from the bottom of the editor): the strength slider floats above it. */
  sliderBottom: number;
  /** The panel area inside the dock. */
  panelBottom: number; panelH: number;
}) {
  const [slider, setSlider] = useState(true);
  const [name, setName] = useState({ text: "", n: 0 });
  return (
    <>
      <FilterName name={name.text} n={name.n} bottom={sliderBottom + 56} />
      {slider && value.key !== ORIGINAL_KEY && (
        <div className="absolute inset-x-3 z-20 flex h-[52px] items-center gap-3 rounded-lg bg-panel/90 px-3 shadow-lg ring-1 ring-line backdrop-blur-md" style={{ bottom: sliderBottom + 8 }}>
          <span className="w-16 flex-none text-[13px] font-medium text-fg-2">Strength</span>
          <EditSeekBar value={value.strength} def={defStrength(value.key)} onChange={(s) => onChange({ ...value, strength: s })} onRelease={(s) => onCommit({ ...value, strength: s })} />
        </div>
      )}
      <div className="absolute inset-x-0 z-20 pt-3" style={{ bottom: panelBottom, height: panelH }}>
        <FilterStrip
          value={value.key}
          sliderOn={slider}
          onToggleSlider={() => setSlider((s) => !s)}
          onPick={(f) => { onCommit({ key: f.key, strength: defStrength(f.key) }); setSlider(true); setName((o) => ({ text: f.name, n: o.n + 1 })); }}
        />
      </div>
    </>
  );
}
