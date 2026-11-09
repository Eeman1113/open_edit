import type { ModelId } from "./models";

export type AiRequest =
  | { op: "warm"; id: number; model: ModelId }
  | { op: "inpaint"; id: number; rgba: Uint8ClampedArray; w: number; h: number; mask: Uint8Array }
  | { op: "upscale"; id: number; rgba: Uint8ClampedArray; w: number; h: number; outScale: 1 | 2 | 4 }
  | { op: "depth"; id: number; bitmap: ImageBitmap }
  | { op: "cancel"; id: number; target: number };

export type AiResult = { ep: "webgpu" | "wasm"; ms: number; rgba?: Uint8ClampedArray; depth?: Float32Array; w?: number; h?: number };

export type AiResponse =
  | { id: number; type: "progress"; stage: "download" | "run"; value: number }
  | ({ id: number; type: "done" } & AiResult)
  | { id: number; type: "error"; message: string };
