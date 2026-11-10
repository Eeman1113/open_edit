// Exploration helper: keeps ONE headless Chrome open and runs flow-style code sent over HTTP.
//   node scripts/e2e/repl.mjs &   then   curl -s localhost:9339 --data-binary 'await s.goto("/"); return await s.clickables()'
// The body is the body of an async function with `s` (Session) and `h` (scripts/e2e/h.mjs) in scope.
// POST /quit kills Chrome and exits.
import http from "node:http";
import { launch } from "./lib.mjs";
import * as h from "./h.mjs";

const s = await launch({ y4m: process.env.E2E_Y4M });
s.flow = "repl"; s.flowNo = 98;
const port = Number(process.env.REPL_PORT ?? 9339);
const srv = http.createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  if (req.url === "/quit") { res.end("bye\n"); s.kill(); process.exit(0); }
  const e0 = s.errors.length;
  let out;
  try { out = await new Function("s", "h", `return (async () => { ${body} })()`)(s, h); }
  catch (e) { out = "ERROR " + e.message; }
  const errs = s.errors.slice(e0).map((e) => `${e.kind}: ${e.text}`);
  res.end(JSON.stringify(out, null, 1) + (errs.length ? "\nERRS:\n" + errs.join("\n") : "") + "\n");
});
srv.listen(port, "127.0.0.1", () => console.log("repl on", port));
setTimeout(() => { s.kill(); process.exit(0); }, Number(process.env.REPL_TTL ?? 3600000));
