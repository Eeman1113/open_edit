"use client";

// AI tab: a launcher for the on-device AI tools. Pick a tool, pick a photo, and the editor opens with that tool.
// Every model runs locally in the browser (WebGPU / WASM); nothing is uploaded.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BottomNav, Icon, cx } from "@/components/ui";
import { PhotoPicker } from "./PhotoPicker";
import { AI_TOOLS, editorHref, type AiTool } from "./tools";

export function AiTab({ initialTool }: { initialTool?: string }) {
  const router = useRouter();
  const [tool, setTool] = useState<AiTool | null>(() => AI_TOOLS.find((t) => t.tool === initialTool) ?? null);
  return (
    <div className="absolute inset-0 flex flex-col bg-bg" style={{ paddingBottom: "var(--oe-bottom-nav)" }}>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-8">
        <header className="px-4 pt-[max(16px,env(safe-area-inset-top))]">
          <h1 className="font-display text-[28px] font-bold tracking-tight">AI tools</h1>
          <p className="mt-1 text-[14px] leading-relaxed text-fg-2">Smart edits that run entirely on your device. Pick a tool, then a photo.</p>
        </header>

        <div className="mt-5 grid grid-cols-2 gap-3 px-4">
          {AI_TOOLS.map((t, i) => (
            <button
              key={t.tool}
              type="button"
              data-tool={t.tool}
              onClick={() => setTool(t)}
              className={cx("oe-press relative flex flex-col items-start overflow-hidden rounded-xl p-4 text-left", i === 0 ? "col-span-2 bg-accent text-on-accent" : "bg-panel")}
            >
              <span className={cx("flex h-11 w-11 items-center justify-center rounded-md", i === 0 ? "bg-black/10" : "bg-accent-soft text-accent")}>
                <Icon name={t.icon} size={24} />
              </span>
              <span className="mt-4 font-display text-[18px] font-bold">{t.name}</span>
              <span className={cx("mt-1 text-[13px] leading-snug", i === 0 ? "text-on-accent/75" : "text-fg-2")}>{t.blurb}</span>
              <span className={cx("mt-3 text-[11px] font-medium uppercase tracking-[0.06em]", i === 0 ? "text-on-accent/60" : "text-fg-3")}>{t.model}</span>
              <Icon name="arrow-right" size={20} className={cx("absolute right-4 top-4", i === 0 ? "" : "text-fg-3")} />
            </button>
          ))}
        </div>

        <div className="mx-4 mt-6 flex gap-3 rounded-lg bg-panel p-4">
          <Icon name="privacy" size={22} className="shrink-0 text-ok" />
          <p className="text-[13px] leading-relaxed text-fg-2">
            Models download once and are cached by your browser. Your photos are processed locally and never sent to a server.
          </p>
        </div>
      </div>
      <PhotoPicker open={!!tool} title={tool ? `${tool.name}: choose a photo` : ""} onClose={() => setTool(null)} onPick={(id) => tool && router.push(editorHref(id, tool.tool))} />
      <BottomNav active="ai" />
    </div>
  );
}
