#!/usr/bin/env node
// Built-in music library of the open pack: the tracks the camera, the capture review and the video editor offer
// when no music provider is configured (served by /api/music). Every loop is synthesised here from scratch
// (additive pads, Karplus-Strong plucks, FM bells, sine bass and noise percussion, all driven by a seeded PRNG),
// rendered to WAV and encoded to MP3 with ffmpeg when it is available (otherwise the WAV is kept). No samples or
// recordings are used, so the audio is original and covered by the pack's MIT licence.
//
//   music/<id>.mp3 (or .wav)    ~20 s loops, mono 22.05 kHz
//   manifest kind "music"       { <id>: { path, type, license, meta: { title, artist, mood, bpm, duration } } }
//
// Run: node scripts/gen-music.mjs
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { PACK_DIR, readManifest, rng, runAsMain, updateManifest, writePack } from "./gen-lib/pack.mjs";

const SR = 22050;
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

/**
 * Track recipes. `prog` = chord roots (semitones above `key`) with a quality, one chord per bar.
 * `parts` picks the instruments; `swing` delays off-beat 16ths.
 */
const TRACKS = [
  { id: "morning-light", title: "Morning Light", mood: "Calm", bpm: 84, key: 57, bars: 8, seed: 11,
    prog: [[0, "maj7"], [5, "maj7"], [9, "m7"], [7, "dom7"]], parts: ["pad", "pluck", "kick", "hat", "bass"], swing: 0.12 },
  { id: "neon-drive", title: "Neon Drive", mood: "Energetic", bpm: 112, key: 52, bars: 10, seed: 23,
    prog: [[0, "min"], [8, "maj"], [3, "maj"], [10, "maj"]], parts: ["pad", "arp", "kick", "snare", "hat", "bass8"], swing: 0 },
  { id: "paper-boats", title: "Paper Boats", mood: "Warm", bpm: 96, key: 60, bars: 8, seed: 37,
    prog: [[0, "maj"], [7, "maj"], [9, "min"], [5, "maj"]], parts: ["pluck", "bell", "bass", "shaker"], swing: 0.08 },
  { id: "sunday-market", title: "Sunday Market", mood: "Upbeat", bpm: 122, key: 55, bars: 10, seed: 41,
    prog: [[0, "maj"], [5, "maj"], [7, "maj"], [5, "maj"]], parts: ["pluck", "bell", "kick", "clap", "hat", "bass"], swing: 0.05 },
  { id: "slow-tide", title: "Slow Tide", mood: "Dreamy", bpm: 68, key: 50, bars: 6, seed: 53,
    prog: [[0, "add9"], [5, "maj7"], [3, "maj7"], [10, "add9"]], parts: ["pad", "bell", "bass"], swing: 0 },
  { id: "pocket-beat", title: "Pocket Beat", mood: "Chill", bpm: 88, key: 53, bars: 8, seed: 67,
    prog: [[0, "m7"], [5, "m7"], [10, "dom7"], [3, "maj7"]], parts: ["pad", "kick", "snare", "hat", "bass", "bell"], swing: 0.16 },
  { id: "lantern-walk", title: "Lantern Walk", mood: "Mellow", bpm: 76, key: 58, bars: 6, seed: 79,
    prog: [[0, "add9"], [9, "m7"], [5, "maj7"], [7, "add9"]], parts: ["pad", "pluck", "bass", "shaker"], swing: 0.1 },
  { id: "kite-day", title: "Kite Day", mood: "Bright", bpm: 128, key: 62, bars: 12, seed: 83,
    prog: [[0, "maj"], [7, "maj"], [9, "min"], [5, "maj"]], parts: ["arp", "bell", "kick", "clap", "hat", "bass8"], swing: 0 },
];

const QUALITY = {
  maj: [0, 4, 7], min: [0, 3, 7], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], dom7: [0, 4, 7, 10], add9: [0, 4, 7, 14],
};

/** Render one track to a Float32Array (mono, SR). */
function render(t) {
  const rand = rng(t.seed);
  const beat = 60 / t.bpm, bar = beat * 4, dur = bar * t.bars;
  const n = Math.ceil(dur * SR);
  const out = new Float32Array(n);
  const add = (start, buf, gain) => {
    const s0 = Math.round(start * SR);
    for (let i = 0; i < buf.length && s0 + i < n; i++) out[s0 + i] += buf[i] * gain;
  };
  const env = (len, a, r) => (i) => { const x = i / SR; return Math.min(1, x / a) * Math.min(1, Math.max(0, (len - x) / r)); };

  // --- instruments (each returns a Float32Array) ---
  const pad = (notes, len) => {
    const b = new Float32Array(Math.ceil(len * SR)), e = env(len, 0.6, 0.8);
    let lp = 0;
    for (let i = 0; i < b.length; i++) {
      const x = i / SR;
      let s = 0;
      for (const m of notes) for (const det of [-0.07, 0.07]) {
        const f = midiHz(m + det);
        for (let h = 1; h <= 5; h++) s += Math.sin(2 * Math.PI * f * h * x + h) / (h * 1.6);
      }
      lp += 0.08 * (s - lp);
      b[i] = lp * e(i) / (notes.length * 2);
    }
    return b;
  };
  const pluck = (m, len, bright = 0.5) => { // Karplus-Strong
    const f = midiHz(m), p = Math.max(2, Math.round(SR / f));
    const ring = new Float32Array(p).map(() => rand() * 2 - 1);
    const b = new Float32Array(Math.ceil(len * SR));
    let idx = 0;
    const damp = 0.996 - (1 - bright) * 0.004;
    for (let i = 0; i < b.length; i++) {
      const nx = (idx + 1) % p;
      const v = ring[idx];
      ring[idx] = damp * 0.5 * (v + ring[nx]);
      b[i] = v;
      idx = nx;
    }
    return b;
  };
  const bell = (m, len) => { // two-operator FM
    const f = midiHz(m), b = new Float32Array(Math.ceil(len * SR));
    for (let i = 0; i < b.length; i++) {
      const x = i / SR, d = Math.exp(-x * 3.2);
      b[i] = Math.sin(2 * Math.PI * f * x + 2.2 * d * Math.sin(2 * Math.PI * f * 3.5 * x)) * d;
    }
    return b;
  };
  const bass = (m, len) => {
    const f = midiHz(m), b = new Float32Array(Math.ceil(len * SR)), e = env(len, 0.01, 0.12);
    for (let i = 0; i < b.length; i++) {
      const x = i / SR;
      b[i] = (Math.sin(2 * Math.PI * f * x) + 0.3 * Math.sin(4 * Math.PI * f * x)) * e(i);
    }
    return b;
  };
  const kick = () => {
    const b = new Float32Array(Math.ceil(0.35 * SR));
    let ph = 0;
    for (let i = 0; i < b.length; i++) {
      const x = i / SR, f = 45 + 95 * Math.exp(-x * 28);
      ph += (2 * Math.PI * f) / SR;
      b[i] = Math.sin(ph) * Math.exp(-x * 9);
    }
    return b;
  };
  const noise = (len, decay, hp) => {
    const b = new Float32Array(Math.ceil(len * SR));
    let prev = 0, lp = 0;
    for (let i = 0; i < b.length; i++) {
      const w = rand() * 2 - 1;
      const v = hp ? w - prev : (lp += 0.35 * (w - lp));
      prev = w;
      b[i] = v * Math.exp((-i / SR) * decay);
    }
    return b;
  };

  const step = beat / 4;
  const at = (barIdx, s16) => barIdx * bar + s16 * step + (s16 % 2 ? t.swing * step : 0);
  const has = (p) => t.parts.includes(p);
  const scale = [0, 2, 4, 7, 9, 12, 14, 16]; // major pentatonic over the key, for melodies

  for (let b = 0; b < t.bars; b++) {
    const [root, q] = t.prog[b % t.prog.length];
    const chord = QUALITY[q].map((iv) => t.key + root + iv);
    if (has("pad")) add(b * bar, pad(chord, bar + 0.4), 0.22);
    if (has("pluck")) for (let s = 0; s < 16; s += 2) {
      if (rand() < 0.25 && s % 4) continue;
      add(at(b, s), pluck(chord[(s / 2) % chord.length] + 12, step * 3, 0.6), 0.28);
    }
    if (has("arp")) for (let s = 0; s < 16; s++) add(at(b, s), pluck(chord[s % chord.length] + 12 * (1 + (s >> 3)), step * 1.5, 0.9), 0.16);
    if (has("bell") && b % 2 === 1) for (let s = 0; s < 16; s += 4) {
      if (rand() < 0.4) continue;
      add(at(b, s + (rand() < 0.5 ? 2 : 0)), bell(t.key + 12 + scale[Math.floor(rand() * scale.length)], 1.4), 0.12);
    }
    if (has("bass")) for (let s = 0; s < 16; s += 4) add(at(b, s), bass(t.key + root - 24 + (s === 12 && rand() < 0.5 ? 7 : 0), step * 3.5), 0.35);
    if (has("bass8")) for (let s = 0; s < 16; s += 2) add(at(b, s), bass(t.key + root - 24 + (s % 4 ? 12 : 0), step * 1.6), 0.28);
    if (has("kick")) for (const s of [0, 8, ...(rand() < 0.5 ? [10] : [])]) add(at(b, s), kick(), 0.7);
    if (has("snare")) for (const s of [4, 12]) add(at(b, s), noise(0.22, 18, false), 0.3);
    if (has("clap")) for (const s of [4, 12]) for (const d of [0, 0.011, 0.023]) add(at(b, s) + d, noise(0.12, 30, true), 0.12);
    if (has("hat")) for (let s = 0; s < 16; s += 2) add(at(b, s), noise(0.06, 70, true), s % 4 ? 0.09 : 0.05);
    if (has("shaker")) for (let s = 0; s < 16; s++) add(at(b, s), noise(0.05, 60, true), s % 2 ? 0.05 : 0.025);
  }

  // master: normalise, soft clip, short fades so the loop restarts cleanly
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const g = peak ? 0.9 / peak : 1, fade = Math.round(0.03 * SR), tail = Math.round(0.8 * SR);
  for (let i = 0; i < n; i++) {
    let v = Math.tanh(out[i] * g * 1.2) / Math.tanh(1.2);
    if (i < fade) v *= i / fade;
    if (i > n - tail) v *= (n - i) / tail;
    out[i] = v;
  }
  return { pcm: out, duration: dur };
}

/** 16-bit PCM WAV file. */
function wav(pcm) {
  const data = Buffer.alloc(pcm.length * 2);
  for (let i = 0; i < pcm.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, pcm[i])) * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

const hasFfmpeg = () => { try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; } catch { return false; } };

export async function generate() {
  const ffmpeg = hasFfmpeg();
  if (!ffmpeg) console.warn("gen-music: ffmpeg not found, writing WAV files");
  rmSync(join(PACK_DIR, "music"), { recursive: true, force: true });
  const entries = {};
  for (const t of TRACKS) {
    const { pcm, duration } = render(t);
    const wavRel = writePack(`music/${t.id}.wav`, wav(pcm));
    let rel = wavRel, type = "audio/wav";
    if (ffmpeg) {
      rel = `music/${t.id}.mp3`; type = "audio/mpeg";
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", join(PACK_DIR, wavRel), "-c:a", "libmp3lame", "-b:a", "96k",
        "-map_metadata", "-1", "-fflags", "+bitexact", "-metadata", `title=${t.title}`, "-metadata", "artist=Open_Edit", join(PACK_DIR, rel)]);
      rmSync(join(PACK_DIR, wavRel));
    }
    entries[t.id] = { path: rel, type, license: "MIT", meta: { title: t.title, artist: "Open_Edit", mood: t.mood, bpm: t.bpm, duration: Math.round(duration * 10) / 10 } };
  }
  // the music library moved from the "content" kind to its own kind
  const m = readManifest();
  if (m.kinds?.content) { delete m.kinds.content.music; if (!Object.keys(m.kinds.content).length) delete m.kinds.content; writePack("manifest.json", JSON.stringify(m, null, 1) + "\n"); }
  rmSync(join(PACK_DIR, "content"), { recursive: true, force: true });
  updateManifest({ music: entries });
  return { tracks: Object.keys(entries).length, format: ffmpeg ? "mp3" : "wav" };
}

if (runAsMain(import.meta.url)) console.log(await generate());
