// Server-safe brand lookup for the root layout and the web manifest (React Server Components cannot import the
// client asset-pack store). Resolves brand ids from the bundled open pack manifest; a custom pack that ships its
// own brand files is used when NEXT_PUBLIC_ASSET_PACK names it and its folder follows the same layout.
import openManifest from "../../../public/packs/open/manifest.json";
import { asset } from "@/lib/base";

type Manifest = { kinds: Record<string, Record<string, { path: string }>> };
const PACK = (process.env.NEXT_PUBLIC_ASSET_PACK || "open").replace(/[^a-z0-9_-]/gi, "") || "open";

export function brandUrlStatic(id: string): string {
  const entry = (openManifest as Manifest).kinds.brand?.[id];
  return entry ? asset(`/packs/${PACK}/${entry.path}`) : "";
}
