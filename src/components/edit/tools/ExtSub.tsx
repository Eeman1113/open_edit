"use client";

// Router for the Tools and Portrait tool pages (sub ids "x:<page>").
import { CutoutTool } from "./Cutout";
import { DslrTool } from "./Dslr";
import { EnhanceTool } from "./Enhance";
import { ExpandTool } from "./Expand";
import { MosaicTool } from "./Mosaic";
import { RemoveTool } from "./Remove";
import { ManualSkinPage, PaintPage } from "./portrait/Brushes";
import { EyeLightPage, FacePage, IconListPage, MakeupPage, VolumePage } from "./portrait/FaceTools";
import { HairColorPage, HdSkinPage } from "./AiPortrait";
import { LiquifyPage } from "./portrait/Liquify";

export type ExtPage =
  | "remove" | "generativefill" | "mosaic" | "enhance" | "dslr" | "cutout"
  | "RESHAPE" | "FACE_RATIO" | "RESHAPE3D" | "RETOUCH" | "MAKEUP" | "HDSKIN" | "SKIN_RETOUCH" | "BODY" | "PAINT" | "EYELIGHT" | "HAIRCOLOR" | "HAIRVOLUME";

export const isExtSub = (s: unknown): s is `x:${string}` => typeof s === "string" && s.startsWith("x:");

export function ExtSub({ sub }: { sub: string }) {
  const page = sub.slice(2) as ExtPage;
  switch (page) {
    case "remove": return <RemoveTool />;
    case "generativefill": return <ExpandTool />;
    case "mosaic": return <MosaicTool />;
    case "enhance": return <EnhanceTool />;
    case "dslr": return <DslrTool />;
    case "cutout": return <CutoutTool />;
    case "RESHAPE": return <FacePage />;
    case "FACE_RATIO": case "RESHAPE3D": case "BODY": return <IconListPage kind={page} />;
    case "RETOUCH": return <LiquifyPage />;
    case "MAKEUP": return <MakeupPage />;
    case "HDSKIN": return <HdSkinPage />;
    case "SKIN_RETOUCH": return <ManualSkinPage />;
    case "PAINT": return <PaintPage />;
    case "EYELIGHT": return <EyeLightPage />;
    case "HAIRCOLOR": return <HairColorPage />;
    case "HAIRVOLUME": return <VolumePage />;
    default: return null;
  }
}
