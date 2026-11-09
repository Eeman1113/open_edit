"use client";

// Compatibility wrapper: the older strength-bar API on top of the design-system <Slider>.
// New code should use <Slider> from "@/components/ui" directly.
import type { CSSProperties } from "react";
import { Slider, SLIDER_HEIGHT } from "@/components/ui";

export type SeekBarType = "WHITE" | "BLACK";

export interface CustomSeekBarProps {
  value: number;
  def: number;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  /** WHITE = over a picture, BLACK = on a panel. */
  type?: SeekBarType;
  showText?: boolean;
  showDefaultDot?: boolean;
  shadow?: boolean;
  bidirectional?: boolean;
  magnet?: boolean;
  magnetPoints?: number[];
  min?: number;
  max?: number;
  locked?: boolean;
  paddingBottom?: number;
  className?: string;
  style?: CSSProperties;
}

/** Height the bar occupies. */
export function seekBarHeight(showText = true, paddingBottom = 0) {
  return (showText ? SLIDER_HEIGHT : SLIDER_HEIGHT - 16) + paddingBottom;
}

export function CustomSeekBar({
  value, def, onChange, onCommit, type = "WHITE", showText = true, showDefaultDot = true, bidirectional = false, magnet = true,
  min = 0, max = 1, locked = false, paddingBottom = 0, className, style,
}: CustomSeekBarProps) {
  return (
    <Slider
      value={value}
      onChange={onChange}
      onCommit={onCommit}
      min={min}
      max={max}
      def={showDefaultDot || magnet ? def : undefined}
      snap={magnet ? 0.025 : 0}
      bipolar={bidirectional}
      label={showText ? "always" : "never"}
      tone={type === "WHITE" ? "overlay" : "default"}
      disabled={locked}
      className={className}
      style={{ height: seekBarHeight(showText, paddingBottom), paddingBottom, ...style }}
    />
  );
}
