#!/usr/bin/env node
// After `next build`: copy public/ and .next/static into the standalone output so `npm start`
// (node .next/standalone/server.js) serves them. Skipped on Vercel, which serves static files itself.
import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const SA = join(ROOT, ".next", "standalone");
if (process.env.VERCEL || !existsSync(SA)) process.exit(0);
cpSync(join(ROOT, "public"), join(SA, "public"), { recursive: true });
cpSync(join(ROOT, ".next", "static"), join(SA, ".next", "static"), { recursive: true });
console.log("postbuild: copied public/ and .next/static into .next/standalone");
