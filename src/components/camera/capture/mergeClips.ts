// Joins several recorded clips into one file (the original concatenates its clip files with FFmpeg).
// Browsers can't concatenate MediaRecorder files byte-wise, so the clips are played back in order into a
// canvas + WebAudio graph that a single MediaRecorder captures (real-time; paused between clips).
export async function mergeClips(clips: Blob[], width: number, height: number, mimeType: string): Promise<Blob> {
  if (clips.length === 1) return clips[0];
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const vstream = canvas.captureStream(30);
  const video = document.createElement("video");
  video.playsInline = true;
  video.preload = "auto";

  let ac: AudioContext | null = null;
  let audioTracks: MediaStreamTrack[] = [];
  try {
    ac = new AudioContext();
    const dest = ac.createMediaStreamDestination();
    ac.createMediaElementSource(video).connect(dest);
    audioTracks = dest.stream.getAudioTracks();
    await ac.resume().catch(() => {});
  } catch {
    ac = null;
  }

  const rec = new MediaRecorder(new MediaStream([...vstream.getVideoTracks(), ...audioTracks]), { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((r) => (rec.onstop = () => r()));
  rec.start();
  rec.pause();

  const draw = () => ctx.drawImage(video, 0, 0, width, height);
  for (const clip of clips) {
    const url = URL.createObjectURL(clip);
    video.src = url;
    await new Promise<void>((res, rej) => {
      video.oncanplay = () => res();
      video.onerror = () => rej(video.error);
    }).catch(() => {});
    draw();
    rec.resume();
    await video.play().catch(async () => {
      video.muted = true;
      await video.play().catch(() => {});
    });
    await new Promise<void>((res) => {
      let raf = 0;
      const tick = () => {
        draw();
        if (video.ended || video.paused) return;
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      video.onended = () => {
        cancelAnimationFrame(raf);
        draw();
        res();
      };
    });
    rec.pause();
    URL.revokeObjectURL(url);
  }
  rec.stop();
  await stopped;
  vstream.getTracks().forEach((t) => t.stop());
  void ac?.close();
  return new Blob(chunks, { type: mimeType.split(";")[0] });
}
