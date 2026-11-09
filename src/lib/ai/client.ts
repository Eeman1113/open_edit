// Main-thread side of the AI worker: one lazily created module worker shared by all tools.
import type { ModelId } from "./models";
import type { AiRequest, AiResponse, AiResult } from "./protocol";

export type Progress = (stage: "download" | "run", value: number) => void;
export interface CallOpts { onProgress?: Progress; signal?: AbortSignal }

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { res: (r: AiResult) => void; rej: (e: Error) => void; onProgress?: Progress }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module", name: "openedit-ai" });
  worker.onmessage = (e: MessageEvent<AiResponse>) => {
    const m = e.data;
    const p = pending.get(m.id);
    if (!p) return;
    if (m.type === "progress") { p.onProgress?.(m.stage, m.value); return; }
    pending.delete(m.id);
    if (m.type === "error") p.rej(new Error(m.message));
    else p.res(m);
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.rej(new Error(e.message || "ai worker failed"));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

type Req = AiRequest extends infer R ? (R extends { op: "cancel" } ? never : Omit<R, "id">) : never;

export function aiCall(req: Req, transfer: Transferable[] = [], opts: CallOpts = {}): Promise<AiResult> {
  const w = getWorker();
  const id = ++seq;
  return new Promise<AiResult>((res, rej) => {
    if (opts.signal?.aborted) { rej(new DOMException("Aborted", "AbortError")); return; }
    pending.set(id, { res, rej, onProgress: opts.onProgress });
    opts.signal?.addEventListener("abort", () => {
      if (!pending.has(id)) return;
      pending.delete(id);
      w.postMessage({ op: "cancel", id: ++seq, target: id } satisfies AiRequest);
      rej(new DOMException("Aborted", "AbortError"));
    }, { once: true });
    w.postMessage({ ...req, id } as AiRequest, transfer);
  });
}

/** Downloads + initialises a model (no-op when already loaded). Resolves with the execution provider used. */
export async function warm(model: ModelId, opts: CallOpts = {}) {
  return (await aiCall({ op: "warm", model }, [], opts)).ep;
}

export const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";
