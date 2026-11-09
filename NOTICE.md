# Third-party notices

Open_Edit is released under the MIT licence (see `LICENSE`). It includes or downloads at runtime the third-party
components listed below. Each keeps its own licence; this file records what they are, where they live in the
repository and what their licences ask of anyone who redistributes Open_Edit. Full licence texts that the
components do not ship themselves are in `licenses/`.

Everything else in the repository (code, shaders, colour grades, face warps, stickers, brushes, collage layouts,
generated demo content and music) is original work of the Open_Edit contributors under the MIT licence, produced
by the scripts in `scripts/`.

## Summary of obligations

| Licence | Components | What redistributors must do |
| --- | --- | --- |
| MIT, ISC, BSD-2/3-Clause, 0BSD | most npm packages, onnxruntime-web, MI-GAN, Real-ESRGAN, Lucide | Keep the copyright and licence notices (this file, `licenses/` and the packages' own LICENSE files). BSD-3: do not use the authors' names to endorse derived products. |
| Apache-2.0 | MediaPipe Tasks Vision (runtime and models), Depth Anything V2 Small, sharp, flatbuffers, long, @swc/helpers | Ship a copy of the licence (`licenses/Apache-2.0.txt`), keep NOTICE/attribution text, and state significant changes to the covered files (the models are used unmodified, apart from format conversion noted below). |
| SIL OFL 1.1 | Inter, Space Grotesk, Playfair Display, Caveat, Pacifico, Bebas Neue, DM Mono | Ship the OFL text with the fonts (done next to every font file and in `licenses/`), do not sell the fonts on their own, and do not use a Reserved Font Name for a modified font. |
| LGPL-3.0-or-later | heic-to (with libheif and libde265 compiled to WebAssembly), sharp's libvips binary | Keep the library a separately loadable, replaceable file (heic-to is loaded as its own on-demand chunk; libvips is a separate native package), ship the licence text (`licenses/LGPL-3.0-heic-to.txt`, GPL-3.0 at https://www.gnu.org/licenses/gpl-3.0.txt), and point users to the corresponding source (links below). |
| CC-BY-4.0 | caniuse-lite (browser support data used at build time) | Attribution: "Data from caniuse.com by Alexis Deveria". It is not part of the client bundle. |

## Model weights and runtimes (in `public/`)

These files are served to the browser and run on the device. They are downloaded once and cached.

| File | Component | Licence | Source | Notes |
| --- | --- | --- | --- | --- |
| `public/mediapipe/wasm/*` | MediaPipe Tasks Vision runtime 1.2.2 | Apache-2.0 | https://github.com/google-ai-edge/mediapipe | Copied unmodified from `@mediapipe/tasks-vision`. |
| `public/mediapipe/models/face_landmarker.task` | MediaPipe Face Landmarker (float16) | Apache-2.0 | https://storage.googleapis.com/mediapipe-models/ | Unmodified. The face mesh topology and canonical UV layout used by the face engine also come from MediaPipe (Apache-2.0). |
| `public/mediapipe/models/selfie_multiclass_256x256.tflite` | MediaPipe Selfie Multiclass Segmenter | Apache-2.0 | https://storage.googleapis.com/mediapipe-models/ | Unmodified. |
| `public/mediapipe/models/pose_landmarker_lite.task` | MediaPipe Pose Landmarker (lite) | Apache-2.0 | https://storage.googleapis.com/mediapipe-models/ | Unmodified. |
| `public/models/magic_touch.tflite` | MediaPipe Interactive Segmenter (MagicTouch) | Apache-2.0 | https://ai.google.dev/edge/mediapipe/solutions/vision/interactive_segmenter | Unmodified. |
| `public/models/migan_pipeline_v2.onnx` | MI-GAN, Picsart AI Research | MIT | https://github.com/Picsart-AI-Research/MI-GAN (ONNX pipeline: https://huggingface.co/andraniksargsyan/migan) | Unmodified ONNX export. Licence: `licenses/MIT-MI-GAN.txt`. |
| `public/models/realesr-general-x4v3.fp32.onnx`, `.fp16.onnx` | Real-ESRGAN realesr-general-x4v3, Xintao Wang | BSD-3-Clause | https://github.com/xinntao/Real-ESRGAN | Converted to ONNX with `scripts/ai-convert-esrgan.py`; weights unchanged (fp16 is a precision conversion). Licence: `licenses/BSD-3-Clause-Real-ESRGAN.txt`. |
| `public/models/depth-anything-v2-small.int8.onnx` | Depth Anything V2 Small | Apache-2.0 | https://github.com/DepthAnything/Depth-Anything-V2 (ONNX: https://huggingface.co/onnx-community/depth-anything-v2-small) | int8 quantised export by onnx-community, unmodified. Only the Small model is Apache-2.0; the larger Depth Anything V2 models are CC-BY-NC-4.0 and must not be added. |
| `public/ort/*` | onnxruntime-web 1.31.1, Microsoft | MIT | https://github.com/microsoft/onnxruntime | Copied unmodified from `onnxruntime-web`. |
| `public/models/LICENSES.txt`, `public/mediapipe/LICENSE-NOTE.txt` | | | | Per-folder notes served with the files. |

## Fonts

| Font | Licence | Shipped as | Copyright |
| --- | --- | --- | --- |
| Inter (variable) | OFL-1.1 | `@fontsource-variable/inter` (bundled into the app CSS) and `public/packs/open/fonts/inter.woff2` | The Inter Project Authors |
| Space Grotesk (variable) | OFL-1.1 | `@fontsource-variable/space-grotesk` and `public/packs/open/fonts/space-grotesk.woff2` | The Space Grotesk Project Authors |
| Playfair Display | OFL-1.1 (Reserved Font Name "Playfair Display") | `public/packs/open/fonts/playfair.woff2` | The Playfair Display Project Authors |
| Caveat | OFL-1.1 | `public/packs/open/fonts/caveat.woff2` | The Caveat Project Authors |
| Pacifico | OFL-1.1 | `public/packs/open/fonts/pacifico.woff2` | The Pacifico Project Authors |
| Bebas Neue | OFL-1.1 | `public/packs/open/fonts/bebas-neue.woff2` | Dharma Type |
| DM Mono | OFL-1.1 | `public/packs/open/fonts/dm-mono.woff2` | The DM Mono Project Authors |

Each pack font has its OFL text next to it (`public/packs/open/fonts/<id>-OFL.txt`); the two UI fonts' texts are in
`licenses/`. The fonts are unmodified (format conversion to WOFF2 only).

## Icons

UI glyphs come from Lucide (`lucide-react`, `lucide`), ISC licence, https://lucide.dev. The brand mark and all other
artwork in `public/packs/open/` are original.

## HEIC import (LGPL)

iPhone HEIC photos are converted in the browser by `heic-to` (LGPL-3.0-or-later), which bundles libheif
(https://github.com/strukturag/libheif, LGPL-3.0) and libde265 (https://github.com/strukturag/libde265, LGPL-3.0)
compiled to WebAssembly. Open_Edit loads it only when a HEIC file is imported, as a separate chunk built from the
unmodified npm package, so it can be replaced with a modified build of the library. Source:
https://github.com/hoppergee/heic-to. Licence text: `licenses/LGPL-3.0-heic-to.txt`.

## npm packages

Runtime dependencies (direct and transitive) as installed, generated with `node scripts/licenses.mjs`; run
`node scripts/licenses.mjs --check` to flag licences that need review. Platform-specific optional packages (for
example `@img/sharp-*` and `@next/swc-*`) differ per operating system. Development-only tools (TypeScript, ESLint,
Tailwind CSS and their dependencies, mostly MIT / ISC / BSD / Apache-2.0, plus a few MPL-2.0 build tools such as
lightningcss) are not distributed with the app; list them with `node scripts/licenses.mjs --dev`.

| Package | Version | Licence |
| --- | --- | --- |
| @fontsource-variable/inter | 5.3.0 | OFL-1.1 |
| @fontsource-variable/space-grotesk | 5.3.0 | OFL-1.1 |
| @img/colour | 1.1.0 | MIT |
| @img/sharp-darwin-arm64 | 0.35.5 | Apache-2.0 |
| @img/sharp-libvips-darwin-arm64 | 1.3.4 | LGPL-3.0-or-later |
| @mediapipe/tasks-vision | 1.2.2 | Apache-2.0 |
| @next/env | 16.4.5 | MIT |
| @next/swc-darwin-arm64 | 16.4.5 | MIT |
| @protobufjs/aspromise | 1.1.2 | BSD-3-Clause |
| @protobufjs/base64 | 1.1.2 | BSD-3-Clause |
| @protobufjs/codegen | 2.0.5 | BSD-3-Clause |
| @protobufjs/eventemitter | 1.1.1 | BSD-3-Clause |
| @protobufjs/fetch | 1.1.1 | BSD-3-Clause |
| @protobufjs/float | 1.0.2 | BSD-3-Clause |
| @protobufjs/path | 1.1.2 | BSD-3-Clause |
| @protobufjs/pool | 1.1.0 | BSD-3-Clause |
| @protobufjs/utf8 | 1.1.2 | BSD-3-Clause |
| @swc/helpers | 0.5.23 | Apache-2.0 |
| @types/node | 20.19.43 | MIT |
| @types/react | 19.3.0 | MIT |
| baseline-browser-mapping | 2.11.35 | Apache-2.0 |
| caniuse-lite | 1.0.30001823 | CC-BY-4.0 |
| client-only | 0.0.1 | MIT |
| csstype | 3.2.3 | MIT |
| detect-libc | 2.1.2 | Apache-2.0 |
| flatbuffers | 25.9.23 | Apache-2.0 |
| guid-typescript | 1.0.9 | ISC |
| heic-to | 1.6.7 | LGPL-3.0 |
| long | 5.3.2 | Apache-2.0 |
| lucide | 1.70.0 | ISC |
| lucide-react | 1.70.0 | ISC |
| nanoid | 3.3.20 | MIT |
| next | 16.4.5 | MIT |
| onnxruntime-common | 1.31.1 | MIT |
| onnxruntime-web | 1.31.1 | MIT |
| picocolors | 1.1.1 | ISC |
| platform | 1.3.6 | MIT |
| postcss | 8.5.23 | MIT |
| protobufjs | 7.6.6 | BSD-3-Clause |
| react | 19.3.0 | MIT |
| react-dom | 19.3.0 | MIT |
| scheduler | 0.28.0 | MIT |
| semver | 7.8.6 | ISC |
| sharp | 0.35.5 | Apache-2.0 |
| source-map-js | 1.2.2 | BSD-3-Clause |
| styled-jsx | 5.1.6 | MIT |
| tslib | 2.9.1 | 0BSD |
| undici-types | 6.21.0 | MIT |
