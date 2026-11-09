"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Facing = "user" | "environment";
/** "unknown" until checked; "prompt" = camera_permission_intro_layout; "denied" = camera_permission_dialog. */
export type CameraPermission = "unknown" | "prompt" | "granted" | "denied";

interface Caps {
  torch: boolean;
  zoom?: { min: number; max: number };
  exposure?: { min: number; max: number; step: number };
}

/** Initial permission state (Permissions API when available). */
export function useCameraPermission(): [CameraPermission, (p: CameraPermission) => void] {
  const [perm, setPerm] = useState<CameraPermission>("unknown");
  useEffect(() => {
    let cancelled = false;
    const q = navigator.permissions?.query({ name: "camera" as PermissionName });
    if (!q) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- capability check
      setPerm("prompt");
      return;
    }
    q.then((s) => {
      if (cancelled) return;
      setPerm(s.state === "granted" ? "granted" : s.state === "denied" ? "denied" : "prompt");
    }).catch(() => !cancelled && setPerm("prompt"));
    return () => { cancelled = true; };
  }, []);
  return [perm, setPerm];
}

/** getUserMedia wrapper standing in for the Android camera module. Opens only while `enabled`. */
export function useCameraStream(facing: Facing, enabled = true, withAudio = false) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caps, setCaps] = useState<Caps>({ torch: false });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const video = videoRef.current ?? document.createElement("video");
    videoRef.current = video;
    video.muted = true;
    video.playsInline = true;

    if (!navigator.mediaDevices) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- capability check
      setError("unsupported");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: withAudio,
      })
      .then(async (stream) => {
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        setError(null);
        video.srcObject = stream;
        await video.play().catch(() => {});
        const track = stream.getVideoTracks()[0];
        const c = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
          torch?: boolean; zoom?: { min: number; max: number };
          exposureCompensation?: { min: number; max: number; step: number };
        };
        setCaps({
          torch: !!c.torch,
          zoom: c.zoom ? { min: c.zoom.min, max: c.zoom.max } : undefined,
          exposure: c.exposureCompensation ? { ...c.exposureCompensation } : undefined,
        });
        const onFrame = () => !cancelled && setReady(true);
        if ("requestVideoFrameCallback" in video) video.requestVideoFrameCallback(onFrame);
        else onFrame();
      })
      .catch((e: Error) => !cancelled && setError(e.name === "NotAllowedError" || e.name === "SecurityError" ? "permission" : e.message || "error"));

    return () => {
      cancelled = true;
      setReady(false);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facing, withAudio, enabled]);

  const track = () => streamRef.current?.getVideoTracks()[0];

  const setTorch = useCallback(async (on: boolean) => {
    try {
      await track()?.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
    } catch {}
  }, []);

  const setZoom = useCallback(async (z: number) => {
    try {
      await track()?.applyConstraints({ advanced: [{ zoom: z } as MediaTrackConstraintSet] });
    } catch {}
  }, []);

  /** Hardware exposure compensation (when the track exposes it); the renderer also applies brightness. */
  const setExposure = useCallback(async (ev: number) => {
    try {
      await track()?.applyConstraints({ advanced: [{ exposureCompensation: ev } as MediaTrackConstraintSet] });
    } catch {}
  }, []);

  return { videoRef, streamRef, ready, error, caps, setTorch, setZoom, setExposure };
}
