#!/usr/bin/env node
// Regenerates every generated asset of the built-in "open" pack (public/packs/open) and the demo feed fixtures.
// Order matters: the feed aliases filter swatches and sticker previews, so it runs last.
// Run: node --no-warnings scripts/gen-all.mjs
import { generate as luts } from "./gen-luts.mjs";
import { generate as stickers } from "./gen-stickers.mjs";
import { generate as brushes } from "./gen-brushes.mjs";
import { generate as collage } from "./gen-collage.mjs";
import { generate as fonts } from "./gen-fonts.mjs";
import { generate as feed } from "./gen-feed.mjs";
import { generate as content } from "./gen-content.mjs";

const steps = [["luts", luts], ["stickers", stickers], ["brushes", brushes], ["collage", collage], ["fonts", fonts], ["feed", feed], ["content", content]];
for (const [name, run] of steps) {
  const t = Date.now();
  const r = await run();
  console.log(`${name.padEnd(9)} ${JSON.stringify(r)} (${Date.now() - t} ms)`);
}
