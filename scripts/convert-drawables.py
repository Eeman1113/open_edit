#!/usr/bin/env python3
"""Convert the APK's drawables into web assets under public/drawable/.

- Android <vector> XML  -> SVG
- PNG/WebP/JPG (prefers xxhdpi, falls back through other densities) -> copied as-is
- Colors are resolved from res/values/colors.xml (and @android:color basics).
"""
import os, re, shutil, sys
import xml.etree.ElementTree as ET

RES = os.path.expanduser("~/code_shit/b612/extracted/apktool/res")
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "drawable")
A = "{http://schemas.android.com/apk/res/android}"

colors = {}
for f in ["values/colors.xml"]:
    for c in ET.parse(os.path.join(RES, f)).getroot():
        if c.tag == "color" and c.text:
            colors[c.get("name")] = c.text.strip()

ANDROID_COLORS = {"white": "#ffffffff", "black": "#ff000000", "transparent": "#00000000"}


def resolve_color(v, depth=0):
    if v is None or depth > 10:
        return None
    v = v.strip()
    if v.startswith("@android:color/"):
        return ANDROID_COLORS.get(v.split("/")[1])
    if v.startswith("@color/"):
        return resolve_color(colors.get(v.split("/")[1]), depth + 1)
    if v.startswith("?"):
        return "#ff000000"
    return v if v.startswith("#") else None


def css_color(argb):
    """#AARRGGBB / #RRGGBB / #ARGB / #RGB -> (rgb, alpha)."""
    if not argb:
        return None, 1.0
    h = argb[1:]
    if len(h) == 3:
        h = "ff" + "".join(c * 2 for c in h)
    elif len(h) == 4:
        h = "".join(c * 2 for c in h)
    elif len(h) == 6:
        h = "ff" + h
    return "#" + h[2:], int(h[:2], 16) / 255


def dim(v):
    return float(re.sub(r"[a-z]+$", "", v or "0"))


def paint(el, attr, alpha_attr):
    rgb, a = css_color(resolve_color(el.get(A + attr)))
    if rgb is None:
        return None
    a *= float(el.get(A + alpha_attr, "1"))
    return rgb, a


def convert_vector(root):
    w, h = dim(root.get(A + "width")), dim(root.get(A + "height"))
    vw, vh = root.get(A + "viewportWidth"), root.get(A + "viewportHeight")
    tint = resolve_color(root.get(A + "tint"))
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:g}" height="{h:g}" viewBox="0 0 {vw} {vh}">']
    defs = []

    def walk(el, depth):
        for ch in el:
            tag = ch.tag
            if tag == "group":
                tx, ty = float(ch.get(A + "translateX", 0)), float(ch.get(A + "translateY", 0))
                px, py = float(ch.get(A + "pivotX", 0)), float(ch.get(A + "pivotY", 0))
                sx, sy = float(ch.get(A + "scaleX", 1)), float(ch.get(A + "scaleY", 1))
                rot = float(ch.get(A + "rotation", 0))
                t = f"translate({tx + px} {ty + py}) rotate({rot}) scale({sx} {sy}) translate({-px} {-py})"
                out.append(f'<g transform="{t}">')
                walk(ch, depth + 1)
                out.append("</g>")
            elif tag == "clip-path":
                cid = f"c{len(defs)}"
                defs.append(f'<clipPath id="{cid}"><path d="{ch.get(A + "pathData")}"/></clipPath>')
                out.append(f'<g clip-path="url(#{cid})">')
                # clip applies to following siblings in the same group
                walk_rest.append(True)
            elif tag == "path":
                d = ch.get(A + "pathData")
                if not d:
                    continue
                attrs = [f'd="{d}"']
                fill = paint(ch, "fillColor", "fillAlpha")
                if fill is None and ch.find("{http://schemas.android.com/aapt}attr") is not None:
                    fill = ("#000000", 1.0)  # gradients: rare in icons, approximate
                if fill:
                    attrs.append(f'fill="{fill[0]}"')
                    if fill[1] < 1:
                        attrs.append(f'fill-opacity="{fill[1]:.3f}"')
                else:
                    attrs.append('fill="none"')
                stroke = paint(ch, "strokeColor", "strokeAlpha")
                if stroke:
                    attrs.append(f'stroke="{stroke[0]}" stroke-width="{ch.get(A + "strokeWidth", "1")}"')
                    if stroke[1] < 1:
                        attrs.append(f'stroke-opacity="{stroke[1]:.3f}"')
                    for k, s in (("strokeLineCap", "stroke-linecap"), ("strokeLineJoin", "stroke-linejoin")):
                        if ch.get(A + k):
                            attrs.append(f'{s}="{ch.get(A + k)}"')
                if ch.get(A + "fillType") == "evenOdd":
                    attrs.append('fill-rule="evenodd"')
                out.append(f"<path {' '.join(attrs)}/>")

    walk_rest = []
    walk(root, 0)
    out.extend("</g>" for _ in walk_rest)
    if defs:
        out.insert(1, "<defs>" + "".join(defs) + "</defs>")
    out.append("</svg>")
    svg = "".join(out)
    if tint:
        rgb, _ = css_color(tint)
        svg = re.sub(r'(fill|stroke)="#[0-9a-fA-F]{6}"', rf'\1="{rgb}"', svg)
    return svg


DENSITIES = ["drawable-xxhdpi", "drawable-xxxhdpi", "drawable-xhdpi", "drawable-nodpi", "drawable-hdpi", "drawable-mdpi", "drawable", "drawable-anydpi", "mipmap-xxhdpi", "mipmap-xxxhdpi"]


def main():
    os.makedirs(OUT, exist_ok=True)
    done, nvec, nbmp, fail = set(), 0, 0, 0
    for d in DENSITIES:
        p = os.path.join(RES, d)
        if not os.path.isdir(p):
            continue
        for f in sorted(os.listdir(p)):
            name, ext = os.path.splitext(f)
            if name in done:
                continue
            src = os.path.join(p, f)
            if ext == ".xml":
                try:
                    root = ET.parse(src).getroot()
                except ET.ParseError:
                    continue
                if root.tag != "vector":
                    continue
                try:
                    open(os.path.join(OUT, name + ".svg"), "w").write(convert_vector(root))
                    nvec += 1
                    done.add(name)
                except Exception as e:  # noqa
                    fail += 1
            elif ext in (".png", ".webp", ".jpg") and not f.endswith(".9.png"):
                shutil.copy(src, os.path.join(OUT, f))
                nbmp += 1
                done.add(name)
    print(f"vectors={nvec} bitmaps={nbmp} failed={fail}")


if __name__ == "__main__":
    main()
