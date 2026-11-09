// On-device AI tools offered from the AI tab. `tool` is the editor tool id passed as /edit?id=<photo>&tool=<tool>.
import type { IconName } from "@/components/ui";

export interface AiTool {
  tool: string;
  icon: IconName;
  name: string;
  blurb: string;
  /** Model family, shown as a small credit line. */
  model: string;
}

export const AI_TOOLS: AiTool[] = [
  { tool: "enhance", icon: "enhance", name: "Enhance", blurb: "Sharpen and upscale soft or small photos.", model: "Real-ESRGAN" },
  { tool: "remove", icon: "remove", name: "Remove", blurb: "Brush over people or objects to erase them.", model: "MI-GAN" },
  { tool: "generativefill", icon: "expand", name: "Expand", blurb: "Grow the canvas and fill in the edges.", model: "MI-GAN" },
  { tool: "dslr", icon: "depth", name: "Depth blur", blurb: "Add a soft background blur, like a big lens.", model: "Depth Anything V2" },
  { tool: "cutout", icon: "cutout", name: "Cutout", blurb: "Lift the subject off the background.", model: "MediaPipe" },
  { tool: "HAIRCOLOR", icon: "hair", name: "Hair colour", blurb: "Try a new hair colour in one tap.", model: "MediaPipe" },
];

export const aiToolById = (t: string | null | undefined) => AI_TOOLS.find((x) => x.tool === t);

/** Editor link for a photo with a tool pre-selected. */
export const editorHref = (photoId: string, tool: string) => `/edit?id=${encodeURIComponent(photoId)}&tool=${encodeURIComponent(tool)}`;
