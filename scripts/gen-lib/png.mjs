// Minimal PNG encoder (8-bit RGBA or grayscale, no interlace) for the asset generators. No dependencies.
import { crc32, deflateSync } from "node:zlib";

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
};

/**
 * Encode pixels as PNG. `px` is a Uint8Array/Uint8ClampedArray of w*h*channels bytes (channels 4 = RGBA, 1 = gray).
 */
export function encodePng(w, h, px, channels = 4) {
  const stride = w * channels;
  const raw = Buffer.alloc((stride + 1) * h);
  const src = Buffer.from(px.buffer, px.byteOffset, stride * h);
  const cand = [Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride)];
  for (let y = 0; y < h; y++) {
    // per-row filter choice (none / sub / up / average / paeth) by the minimum sum of absolute values
    const row = y * stride, prev = (y - 1) * stride;
    let best = 0, bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const out = cand[f];
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const x = src[row + i], a = i >= channels ? src[row + i - channels] : 0, b = y ? src[prev + i] : 0, c = y && i >= channels ? src[prev + i - channels] : 0;
        let p;
        if (f === 0) p = x;
        else if (f === 1) p = x - a;
        else if (f === 2) p = x - b;
        else if (f === 3) p = x - ((a + b) >> 1);
        else {
          const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c);
          p = x - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        }
        out[i] = p & 255;
        sum += out[i] < 128 ? out[i] : 256 - out[i];
      }
      if (sum < bestSum) { bestSum = sum; best = f; }
    }
    raw[y * (stride + 1)] = best;
    cand[best].copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : channels === 3 ? 2 : 0;
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Simple RGBA canvas with float helpers. */
export class Raster {
  constructor(w, h) { this.w = w; this.h = h; this.px = new Uint8ClampedArray(w * h * 4); }
  set(x, y, r, g, b, a = 1) {
    const i = (y * this.w + x) * 4;
    this.px[i] = r * 255 + 0.5; this.px[i + 1] = g * 255 + 0.5; this.px[i + 2] = b * 255 + 0.5; this.px[i + 3] = a * 255 + 0.5;
  }
  png() { return encodePng(this.w, this.h, this.px, 4); }
}
