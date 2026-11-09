// GET /api/health → { ok, version, catalogs }. Liveness probe for Docker / load balancers. Reports which source
// each catalogue uses (never URLs or keys). Not rate limited, never cached.
import { connection } from "next/server";
import { providerSummary } from "@/server/providers";
import pkg from "../../../../package.json";

export async function GET() {
  await connection(); // evaluated per request, never prerendered
  return Response.json({ ok: true, version: pkg.version, catalogs: providerSummary() }, { headers: { "cache-control": "no-store" } });
}
