import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TOKENS, themeCss } from "@/components/ui/theme";
import { brandUrlStatic as brandUrl } from "@/components/ui/brand-static";
import { ToastHost } from "@/components/ui/Toast";
import { PackTheme } from "@/components/ui/PackTheme";
import { asset } from "@/lib/base";

export const metadata: Metadata = {
  title: { default: "Open_Edit", template: "%s · Open_Edit" },
  description: "A free, open-source camera and photo and video editor that runs in your browser. Live filters, beauty and AR effects, and on-device AI tools. No account needed.",
  applicationName: "Open_Edit",
  manifest: asset("/manifest.webmanifest"),
  icons: {
    icon: [
      { url: brandUrl("favicon"), type: "image/svg+xml" },
      { url: brandUrl("favicon-32"), sizes: "32x32", type: "image/png" },
    ],
    shortcut: brandUrl("favicon-ico"),
    apple: { url: brandUrl("apple-touch-icon"), sizes: "180x180" },
  },
  appleWebApp: { capable: true, title: "Open_Edit", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: TOKENS.color.bg,
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <head>
        {/* design tokens (src/components/ui/theme.ts); an asset pack may override them with its own stylesheet */}
        <style href="oe-theme" precedence="high">{themeCss()}</style>
      </head>
      <body>
        <div className="app-frame">
          {children}
          <ToastHost />
          <PackTheme />
        </div>
      </body>
    </html>
  );
}
