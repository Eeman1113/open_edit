// Transitional bridge for screens that have not been moved to <Icon> yet (editor, video editor, collage).
// `d(id)` used to return the URL of a bundled bitmap; it now returns a data-URL SVG of a generic glyph picked from
// keywords in the id, so those screens keep working (as <img src> or CSS mask) until they are reskinned.
// New code must use <Icon name> from "@/components/ui" instead.
import {
  ArrowLeft, Blend, Brush, Check, Circle, Contrast, Crop, Download, Droplet, Eraser, Expand, Eye, Film, Image, Images, Layers,
  Music, Palette, Pause, Play, Plus, Redo2, RotateCcw, RotateCw, Scissors, Search, Settings, Smile, Sparkle, Sparkles, Square,
  Sticker, Sun, Trash2, Type, Undo2, WandSparkles, X, type IconNode,
} from "lucide";

const RULES: [RegExp, IconNode][] = [
  [/close|_x$|cancel|top_btn_x/, X], [/confirm|check|_ok|done|select/, Check], [/back|return/, ArrowLeft],
  [/undo/, Undo2], [/redo/, Redo2], [/rotate_left/, RotateCcw], [/rotate|reset|retry|restore/, RotateCw],
  [/save|download/, Download], [/delete|trash/, Trash2], [/search/, Search], [/setting/, Settings], [/add|plus|create/, Plus],
  [/crop|ratio/, Crop], [/filter|blend/, Blend], [/adjust|bright|lux|exposure/, Sun], [/contrast|original|compare|diff/, Contrast],
  [/beauty|skin|face|makeup|smile/, Smile], [/text|font/, Type], [/sticker|stamp/, Sticker], [/brush|paint|hair/, Brush],
  [/eras|remove/, Eraser], [/enhance|magic|ai_|generat/, WandSparkles], [/expand|border|frame/, Expand], [/cutout|scissor/, Scissors],
  [/layer/, Layers], [/music|sound|audio/, Music], [/play/, Play], [/pause/, Pause], [/video|clip|movie/, Film],
  [/gallery|album/, Images], [/image|photo|thumb/, Image], [/color|tone|tint|palette/, Palette], [/drop|opacity/, Droplet],
  [/eye/, Eye], [/effect|sparkle|glitter/, Sparkles], [/star|new|hot/, Sparkle], [/square|layout|collage/, Square],
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const cache = new Map<string, string>();

function svg(node: IconNode): string {
  const body = node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${esc(String(v))}"`).join(" ")}/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#9AA0AB" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

/** @deprecated Use <Icon name> from "@/components/ui". */
export function d(id: string): string {
  let url = cache.get(id);
  if (!url) {
    const key = id.toLowerCase();
    const node = RULES.find(([re]) => re.test(key))?.[1] ?? Circle;
    url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg(node))}`;
    cache.set(id, url);
  }
  return url;
}
