"use client";

// About Open_Edit: what it is, version, privacy and terms in plain words, credits.
import { useState } from "react";
import { ListGroup, ListRow, ScrollBody, Screen, Sheet, TopBar, Wordmark, useGoBack } from "@/components/ui";

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "0.1.0";

const PRIVACY = [
  "Open_Edit runs in your browser. There are no accounts and no sign-in.",
  "Photos and videos you take or import are stored only in this browser (IndexedDB). They are never uploaded.",
  "The AI tools download their models once and run them on your device.",
  "Settings, favourites and search history are kept in this browser’s local storage.",
  "You can delete everything at any time with Settings → Clear local data.",
  "If the site operator connects optional content services (music, effects), those catalogs are fetched through this site’s server; your photos are never sent with those requests.",
];
const TERMS = [
  "Open_Edit is free, open-source software provided as is, without warranty of any kind.",
  "You own what you create with it. Respect other people’s rights and privacy when you take, edit or share photos.",
  "Bundled models, fonts and assets keep their own licences; see Open-source licences.",
];

export function AboutBody() {
  const [sheet, setSheet] = useState<null | "privacy" | "terms">(null);
  return (
    <>
      <div className="flex flex-col items-center px-6 pb-2 pt-4 text-center">
        <Wordmark size={30} />
        <p className="mt-3 text-[14px] leading-relaxed text-fg-2">A free, open-source camera and photo and video editor for the web.</p>
      </div>
      <ListGroup>
        <ListRow icon="info" title="Version" value={APP_VERSION} />
        <ListRow icon="privacy" title="Privacy" onClick={() => setSheet("privacy")} />
        <ListRow icon="file" title="Terms of use" onClick={() => setSheet("terms")} />
        <ListRow icon="code" title="Open-source licences" href="/settings/about/opensource" />
      </ListGroup>
      <Sheet open={!!sheet} onClose={() => setSheet(null)} title={sheet === "terms" ? "Terms of use" : "Privacy"}>
        <ul className="space-y-3 px-5 pb-4 text-[14px] leading-relaxed text-fg-2">
          {(sheet === "terms" ? TERMS : PRIVACY).map((t) => <li key={t} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />{t}</li>)}
        </ul>
      </Sheet>
    </>
  );
}

export function AboutSettings() {
  const back = useGoBack("/settings");
  return (
    <Screen>
      <TopBar title="About" onBack={back} />
      <ScrollBody className="pb-10"><AboutBody /></ScrollBody>
    </Screen>
  );
}
