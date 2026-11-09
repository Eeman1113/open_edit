// Built-in art styles. Each style is a short recipe of image operations (src/lib/artstyle.ts) that runs on the
// device, so photos never leave the browser. The content API serves this list when no art-style provider is
// configured; a provider may add styles built from the same operations.
import type { ArtStyle } from "@/lib/content/types";

export const ART_STYLES: ArtStyle[] = [
  { id: "comic", name: "Comic", about: "Flat colours with bold ink outlines.",
    ops: [{ op: "smooth", radius: 0.006 }, { op: "posterize", levels: 6 }, { op: "saturate", amount: 1.35 }, { op: "edges", strength: 0.95, threshold: 0.18 }] },
  { id: "pencil", name: "Pencil", about: "A soft graphite sketch on warm paper.",
    ops: [{ op: "sketch", strength: 1 }, { op: "paper", color: "#f4efe4", amount: 0.5 }, { op: "grain", amount: 0.05 }] },
  { id: "poster", name: "Poster", about: "Few colours, strong contrast.",
    ops: [{ op: "smooth", radius: 0.004 }, { op: "contrast", amount: 1.3 }, { op: "posterize", levels: 4 }, { op: "saturate", amount: 1.5 }] },
  { id: "watercolour", name: "Watercolour", about: "Soft washes with faint pencil lines.",
    ops: [{ op: "smooth", radius: 0.012 }, { op: "posterize", levels: 9 }, { op: "saturate", amount: 0.9 }, { op: "brightness", amount: 0.06 },
      { op: "edges", strength: 0.35, threshold: 0.12, color: "#5a4a40" }, { op: "paper", color: "#fbf7ee", amount: 0.25 }] },
  { id: "riso", name: "Riso", about: "Two-ink print in blue and pink with grain.",
    ops: [{ op: "contrast", amount: 1.15 }, { op: "duotone", dark: "#1d3fbb", light: "#ff8fb1" }, { op: "grain", amount: 0.12 }] },
  { id: "halftone", name: "Halftone", about: "Printed dots, like an old magazine.",
    ops: [{ op: "saturate", amount: 1.2 }, { op: "halftone", cell: 0.012, angle: 0.4 }] },
  { id: "ink", name: "Ink", about: "Black linework only.",
    ops: [{ op: "smooth", radius: 0.004 }, { op: "brightness", amount: 1 }, { op: "edges", strength: 1, threshold: 0.14 }] },
  { id: "noir", name: "Noir comic", about: "Three greys and hard outlines.",
    ops: [{ op: "saturate", amount: 0 }, { op: "contrast", amount: 1.25 }, { op: "posterize", levels: 3 }, { op: "edges", strength: 0.9, threshold: 0.2 }] },
  { id: "pastel", name: "Pastel", about: "Light, chalky colours.",
    ops: [{ op: "smooth", radius: 0.008 }, { op: "saturate", amount: 0.65 }, { op: "brightness", amount: 0.12 }, { op: "posterize", levels: 10 }, { op: "paper", color: "#fff6f0", amount: 0.2 }] },
  { id: "sunset-duo", name: "Sunset duo", about: "Plum shadows and peach highlights.",
    ops: [{ op: "duotone", dark: "#3a1048", light: "#ffc27a" }, { op: "grain", amount: 0.04 }] },
];
