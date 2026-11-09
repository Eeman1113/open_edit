#!/usr/bin/env python3
"""Copy APK 9-patch drawables (apktool-decoded, with the 1px marker border) into public/drawable.

For each <name>.9.png missing from public/drawable this writes:
  public/drawable/<name>.webp   content with the marker border stripped (lossless), so d("<name>") works
  public/drawable/<name>.9.png  the raw 9-patch (markers kept)
and records stretch/padding insets (px at xxhdpi; divide by 3 for CSS px) in public/drawable/ninepatch.json
for use with CSS `border-image: url(...) <top> <right> <bottom> <left> fill; border-width: <inset/3>px`.
Prefers drawable-xxhdpi, then xhdpi/hdpi/mdpi/nodpi. Usage: python3 scripts/copy-ninepatch.py [names...]
"""
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "..", "extracted", "apktool", "res")
OUT = os.path.join(ROOT, "public", "drawable")
DIRS = ["drawable-xxhdpi", "drawable-xxxhdpi", "drawable-xhdpi", "drawable-hdpi", "drawable-mdpi", "drawable-nodpi", "drawable"]
SCALE = {"drawable-xxhdpi": 3, "drawable-xxxhdpi": 4, "drawable-xhdpi": 2, "drawable-hdpi": 1.5, "drawable-mdpi": 1, "drawable-nodpi": 1, "drawable": 1}


def black(px):
    return px[3] > 0 and px[0] < 128 and px[1] < 128 and px[2] < 128


def span(pixels):
    idx = [i for i, p in enumerate(pixels) if black(p)]
    return (idx[0], idx[-1] + 1) if idx else None


def main():
    names = sys.argv[1:]
    found = {}
    for d in DIRS:
        p = os.path.join(RES, d)
        if not os.path.isdir(p):
            continue
        for f in os.listdir(p):
            if f.endswith(".9.png"):
                n = f[:-6]
                if n not in found:
                    found[n] = (d, os.path.join(p, f))
    meta_path = os.path.join(OUT, "ninepatch.json")
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    for n, (d, path) in sorted(found.items()):
        if names and n not in names:
            continue
        if not names and any(os.path.exists(os.path.join(OUT, n + e)) for e in (".webp", ".png")):
            continue
        im = Image.open(path).convert("RGBA")
        w, h = im.size
        px = im.load()
        top = span([px[x, 0] for x in range(1, w - 1)])
        left = span([px[0, y] for y in range(1, h - 1)])
        bottom = span([px[x, h - 1] for x in range(1, w - 1)])
        right = span([px[w - 1, y] for y in range(1, h - 1)])
        content = im.crop((1, 1, w - 1, h - 1))
        cw, ch = content.size
        content.save(os.path.join(OUT, n + ".webp"), lossless=True)
        with open(path, "rb") as src, open(os.path.join(OUT, n + ".9.png"), "wb") as dst:
            dst.write(src.read())
        meta[n] = {
            "density": d, "scale": SCALE[d], "size": [cw, ch],
            # border-image slice (px in the image): top right bottom left
            "slice": [left[0] if left else 0, cw - top[1] if top else 0, ch - left[1] if left else 0, top[0] if top else 0],
            # content padding (px in the image): top right bottom left
            "padding": [right[0] if right else 0, cw - bottom[1] if bottom else 0, ch - right[1] if right else 0, bottom[0] if bottom else 0],
        }
        print(n, meta[n])
    json.dump(meta, open(meta_path, "w"), indent=1, sort_keys=True)


if __name__ == "__main__":
    main()
