# Open_Edit design system

Open_Edit has its own look: a dark, photo-first interface with one warm accent. Everything below lives in
`src/components/ui/` and is imported from `@/components/ui`.

## Identity

- **Name treatment:** `open_edit` in lowercase Space Grotesk Bold, tracked tight. The underscore is drawn in the accent
  colour. In prose the product is written **Open_Edit**.
- **Mark:** an open ring (a lens with a 70° gap at the upper right) and a dot that sits in the gap. It reads as an
  aperture that has been "opened" and as a cursor/spark for editing. The stroke is round-capped, 7/64 of the box.
- **Files:** `public/packs/open/brand/`, registered in the open pack manifest under kind `brand`:
  - `mark` and `mark-mono`: the mark in accent, and in `currentColor`
  - `wordmark`: the mark plus the name
  - `icon` and `icon-maskable`: app icon SVGs on the ink tile, the maskable one inside the 80% safe zone
  - `icon-192`, `icon-512`, `icon-maskable-512`, `apple-touch-icon`, `favicon` (SVG), `favicon-32`, `favicon-ico`
- **Metadata:** `src/app/layout.tsx` sets the title template (`%s · Open_Edit`), description, icons, theme colour and
  colour scheme. `src/app/manifest.tsx` produces the installable PWA manifest (standalone, portrait, maskable icon).
  Both resolve brand files through `brandUrlStatic()` in `ui/brand-static.ts`, which works in server components.
- **In the UI:** `<Logo/>` and `<Wordmark/>` (in `ui/Media.tsx`) load the mark from the active pack.

## Tokens: one theme file

`src/components/ui/theme.ts` (`TOKENS`) is the only place visual values are defined. `themeCss()` turns it into
`--oe-*` custom properties. The root layout inlines them, and `globals.css` maps them to Tailwind utilities.

| Group | Tokens (CSS var → Tailwind) |
|---|---|
| Surfaces | `bg` #0B0C0F → `bg-bg` · `panel` #15171C → `bg-panel` · `raised` #1F2229 → `bg-raised` · `muted` #2A2E37 → `bg-muted` |
| Lines | `line` white 8% → `border-line` |
| Text | `fg` #F4F5F7 → `text-fg` · `fg2` #A6ACB8 → `text-fg-2` · `fg3` #6C7280 → `text-fg-3` |
| Accent ("Sodium") | `accent` #FFB020 → `bg-accent` / `text-accent` · `on-accent` #1A1200 · `accent-soft` (16% fill) |
| Status | `info` #5B8CFF (links, verified) · `ok` #3DD68C · `danger` #FF5A5F (destructive, recording) |
| Overlays | `glass` (56% ink, used with `backdrop-blur`) for chrome over photos · `scrim` (60% black) behind dialogs |
| Type | `--font-sans`: Inter Variable (UI text) · `--font-display`: Space Grotesk Variable (titles, numbers, wordmark) |
| Radii | `xs` 6 · `sm` 10 · `md` 14 · `lg` 20 · `xl` 28 → `rounded-xs` … `rounded-xl`; pills use `rounded-full` |
| Spacing | 4 px grid; screen gutter 16 px (`px-4`) |
| Chrome | top bar 52 px (`--oe-top-bar`) · bottom nav 64 px (`--oe-bottom-nav`) · minimum tap target 44 px |
| Motion | `fast` 120 ms · `base` 200 ms · `slow` 320 ms · easing `cubic-bezier(.2,.8,.2,1)` (`--oe-ease`) |

Shared keyframes in `globals.css`: `oe-spin`, `oe-fade-in` / `oe-fade-out`, `oe-rise`, `oe-sheet-in`, `oe-pop`,
`oe-pulse`. `.oe-press` gives the pressed scale.

Both fonts are bundled through `@fontsource-variable/*` (SIL OFL 1.1). The app is dark-only: photos read best on a
dark surround and the camera UI stays consistent with the rest of the app.

## Asset packs and overrides

All replaceable art is looked up through the asset-pack manifest (`src/lib/assets`; packs live in
`public/packs/<id>/`). The UI-side helpers are in `ui/pack.ts`:

- `brandUrl(id)`: brand marks (kind `brand`).
- `illustrationUrl(id)`: optional illustrations (kind `illustration`).
- `packIconUrl(name)`: icon overrides (kind `icon`; see below).
- `themeOverrideUrl()`: a pack stylesheet (kind `theme`, id `tokens`) that redefines any `--oe-*` variable.
  `<PackTheme/>` in the root layout loads it after the defaults, so a pack can restyle colours, fonts and radii
  without code changes.

Content pictures (feed cards, filter and effect previews) also go through the pack (`feed`, `filter-thumb` and
`sticker-thumb` kinds). An id that the pack doesn't provide gets a seeded gradient instead (`<Thumb/>`, `swatchBg()`),
so the UI never shows a broken image.

## Icons

`<Icon name="camera" size={24} />` (`ui/Icon.tsx`) is the only way to draw a glyph. Names are semantic ids
(`ICONS`: `flip`, `flash-on`, `filter`, `beauty`, `effects`, `enhance`, `depth`, `trash`, …), not glyph names.

Resolution order:
1. Pack `icon/<name>@color`: a full-colour image, drawn as is.
2. Pack `icon/<name>`: a single-colour image, drawn as a CSS mask so it follows `currentColor`.
3. Otherwise the bundled lucide-react glyph (ISC) at a 1.75 stroke.

The editors add their own semantic ids (adjust items such as `curves`, `brightness`, `warmth`, `vignette`; tools such as
`tools`, `rotate-left`, `flip-h` / `flip-v`, `skew-h` / `skew-v`, `face-3d`, `body`, `brush`, `paint`, `merge`, `library`,
`speed`, `reverse`, `stack-v` / `stack-h`, `replace`). `flip-h` mirrors left ↔ right and `flip-v` top ↔ bottom.
Aspect ratios are not icons: they are drawn as a rounded box of that ratio (`RatioGlyph`).

## Components

| Component | Use |
|---|---|
| `Button` | Text actions. `primary` (accent, one per view), `secondary`, `ghost`, `danger`, `glass` (over photos). Sizes `sm` / `md` / `lg`; `icon`, `iconRight`, `loading`, `block`. |
| `IconButton` | Round icon-only action with a required `label`. Variants `plain`, `glass`, `raised`, `accent`; `active`, `filled`, `badge`. |
| `Sheet` | Bottom drawer with a handle, optional title or action, and `full` height. Closes on scrim tap and Escape/back. |
| `Dialog` | Centred confirm / alert. An optional icon tile, title, body, then a stacked primary (or `destructive`) button and Cancel. |
| `toast()` / `ToastHost` | App-wide transient message with an optional icon and tone. The host is mounted once in the layout. |
| `Tabs` | `underline` (scrollable section tabs with a sliding accent bar) or `segment` (pill track for 2–4 options). `tone="overlay"` for use over photos. |
| `Slider` | Unipolar or `bipolar` (fills from the centre for ± adjustments). Default tick with snap, floating value label, keyboard arrows. `tone="overlay"` over the camera. |
| `Switch` | On/off toggle (accent track when on). |
| `Chip` | Filter / category pill; selected = inverted. |
| `ListRow` / `ListGroup` | Settings-style rows with an icon tile, subtitle, value, trailing control or chevron; links and buttons. Groups have a caps header and footnote. |
| `TopBar` | Back button, title (or a `large` title below), actions. |
| `BottomNav` | Home · Discover · [Camera] · AI tools · Me. The camera is a raised accent tile. `tone="overlay"` over the live preview. Re-tapping the active tab fires `NAV_RESELECT`. |
| `Screen` / `ScrollBody` / `EmptyState` | Page scaffold, scrolling body, centred empty or error state. |
| `Logo` / `Wordmark` / `Thumb` | Brand mark, name treatment, image-or-gradient thumbnail. |

Helpers in `ui/app.ts`: `useGoBack(fallback)`, `PHOTOS_EVENT` (gallery changed), and `clearLocalData()`.

## Patterns

- **Camera:** full-bleed preview. Chrome over the picture uses `glass` with a blur. The glass toolbar across the top
  holds Flash, Timer, Frame, Bounce, Collage, Music and More, and a drop-down option row opens under it. Above the
  shutter row sit three dock pills: Filters, Beauty, Effects. Then the shutter row (gallery thumbnail · shutter ·
  flip), a Photo/Video switch, and the bottom nav. Drawers (filters, beauty, effects) slide up from the bottom, and
  the shutter shrinks and floats above them.
- **Shutter:** a white ring with a white core (photo) or a red core (video). While recording, the core becomes a
  rounded square and an accent ring fills around it.
- **Review:** the result fills its frame. The bottom bar has Share · Save (a large accent pill: Save → Saving → Saved) ·
  Edit. A White border sheet offers aspect presets.
- **Lists and settings:** grouped rounded panels on the ink background, 56 px rows, and caps section labels.
- **Editors (photo, video, collage):** the shared building blocks are in `src/components/edit/ui.tsx` and
  `edit/tools/common.tsx`; the video editor and the collage maker use the same pieces.
  - *Shell:* a solid top bar (52 px): back (raised round button) · undo / redo · layers (with a count badge) · **Save**
    (accent pill). The photo sits in a soft radial vignette between the top bar and the **dock**, a 200 px `panel`
    sheet with `rounded-t-xl`, a shadow and a 60 px tab bar at its foot. Tabs are an icon over an 11 px label; the
    active tab is `fg` with a short accent bar on its top edge, the rest are `fg-3`.
  - *Tool pages:* opening a tool swaps the top bar for its command row (portalled into the bar): Cancel (raised round
    ✕) · title or a segmented switch (`BarTabs`) · Apply (accent round ✓), or a **Generate** pill when the next step is
    an AI run. The tool's controls fill the whole dock. Collage pages use the same row (`PageBar`).
  - *Over the photo:* a 48 px control row floats just above the dock: local undo / redo on the left, the active slider
    in the middle, hold-to-compare on the right, all as `glass` round buttons. Extra controls (brush size, strength,
    colour rows, blend modes) sit in a floating card (`OptionRow`: `panel` at 90% with a blur, `rounded-lg`, a hairline
    ring) between the control row and the dock. Hints use `HintPill`; busy states use a glass pill with a spinner;
    on-device AI runs show a centred card with a progress ring, a step caption, "Runs on your device" and Cancel.
  - *Picking things:* `FeatureButton` tiles (44 px `raised` square with the icon, label below; selected = accent tile,
    edited = accent dot) for tools and adjustments; `ToolChip` text chips (selected = inverted) for long lists of named
    sliders (face shape, retouch items, body, blend modes, categories); `ThumbItem` picture tiles (selected = accent
    ring with a check badge) for filters, tones, looks and effects; `ColorChip` swatches (selected = light ring with a
    gap) and `SwatchTool` round tool buttons (eyedropper, colour wheel, none).
  - *Sliders:* `EditSeekBar`: a 4 px track, accent fill (from the centre for ± values, a gradient track for colour
    sliders), a tick at the default that the thumb snaps to, a white thumb with an accent halo while dragging and a
    small value bubble. `SliderRow` adds a caption and the value.
  - *On-photo handles:* layers get an accent outline with white round corner handles and an accent rotate handle;
    crop and expand frames use accent L-shaped corners; the trim strip has accent handles and a white playhead.
  - *Results:* Save shows a "Saving full size…" card, then the **Saved** page (the result in a rounded frame, a green
    check, "Saved · It's in your gallery", Share and Open gallery). Share opens a `Sheet` with the device share menu
    (when the browser has one) and Download.
  - *Deep links:* `/edit?id=<photo>&tool=<tool>` opens straight into a tool: `crop`, `enhance`, `remove`,
    `generativefill`, `dslr`, `cutout`, `mosaic`, or a Portrait page id such as `HAIRCOLOR`.
  - *Content:* sticker packs are drawn in code (`edit/stamps.ts`) and added from the Sticker library; face filters,
    filters, brushes, fonts and collage layouts come from the asset pack. Features that need an online catalogue
    (music) say so plainly instead of showing an error.
- **Copy:** short, plain, friendly sentences in British spelling ("colour", "favourites"). No account or premium
  language anywhere.

## Anonymous sessions

There are no accounts. **Me** shows the guest session: how many photos are stored and how much space they use.
**Settings → Privacy → Clear local data** deletes all IndexedDB databases, local and session storage and Cache Storage,
then reloads into a fresh session. The login, account settings and profile name/bio screens were removed. The
Discover follows, likes, hides and reports are kept only in this browser.
