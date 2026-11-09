// WebGL renderer: source (video/image) -> [skin smoothing] -> [face passes] -> colour cube (strength mix, brighten)
// -> [portrait tone] -> [camera adjust] -> [editor adjust] -> canvas.
// Lookup tables and textures come from the asset pack (scripts/gen-luts.mjs): filters by id (kind "filter"),
// engine tables by id (kind "table").
import { getAsset } from "@/lib/assets";
import { BLUR_FRAG, CUBE_GLSL, DOWN_FRAG, EDIT_FRAG, EDIT_UNIFORMS, TONE_FRAG, TONE_UNIFORMS } from "./editShaders";
import { FacePipeline, faceParamsActive, type FaceRenderParams } from "../face/pipeline";
import type { FaceData } from "../face/landmarks";

const VERT = `
attribute vec2 position;
attribute vec2 texCoord;
uniform vec2 scale;
uniform float mirror;
uniform float flipY;
uniform vec4 srcRect; // crop of the input in normalized coords (x, y, w, h); (0, 0, 1, 1) = whole input
varying highp vec2 textureCoordinate;
void main() {
  gl_Position = vec4(position * scale, 0.0, 1.0);
  vec2 t = vec2(mix(texCoord.x, 1.0 - texCoord.x, mirror), mix(texCoord.y, 1.0 - texCoord.y, flipY));
  textureCoordinate = srcRect.xy + t * srcRect.zw;
}`;

/**
 * Skin smoothing: an edge-aware average over two rings of taps (range weight on colour distance), applied in
 * proportion to a chroma-based skin likelihood. A fraction of the fine detail is added back so skin keeps texture.
 */
const SMOOTH_FRAG = `
precision mediump float;
varying highp vec2 textureCoordinate;
uniform sampler2D inputImageTexture;
uniform vec2 texelSize; // one output pixel in source uv
uniform float smoothAmount;
float skinLikelihood(vec3 c) {
  float cb = -0.169 * c.r - 0.331 * c.g + 0.5 * c.b;
  float cr = 0.5 * c.r - 0.419 * c.g - 0.081 * c.b;
  return clamp(1.7 - length(vec2((cb + 0.08) / 0.1, (cr - 0.1) / 0.09)), 0.0, 1.0) * smoothstep(0.06, 0.22, c.r);
}
void main() {
  vec4 c = texture2D(inputImageTexture, textureCoordinate);
  if (smoothAmount <= 0.001) { gl_FragColor = c; return; }
  vec3 acc = c.rgb;
  float wsum = 1.0;
  // 2 rings x 8 directions, radius ~2.5 and ~5.5 output pixels, rotated against each other
  for (int ring = 0; ring < 2; ring++) {
    float r = ring == 0 ? 2.5 : 5.5;
    float rot = ring == 0 ? 0.0 : 0.3927;
    float spatial = ring == 0 ? 1.0 : 0.6;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7854 + rot;
      vec3 s = texture2D(inputImageTexture, textureCoordinate + vec2(cos(a), sin(a)) * r * texelSize).rgb;
      vec3 d = s - c.rgb;
      float w = spatial * exp(-dot(d, d) * 45.0);
      acc += s * w;
      wsum += w;
    }
  }
  vec3 smoothed = acc / wsum;
  float k = smoothAmount * mix(0.3, 1.0, skinLikelihood(c.rgb));
  vec3 detail = c.rgb - smoothed;
  gl_FragColor = vec4(c.rgb - detail * k * 0.85, c.a);
}`;

/** Colour cube with strength, plus the brighten table. */
const CUBE_FRAG = `
precision mediump float;
varying highp vec2 textureCoordinate;
uniform sampler2D inputImageTexture;
uniform sampler2D filterCube;
uniform float intensity;
uniform sampler2D brightenCube;
uniform float brighten;
${CUBE_GLSL}
void main() {
  vec4 src = texture2D(inputImageTexture, textureCoordinate);
  vec3 c = src.rgb;
  if (brighten > 0.001) c = mix(c, sampleCube(brightenCube, c), brighten);
  if (intensity > 0.001) c = mix(c, sampleCube(filterCube, c), intensity);
  gl_FragColor = vec4(c, src.a);
}`;

/** Camera adjust pass (simple per-pixel controls). */
const ADJUST_FRAG = `
precision mediump float;
varying highp vec2 textureCoordinate;
uniform sampler2D inputImageTexture;
uniform vec2 texelSize;
uniform float brightness, contrast, saturation, warmth, tint, vignette, sharpen, grain, fade, highlights, shadows, hue;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
float hash12(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec3 rotateHue(vec3 c, float a) {
  // rotation about the grey axis
  vec3 k = vec3(0.57735);
  return c * cos(a) + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - cos(a));
}
void main() {
  vec4 src = texture2D(inputImageTexture, textureCoordinate);
  vec3 c = src.rgb;
  if (sharpen > 0.001) {
    vec3 n = texture2D(inputImageTexture, textureCoordinate + vec2(texelSize.x, 0.0)).rgb
           + texture2D(inputImageTexture, textureCoordinate - vec2(texelSize.x, 0.0)).rgb
           + texture2D(inputImageTexture, textureCoordinate + vec2(0.0, texelSize.y)).rgb
           + texture2D(inputImageTexture, textureCoordinate - vec2(0.0, texelSize.y)).rgb;
    c += (c - n * 0.25) * sharpen * 1.8;
  }
  c *= exp2(brightness * 0.6);
  c = (c - 0.5) * (1.0 + contrast * 0.6) + 0.5;
  float y = dot(c, LUMA);
  c = mix(vec3(y), c, 1.0 + saturation);
  c *= vec3(1.0 + warmth * 0.07, 1.0 - tint * 0.05, 1.0 - warmth * 0.08);
  if (abs(hue) > 0.001) c = rotateHue(c, hue * 3.14159265);
  y = dot(c, LUMA);
  c += shadows * 0.22 * (1.0 - smoothstep(0.0, 0.55, y)) + highlights * 0.22 * smoothstep(0.45, 1.0, y);
  c = mix(c, c * 0.84 + 0.1, fade);
  vec2 p = textureCoordinate - 0.5;
  c *= 1.0 - vignette * smoothstep(0.25, 0.75, length(p));
  c += (hash12(gl_FragCoord.xy) - 0.5) * grain * 0.18;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), src.a);
}`;

export interface Adjustments {
  brightness: number; contrast: number; saturation: number; warmth: number; tint: number;
  vignette: number; sharpen: number; grain: number; fade: number; highlights: number; shadows: number; hue: number;
}
export const ZERO_ADJUST: Adjustments = {
  brightness: 0, contrast: 0, saturation: 0, warmth: 0, tint: 0, vignette: 0, sharpen: 0, grain: 0, fade: 0, highlights: 0, shadows: 0, hue: 0,
};

/** Photo-editor Adjust values (-1..1 unless noted) + Curves / HSL / Split Tone. */
export interface EditAdjust {
  /** Auto tone strength. */ lux: number;
  brightness: number; brilliance: number; contrast: number; clarity: number; saturation: number;
  sharpen: number;
  /** Fine detail (small-radius local contrast). */ texture: number;
  highlights: number; shadows: number; fade: number; grain: number;
  warmth: number; tint: number; vignette: number;
  /** 256x1 RGBA bytes: R=master, G=red, B=green, A=blue (null = identity). */
  curves?: Uint8Array | null;
  /** 7 bands (red, orange, yellow, green, cyan, blue, magenta) x (hue, sat, light) in -1..1 (null = untouched). */
  hsl?: number[] | null;
  split?: { shadowColor: [number, number, number]; shadow: number; highlightColor: [number, number, number]; highlight: number } | null;
}
export const ZERO_EDIT: EditAdjust = {
  lux: 0, brightness: 0, brilliance: 0, contrast: 0, clarity: 0, saturation: 0, sharpen: 0, texture: 0,
  highlights: 0, shadows: 0, fade: 0, grain: 0, warmth: 0, tint: 0, vignette: 0,
};

/** Portrait tone: Cool/Warm and Tan/Light (-1..1), skin tone preset key + strength (0..1). */
export interface ToneParams { coolWarm: number; tanLight: number; skinTone?: string | null; skinToneValue: number }

export interface RenderParams {
  /** Filter lookup table id (asset kind "filter"). */
  lut?: string;
  intensity: number;     // 0..1
  smooth: number;        // skin smoothing 0..1
  whiten: number;        // brighten 0..1
  adjust?: Adjustments;
  mirror?: boolean;
  /** Editor passes (additive; the camera leaves these undefined). */
  edit?: EditAdjust;
  tone?: ToneParams;
  /** Crop of source in normalized coords (cover-fit into the canvas aspect). */
  crop?: { x: number; y: number; w: number; h: number };
  /** Face engine passes (reshape / makeup / liquify / stickers), run after skin smoothing and before the colour cube. */
  face?: FaceRenderParams;
}

type Prog = { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };

/** Face landmarks re-expressed in the coords of a source crop rect (z scales like x). */
function cropFace(f: FaceData, x: number, y: number, w: number, h: number): FaceData {
  const a = f.points, out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i += 3) { out[i] = (a[i] - x) / w; out[i + 1] = (a[i + 1] - y) / h; out[i + 2] = a[i + 2] / w; }
  return { ...f, points: out };
}

/** Texture cache key of an engine table. */
const T = (id: string) => `table:${id}`;
const tableUrl = (id: string) => getAsset("table", id);

export class Renderer {
  readonly gl: WebGLRenderingContext;
  private smoothProg: Prog;
  private cubeProg: Prog;
  private adjust: Prog;
  private srcTex: WebGLTexture;
  private down?: Prog;
  private blur?: Prog;
  private editProg?: Prog;
  private toneProg?: Prog;
  private facePipe?: FacePipeline;
  private faceFailed = false;
  private curvesTex?: WebGLTexture;
  private luts = new Map<string, WebGLTexture>();
  private lutLoading = new Set<string>();
  private fbos: { fb: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number }[] = [];
  private quad: WebGLBuffer;

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) throw new Error("WebGL not supported");
    this.gl = gl;
    this.smoothProg = this.program(SMOOTH_FRAG, ["inputImageTexture", "texelSize", "smoothAmount"]);
    this.cubeProg = this.program(CUBE_FRAG, ["inputImageTexture", "filterCube", "intensity", "brightenCube", "brighten"]);
    this.adjust = this.program(ADJUST_FRAG, ["inputImageTexture", "texelSize", ...Object.keys(ZERO_ADJUST)]);
    this.srcTex = this.texture();
    this.quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    // x, y, u, v  (v flipped so image top = texture row 0)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 1, 1, -1, 1, 1, -1, 1, 0, 0, 1, 1, 1, 0]), gl.STATIC_DRAW);
    this.loadLut(T("whiten"), tableUrl("whiten"));
  }

  private program(frag: string, uniforms: string[]): Prog {
    const gl = this.gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.isContextLost() ? "WebGL context lost" : gl.getShaderInfoLog(s) || "shader compile failed");
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(p);
    const u: Prog["u"] = {};
    for (const n of [...uniforms, "scale", "mirror", "flipY", "srcRect"]) u[n] = gl.getUniformLocation(p, n);
    return { p, u };
  }

  private texture(): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  /**
   * Load a lookup texture once. `name` is a filter id (asset kind "filter") unless `url` is given.
   * Resolves when loaded (or failed: it never rejects).
   */
  loadLut(name: string, url = getAsset("filter", name)): Promise<void> {
    if (this.luts.has(name) || this.lutLoading.has(name) || !url) return Promise.resolve();
    this.lutLoading.add(name);
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const gl = this.gl;
        const t = this.texture();
        // table data must not be colour-managed or premultiplied
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
        this.luts.set(name, t);
        this.lutLoading.delete(name);
        resolve();
      };
      img.onerror = () => { this.lutLoading.delete(name); resolve(); };
      img.src = url;
    });
  }

  private fbo(i: number, w: number, h: number) {
    const gl = this.gl;
    let f = this.fbos[i];
    if (!f || f.w !== w || f.h !== h) {
      const tex = this.texture();
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const fb = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      f = this.fbos[i] = { fb, tex, w, h };
    }
    return f;
  }

  private draw(prog: Prog, input: WebGLTexture, target: WebGLFramebuffer | null, w: number, h: number, scale: [number, number], mirror: boolean, setup?: () => void, srcRect: [number, number, number, number] = [0, 0, 1, 1]) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    const pos = gl.getAttribLocation(prog.p, "position");
    const tc = gl.getAttribLocation(prog.p, "texCoord");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(tc);
    gl.vertexAttribPointer(tc, 2, gl.FLOAT, false, 16, 8);
    gl.uniform2f(prog.u.scale, scale[0], scale[1]);
    gl.uniform1f(prog.u.mirror, mirror ? 1 : 0);
    // FBO textures are stored bottom-up; the source image is top-down.
    gl.uniform1f(prog.u.flipY, input === this.srcTex ? 0 : 1);
    gl.uniform4f(prog.u.srcRect, srcRect[0], srcRect[1], srcRect[2], srcRect[3]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(prog.u.inputImageTexture, 0);
    setup?.();
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Render `source` cover-fit into the canvas' current size. */
  render(source: TexImageSource & { videoWidth?: number; width?: number }, sw: number, sh: number, params: RenderParams) {
    const gl = this.gl;
    const w = this.canvas.width, h = this.canvas.height;
    if (!sw || !sh || !w || !h) return;
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    // crop (camera zoom / editor crop), clamped to the source; mirror flips inside the crop rect
    const c = params.crop;
    const cx = c ? Math.max(0, Math.min(1, c.x)) : 0, cy = c ? Math.max(0, Math.min(1, c.y)) : 0;
    const cw = c ? Math.max(1e-3, Math.min(1 - cx, c.w)) : 1, ch = c ? Math.max(1e-3, Math.min(1 - cy, c.h)) : 1;
    const cropped = cw < 0.9999 || ch < 0.9999;
    const srcRect: [number, number, number, number] = [cx, cy, cw, ch];

    // cover fit: scale the quad beyond the viewport on the overflowing axis
    const sa = (sw * cw) / (sh * ch), da = w / h;
    const scale: [number, number] = sa > da ? [sa / da, 1] : [1, da / sa];
    const one: [number, number] = [1, 1];

    // pass 1: source -> fbo0 (crop / cover / mirror) with skin smoothing
    const f0 = this.fbo(0, w, h);
    this.draw(this.smoothProg, this.srcTex, f0.fb, w, h, scale, !!params.mirror, () => {
      // footprint grows with the output size so previews and full-resolution exports match
      const k = Math.max(1, Math.min(w, h) / 640);
      gl.uniform2f(this.smoothProg.u.texelSize, (k * cw) / (w * scale[0]), (k * ch) / (h * scale[1]));
      gl.uniform1f(this.smoothProg.u.smoothAmount, params.smooth);
    }, srcRect);

    const adjust = params.adjust;
    const tone = params.tone && (Math.abs(params.tone.coolWarm) > 0.005 || Math.abs(params.tone.tanLight) > 0.005 || (params.tone.skinTone && params.tone.skinToneValue > 0.005)) ? params.tone : undefined;
    const edit = params.edit;
    const extra: ((input: WebGLTexture, target: WebGLFramebuffer | null) => void)[] = [];
    if (tone) extra.push((i, t) => this.tonePass(i, t, w, h, tone));
    if (adjust) extra.push((i, t) => {
      this.draw(this.adjust, i, t, w, h, one, false, () => {
        gl.uniform2f(this.adjust.u.texelSize, 1 / w, 1 / h);
        for (const [k, v] of Object.entries(adjust)) gl.uniform1f(this.adjust.u[k], v);
      });
    });
    if (edit) extra.push((i, t) => this.editPass(i, t, w, h, edit));

    const f1 = extra.length ? this.fbo(1, w, h) : null;
    const cube = params.lut ? this.luts.get(params.lut) : undefined;
    if (params.lut && !cube) void this.loadLut(params.lut);
    const bright = this.luts.get(T("whiten"));
    // face passes: reshape / makeup / liquify / stickers in canvas space
    let cubeInput = f0.tex;
    if (!this.faceFailed && faceParamsActive(params.face)) {
      try {
        this.facePipe ??= new FacePipeline(gl);
        let face = params.face!;
        let mapping = { sx: scale[0], sy: scale[1], mirror: !!params.mirror };
        if (cropped && face.space !== "view") {
          const centered = Math.abs(cx + cw / 2 - 0.5) < 1e-4 && Math.abs(cy + ch / 2 - 0.5) < 1e-4;
          // a centered crop is a plain scale about the center (folds into the mapping); an off-center crop
          // re-expresses the faces in crop-normalized coords instead
          if (centered) mapping = { sx: scale[0] / cw, sy: scale[1] / ch, mirror: !!params.mirror };
          else face = { ...face, faces: face.faces.map((f) => cropFace(f, cx, cy, cw, ch)) };
        }
        cubeInput = this.facePipe.run(f0.tex, w, h, face, mapping);
      } catch (err) {
        // never take the camera / editor down because of a face pass
        this.faceFailed = true;
        cubeInput = f0.tex;
        console.error("face pipeline disabled:", err);
      }
    }
    this.draw(this.cubeProg, cubeInput, f1 ? f1.fb : null, w, h, one, false, () => {
      this.bindTex(1, cube, this.cubeProg.u.filterCube);
      gl.uniform1f(this.cubeProg.u.intensity, cube ? params.intensity : 0);
      this.bindTex(2, bright, this.cubeProg.u.brightenCube);
      gl.uniform1f(this.cubeProg.u.brighten, bright ? params.whiten : 0);
    });

    // tone / adjust / edit, ping-ponging between fbo 1 and fbo 0
    let cur = f1;
    extra.forEach((pass, idx) => {
      const last = idx === extra.length - 1;
      const next = last ? null : this.fbo(cur === this.fbos[1] ? 0 : 1, w, h);
      pass(cur!.tex, next ? next.fb : null);
      cur = next;
    });
  }

  /** Engine table texture (starts loading on first use; undefined until ready). */
  private table(id: string, repeat = false) {
    const key = T(id);
    if (this.luts.has(key)) return this.luts.get(key)!;
    void this.loadLut(key, tableUrl(id)).then(() => { if (repeat) this.setRepeat(key); });
    return undefined;
  }

  private setRepeat(key: string) {
    const gl = this.gl, t = this.luts.get(key);
    if (!t) return;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  }

  /** Preload every table the editor passes need (plus the given skin tone presets); resolves when ready. */
  preloadEditTextures(skinTones: string[] = []): Promise<void> {
    const ids: [string, boolean][] = [
      ["grain", true], ["skin-warm", false], ["skin-cool", false], ["skin-light", false], ["skin-tan", false],
      ...skinTones.flatMap((k) => [[`skintone-${k}-skin`, false], [`skintone-${k}-bg`, false]] as [string, boolean][]),
    ];
    return Promise.all(ids.map(([id, rep]) => this.loadLut(T(id), tableUrl(id)).then(() => { if (rep) this.setRepeat(T(id)); }))).then(() => undefined);
  }

  private bindTex(unit: number, tex: WebGLTexture | undefined, loc: WebGLUniformLocation | null | undefined) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex ?? this.srcTex);
    gl.uniform1i(loc ?? null, unit);
  }

  private tonePass(input: WebGLTexture, target: WebGLFramebuffer | null, w: number, h: number, t: ToneParams) {
    const gl = this.gl;
    this.toneProg ??= this.program(TONE_FRAG, TONE_UNIFORMS);
    const p = this.toneProg;
    const cw = this.table(t.coolWarm >= 0 ? "skin-warm" : "skin-cool");
    const tl = this.table(t.tanLight >= 0 ? "skin-light" : "skin-tan");
    const st = t.skinTone ? this.table(`skintone-${t.skinTone}-skin`) : undefined;
    const sb = t.skinTone ? this.table(`skintone-${t.skinTone}-bg`) : undefined;
    this.draw(p, input, target, w, h, [1, 1], false, () => {
      this.bindTex(1, cw, p.u.coolWarmLut);
      this.bindTex(2, tl, p.u.tanLightLut);
      this.bindTex(3, st, p.u.skinLut);
      this.bindTex(4, sb, p.u.bgLut);
      gl.uniform1f(p.u.coolWarm, cw ? t.coolWarm : 0);
      gl.uniform1f(p.u.tanLight, tl ? t.tanLight : 0);
      gl.uniform1f(p.u.skinTone, st && sb ? t.skinToneValue : 0);
    });
  }

  /** Gaussian blur of `input` with sigma = `sigmaFrac` of the short side, into fbo slots base..base+1. */
  private blurred(input: WebGLTexture, w: number, h: number, sigmaFrac: number, base: number): WebGLTexture {
    const gl = this.gl;
    this.down ??= this.program(DOWN_FRAG, ["footprint"]);
    this.blur ??= this.program(BLUR_FRAG, ["dir"]);
    // downsample so that sigma == 2 small texels
    const k = Math.min(1, 2 / (sigmaFrac * Math.min(w, h)));
    const sw = Math.max(4, Math.round(w * k)), sh = Math.max(4, Math.round(h * k));
    const a = this.fbo(base, sw, sh), b = this.fbo(base + 1, sw, sh);
    this.draw(this.down, input, a.fb, sw, sh, [1, 1], false, () => gl.uniform2f(this.down!.u.footprint, 1 / sw, 1 / sh));
    this.draw(this.blur, a.tex, b.fb, sw, sh, [1, 1], false, () => gl.uniform2f(this.blur!.u.dir, 1 / sw, 0));
    this.draw(this.blur, b.tex, a.fb, sw, sh, [1, 1], false, () => gl.uniform2f(this.blur!.u.dir, 0, 1 / sh));
    return a.tex;
  }

  private editPass(input: WebGLTexture, target: WebGLFramebuffer | null, w: number, h: number, e: EditAdjust) {
    const gl = this.gl;
    this.editProg ??= this.program(EDIT_FRAG, EDIT_UNIFORMS);
    const p = this.editProg;
    const needBase = e.sharpen > 0.005 || Math.abs(e.highlights) > 0.005 || Math.abs(e.shadows) > 0.005 || Math.abs(e.lux) > 0.005
      || Math.abs(e.texture) > 0.005 || Math.abs(e.brilliance) > 0.005;
    const bl = needBase ? this.blurred(input, w, h, 0.015, 2) : input;
    const co = Math.abs(e.clarity) > 0.005 ? this.blurred(input, w, h, 0.04, 4) : input;
    if (e.curves) {
      this.curvesTex ??= this.texture();
      gl.bindTexture(gl.TEXTURE_2D, this.curvesTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, e.curves);
    }
    const grain = this.table("grain", true);
    this.draw(p, input, target, w, h, [1, 1], false, () => {
      this.bindTex(1, bl, p.u.blurred);
      this.bindTex(2, co, p.u.coarse);
      this.bindTex(3, grain, p.u.grainTex);
      this.bindTex(4, e.curves ? this.curvesTex : undefined, p.u.curvesTex);
      gl.uniform2f(p.u.resolution, w, h);
      const f = (n: string, v: number) => gl.uniform1f(p.u[n], v);
      f("autoTone", e.lux); f("brightness", e.brightness); f("contrast", e.contrast); f("clarity", e.clarity);
      f("brilliance", e.brilliance); f("saturation", e.saturation); f("sharpen", e.sharpen);
      f("detail", e.texture); f("highlights", e.highlights); f("shadows", e.shadows); f("fade", e.fade);
      f("grain", grain ? e.grain : 0); f("warmth", e.warmth); f("tint", e.tint); f("vignette", e.vignette);
      f("useCurves", e.curves ? 1 : 0);
      const hsl = e.hsl && e.hsl.some((v) => Math.abs(v) > 0.001) ? e.hsl : null;
      f("useHsl", hsl ? 1 : 0);
      gl.uniform3fv(p.u.hslShift, new Float32Array(hsl ?? new Array(21).fill(0)));
      const s = e.split;
      gl.uniform3fv(p.u.splitShadowColor, s?.shadowColor ?? [0.5, 0.5, 0.5]);
      gl.uniform3fv(p.u.splitHighlightColor, s?.highlightColor ?? [0.5, 0.5, 0.5]);
      f("splitShadow", s?.shadow ?? 0);
      f("splitHighlight", s?.highlight ?? 0);
    });
  }

  /** The face pass chain (created on first use); exposes its image cache for preloading sticker / makeup textures. */
  get face(): FacePipeline {
    this.facePipe ??= new FacePipeline(this.gl);
    return this.facePipe;
  }

  /** Largest texture side this context supports (for full-resolution export). */
  get maxTextureSize(): number {
    return this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number;
  }

  toBlob(type = "image/jpeg", quality = 0.95): Promise<Blob> {
    return new Promise((res, rej) => this.canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), type, quality));
  }

  /** Frees GL objects. The context itself is kept: the canvas may be reused (e.g. React StrictMode remount). */
  dispose() {
    const gl = this.gl;
    for (const t of this.luts.values()) gl.deleteTexture(t);
    for (const f of this.fbos) { gl.deleteFramebuffer(f.fb); gl.deleteTexture(f.tex); }
    gl.deleteTexture(this.srcTex);
    gl.deleteBuffer(this.quad);
    for (const p of [this.smoothProg, this.cubeProg, this.adjust]) gl.deleteProgram(p.p);
    this.facePipe?.dispose();
    this.facePipe = undefined;
    this.luts.clear();
    this.fbos = [];
  }
}
