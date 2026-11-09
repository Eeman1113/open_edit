"use client";

// Back navigation on the web: the Escape key closes the topmost open thing.
//
// One window listener dispatches to a stack of handlers, newest-mounted first:
// the deepest open thing (dialog → sheet / share bar → sub-page / tool page → panel → screen) closes first. A handler
// returns `false` to pass the press on to the next one (e.g. a screen with no panel open).
//
// Order = render order of the first mount (useState initialiser), so a child rendered in the same commit as its
// parent still sits above it, and anything opened later (a sheet, a dialog) is above everything that was there.
// While a text field has focus, the first press only blurs the field.
import { useEffect, useRef, useState } from "react";

type Handler = () => boolean | void;
interface Entry { order: number; enabled: boolean; fn: () => boolean | void }

const entries = new Set<Entry>();
let seq = 0;
let installed = false;

function isTyping(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return true;
  return el instanceof HTMLInputElement && !["button", "checkbox", "radio", "range", "file", "submit", "reset", "color"].includes(el.type);
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== "Escape" || e.defaultPrevented || e.repeat) return;
  const active = document.activeElement;
  if (isTyping(active)) {
    active.blur();
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }
  const list = [...entries].filter((x) => x.enabled).sort((a, b) => b.order - a.order);
  for (const x of list) {
    if (x.fn() !== false) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
  }
}

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  // capture phase: runs before any element / bubbling listener, so one press closes exactly one thing
  window.addEventListener("keydown", onKeyDown, true);
}

/** Simulates a hardware back press (dev / tests): returns true when a handler consumed it. */
export function pressBack(): boolean {
  const list = [...entries].filter((x) => x.enabled).sort((a, b) => b.order - a.order);
  return list.some((x) => x.fn() !== false);
}

/**
 * Registers a back (Escape) handler while the component is mounted and `enabled` is true. The newest mounted
 * handler runs first; return `false` from it to let the next one handle the press.
 */
export function useBackHandler(handler: Handler, enabled = true) {
  const [order] = useState(() => ++seq);
  const ref = useRef(handler);
  useEffect(() => { ref.current = handler; });
  const entry = useRef<Entry | null>(null);
  useEffect(() => {
    install();
    const x: Entry = { order, enabled, fn: () => ref.current() };
    entry.current = x;
    entries.add(x);
    return () => { entries.delete(x); entry.current = null; };
    // `enabled` is synced by the effect below; registering once keeps the mount order
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);
  useEffect(() => { if (entry.current) entry.current.enabled = enabled; }, [enabled]);
}
