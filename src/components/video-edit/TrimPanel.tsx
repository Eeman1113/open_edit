"use client";

// Trim tab: a strip of frames with two accent handles that set the start and end, a playhead, and the length of the
// kept section. Clips longer than five minutes scroll under the handles.
import { useEffect, useMemo, useRef, useState } from "react";
import { FRAME, MAX_MS, MIN_MS, fmtDuration } from "./model";

const HANDLE_W = 16;
const CELLS = 6;

interface Props {
  url: string;
  width: number;
  /** Source duration (ms). */
  duration: number;
  start: number;
  end: number;
  pos: number;
  speed: number;
  /** Bottom of the panel (px from the bottom of the editor). */
  bottom: number;
  onStart: () => void;
  onMove: (start: number, end: number, edge: "L" | "R") => void;
  onEnd: (start: number, end: number) => void;
  onScrub?: (ms: number) => void;
}

/** Up to 5 min the strip is exactly CELLS frames wide; longer clips get one frame per 5 min / CELLS and scroll. */
function frameDuration(duration: number, speed: number) {
  return duration < MAX_MS * speed ? duration / CELLS : (MAX_MS * speed) / CELLS;
}

export function TrimPanel({ url, width, duration, start, end, pos, speed, bottom, onStart, onMove, onEnd }: Props) {
  const pad = Math.max(HANDLE_W + 4, (width - FRAME * CELLS) / 2);
  const fd = frameDuration(duration, speed);
  const count = Math.ceil(duration / fd - 1e-6);
  const pxPerMs = FRAME / fd;
  const listRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState(0);
  const scrollMs = scroll / pxPerMs;
  const xOf = (ms: number) => pad + (ms - scrollMs) * pxPerMs;
  const msOf = (x: number) => scrollMs + (x - pad) / pxPerMs;
  const maxRight = pad + FRAME * CELLS;
  const leftX = xOf(start), rightX = Math.min(xOf(end), maxRight, pad + (duration - scrollMs) * pxPerMs);
  const minGap = Math.ceil(MIN_MS * speed * pxPerMs);

  // frame thumbnails
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

  // handle drag (a 20 px slop around each handle)
  const drag = useRef<{ edge: "L" | "R" } | null>(null);
  const clampL = (x: number) => Math.max(pad, Math.min(x, rightX - minGap));
  const clampR = (x: number) => Math.min(maxRight, pad + (duration - scrollMs) * pxPerMs, Math.max(x, leftX + minGap));
  const toTimes = (edge: "L" | "R", x: number): [number, number] => {
    if (edge === "L") return [Math.max(0, msOf(clampL(x))), end];
    return [start, Math.min(duration, msOf(clampR(x)))];
  };

  // playhead
  const pointerX = end > start ? leftX + ((pos - start) / (end - start)) * (rightX - leftX) : leftX;
  const durText = fmtDuration((end - start) / speed);

  const cells = useMemo(() => Array.from({ length: count }, (_, i) => {
    const len = Math.min(fd, duration - i * fd);
    return { i, w: (FRAME * len) / fd };
  }), [count, fd, duration]);

  return (
    <div className="absolute inset-x-0 z-20" style={{ bottom, height: 140 }}>
      <div className="absolute inset-x-0 top-3 flex items-center justify-between px-5 text-[12px]">
        <span className="font-medium text-fg-3">Drag the ends to trim</span>
        <span className="tabular rounded-full bg-raised px-2.5 py-1 font-semibold text-fg">{durText}</span>
      </div>
      {/* frames */}
      <div
        ref={listRef}
        className="no-scrollbar absolute inset-x-0 flex"
        style={{ top: 50, height: FRAME, paddingLeft: pad, paddingRight: pad, overflowX: count > CELLS ? "auto" : "hidden" }}
        onScroll={(e) => {
          const sc = e.currentTarget.scrollLeft;
          setScroll(sc);
          // scrolling moves the section (its length is kept)
          const ns = sc / pxPerMs + (leftX - pad) / pxPerMs;
          onMove(ns, ns + (end - start), "L");
        }}
      >
        {cells.map((c, i) => (
          <div key={c.i} className="flex-none overflow-hidden bg-raised" style={{ width: c.w, height: FRAME, borderTopLeftRadius: i === 0 ? 8 : 0, borderBottomLeftRadius: i === 0 ? 8 : 0, borderTopRightRadius: i === cells.length - 1 ? 8 : 0, borderBottomRightRadius: i === cells.length - 1 ? 8 : 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {thumbs[c.i] && <img src={thumbs[c.i]} alt="" draggable={false} style={{ width: FRAME, height: FRAME, objectFit: "cover", maxWidth: "none" }} />}
          </div>
        ))}
      </div>
      {/* section and handles */}
      <div
        className="absolute inset-x-0 touch-none"
        style={{ top: 50, height: FRAME }}
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
          const [st, en] = toTimes(drag.current.edge, e.clientX - r.left);
          onMove(st, en, drag.current.edge);
        }}
        onPointerUp={(e) => {
          if (!drag.current) return;
          const r = e.currentTarget.getBoundingClientRect();
          const [st, en] = toTimes(drag.current.edge, e.clientX - r.left);
          drag.current = null;
          onEnd(st, en);
        }}
        onPointerCancel={() => { drag.current = null; onEnd(start, end); }}
      >
        <div className="pointer-events-none absolute inset-y-0 bg-bg/75" style={{ left: pad - HANDLE_W, width: Math.max(0, leftX - pad + HANDLE_W) }} />
        <div className="pointer-events-none absolute inset-y-0 bg-bg/75" style={{ left: rightX, right: pad - HANDLE_W }} />
        <div className="pointer-events-none absolute inset-y-0 border-y-[3px] border-accent" style={{ left: leftX, width: Math.max(0, rightX - leftX) }} />
        {(["L", "R"] as const).map((edge) => (
          <span
            key={edge}
            className="pointer-events-none absolute inset-y-0 flex items-center justify-center bg-accent"
            style={{ left: edge === "L" ? leftX - HANDLE_W : rightX, width: HANDLE_W, borderRadius: edge === "L" ? "8px 0 0 8px" : "0 8px 8px 0" }}
          >
            <span className="h-5 w-[3px] rounded-full bg-on-accent/60" />
          </span>
        ))}
        {/* playhead */}
        <span className="pointer-events-none absolute -bottom-1.5 -top-1.5 w-[3px] -translate-x-1/2 rounded-full bg-white shadow-[0_0_4px_rgba(0,0,0,0.6)]" style={{ left: pointerX }} />
      </div>
    </div>
  );
}
