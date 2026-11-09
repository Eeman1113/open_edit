import type { MetadataRoute } from "next";
import { TOKENS } from "@/components/ui/theme";
import { brandUrlStatic as brandUrl } from "@/components/ui/brand-static";
import { asset } from "@/lib/base";

// Web app manifest: makes Open_Edit installable as a standalone PWA.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: asset("/"),
    name: "Open_Edit",
    short_name: "Open_Edit",
    description: "Open-source camera and photo and video editor for the web. No account, everything stays on your device.",
    start_url: asset("/"),
    scope: asset("/"),
    display: "standalone",
    orientation: "portrait",
    background_color: TOKENS.color.bg,
    theme_color: TOKENS.color.bg,
    categories: ["photo", "graphics", "multimedia"],
    icons: [
      { src: brandUrl("icon-192"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: brandUrl("icon-512"), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: brandUrl("icon-maskable-512"), sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: brandUrl("icon"), sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
