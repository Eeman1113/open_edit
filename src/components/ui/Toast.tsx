"use client";

// App-wide toast: call `toast("Saved to gallery")` from anywhere; <ToastHost/> (in the root layout) shows it.
import { useSyncExternalStore } from "react";
import { Icon, type IconName } from "./Icon";

interface ToastMsg { id: number; text: string; icon?: IconName; tone?: "default" | "danger" | "ok" }
let current: ToastMsg | null = null;
let seq = 0;
let timer: number | undefined;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function toast(text: string, opts: { icon?: IconName; tone?: ToastMsg["tone"]; ms?: number } = {}) {
  current = { id: ++seq, text, icon: opts.icon, tone: opts.tone };
  emit();
  window.clearTimeout(timer);
  timer = window.setTimeout(() => { current = null; emit(); }, opts.ms ?? 2200);
}

const subscribe = (f: () => void) => { subs.add(f); return () => subs.delete(f); };

export function ToastHost() {
  const t = useSyncExternalStore(subscribe, () => current, () => null);
  if (!t) return null;
  const tint = t.tone === "danger" ? "text-danger" : t.tone === "ok" ? "text-ok" : "text-accent";
  return (
    <div className="pointer-events-none absolute inset-x-0 z-[200] flex justify-center px-6" style={{ bottom: "calc(var(--oe-bottom-nav) + 24px)" }}>
      <div
        key={t.id}
        role="status"
        aria-live="polite"
        className="flex max-w-full items-center gap-2.5 rounded-md bg-raised/95 px-4 py-3 text-[14px] leading-snug text-fg shadow-xl ring-1 ring-line backdrop-blur-md"
        style={{ animation: "oe-rise 200ms var(--oe-ease)" }}
      >
        {t.icon && <Icon name={t.icon} size={18} className={tint} />}
        <span className="whitespace-pre-line">{t.text}</span>
      </div>
    </div>
  );
}
