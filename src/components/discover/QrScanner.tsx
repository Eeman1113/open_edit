"use client";

// QR scanner: scans an Open_Edit share link (a look or a creator page) with the back camera, or from a picked image.
// Uses the browser's BarcodeDetector where available.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Dialog, IconButton, useGoBack } from "@/components/ui";
import { useBackHandler } from "@/lib/back";

interface Detector {
  detect(src: CanvasImageSource | ImageBitmap): Promise<{ rawValue: string }[]>;
}
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

const FAIL = "That code isn’t an Open_Edit link. Try another code or image.";
const UNSUPPORTED = "This browser can’t scan QR codes. Try a recent version of Chrome or Edge.";

export function QrScanner() {
  const router = useRouter();
  const back = useGoBack("/discover");
  useBackHandler(back);
  const video = useRef<HTMLVideoElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [alert, setAlert] = useState<string | null>(null);
  const busy = useRef(false);
  const detector = useRef<Detector | null>(null);

  const handle = (text: string) => {
    let url: URL | null = null;
    try {
      url = new URL(text);
    } catch {
      url = null;
    }
    // our own share links: /discover/post/<id>, /discover/profile/<id>, or ?sharepost=<id> / ?userpage=<id>
    const ours = url && url.origin === window.location.origin;
    if (!url || !ours) {
      setAlert(FAIL);
      return;
    }
    const post = url.searchParams.get("sharepost");
    const user = url.searchParams.get("userpage");
    if (post) router.replace(`/discover/post/${encodeURIComponent(post)}`);
    else if (user) router.replace(`/discover/profile/${encodeURIComponent(user)}`);
    else router.replace(url.pathname.replace(process.env.NEXT_PUBLIC_BASE_PATH ?? "", "") + url.search);
  };

  useEffect(() => {
    const Ctor = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    detector.current = Ctor ? new Ctor({ formats: ["qr_code"] }) : null;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped) return;
        const v = video.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play().catch(() => {});
        const tick = async () => {
          if (stopped) return;
          if (detector.current && !busy.current && v.readyState >= 2) {
            busy.current = true;
            try {
              const r = await detector.current.detect(v);
              if (r[0]?.rawValue) handle(r[0].rawValue);
              else busy.current = false;
            } catch {
              busy.current = false;
            }
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        if (!stopped) setAlert(UNSUPPORTED);
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // decode a picked image
  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (!detector.current) {
      setAlert(UNSUPPORTED);
      return;
    }
    busy.current = true;
    try {
      const bmp = await createImageBitmap(f);
      const r = await detector.current.detect(bmp);
      bmp.close();
      if (r[0]?.rawValue) handle(r[0].rawValue);
      else setAlert(FAIL);
    } catch {
      setAlert(FAIL);
    }
  };

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <video ref={video} muted playsInline className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute left-1/2 top-[44%] aspect-square w-[min(72%,300px)] -translate-x-1/2 -translate-y-1/2">
        <div className="absolute inset-0 rounded-xl shadow-[0_0_0_2000px_rgba(0,0,0,.55)]" />
        <div className="absolute inset-0 rounded-xl border-2 border-accent" />
        <div className="absolute inset-x-4 top-1/2 h-0.5 rounded-full bg-accent/80" style={{ animation: "oe-scan 2.2s ease-in-out infinite alternate" }} />
        <p className="absolute inset-x-0 top-full mt-6 text-center text-[15px] font-medium text-white">Point at an Open_Edit QR code</p>
      </div>
      <style href="oe-qr-kf" precedence="default">{"@keyframes oe-scan{from{transform:translateY(-110px)}to{transform:translateY(110px)}}"}</style>
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3 pt-[max(12px,env(safe-area-inset-top))]">
        <IconButton icon="close" label="Close" variant="glass" onClick={back} />
        <IconButton icon="gallery" label="Scan from a photo" variant="glass" onClick={() => file.current?.click()} />
      </div>
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      <Dialog open={!!alert} onClose={() => { setAlert(null); busy.current = false; }} icon="qr" title="Couldn’t read the code">{alert}</Dialog>
    </div>
  );
}
