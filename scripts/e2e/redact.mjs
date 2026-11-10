// Pixelates every face in a folder of screenshots (proof images of runs that used a real person's photo).
//   node scripts/e2e/redact.mjs <in-dir> <out-dir>
// Uses ONE headless Chrome on the running app (E2E_BASE) and the face model the app already ships
// (MediaPipe Face Landmarker, public/mediapipe), so nothing is uploaded. Each image is searched at full size and in
// overlapping zoomed tiles (small faces in thumbnails), and every face box is pixelated with a generous margin.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, BASE_URL } from "./lib.mjs";

const [src, dst] = process.argv.slice(2);
if (!src || !dst) { console.error("usage: node scripts/e2e/redact.mjs <in-dir> <out-dir>"); process.exit(1); }
mkdirSync(dst, { recursive: true });
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const bundle = readFileSync(path.join(repo, "node_modules/@mediapipe/tasks-vision/vision_bundle.mjs"), "utf8");

const s = await launch();
try {
  await s.goto("/settings/about", { settle: 500 });
  await s.ev(`(async () => {
    const url = URL.createObjectURL(new Blob([${JSON.stringify(bundle)}], { type: "text/javascript" }));
    const { FilesetResolver, FaceLandmarker } = await import(url);
    const files = await FilesetResolver.forVisionTasks(location.origin + "/mediapipe/wasm");
    window.__lm = await FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: location.origin + "/mediapipe/models/face_landmarker.task", delegate: "CPU" },
      runningMode: "IMAGE", numFaces: 8, minFaceDetectionConfidence: 0.3, minFacePresenceConfidence: 0.3,
    });
    return true;
  })()`, 120000);
  let total = 0, withFaces = 0;
  for (const f of readdirSync(src).filter((n) => n.endsWith(".png")).sort()) {
    const b64 = readFileSync(path.join(src, f)).toString("base64");
    const out = await s.ev(`(async () => {
      const img = new Image(); img.src = "data:image/png;base64,${b64}"; await img.decode();
      const W = img.naturalWidth, H = img.naturalHeight;
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const g = c.getContext("2d"); g.drawImage(img, 0, 0);
      const boxes = [];
      const find = (sx, sy, sw, sh, scale) => {
        const t = document.createElement("canvas"); t.width = Math.round(sw * scale); t.height = Math.round(sh * scale);
        t.getContext("2d").drawImage(c, sx, sy, sw, sh, 0, 0, t.width, t.height);
        for (const lm of window.__lm.detect(t).faceLandmarks) {
          const xs = lm.map((p) => sx + p.x * sw), ys = lm.map((p) => sy + p.y * sh);
          boxes.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
        }
      };
      find(0, 0, W, H, 1);
      // zoomed tiles find small faces (thumbnails, picker grids)
      const T = Math.round(Math.min(W, H) / 2.5);
      for (let y = 0; y < H; y += T * 0.5) for (let x = 0; x < W; x += T * 0.5) find(x, y, Math.min(T, W - x), Math.min(T, H - y), 512 / T);
      for (const [x0, y0, x1, y1] of boxes) {
        const w = x1 - x0, h = y1 - y0, m = 0.45 * Math.max(w, h);
        const X0 = Math.max(0, Math.floor(x0 - m)), Y0 = Math.max(0, Math.floor(y0 - m * 1.3)), X1 = Math.min(W, Math.ceil(x1 + m)), Y1 = Math.min(H, Math.ceil(y1 + m));
        const k = Math.max(6, Math.round((X1 - X0) / 10));
        const t = document.createElement("canvas"); t.width = Math.max(1, Math.round((X1 - X0) / k)); t.height = Math.max(1, Math.round((Y1 - Y0) / k));
        t.getContext("2d").drawImage(c, X0, Y0, X1 - X0, Y1 - Y0, 0, 0, t.width, t.height);
        g.imageSmoothingEnabled = false; g.drawImage(t, X0, Y0, X1 - X0, Y1 - Y0);
      }
      return { n: boxes.length, png: c.toDataURL("image/png").split(",")[1] };
    })()`, 120000);
    writeFileSync(path.join(dst, f), Buffer.from(out.png, "base64"));
    total++; if (out.n) withFaces++;
  }
  console.log(`${total} images, faces pixelated in ${withFaces} (server ${BASE_URL})`);
} finally {
  try { s.ws.close(); } catch {}
  s.kill();
}
process.exit(0);
