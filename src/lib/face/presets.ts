// Face reshape presets: named sets of parametric warp values (see WarpParams). A preset is applied at a strength
// (0..1) and added on top of the user's own sliders.
import type { WarpParams } from "./warp";

export interface FacePreset {
  key: string;
  label: string;
  /** One-line description (UI hint / docs). */
  about: string;
  /** Values at strength 1. */
  warp: Partial<WarpParams>;
}

export const FACE_PRESETS: FacePreset[] = [
  {
    key: "natural", label: "Natural", about: "A light, balanced refinement.",
    warp: { faceSlim: 0.25, jaw: 0.15, eyeSize: 0.12, noseWidth: -0.12, chinLength: 0.05 },
  },
  {
    key: "soft", label: "Soft", about: "Rounder, softer contours and a gentle smile.",
    warp: { jaw: 0.3, cheekbone: 0.15, faceSlim: 0.1, eyeSize: 0.15, eyeLower: 0.2, smile: 0.2, forehead: 0.15 },
  },
  {
    key: "slim", label: "Slim", about: "A narrower face and jaw.",
    warp: { faceSlim: 0.55, jaw: 0.3, cheekbone: 0.2, noseWidth: -0.2, faceWidth: -0.1 },
  },
  {
    key: "bright-eyes", label: "Bright Eyes", about: "Larger, more open eyes.",
    warp: { eyeSize: 0.35, eyeHeight: 0.15, eyeLower: 0.25, pupil: 0.15, eyeOuter: 0.1 },
  },
  {
    key: "vline", label: "V-line", about: "A tapered jaw and a slightly longer chin.",
    warp: { vline: 0.5, jaw: 0.25, chinLength: 0.2, faceSlim: 0.15 },
  },
];

export const facePreset = (key: string) => FACE_PRESETS.find((p) => p.key === key);

/** Adds `k` x the preset's values to `into` (returns `into`). Unknown keys are a no-op. */
export function addPreset(into: Partial<WarpParams>, key: string, k: number): Partial<WarpParams> {
  const p = facePreset(key);
  if (!p || !k) return into;
  for (const [name, v] of Object.entries(p.warp)) {
    const n = name as keyof WarpParams;
    into[n] = (into[n] ?? 0) + (v ?? 0) * k;
  }
  return into;
}
