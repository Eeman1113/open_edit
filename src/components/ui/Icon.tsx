"use client";

// <Icon name="camera" />: every UI glyph goes through this wrapper.
// Resolution order: the active asset pack may override an icon id with an image (kind "icon", id = the name below);
// otherwise the bundled lucide-react glyph (ISC licence) is drawn. Image overrides are drawn as a CSS mask so they
// still follow `currentColor`, unless the pack marks them as full-colour (id suffix "@color").
import type { CSSProperties } from "react";
import {
  Aperture, ArrowLeft, ArrowRight, AudioLines, BadgeCheck, Ban, Bell, Blend, Bookmark, Camera, CameraOff, Check, ChevronDown,
  ChevronLeft, ChevronRight, ChevronUp, Circle, CircleAlert, CircleCheck, CircleDot, CircleUserRound, CircleX, Clock, Code,
  Compass, Contrast, Copy, Crop, Database, Download, Droplet, Ellipsis, EllipsisVertical, Eraser, Expand, ExternalLink, Eye,
  EyeOff, FileText, Film, Flag, Flashlight, FlipHorizontal2, Focus, Folder, Frame, Globe, Grid2x2, Grid3x3, GripVertical,
  Hand, Hash, Heart, House, Image, ImagePlus, Images, Info, Layers, LayoutGrid, Lightbulb, Link, List, LoaderCircle, Lock,
  Mail, MessageSquare, Minus, Moon, Music, Paintbrush, Palette, Pause, Pencil, Pipette, Play, Plus, Pointer,
  Proportions, QrCode, RectangleVertical, Redo2, Repeat2, RotateCcw, ScanFace, ScanLine, ScanQrCode, Scissors, Search, Send,
  Settings, Shapes, Share, ShieldCheck, SlidersHorizontal, Smartphone, Smile, Sparkle, Sparkles, Square, SquareDashed, Star,
  Sticker, Sun, SwitchCamera, Tag, Timer, TimerOff, Trash2, Type, Undo2, Upload, User, Users, Video, Volume2, VolumeX,
  WandSparkles, WifiOff, X, Zap, ZapOff, ZoomIn, type LucideIcon,
} from "lucide-react";
import {
  Brush, CircleDashed, CloudFog, Columns3, Diamond, Droplets, Gauge, Gem, Grip, Library, Merge, MoveHorizontal,
  MoveVertical, PaintRoller, PersonStanding, Replace, Rewind, Rotate3d, RotateCw, Rows3, Spline, SunDim, SunMedium, SwatchBook,
  TextAlignCenter, TextAlignEnd, TextAlignStart, Thermometer, Triangle, TrianglesCenterlineDashedHorizontal,
  TrianglesCenterlineDashedVertical, Waves, Wind, Wrench,
} from "lucide-react";
import { useAssetPack } from "@/lib/assets";
import { packIconUrl } from "./pack";

/** Semantic icon ids. Packs override by these ids, so keep them stable. */
export const ICONS = {
  // navigation
  home: House, discover: Compass, camera: Camera, ai: Sparkles, me: CircleUserRound, settings: Settings,
  back: ChevronLeft, forward: ChevronRight, "chevron-right": ChevronRight, "chevron-down": ChevronDown, "chevron-up": ChevronUp,
  "arrow-left": ArrowLeft, "arrow-right": ArrowRight, close: X, check: Check, plus: Plus, minus: Minus, more: Ellipsis,
  "more-vertical": EllipsisVertical, search: Search, external: ExternalLink, link: Link, menu: List,
  // camera
  flip: SwitchCamera, "flash-on": Zap, "flash-off": ZapOff, "flash-auto": Zap, torch: Flashlight, timer: Timer, "timer-off": TimerOff,
  ratio: Proportions, portrait: RectangleVertical, square: Square, full: Smartphone, grid: Grid3x3, collage: LayoutGrid,
  "grid-2": Grid2x2, bounce: Repeat2, music: Music, touch: Pointer, hand: Hand, night: Moon, exposure: Sun, focus: Focus,
  filter: Blend, beauty: Sparkle, effects: WandSparkles, gallery: Images, image: Image, "image-plus": ImagePlus, video: Video,
  record: Circle, "record-dot": CircleDot, pause: Pause, play: Play, undo: Undo2, redo: Redo2, save: Download, share: Share,
  edit: SlidersHorizontal, pencil: Pencil, original: Contrast, mirror: FlipHorizontal2, face: ScanFace, smile: Smile,
  frame: Frame, crop: Crop, layers: Layers, text: Type, sticker: Sticker, shapes: Shapes, "camera-off": CameraOff,
  sound: Volume2, mute: VolumeX, wave: AudioLines, film: Film, clock: Clock, zoom: ZoomIn, scan: ScanLine,
  // AI tools
  enhance: WandSparkles, remove: Eraser, expand: Expand, depth: Aperture, cutout: Scissors, hair: Paintbrush,
  droplet: Droplet, palette: Palette, pipette: Pipette, sparkles: Sparkles, idea: Lightbulb,
  // social / content
  heart: Heart, star: Star, bookmark: Bookmark, tag: Tag, hash: Hash, user: User, users: Users, verified: BadgeCheck,
  qr: QrCode, "qr-scan": ScanQrCode, send: Send, copy: Copy, flag: Flag, block: Ban, comment: MessageSquare, bell: Bell,
  // system
  trash: Trash2, info: Info, alert: CircleAlert, "check-circle": CircleCheck, "x-circle": CircleX, loader: LoaderCircle,
  eye: Eye, "eye-off": EyeOff, reset: RotateCcw, upload: Upload, download: Download, folder: Folder, file: FileText,
  code: Code, mail: Mail, globe: Globe, privacy: ShieldCheck, lock: Lock, storage: Database, offline: WifiOff, grip: GripVertical,
  empty: SquareDashed, logo: Aperture,
  // editors (photo, video, collage)
  tools: Wrench, curves: Spline, "split-tone": SwatchBook, brightness: SunMedium, brilliance: Gem, contrast: Contrast,
  clarity: Diamond, saturation: Droplets, sharpen: Triangle, texture: Waves, highlights: SunDim, fade: CloudFog, grain: Grip,
  warmth: Thermometer, tint: Droplet, vignette: CircleDashed, "rotate-left": RotateCcw, "rotate-right": RotateCw,
  "flip-h": TrianglesCenterlineDashedVertical, "flip-v": TrianglesCenterlineDashedHorizontal, "skew-h": MoveHorizontal, "skew-v": MoveVertical, "face-3d": Rotate3d, body: PersonStanding,
  brush: Brush, paint: PaintRoller, "skin-tone": SwatchBook, wind: Wind, merge: Merge, library: Library,
  "align-left": TextAlignStart, "align-center": TextAlignCenter, "align-right": TextAlignEnd, speed: Gauge, reverse: Rewind,
  "stack-v": Rows3, "stack-h": Columns3, replace: Replace,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  /** Pixel size (square). Default 24. */
  size?: number;
  /** Stroke width for lucide glyphs. Default 1.75 (our house style). */
  stroke?: number;
  /** Fill the glyph (hearts, stars, record dot). */
  filled?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Accessible label; omitted = decorative. */
  label?: string;
}

export function Icon({ name, size = 24, stroke = 1.75, filled, className, style, label }: IconProps) {
  useAssetPack(); // re-render when a custom pack (with icon overrides) finishes loading
  const aria = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };
  const override = packIconUrl(name);
  if (override) {
    const color = override.color;
    return (
      <span
        {...aria}
        className={className}
        style={{
          display: "inline-block", flexShrink: 0, width: size, height: size,
          ...(color
            ? { backgroundImage: `url("${override.url}")`, backgroundSize: "contain", backgroundRepeat: "no-repeat", backgroundPosition: "center" }
            : {
                background: "currentColor",
                WebkitMaskImage: `url("${override.url}")`, maskImage: `url("${override.url}")`,
                WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
                WebkitMaskPosition: "center", maskPosition: "center",
              }),
          ...style,
        }}
      />
    );
  }
  const Glyph = ICONS[name];
  return (
    <Glyph
      {...aria}
      width={size}
      height={size}
      strokeWidth={stroke}
      absoluteStrokeWidth={false}
      fill={filled ? "currentColor" : "none"}
      className={className}
      style={{ flexShrink: 0, ...style }}
    />
  );
}
