# Testing

Open_Edit has no unit-test framework to install: the checks are TypeScript, ESLint, the provenance and licence
audits, the client secret check and an end-to-end suite that drives the real app in headless Chrome.

```sh
source ~/.nvm/nvm.sh && nvm use 24
npx tsc --noEmit                      # types
npx eslint src scripts                # lint
node scripts/audit-provenance.mjs     # no vendor files, names or tables in the repo
node scripts/licenses.mjs --check     # runtime dependency licences are on the allow-list
npm run audit:secrets                 # no server-only values in client chunks (.next/static or .next/dev/static)
npm run e2e                           # end-to-end flows (below)
```

## End-to-end suite

`scripts/e2e/run.mjs` launches **one** headless Chrome (a 390 × 844 phone viewport at 2×, touch, a fake camera and
microphone), runs the flows in `scripts/e2e/flows/` in order and kills Chrome when it is done. It needs no npm
packages: it talks to Chrome over the DevTools protocol with Node 24's `fetch` and `WebSocket`.

Start the app first (`npm run dev`), then:

```sh
npm run e2e                           # every flow
npm run e2e -- 11 12                  # only flows whose file name contains "11" or "12"
E2E_BASE=http://localhost:3700 npm run e2e   # another server
```

Every step clicks, drags and types like a user, asserts on the page and takes a screenshot. A step **fails** on:

- a failed assertion or a timeout;
- a console error, an uncaught exception, an HTTP response ≥ 400 or a failed request while it ran (a step can
  declare an expected error, e.g. a deliberate 400 in the API flow, with `s.allow(/…/)`);
- the visual audit (`s.visualAudit()`): broken images, transparent text, text whose colour is too close to the
  surface behind it, two texts drawn over each other, and text running off the screen.

If Chrome dies (for example the machine runs out of memory) the runner starts a new one for the next flow and
keeps the results. A flow that hangs is stopped after 25 minutes (`E2E_FLOW_TIMEOUT`).

### Settings

| Variable | Default | Use |
| --- | --- | --- |
| `E2E_BASE` | `http://localhost:3000` | App under test |
| `E2E_PHOTO` | `public/packs/open/videos/clip-1.jpg` | Photo imported into the gallery for the editor, AI and face flows. Use a photo with one or more faces to exercise the face tools. |
| `E2E_Y4M` | `$E2E_SCRATCH/e2e/user.y4m` if present | Fake camera video (`--use-file-for-fake-video-capture`). Without it Chrome's synthetic pattern is used (no face). |
| `E2E_VIDEO` | `public/packs/open/videos/clip-1.mp4` | Clip for the video editor flows |
| `E2E_FACE_VIDEO` | `E2E_VIDEO` | Clip with a face for the video Face FX flow |
| `E2E_SCRATCH` | `<tmp>/open_edit-e2e` | Chrome profile, downloads, `e2e/results-<flows>.json` |
| `E2E_OUT` | `$E2E_SCRATCH/proof/e2e` | Screenshots, `NN-<flow>-<step>.png` |
| `E2E_FLOW_TIMEOUT` | `1500000` | Watchdog per flow (ms) |

Making the face media from your own photo (keep it outside the repository; never commit personal photos):

```sh
ffmpeg -loop 1 -i me.jpg -vf "scale=540:960:force_original_aspect_ratio=increase,crop=540:960,format=yuv420p" \
  -frames:v 10 -r 10 /tmp/oe/user.y4m
ffmpeg -loop 1 -i me.jpg -t 3 -r 30 -vf "scale=720:960:force_original_aspect_ratio=increase,crop=720:960,format=yuv420p" \
  -c:v libx264 /tmp/oe/user-face.mp4
E2E_PHOTO=me.jpg E2E_Y4M=/tmp/oe/user.y4m E2E_FACE_VIDEO=/tmp/oe/user-face.mp4 npm run e2e
```

Screenshots of such a run show real faces. Before sharing them, pixelate the faces with
`node scripts/e2e/redact.mjs <screenshots> <out>` (it uses the face model the app ships, in one headless Chrome).

### Tools

- `node scripts/e2e/run.mjs --probe /route "js;;js"` opens a route, runs the snippets and prints the tappable
  elements, the visual audit, the errors and a screenshot.
- `node scripts/e2e/repl.mjs` keeps one Chrome open and runs flow-style code posted to it
  (`curl -s localhost:9339 --data-binary 'await s.goto("/"); return await s.clickables()'`, `curl localhost:9339/quit`).
- Helpers for flows are in `scripts/e2e/h.mjs` (`openCamera`, `importToGallery`, `openThumb`, `editTab`,
  `videoTab`, `slide`, `apply`, `aiDone`, `audit`, `closeDrawer`, …); the session API (`tap`, `click`, `drag`,
  `swipe`, `type`, `key`, `waitFor`, `assert`, `shot`) is in `scripts/e2e/lib.mjs`.

### Flows

| # | Flow | Covers |
| --- | --- | --- |
| 01 | launch | Launch screen, camera ready, dock, navigation |
| 02 | camera-controls | More panel, flash, timer, frame ratios, bounce, collage mode, music (pick a track), filters (pick, manage), beauty (items, sliders, makeup), effects, Photo/Video, switch camera |
| 03 | camera-capture | Shutter, review, white border presets (the saved file is the 1:1 composite), save, gallery button, edit, timer shot, bounce loop, collage capture |
| 04 | video-record | Clips, undo, finish, review with the chosen music mixed in (sound track checked), save, edit |
| 05 | gnb-tabs | Every bottom-nav tab, highlight, re-tap scrolls to top |
| 06 | home | Feed, quick actions, effect / filter items open the camera, See all |
| 07 | discover | Tabs, post (like, profile, follow, Try), search, trending keywords, tags, profile sheet, QR scanner (camera and photo), Create a look |
| 08 | ai | AI tools launcher → every tool (Enhance, Remove, Expand, Depth blur, Cutout, Hair colour) on a gallery photo, Choose from device, `/aimode` link |
| 09 | my-settings | Me, About, inbox and notification settings, every camera setting, where photos are saved, licences, privacy / terms, web page, Clear local data dialog |
| 10 | gallery | Import, albums, All / Videos, viewer, edit from the viewer, collage picker → collage (layout, stack, border) → Saved, delete |
| 11 | photo-editor | Every tab and tool page: Tools (crop, undo / redo, Enhance, Erase, Expand, Depth blur, Cutout, Pixelate), Filters, Effects, Adjust (sliders, Curves, Split tone, Colour mix), Portrait (all 15 pages incl. AI Hair), Face FX, Stickers (library), Text, Draw, layers popup, Frame; Save → Saved → Share → Download → back → Open gallery |
| 12 | video-editor | Sound, rotate, Trim, Speed + play backwards, Filters, Effects, Face FX, Face shape, Liquify, Music (track, volume, full list); Share export; Save export (trimmed, with sound) → Saved → Share → Done |
| 13 | deeplinks | Every `openedit://` link, unknown and foreign links |
| 14 | back-nav | Browser back across tabs, settings, review, gallery, editor, collage, post, search, group pages, about |
| 15 | face-fx | Camera beauty, makeup and an effect on a real face (preview changes, capture carries it); video Face FX tracked per frame and present in the export |
| 16 | back-key | Escape closes exactly the top-most thing: camera drawers, More, Music, review border sheet, viewer, editor tool page / text typing / sticker library / discard dialog / Saved + share sheet, video tool page / music sheet / discard dialog, collage dialog, Discover sheets and dialogs, settings dialog |
| 17 | creators | Look creator (pick pieces, layers, remove, search, name, tags, guide, photo preview, save → camera, saved looks, discard), Templates, template detail, Art styles (apply, save) |
| 18 | api | `/api/health`, music (audio files), search and paging, validation errors, ETag / 304, art styles, every `/api/looks/<kind>`, stickers, templates, feeds, `/api/ai/hair`, the session cookie; then the `/api-static` fallback with `/api/*` blocked |
| 19 | clear-data | Settings → Clear local data wipes the gallery, preferences, session data and caches and starts a fresh session |

## Latest results

<!-- results -->
