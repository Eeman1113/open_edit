# Contributing to Open_Edit

Thanks for helping. Open_Edit is a clean-room, open-source project, so the most important rule is about where
things come from.

## Ground rules

- **Everything must be original or permissively licensed.** Do not copy images, icons, filter tables, shaders,
  textures, face-warp data, layouts, UI text or brand names from any other app or its packages, and do not add
  decompiled code. New third-party code, fonts, models or media need an MIT, ISC, BSD, Apache-2.0, OFL or similar
  licence; add them to `NOTICE.md` (and their licence text to `licenses/` if they don't ship one).
- **Assets go through the asset pack.** Add replaceable assets to `public/packs/open/` through a generator in
  `scripts/` and look them up with `getAsset(kind, id)` / `useAsset(kind, id)`; never hard-code a path. See
  `docs/engine.md`.
- **No accounts, no paywalls, no tracking.** Every feature works for an anonymous visitor, and photos stay on the
  device. Server-side features go through `src/app/api/**` with secrets in server-only env vars
  (`docs/platform.md`).
- **Write UI text in plain, friendly British English** ("colour", "favourites"), and use the design system in
  `src/components/ui` (`docs/design.md`).

## Getting started

```sh
nvm use 24            # Node.js 24
npm install
npm run dev           # http://localhost:3000
```

## Before you open a pull request

```sh
npm run typecheck     # tsc --noEmit
npx eslint src        # lint
npm run audit         # provenance audit + dependency licence check
```

If you changed a generator, run it (`npm run gen:assets` or the single script) and commit the regenerated files.
For UI changes, attach before/after screenshots. End-to-end flows live in `scripts/e2e` (`npm run e2e` against a
running dev server); please update them when you change UI text or routes.

## Pull requests

- Keep each pull request focused on one change and describe what and why.
- Code comments explain intent in our own words; no references to other products.
- By contributing you agree that your contribution is licensed under the MIT licence of this project.

## Reporting bugs and ideas

Use the issue templates. For security problems, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
