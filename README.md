# B612 Web

A one-to-one web port of the B612 Android camera app (v14.0.31), built with Next.js 16. The screens were reproduced from the decompiled APK: layouts, dimensions, colors, strings, drawables, filter LUTs and shaders.

```bash
nvm use 24
npm install
npm run dev   # http://localhost:3000 (camera needs localhost or https)
```

## Screens
| Route | Original | Notes |
|---|---|---|
| `/` | ActivityCamera | Live WebGL preview; 17 filters using the APK's real LUTs and lookup shader; ratios Full/9:16/3:4/1:1; timer; flash/screen flash; tap focus; swipe to change filter; pinch zoom; long-press video; confirm screen |
| `/home`, `/discover`, `/ai`, `/my` | Bottom nav tabs | Home and Discover feeds come from static JSON in `src/data/` (the originals are server-driven) |
| `/settings/**` | Camera settings, About, Account | Settings persist in localStorage under the original pref names |
| `/gallery` | GalleryActivity | Photos are stored in IndexedDB. Import includes iPhone HEIC (converted with libheif) |
| `/edit?id=` | EPActivity | Filters, Adjust (shaders recovered from the APK), Crop/rotate, Portrait (pixel-based items), Text, Brush, Border, Stickers, layers, undo/redo |

## Where things come from
- `public/drawable/`: APK drawables; vector XML converted to SVG by `scripts/convert-drawables.py`.
- `public/lut/`, `public/kuru/`, `public/edit/`: the APK's `.dat` LUTs, which are byte-reversed PNGs.
- `src/lib/filters.ts`: `LocalFilterType` ported one-to-one (front/back LUTs and strengths).
- `src/lib/gl/`: the WebGL pipeline; the LUT shader is copied verbatim from the APK.

## Not reproducible on the web
- **Native face engine:** AR effects/stickers, face-shape beauty and makeup run in proprietary native libraries (`libkuru`, SenseTime).
- **Script filters:** "HD" and "No Filter" are encrypted Kuru scripts and are approximated here.
- **Server-backed features:** AI tools, effect/sticker/font catalogs, login and the server feeds. Their UI shells are present with empty or unavailable states.

There's no VIP tier: all content is unlocked for everyone.
