// Portrait makeup catalogue: the shared procedural looks (src/data/camera/beauty.ts) in the editor's list shape.
import { MAKEUP_CATEGORIES } from "@/data/camera/beauty";

export interface MakeupCat { key: string; s: string; label: string; bg: string; def: number; items: { k: string; l: string; bg?: string }[] }

export const MAKEUP: MakeupCat[] = MAKEUP_CATEGORIES.map((c) => ({
  key: c.key, s: c.short, label: c.label, bg: c.bg, def: c.def,
  items: c.contents.map((ct) => ({ k: ct.key, l: ct.label, bg: ct.bg })),
}));
