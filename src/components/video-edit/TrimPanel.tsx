"use client";

// Trim tab (VideoEditTabType.VideoEdit, group video_edit_group): frame_recyclerview (54dp cells, VideoFrameAdapter),
// VideoSectionView (edit_handle_left / _right, #000 alpha 204 outside the section), VideoTimeBarView
// (edit_video_pointer, 72dp) and duration_textview (11dp, right-aligned to the right handle).
import { useEffect, useMemo, useRef, useState } from "react";
import { d } from "@/components/ui/legacy-drawable";
import { FRAME, MAX_MS, MIN_MS, fmtDuration } from "./model";

const HANDLE_W = 16; // edit_handle_left: 48px @3x
const CELLS = 5;

interface Props {
  url: string;
  width: number;
  /** Source duration (ms). */
  duration: number;
  start: number;
  end: number;
  pos: number;
  speed: number;
  /** Top of the strip (px from the top of the screen area). */
  top: number;
  onStart: () => void;
  onMove: (start: number, end: number, edge: "L" | "R") => void;
  onEnd: (start: number, end: number) => void;
  onScrub?: (ms: number) => void;
}

/** C14816a.m61362a: below 5 min the strip is exactly five cells; above, each cell is 1 min and the list scrolls. */
function frameDuration(duration: number, speed: number) {
  return duration < MAX_MS * speed ? duration / CELLS : (MAX_MS * speed) / CELLS;
}

export function TrimPanel({ url, width, duration, start, end, pos, speed, top, onStart, onMove, onEnd }: Props) {
  const pad = Math.max(HANDLE_W, (width - FRAME * CELLS) / 2); // VideoSectionHandler.m61239C
  const fd = frameDuration(duration, speed);
  const count = Math.ceil(duration / fd - 1e-6);
  const pxPerMs = FRAME / fd;
  const listRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState(0);
  const scrollMs = scroll / pxPerMs;
  const xOf = (ms: number) => pad + (ms - scrollMs) * pxPerMs;
  const msOf = (x: number) => scrollMs + (x - pad) / pxPerMs;
  const maxRight = pad + FRAME * CELLS; // setMaxRightX
  const leftX = xOf(start), rightX = Math.min(xOf(end), maxRight, pad + (duration - scrollMs) * pxPerMs);
  const minGap = Math.ceil(MIN_MS * speed * pxPerMs); // setBarGap

  // thumbnails (VideoFrameAdapter / Glide video frames)
  const [thumbs, setThumbs] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    const v = document.createElement("video");
    v.muted = true; v.preload = "auto"; v.src = url;
    const out: string[] = [];
    const run = async () => {
      await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error("v")); });
      const c = document.createElement("canvas");
      const s = (FRAME * 2) / Math.min(v.videoWidth, v.videoHeight);
      c.width = Math.round(v.videoWidth * s); c.height = Math.round(v.videoHeight * s);
      for (let i = 0; i < count && alive; i++) {
        await new Promise<void>((res) => { v.onseeked = () => res(); v.currentTime = Math.min(duration - 1, i * fd + Math.min(fd, duration - i * fd) / 2) / 1000; });
        c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
        out[i] = c.toDataURL("image/jpeg", 0.7);
        if (alive) setThumbs([...out]);
      }
    };
    void run().catch(() => undefined);
    return () => { alive = false; v.removeAttribute("src"); v.load(); };
  }, [url, count, fd, duration]);

  // handle drag (VideoSectionView.onTouchEvent: 20dp / 10dp slop around each handle)
  const drag = useRef<{ edge: "L" | "R" } | null>(null);
  const clampL = (x: number) => Math.max(pad, Math.min(x, rightX - minGap));
  const clampR = (x: number) => Math.min(maxRight, pad + (duration - scrollMs) * pxPerMs, Math.max(x, leftX + minGap));
  const toTimes = (edge: "L" | "R", x: number): [number, number] => {
    if (edge === "L") return [Math.max(0, msOf(clampL(x))), end];
    return [start, Math.min(duration, msOf(clampR(x)))];
  };

  // VideoTimeBarView pointer
  const pointerX = end > start ? leftX + ((pos - start) / (end - start)) * (rightX - leftX) : leftX;
  const durText = fmtDuration((end - start) / speed);

  const cells = useMemo(() => Array.from({ length: count }, (_, i) => {
    const len = Math.min(fd, duration - i * fd);
    return { i, w: (FRAME * len) / fd };
  }), [count, fd, duration]);

  return (
    <div className="absolute inset-x-0" style={{ top: top - 30, height: 30 + FRAME + 9 }}>
      {/* duration_textview: 11dp, gravity right, marginBottom 8, paddingRight = W − rightBarX − handle */}
      <div className="absolute inset-x-0 text-right text-white" style={{ top: 30 - 8 - 13, fontSize: 11, lineHeight: "13px", paddingRight: Math.max(0, width - rightX - HANDLE_W) }}>{durText}</div>
      {/* frame_recyclerview */}
      <div
        ref={listRef}
        className="no-scrollbar absolute inset-x-0 flex overflow-x-auto bg-black"
        style={{ top: 30, height: FRAME, paddingLeft: pad, paddingRight: pad, overflowX: count > CELLS ? "auto" : "hidden" }}
        onScroll={(e) => {
          const s = e.currentTarget.scrollLeft;
          setScroll(s);
          // scrolling moves the section (length kept)
          const ns = s / pxPerMs + (leftX - pad) / pxPerMs;
          onMove(ns, ns + (end - start), "L");
        }}
      >
        {cells.map((c) => (
          <div key={c.i} className="flex-none overflow-hidden bg-[#111]" style={{ width: c.w, height: FRAME }}>
            {thumbs[c.i] && <img src={thumbs[c.i]} alt="" draggable={false} style={{ width: FRAME, height: FRAME, objectFit: "cover", maxWidth: "none" }} />}
          </div>
        ))}
      </div>
      {/* VideoSectionView */}
      <div
        className="absolute inset-x-0 touch-none"
        style={{ top: 30, height: FRAME }}
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - r.left;
          const nearL = x >= leftX - HANDLE_W - 20 && x <= leftX + 20;
          const nearR = x >= rightX - 20 && x <= rightX + HANDLE_W + 20;
          if (!nearL && !nearR) return;
          const edge = nearL && nearR ? (Math.abs(x - leftX) < Math.abs(x - rightX) ? "L" : "R") : nearL ? "L" : "R";
          drag.current = { edge };
          e.currentTarget.setPointerCapture(e.pointerId);
          e.stopPropagation();
          onStart();
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const r = e.currentTarget.getBoundingClientRect();
          const [s, en] = toTimes(drag.current.edge, e.clientX - r.left);
          onMove(s, en, drag.current.edge);
        }}
        onPointerUp={(e) => {
          if (!drag.current) return;
          const r = e.currentTarget.getBoundingClientRect();
          const [s, en] = toTimes(drag.current.edge, e.clientX - r.left);
          drag.current = null;
          onEnd(s, en);
        }}
        onPointerCancel={() => { drag.current = null; onEnd(start, end); }}
      >
        <div className="pointer-events-none absolute inset-y-0" style={{ left: pad - HANDLE_W, width: Math.max(0, leftX - pad + HANDLE_W), background: "rgba(0,0,0,0.8)" }} />
        <div className="pointer-events-none absolute inset-y-0" style={{ left: rightX, right: pad - HANDLE_W, background: "rgba(0,0,0,0.8)" }} />
        <img src={d("edit_handle_left")} alt="" draggable={false} className="pointer-events-none absolute" style={{ left: leftX - HANDLE_W, top: 0, width: HANDLE_W, height: FRAME }} />
        <img src={d("edit_handle_right")} alt="" draggable={false} className="pointer-events-none absolute" style={{ left: rightX, top: 0, width: HANDLE_W, height: FRAME }} />
      </div>
      {/* VideoTimeBarView: 72dp tall, centred on the strip */}
      <img src={d("edit_video_pointer")} alt="" draggable={false} className="pointer-events-none absolute" style={{ left: pointerX - 5, top: 30 + FRAME / 2 - 36, width: 10, height: 72 }} />
    </div>
  );
}
