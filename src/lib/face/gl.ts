// Small WebGL1 helpers shared by the face passes (warp, makeup, stickers).
// Texture orientation convention inside the face pipeline: FBO textures, uv origin bottom-left (GL),
// view-normalized point (x, y-down) <-> uv (x, 1 - y) <-> NDC (2x - 1, 1 - 2y).

export type Prog = { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null>; a: Record<string, number> };

export function compile(gl: WebGLRenderingContext, vert: string, frag: string, uniforms: string[], attribs: string[]): Prog {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "face shader compile failed");
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vert));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "face program link failed");
  const u: Prog["u"] = {}, a: Prog["a"] = {};
  for (const n of uniforms) u[n] = gl.getUniformLocation(p, n);
  for (const n of attribs) a[n] = gl.getAttribLocation(p, n);
  return { p, u, a };
}

export function makeTexture(gl: WebGLRenderingContext, repeat = false): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  return t;
}

export interface Target { fb: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number; depth?: WebGLRenderbuffer }

/** Named, resizable FBO pool. */
export class Targets {
  private m = new Map<string, Target>();
  constructor(private gl: WebGLRenderingContext) {}
  /** `depth`: also attach a 16-bit depth renderbuffer (3D sticker occlusion). */
  get(name: string, w: number, h: number, depth = false): Target {
    const gl = this.gl;
    let t = this.m.get(name);
    if (t && t.w === w && t.h === h && !!t.depth === depth) return t;
    if (t) { gl.deleteFramebuffer(t.fb); gl.deleteTexture(t.tex); if (t.depth) gl.deleteRenderbuffer(t.depth); }
    const tex = makeTexture(gl);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    let rb: WebGLRenderbuffer | undefined;
    if (depth) {
      rb = gl.createRenderbuffer()!;
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
      gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    }
    t = { fb, tex, w, h, depth: rb };
    this.m.set(name, t);
    return t;
  }
  dispose() {
    for (const t of this.m.values()) { this.gl.deleteFramebuffer(t.fb); this.gl.deleteTexture(t.tex); if (t.depth) this.gl.deleteRenderbuffer(t.depth); }
    this.m.clear();
  }
}

/** Streams interleaved float vertex data + optional indices (re-used buffers). */
export class Stream {
  readonly vbo: WebGLBuffer;
  readonly ibo: WebGLBuffer;
  constructor(private gl: WebGLRenderingContext) {
    this.vbo = gl.createBuffer()!;
    this.ibo = gl.createBuffer()!;
  }
  /**
   * Draw triangles. `layout` = [[attribLocation, size], ...] in interleave order.
   * Disables the attribute arrays afterwards so the host renderer's state stays clean.
   */
  draw(data: Float32Array, layout: [number, number][], indices?: Uint16Array, mode?: number) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
    const stride = layout.reduce((s, [, n]) => s + n, 0) * 4;
    let off = 0;
    for (const [loc, n] of layout) {
      if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, stride, off); }
      off += n * 4;
    }
    if (indices) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STREAM_DRAW);
      gl.drawElements(mode ?? gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
    } else {
      gl.drawArrays(mode ?? gl.TRIANGLES, 0, data.length / (stride / 4));
    }
    for (const [loc] of layout) if (loc > 0) gl.disableVertexAttribArray(loc);
  }
  dispose() { this.gl.deleteBuffer(this.vbo); this.gl.deleteBuffer(this.ibo); }
}

/** URL -> texture cache with async loading; `get` returns undefined until loaded. Images are uploaded top-down (v down). */
export class ImageCache {
  private m = new Map<string, { tex?: WebGLTexture; w: number; h: number; failed?: boolean }>();
  constructor(private gl: WebGLRenderingContext) {}
  get(url: string): { tex: WebGLTexture; w: number; h: number } | undefined {
    const e = this.m.get(url);
    if (e) return e.tex ? (e as { tex: WebGLTexture; w: number; h: number }) : undefined;
    const entry: { tex?: WebGLTexture; w: number; h: number; failed?: boolean } = { w: 0, h: 0 };
    this.m.set(url, entry);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const gl = this.gl;
      const t = makeTexture(gl);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      entry.tex = t; entry.w = img.naturalWidth; entry.h = img.naturalHeight;
    };
    img.onerror = () => { entry.failed = true; };
    img.src = url;
    return undefined;
  }
  /** Resolves when every url has loaded (or failed). */
  preload(urls: string[]): Promise<void> {
    return Promise.all(urls.map((u) => new Promise<void>((res) => {
      this.get(u);
      const tick = () => { const e = this.m.get(u); if (!e || e.tex || e.failed) res(); else setTimeout(tick, 30); };
      tick();
    }))).then(() => undefined);
  }
  dispose() {
    for (const e of this.m.values()) if (e.tex) this.gl.deleteTexture(e.tex);
    this.m.clear();
  }
}

/** GLSL blend functions (the usual separable and non-separable modes). Codes: see BLEND_CODE. */
export const BLEND_GLSL = `
vec3 softLight(vec3 b, vec3 s) {
  return mix(2.0*b*s + b*b*(1.0-2.0*s), sqrt(b)*(2.0*s-1.0) + 2.0*b*(1.0-s), step(0.5, s));
}
vec3 overlayB(vec3 b, vec3 s) { return mix(2.0*b*s, 1.0-2.0*(1.0-b)*(1.0-s), step(0.5, b)); }
float lumOf(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 setLum(vec3 c, float l) {
  vec3 r = c + (l - lumOf(c));
  float lo = min(min(r.r, r.g), r.b), hi = max(max(r.r, r.g), r.b), L = lumOf(r);
  if (lo < 0.0) r = L + (r - L) * L / max(L - lo, 1e-4);
  if (hi > 1.0) r = L + (r - L) * (1.0 - L) / max(hi - L, 1e-4);
  return r;
}
float satOf(vec3 c) { return max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b); }
vec3 setSat(vec3 c, float sat) {
  float lo = min(min(c.r, c.g), c.b), hi = max(max(c.r, c.g), c.b);
  return hi > lo ? (c - lo) * sat / (hi - lo) : vec3(0.0);
}
vec3 burnB(vec3 b, vec3 s) { return vec3(s.r <= 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - b.r) / s.r), s.g <= 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - b.g) / s.g), s.b <= 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - b.b) / s.b)); }
vec3 dodgeB(vec3 b, vec3 s) { return vec3(s.r >= 1.0 ? 1.0 : min(1.0, b.r / (1.0 - s.r)), s.g >= 1.0 ? 1.0 : min(1.0, b.g / (1.0 - s.g)), s.b >= 1.0 ? 1.0 : min(1.0, b.b / (1.0 - s.b))); }
vec3 reflectB(vec3 b, vec3 s) { return vec3(s.r >= 1.0 ? 1.0 : min(1.0, b.r * b.r / (1.0 - s.r)), s.g >= 1.0 ? 1.0 : min(1.0, b.g * b.g / (1.0 - s.g)), s.b >= 1.0 ? 1.0 : min(1.0, b.b * b.b / (1.0 - s.b))); }
// extended modes, 10..31 (see BLEND_CODE)
vec3 blendMode2(vec3 b, vec3 s, int mode) {
  if (mode == 10) return abs(b - s);
  if (mode == 11) return b + s - 2.0 * b * s;
  if (mode == 12) return max(b - s, 0.0);
  if (mode == 13) return burnB(b, s);
  if (mode == 14) return dodgeB(b, s);
  if (mode == 15) return max(b + s - 1.0, 0.0);
  if (mode == 16) return clamp(b + 2.0 * s - 1.0, 0.0, 1.0);
  if (mode == 17) return mix(burnB(b, 2.0 * s), dodgeB(b, 2.0 * s - 1.0), step(0.5, s));
  if (mode == 18) return mix(min(b, 2.0 * s), max(b, 2.0 * s - 1.0), step(0.5, s));
  if (mode == 19) return step(1.0, b + s);
  if (mode == 20) return (b + s) * 0.5;
  if (mode == 21) return 1.0 - abs(1.0 - b - s);
  if (mode == 22) return reflectB(b, s);
  if (mode == 23) return reflectB(s, b);
  if (mode == 24) return min(b, s) - max(b, s) + 1.0;
  if (mode == 25) return vec3(s.r <= 0.0 ? 1.0 : min(1.0, b.r / s.r), s.g <= 0.0 ? 1.0 : min(1.0, b.g / s.g), s.b <= 0.0 ? 1.0 : min(1.0, b.b / s.b));
  if (mode == 26) return setLum(setSat(s, satOf(b)), lumOf(b));
  if (mode == 27) return setLum(setSat(b, satOf(s)), lumOf(b));
  if (mode == 28) return setLum(b, lumOf(s));
  if (mode == 29) return 1.0 - (1.0 - b) * (1.0 - s);
  if (mode == 30) return burnB(b, s);
  if (mode == 31) return dodgeB(b, s);
  return s;
}
vec3 blendMode(vec3 b, vec3 s, int mode) {
  if (mode == 1) return b * s;
  if (mode == 2) return 1.0 - (1.0 - b) * (1.0 - s);
  if (mode == 3) return overlayB(b, s);
  if (mode == 4) return softLight(b, s);
  if (mode == 5) return overlayB(s, b);
  if (mode == 6) return min(b + s, 1.0);
  if (mode == 7) return setLum(s, lumOf(b));
  if (mode == 8) return min(b, s);
  if (mode == 9) return max(b, s);
  if (mode < 10) return s;
  return blendMode2(b, s, mode);
}`;

export type BlendName =
  | "normal" | "multiply" | "screen" | "overlay" | "softlight" | "hardlight" | "add" | "color" | "darken" | "lighten"
  | "difference" | "exclusion" | "subtract" | "colorburn" | "colordodge" | "linearburn" | "linearlight" | "vividlight"
  | "pinlight" | "hardmix" | "average" | "negation" | "reflect" | "glow" | "phoenix" | "divide" | "hue" | "saturation"
  | "luminosity" | "lineardodge" | "burn" | "dodge";
export const BLEND_CODE: Record<BlendName, number> = {
  normal: 0, multiply: 1, screen: 2, overlay: 3, softlight: 4, hardlight: 5, add: 6, color: 7, darken: 8, lighten: 9,
  difference: 10, exclusion: 11, subtract: 12, colorburn: 13, colordodge: 14, linearburn: 15, linearlight: 16, vividlight: 17,
  pinlight: 18, hardmix: 19, average: 20, negation: 21, reflect: 22, glow: 23, phoenix: 24, divide: 25, hue: 26, saturation: 27,
  luminosity: 28, lineardodge: 6, burn: 30, dodge: 31,
};

/** Blend mode code by name, case-insensitive; a "blend_" prefix, "_" and "-" are ignored. Unknown -> normal. */
export function blendCode(name?: string): number {
  if (!name) return 0;
  const k = name.toLowerCase().replace(/^blend_/, "").replace(/[_-]/g, "") as BlendName;
  return BLEND_CODE[k] ?? 0;
}

/** Full-screen copy program (uv in GL convention). */
export const COPY_VERT = `
attribute vec2 position;
varying vec2 vUv;
void main() { vUv = position * 0.5 + 0.5; gl_Position = vec4(position, 0.0, 1.0); }`;
export const COPY_FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D tex;
void main() { gl_FragColor = texture2D(tex, vUv); }`;
export const FULLSCREEN = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const n = parseInt(v, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
