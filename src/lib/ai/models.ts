// On-device AI models (all permissively licensed, self-hosted under public/models). Sources and licences:
// public/models/LICENSES.txt.
import { BASE } from "@/lib/base";

export type ModelId = "migan" | "esrgan" | "depth";

export interface ModelInfo {
  /** WebGPU variant (null = always WASM) */
  webgpu: string | null;
  wasm: string;
  /** approx. bytes, used when the server sends no Content-Length */
  size: number;
  license: string;
}

export const MODELS: Record<ModelId, ModelInfo> = {
  // MI-GAN pipeline v2 (MIT, Picsart AI Research): uint8 image [1,3,H,W] + uint8 mask [1,1,H,W] (255 known, 0 hole)
  migan: { webgpu: null, wasm: `${BASE}/models/migan_pipeline_v2.onnx`, size: 28079181, license: "MIT" },
  // Real-ESRGAN realesr-general-x4v3 (BSD-3-Clause), converted by scripts/ai-convert-esrgan.py
  esrgan: { webgpu: `${BASE}/models/realesr-general-x4v3.fp16.onnx`, wasm: `${BASE}/models/realesr-general-x4v3.fp32.onnx`, size: 4866394, license: "BSD-3-Clause" },
  // Depth Anything V2 Small (Apache-2.0), onnx-community int8 export (ConvInteger/MatMulInteger: WASM only)
  depth: { webgpu: null, wasm: `${BASE}/models/depth-anything-v2-small.int8.onnx`, size: 27258801, license: "Apache-2.0" },
};

/** MediaPipe Interactive Segmenter (Apache-2.0). */
export const MAGIC_TOUCH_URL = `${BASE}/models/magic_touch.tflite`;
/** onnxruntime-web runtime files (MIT). */
export const ORT_BASE = `${BASE}/ort/`;
