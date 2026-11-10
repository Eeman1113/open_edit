// Whole-image creative effects (photo editor Effects tab, video editor Effects tab).
// Each effect is one fragment shader that runs as the last pass of the Renderer (see renderer.ts, `fx`). Inputs:
//   inputImageTexture  the graded photo / frame
//   blurTex            a gaussian-blurred copy (effects with `blur`; sigma as a fraction of the short side)
//   fxTex              an overlay texture from the asset pack (kind "fx", made by scripts/gen-effects.mjs)
//   resolution         output size in pixels; patterns are laid out in short-side units so the preview and the
//                      full-resolution export look the same
//   amount             0..1 intensity
//   time               seconds (animated effects move in videos; photos render at time 0)
// All shaders are written for this project.

export interface EffectDef {
  id: string;
  name: string;
  /** Default intensity. */
  amount: number;
  /** Blurred input needed (gaussian sigma as a fraction of the short side). */
  blur?: number;
  /** Overlay texture id (asset kind "fx"). */
  tex?: string;
  /** Overlay texture tiles (repeat wrap). */
  repeat?: boolean;
  /** Moves over time in videos. */
  animated?: boolean;
  /** Fragment body: defines `vec3 effect(vec3 c)`. */
  glsl: string;
}

export interface EffectParams { id: string; amount: number; time?: number }

export const FX_UNIFORMS = ["inputImageTexture", "blurTex", "fxTex", "resolution", "amount", "time", "hasTex"];

const HEADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying highp vec2 textureCoordinate;
uniform sampler2D inputImageTexture;
uniform sampler2D blurTex;
uniform sampler2D fxTex;
uniform vec2 resolution;
uniform float amount;
uniform float time;
uniform float hasTex;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
// image space: x right, y down, 0..1
vec2 imgUv() { return vec2(textureCoordinate.x, 1.0 - textureCoordinate.y); }
// short-side units: the short side spans 0..1
vec2 unitPos() { return imgUv() * resolution / min(resolution.x, resolution.y); }
vec3 src(vec2 imgPos) { return texture2D(inputImageTexture, vec2(imgPos.x, 1.0 - imgPos.y)).rgb; }
vec3 blurAt(vec2 imgPos) { return texture2D(blurTex, vec2(imgPos.x, 1.0 - imgPos.y)).rgb; }
float hash12(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec2 hash22(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
vec3 screen(vec3 a, vec3 b) { return 1.0 - (1.0 - a) * (1.0 - b); }
vec3 hue(float h) { return clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0); }
float vignette(float k) { vec2 p = imgUv() - 0.5; return 1.0 - k * smoothstep(0.3, 0.85, length(p) * 1.25); }
// film-like grain, fixed to the short side (about 900 cells across) and refreshed every 1/24 s
float grain() { vec2 p = floor(unitPos() * 900.0); return hash12(p + floor(time * 24.0) * 17.0) - 0.5; }
`;

const FOOTER = `
void main() {
  vec4 s = texture2D(inputImageTexture, textureCoordinate);
  gl_FragColor = vec4(clamp(effect(s.rgb), 0.0, 1.0), s.a);
}`;

export const EFFECTS: EffectDef[] = [
  {
    id: "lightleak", name: "Light leak", amount: 0.7, tex: "lightleak", animated: true,
    glsl: `
vec3 effect(vec3 c) {
  vec2 uv = imgUv();
  // the leak breathes slowly in videos
  vec2 drift = vec2(sin(time * 0.35), cos(time * 0.27)) * 0.04;
  vec3 leak = hasTex > 0.5 ? texture2D(fxTex, clamp(uv * 0.92 + drift + 0.02, 0.0, 1.0)).rgb : vec3(0.0);
  float pulse = 0.85 + 0.15 * sin(time * 0.9);
  vec3 warm = c * vec3(1.04, 1.0, 0.94) + vec3(0.02, 0.01, 0.0);
  vec3 o = screen(mix(c, warm, amount), leak * amount * 1.1 * pulse);
  return o;
}`,
  },
  {
    id: "dust", name: "Film dust", amount: 0.7, tex: "dust", repeat: true, animated: true,
    glsl: `
vec3 effect(vec3 c) {
  vec2 p = unitPos();
  // a new dust frame every 1/12 s in videos
  float f = floor(time * 12.0);
  vec2 off = hash22(vec2(f, 3.7)) * step(0.001, time);
  vec3 d = hasTex > 0.5 ? texture2D(fxTex, p * 0.85 + off).rgb : vec3(0.0);
  // faded, slightly warm film base
  float y = dot(c, LUMA);
  vec3 film = mix(vec3(y), c, 0.82);
  film = film * vec3(1.03, 1.0, 0.93) * 0.92 + vec3(0.05, 0.04, 0.03);
  film += grain() * 0.09;
  film = film + d.r * 0.55 - d.g * 0.5;
  film *= vignette(0.35);
  return mix(c, film, amount);
}`,
  },
  {
    id: "glow", name: "Glow", amount: 0.6, blur: 0.025,
    glsl: `
vec3 effect(vec3 c) {
  vec3 b = blurAt(imgUv());
  float l = dot(b, LUMA);
  vec3 bloom = b * smoothstep(0.35, 0.95, l) * 1.4;
  return screen(c, bloom * amount);
}`,
  },
  {
    id: "dream", name: "Dreamy", amount: 0.6, blur: 0.012,
    glsl: `
vec3 effect(vec3 c) {
  vec3 b = blurAt(imgUv());
  vec3 soft = screen(c, b * 0.55);
  float y = dot(soft, LUMA);
  soft = mix(vec3(y), soft, 0.85) * vec3(1.02, 0.99, 1.03) + vec3(0.03, 0.02, 0.05);
  return mix(c, soft, amount);
}`,
  },
  {
    id: "prism", name: "Prism", amount: 0.6,
    glsl: `
vec3 effect(vec3 c) {
  vec2 uv = imgUv();
  vec2 dir = normalize(vec2(1.0, -0.6)) * vec2(min(resolution.x, resolution.y) / resolution.x, min(resolution.x, resolution.y) / resolution.y);
  float k = 0.012 * amount;
  vec3 split = vec3(src(uv + dir * k).r, c.g, src(uv - dir * k).b);
  // a band of spectrum light crossing the frame
  vec2 p = unitPos();
  float t = dot(p, normalize(vec2(1.0, 0.75))) - 0.55 * (resolution.x / min(resolution.x, resolution.y));
  float band = exp(-t * t / 0.02);
  vec3 rainbow = hue(fract(t * 2.2 + 0.1)) * band * 0.45;
  return screen(mix(c, split, min(1.0, amount * 1.5)), rainbow * amount);
}`,
  },
  {
    id: "chroma", name: "Colour shift", amount: 0.6,
    glsl: `
vec3 effect(vec3 c) {
  vec2 uv = imgUv();
  vec2 d = (uv - 0.5);
  vec2 off = d * length(d) * 0.06 * amount;
  vec3 o = vec3(src(uv - off).r, c.g, src(uv + off).b);
  return o * vignette(0.25 * amount);
}`,
  },
  {
    id: "vhs", name: "Tape", amount: 0.7, animated: true,
    glsl: `
vec3 effect(vec3 c) {
  vec2 uv = imgUv();
  float lines = 300.0;
  float row = floor(uv.y * lines);
  float f = floor(time * 30.0);
  // tracking band rolling down the frame
  float band = fract(0.68 + time * 0.07);
  float inBand = exp(-pow((uv.y - band) * 18.0, 2.0));
  float jitter = (hash12(vec2(row, f)) - 0.5) * (0.002 + inBand * 0.02);
  vec2 q = vec2(uv.x + jitter * amount, uv.y);
  float bleed = 0.004 * amount;
  vec3 v = vec3(src(q + vec2(bleed, 0.0)).r, src(q).g, src(q - vec2(bleed, 0.0)).b);
  float y = dot(v, LUMA);
  v = mix(vec3(y), v, 0.8) * vec3(1.02, 1.0, 1.06);
  v = (v - 0.5) * 0.9 + 0.52;
  v *= 0.9 + 0.1 * sin(uv.y * lines * 3.14159);
  v += (hash12(vec2(floor(uv.x * 240.0), row) + f) - 0.5) * (0.06 + inBand * 0.3);
  v *= vignette(0.4);
  return mix(c, v, amount);
}`,
  },
  {
    id: "glitch", name: "Glitch", amount: 0.6, animated: true,
    glsl: `
vec3 effect(vec3 c) {
  vec2 uv = imgUv();
  float f = floor(time * 8.0);
  float rows = 18.0;
  float r = floor(uv.y * rows);
  float h = hash12(vec2(r, f + 1.0));
  float blockX = floor(uv.x * 4.0);
  float hit = step(1.0 - 0.35 * amount, h) * step(0.3, hash12(vec2(blockX, r + f * 3.0)));
  float shift = (hash12(vec2(r, f + 7.0)) - 0.5) * 0.12 * amount * hit;
  vec2 q = vec2(fract(uv.x + shift), uv.y);
  float s = 0.008 * amount + hit * 0.01;
  vec3 g = vec3(src(q + vec2(s, 0.0)).r, src(q).g, src(q - vec2(s, 0.0)).b);
  // some displaced blocks lose a channel
  float drop = hit * step(0.6, hash12(vec2(r, f + 11.0)));
  g = mix(g, vec3(g.r, g.g * 0.4, g.b * 1.2), drop);
  return mix(c, g, min(1.0, amount * 1.4));
}`,
  },
  {
    id: "halftone", name: "Halftone", amount: 0.8,
    glsl: `
vec3 effect(vec3 c) {
  float cell = 0.014;
  vec2 p = unitPos();
  float a = 0.7854; // 45 degree screen
  mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 rp = rot * p / cell;
  vec2 centre = (floor(rp) + 0.5);
  vec2 cp = transpose2(rot) * centre * cell;
  vec2 cuv = cp * min(resolution.x, resolution.y) / resolution;
  vec3 cc = src(clamp(cuv, 0.0, 1.0));
  float y = dot(cc, LUMA);
  float rad = sqrt(1.0 - y) * 0.62;
  float d = length(rp - centre);
  float aa = 0.06;
  float dotMask = 1.0 - smoothstep(rad - aa, rad + aa, d);
  vec3 paper = vec3(0.97, 0.95, 0.9);
  vec3 ink = cc * 0.75;
  vec3 h = mix(paper, ink, dotMask);
  return mix(c, h, amount);
}`,
  },
  {
    id: "duotone", name: "Duotone", amount: 0.85,
    glsl: `
vec3 effect(vec3 c) {
  float y = dot(c, LUMA);
  y = smoothstep(0.02, 0.98, y);
  vec3 lo = vec3(0.17, 0.11, 0.38);
  vec3 hi = vec3(1.0, 0.74, 0.42);
  vec3 d = mix(lo, hi, y);
  return mix(c, d, amount);
}`,
  },
  {
    id: "bokeh", name: "Bokeh", amount: 0.7, blur: 0.006, tex: "bokeh", animated: true,
    glsl: `
vec3 effect(vec3 c) {
  vec2 uv = imgUv();
  vec3 b = blurAt(uv);
  vec2 drift = vec2(time * 0.006, -time * 0.004);
  vec3 lights = hasTex > 0.5 ? texture2D(fxTex, fract(uv * vec2(1.0, resolution.y / resolution.x) * 0.9 + drift)).rgb : vec3(0.0);
  vec3 soft = mix(c, b, 0.3 * amount);
  return screen(soft, lights * amount);
}`,
  },
  {
    id: "rain", name: "Rain", amount: 0.7, animated: true,
    glsl: `
float rainLayer(vec2 p, float scale, float speed, float seed, float density) {
  p.x += p.y * 0.18;
  vec2 q = p * vec2(scale, scale * 0.22);
  float col = floor(q.x);
  q.y -= time * speed + hash12(vec2(col, seed)) * 7.0;
  vec2 id = floor(q);
  vec2 f = fract(q);
  float h = hash12(id + seed);
  float on = step(1.0 - density, h);
  float x = abs(f.x - 0.2 - h * 0.6);
  float streak = (1.0 - smoothstep(0.0, 0.07, x)) * smoothstep(0.0, 0.55, f.y) * (1.0 - smoothstep(0.55, 0.75, f.y));
  return streak * on;
}
vec3 effect(vec3 c) {
  vec2 p = unitPos();
  float r = rainLayer(p, 60.0, 9.0, 1.0, 0.25) * 0.55 + rainLayer(p, 34.0, 6.0, 2.0, 0.22) * 0.7 + rainLayer(p, 18.0, 3.5, 3.0, 0.15);
  vec3 wet = c * vec3(0.9, 0.95, 1.02) * 0.92;
  wet = (wet - 0.5) * 0.92 + 0.5;
  vec3 o = mix(c, wet, amount);
  return o + r * 0.42 * amount * vec3(0.92, 0.96, 1.0);
}`,
  },
  {
    id: "snow", name: "Snow", amount: 0.7, animated: true,
    glsl: `
float snowLayer(vec2 p, float scale, float speed, float seed, float size) {
  vec2 q = p * scale;
  q.y -= time * speed;
  q.x += sin(q.y * 0.6 + seed) * 0.35;
  vec2 id = floor(q);
  vec2 f = fract(q);
  float acc = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 o = vec2(float(i), float(j));
    vec2 h = hash22(id + o + seed);
    vec2 pos = o + 0.15 + h * 0.7;
    pos.x += sin(time * 1.3 + h.y * 6.28) * 0.12;
    float r = size * (0.5 + h.x * 0.7);
    float on = step(0.45, hash12(id + o + seed * 1.7));
    acc += (1.0 - smoothstep(r * 0.35, r, length(f - pos))) * on;
  }
  return acc;
}
vec3 effect(vec3 c) {
  vec2 p = unitPos();
  float s = snowLayer(p, 26.0, 1.2, 4.0, 0.09) * 0.6 + snowLayer(p, 14.0, 0.8, 9.0, 0.1) * 0.85 + snowLayer(p, 7.0, 0.5, 13.0, 0.11);
  vec3 cold = mix(c, c * vec3(0.94, 0.98, 1.06) + 0.05, amount);
  return cold + min(1.0, s) * amount * 0.95;
}`,
  },
  {
    id: "sparkle", name: "Sparkle", amount: 0.7, animated: true,
    glsl: `
vec3 effect(vec3 c) {
  vec2 p = unitPos();
  float cell = 0.06;
  vec2 g = p / cell;
  vec2 id = floor(g);
  vec3 acc = vec3(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 cid = id + vec2(float(i), float(j));
    vec2 h = hash22(cid);
    vec2 sp = (cid + 0.2 + h * 0.6) * cell;
    vec2 suv = sp * min(resolution.x, resolution.y) / resolution;
    vec3 sc = src(clamp(suv, 0.0, 1.0));
    float l = dot(sc, LUMA);
    float bright = smoothstep(0.5, 0.9, l) * step(0.3, hash12(cid + 5.0));
    float tw = 0.6 + 0.4 * sin(time * 4.0 + h.x * 6.28);
    vec2 d = (p - sp) / cell;
    float size = (0.8 + h.y * 1.1) * bright * tw;
    // four-point star: two long thin streaks, two shorter diagonal ones and a soft core
    float sz = max(size, 0.01);
    float star = exp(-abs(d.x) * 45.0 / sz) * exp(-abs(d.y) * 2.6 / sz)
               + exp(-abs(d.y) * 45.0 / sz) * exp(-abs(d.x) * 2.6 / sz);
    vec2 r = vec2(d.x + d.y, d.x - d.y) * 0.7071;
    star += 0.45 * (exp(-abs(r.x) * 60.0 / sz) * exp(-abs(r.y) * 6.0 / sz)
                  + exp(-abs(r.y) * 60.0 / sz) * exp(-abs(r.x) * 6.0 / sz));
    star += exp(-dot(d, d) * 40.0 / (sz * sz)) * 0.9;
    acc += star * bright * mix(vec3(1.0), sc, 0.25);
  }
  return screen(c, min(acc, vec3(1.0)) * amount);
}`,
  },
];

const BY_ID = new Map(EFFECTS.map((e) => [e.id, e]));
export const effectById = (id: string | null | undefined) => (id ? BY_ID.get(id) : undefined);

/** GLSL ES 1.0 has no transpose(); a rotation matrix's inverse is its transpose. */
const TRANSPOSE = "mat2 transpose2(mat2 m) { return mat2(m[0][0], m[1][0], m[0][1], m[1][1]); }\n";

/** Complete fragment shader of one effect. */
export function effectFrag(def: EffectDef): string {
  return HEADER + TRANSPOSE + def.glsl + FOOTER;
}

/** True when the params describe an effect that changes the picture. */
export const effectActive = (p: EffectParams | null | undefined): p is EffectParams => !!p && p.amount > 0.001 && BY_ID.has(p.id);

/** Groups for the effect pickers (every effect is in exactly one). */
export const EFFECT_GROUPS: { id: string; label: string; ids: string[] }[] = [
  { id: "light", label: "Light", ids: ["lightleak", "glow", "dream", "bokeh", "sparkle"] },
  { id: "film", label: "Film", ids: ["dust", "vhs", "halftone", "duotone"] },
  { id: "lens", label: "Lens", ids: ["prism", "chroma", "glitch"] },
  { id: "weather", label: "Weather", ids: ["rain", "snow"] },
];
