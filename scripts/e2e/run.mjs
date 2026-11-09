// usage: node scripts/e2e/run.mjs [flowFilter...]   (flows live in scripts/e2e/flows/NN-name.mjs)
//        node scripts/e2e/run.mjs --probe /route ["js;;js"]  → prints clickables + screenshot
import { readdirSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launch, SCRATCH, OUT } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const y4m = process.env.E2E_Y4M ?? path.join(SCRATCH, "e2e/user.y4m");
const argv = process.argv.slice(2);
const s = await launch({ y4m });
const guard = setTimeout(() => { console.log("GLOBAL TIMEOUT"); s.kill(); process.exit(2); }, Number(process.env.E2E_TIMEOUT ?? 900000));

try {
  if (argv[0] === "--probe") {
    s.flow = "probe"; s.flowNo = 99;
    await s.goto(argv[1], { settle: Number(process.env.SETTLE ?? 2500) });
    for (const js of (argv[2] ?? "").split(";;").filter(Boolean)) { console.log("js→", JSON.stringify(await s.ev(js).catch((e) => e.message))?.slice(0, 400)); await s.sleep(Number(process.env.STEP ?? 1200)); }
    console.log(await s.path());
    console.log((await s.clickables()).join("\n"));
    console.log("audit:", await s.visualAudit());
    console.log("shot:", await s.shot(process.env.NAME ?? "x"));
    console.log("errors:", s.errors);
  } else {
    const files = readdirSync(path.join(here, "flows")).filter((f) => /^\d\d-.*\.mjs$/.test(f)).sort()
      .filter((f) => !argv.length || argv.some((a) => f.includes(a)));
    for (const f of files) {
      const [, no, name] = f.match(/^(\d\d)-(.*)\.mjs$/);
      s.flow = name; s.flowNo = Number(no);
      console.log(`\n== ${no} ${name}`);
      const mod = await import(pathToFileURL(path.join(here, "flows", f)).href);
      try { await mod.default(s); } catch (e) { s.results.push({ flow: name, step: "(flow crashed)", ok: false, error: e.message, errs: [] }); console.log("  FLOW CRASH", e.message); }
    }
    const byFlow = {};
    for (const r of s.results) (byFlow[r.flow] ??= []).push(r);
    const summary = Object.entries(byFlow).map(([flow, rs]) => ({ flow, pass: rs.filter((r) => r.ok).length, total: rs.length }));
    mkdirSync(path.join(SCRATCH, "e2e"), { recursive: true });
    const tag = argv.length ? argv.join("_").replace(/[^\w-]/g, "") : "all";
    writeFileSync(path.join(SCRATCH, `e2e/results-${tag}.json`), JSON.stringify({ summary, results: s.results, errors: s.errors }, null, 1));
    console.log("\nSUMMARY"); for (const x of summary) console.log(`  ${x.pass === x.total ? "PASS" : "FAIL"} ${x.flow} ${x.pass}/${x.total}`);
    console.log("screens in", OUT);
  }
} finally {
  clearTimeout(guard);
  try { s.ws.close(); } catch {}
  s.kill();
}
process.exit(0);
