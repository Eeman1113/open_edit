"use client";

// Third-party software, models and fonts used by Open_Edit, with their licences.
import { ListGroup, ListRow, ScrollBody, Screen, TopBar, useGoBack } from "@/components/ui";

const ITEMS: { group: string; rows: [string, string, string][] }[] = [
  { group: "Open_Edit", rows: [["Open_Edit", "MIT", "The app itself"]] },
  {
    group: "Runtime",
    rows: [
      ["Next.js", "MIT", "Web framework"], ["React", "MIT", "UI library"], ["Tailwind CSS", "MIT", "Styling"],
      ["onnxruntime-web", "MIT", "Runs the AI models"], ["MediaPipe Tasks Vision", "Apache-2.0", "Face, body and hair tracking"],
      ["heic-to / libheif", "LGPL-3.0", "Opens iPhone HEIC photos"], ["Lucide", "ISC", "Icons"],
    ],
  },
  {
    group: "AI models",
    rows: [["Real-ESRGAN", "BSD-3-Clause", "Enhance"], ["MI-GAN", "MIT", "Remove and Expand"], ["Depth Anything V2 Small", "Apache-2.0", "Depth blur"]],
  },
  { group: "Fonts", rows: [["Inter", "OFL-1.1", "Interface text"], ["Space Grotesk", "OFL-1.1", "Headings and logo"]] },
];

export function OpenSourceLicense() {
  const back = useGoBack("/settings/about");
  return (
    <Screen>
      <TopBar title="Open-source licences" onBack={back} />
      <ScrollBody className="pb-10">
        <p className="px-5 pt-2 text-[14px] leading-relaxed text-fg-2">Open_Edit is built on these projects. Thank you to everyone who makes them.</p>
        {ITEMS.map((g) => (
          <ListGroup key={g.group} title={g.group}>
            {g.rows.map(([name, lic, what]) => <ListRow key={name} title={name} subtitle={what} value={lic} />)}
          </ListGroup>
        ))}
      </ScrollBody>
    </Screen>
  );
}
