#!/usr/bin/env python3
"""Verify filter LUTs: decode check, size, byte-identity with the APK .dat, and a CPU
re-implementation of the APK GPUImage lookup shader (p000/h2b.java) mixed by strength.

Usage: python3 scripts/verify-luts.py [test.jpg] [outdir]

For every LocalFilterType LUT it:
  1. checks public/lut/<name>.png == reversed(raw/assets/lut/<name>.dat) and decodes as 512x512,
  2. applies the LUT (front strength) to the test image and writes <outdir>/<key>.jpg,
  3. applies the LUT at strengths 0..1 to filterthumb_original and finds the strength that best
     matches filterthumb_<x> (mean abs error, 0..255) as a sanity check of LUT/thumbnail pairing.
"""
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "..", "extracted", "raw", "assets")
PUB = os.path.join(ROOT, "public")

# key, lut, backLut, strength, backStrength, thumb  (LocalFilterType)
FILTERS = [
    ("COTTON", "cotton", None, 0.6, 1.0, "filterthumb_cotton"),
    ("SUNNY", "sunny", None, 0.6, 0.8, "filterthumb_sunny"),
    ("FRUITY", "fruity", None, 0.6, 1.0, "filterthumb_fruity"),
    ("DAILY", "daily", "b_heart", 0.65, 0.6, "filterthumb_daily"),
    ("AQUA", "aqua", "b_clean", 0.7, 0.6, "filterthumb_aqua"),
    ("JELLY", "jelly", "b_pretty", 0.7, 0.6, "filterthumb_jelly"),
    ("MILK", "milk", None, 0.7, 1.0, "filterthumb_milk"),
    ("DAILY2", "daily2_lut", None, 0.8, 1.0, "filterthumb_natural"),
    ("PLAIN2", "plain2", "plain2_back", 0.4, 0.4, "filterthumb_plain2"),
    ("CLEAN", "clean", "b_clean", 0.8, 1.0, "filterthumb_clean"),
    ("HEART", "heart", "b_heart", 0.8, 1.0, "filterthumb_heart"),
    ("PRETTY", "pretty", "b_pretty", 1.0, 1.0, "filterthumb_pretty"),
    ("FANCY", "fancy", None, 0.8, 0.8, "filterthumb_fancy"),
    ("PRESET", "original", None, 0.8, 0.8, None),
]


def sample_bilinear(lut, x, y):
    """GL_LINEAR + CLAMP_TO_EDGE sampling; x,y normalised texture coords."""
    h, w, _ = lut.shape
    fx = np.clip(x * w - 0.5, 0, w - 1)
    fy = np.clip(y * h - 0.5, 0, h - 1)
    x0 = np.floor(fx).astype(np.int32)
    y0 = np.floor(fy).astype(np.int32)
    x1 = np.minimum(x0 + 1, w - 1)
    y1 = np.minimum(y0 + 1, h - 1)
    ax = (fx - x0)[..., None]
    ay = (fy - y0)[..., None]
    top = lut[y0, x0] * (1 - ax) + lut[y0, x1] * ax
    bot = lut[y1, x0] * (1 - ax) + lut[y1, x1] * ax
    return top * (1 - ay) + bot * ay


def lookup(img, lut):
    """Exact GPUImageLookupFilter math (h2b.java). img, lut float32 0..1 RGB."""
    r, g, b = img[..., 0], img[..., 1], img[..., 2]
    blue = b * 63.0
    q1y = np.floor(blue / 8.0)
    q1x = np.floor(blue) - q1y * 8.0
    q2y = np.floor(np.ceil(blue) / 7.999)
    q2x = np.ceil(blue) - q2y * 8.0
    k = 0.125 - 1.0 / 512.0
    t1x = q1x * 0.125 + 0.5 / 512.0 + k * r
    t1y = q1y * 0.125 + 0.5 / 512.0 + k * g
    t2x = q2x * 0.125 + 0.5 / 512.0 + k * r
    t2y = q2y * 0.125 + 0.5 / 512.0 + k * g
    c1 = sample_bilinear(lut, t1x, t1y)
    c2 = sample_bilinear(lut, t2x, t2y)
    f = (blue - np.floor(blue))[..., None]
    return c1 * (1 - f) + c2 * f


def apply(img, lut, strength):
    return img * (1 - strength) + lookup(img, lut) * strength


def load_rgb(path, max_side=None):
    im = Image.open(path).convert("RGB")
    if max_side and max(im.size) > max_side:
        im.thumbnail((max_side, max_side), Image.LANCZOS)
    return np.asarray(im, dtype=np.float32) / 255.0


def save(arr, path):
    Image.fromarray(np.clip(arr * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(path, quality=92)


def check_png(dir_pub, name, raw_dirs):
    path = os.path.join(dir_pub, name)
    im = Image.open(path)
    im.load()
    info = {"size": im.size, "mode": im.mode, "chunks": [k for k in ("icc_profile", "gamma", "srgb") if k in im.info]}
    stem = os.path.splitext(name)[0]
    for d in raw_dirs:
        dat = os.path.join(d, stem + ".dat")
        png = os.path.join(d, stem + ".png")
        if os.path.exists(dat):
            info["identical"] = open(dat, "rb").read()[::-1] == open(path, "rb").read()
            info["src"] = os.path.relpath(dat, os.path.join(ROOT, ".."))
            break
        if os.path.exists(png):
            info["identical"] = open(png, "rb").read() == open(path, "rb").read()
            info["src"] = os.path.relpath(png, os.path.join(ROOT, ".."))
            break
    return info


def main():
    test = sys.argv[1] if len(sys.argv) > 1 else None
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "scratch-filters")
    os.makedirs(out, exist_ok=True)

    print("== PNG decode / size / source identity ==")
    for sub, raws in (("lut", [os.path.join(RAW, "lut")]), ("kuru", [os.path.join(RAW, "kuru", "filters")])):
        for n in sorted(os.listdir(os.path.join(PUB, sub))):
            if not n.endswith(".png"):
                continue
            try:
                i = check_png(os.path.join(PUB, sub), n, raws)
                flag = "" if i["size"] == (512, 512) else "  <-- not 512x512"
                print(f"{sub}/{n:28s} {i['size'][0]}x{i['size'][1]} {i['mode']:5s} identical={i.get('identical')} "
                      f"chunks={i['chunks']}{flag}")
            except Exception as e:  # noqa: BLE001
                print(f"{sub}/{n:28s} DECODE FAIL {e}")

    luts = {}
    for _, lut, back, *_ in FILTERS:
        for n in filter(None, (lut, back)):
            luts[n] = np.asarray(Image.open(os.path.join(PUB, "lut", n + ".png")).convert("RGB"), dtype=np.float32) / 255.0

    # Identity check: original.dat should be (near) identity.
    ident = np.stack(np.meshgrid(np.linspace(0, 1, 32), np.linspace(0, 1, 32), indexing="xy"), -1)
    grid = np.concatenate([ident, np.full(ident.shape[:2] + (1,), 0.5)], -1).astype(np.float32)
    print(f"\noriginal.png identity error (mean abs, 0..255): {np.abs(lookup(grid, luts['original']) - grid).mean() * 255:.2f}")

    print("\n== Thumbnail sanity (LUT applied to filterthumb_original; best-fit strength) ==")
    base = load_rgb(os.path.join(PUB, "drawable", "filterthumb_original.webp"))
    for key, lut, back, s, bs, thumb in FILTERS:
        if not thumb:
            continue
        tgt = load_rgb(os.path.join(PUB, "drawable", thumb + ".webp"))
        if tgt.shape != base.shape:
            print(f"{key:8s} thumb size differs {tgt.shape} vs {base.shape}")
            continue
        lk = lookup(base, luts[lut])
        res = []
        for st in np.linspace(0, 1, 21):
            res.append((np.abs(base * (1 - st) + lk * st - tgt).mean() * 255, st))
        err0 = np.abs(base - tgt).mean() * 255
        best = min(res)
        at_def = np.abs(apply(base, luts[lut], s) - tgt).mean() * 255
        mean_shift = (tgt - base).reshape(-1, 3).mean(0) * 255
        lut_shift = (apply(base, luts[lut], s) - base).reshape(-1, 3).mean(0) * 255
        print(f"{key:8s} {lut:12s} err(no lut)={err0:5.1f} err(default {s:.2f})={at_def:5.1f} "
              f"best={best[0]:5.1f}@{best[1]:.2f}  thumbTint(RGB)={np.round(mean_shift, 1)} lutTint={np.round(lut_shift, 1)}")
        save(np.concatenate([base, apply(base, luts[lut], s), tgt], 1), os.path.join(out, f"thumbcmp_{key}.png"))

    # The thumbnails are NOT the same base photo per filter, but they come in sets that share
    # a photo (DAILY/AQUA/JELLY/MILK and CLEAN/HEART/PRETTY). Within a set the *relative* colour
    # shift between thumbs should follow the relative shift between the LUTs. Base = set mean.
    print("\n== Relative tint within thumbnail sets (thumbDelta vs lutDelta, mean RGB 0..255) ==")
    by_key = {f[0]: f for f in FILTERS}
    for group in (["DAILY", "AQUA", "JELLY", "MILK"], ["CLEAN", "HEART", "PRETTY"]):
        thumbs = [load_rgb(os.path.join(PUB, "drawable", by_key[k][5] + ".webp")) for k in group]
        base = np.mean(thumbs, 0)
        lut_out = [apply(base, luts[by_key[k][1]], by_key[k][3]) for k in group]
        lut_mean = np.mean(lut_out, 0)
        tv, lv = [], []
        for k, t, lo in zip(group, thumbs, lut_out):
            td = (t - base).reshape(-1, 3).mean(0) * 255
            ld = (lo - lut_mean).reshape(-1, 3).mean(0) * 255
            tv += list(td)
            lv += list(ld)
            print(f"{k:8s} thumbDelta={np.round(td, 1)} lutDelta={np.round(ld, 1)}")
        tc = (np.array(tv).reshape(-1, 3) - np.array(tv).reshape(-1, 3).mean(1, keepdims=True)).ravel()
        lc = (np.array(lv).reshape(-1, 3) - np.array(lv).reshape(-1, 3).mean(1, keepdims=True)).ravel()
        print(f"  correlation({'/'.join(group)}) rgb={np.corrcoef(tv, lv)[0, 1]:.2f} chroma-only={np.corrcoef(tc, lc)[0, 1]:.2f}")

    if test:
        print(f"\n== Applying to {test} ==")
        img = load_rgb(test, 720)
        save(img, os.path.join(out, "_original.jpg"))
        for key, lut, back, s, bs, _ in FILTERS:
            save(apply(img, luts[lut], s), os.path.join(out, f"{key}_front.jpg"))
            if back:
                save(apply(img, luts[back], bs), os.path.join(out, f"{key}_back.jpg"))
        print(f"wrote {out}")


if __name__ == "__main__":
    main()
