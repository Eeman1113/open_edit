// On-device AI for the editor's server-only tools. Models load lazily (first use) and ONNX inference runs in
// a Web Worker (onnxruntime-web, WebGPU with WASM fallback); MediaPipe tasks run on the main thread.
export { aiCall, warm, isAbort, type Progress, type CallOpts } from "./client";
export { MODELS, MAGIC_TOUCH_URL, ORT_BASE, type ModelId } from "./models";
export { inpaintCanvas, outpaintCanvas, type Extension } from "./inpaint";
export { enhanceCanvas, hdSkinCanvas, superRes, type BgMode, type FaceMode, type FaceBox } from "./enhance";
export { depthMap, depthAt, bokeh, focusDepth, type DepthMap, type BokehParams } from "./depth";
export { subjectAt, subjectInOutline, loadSegmenter } from "./segment";
export { photoFaces, type PhotoFaces } from "./faces";
export { refineMask, recolorHair, HAIR_COLORS } from "./hair";
