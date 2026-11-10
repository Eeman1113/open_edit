// Joins several recorded clips into one file, optionally with a music track mixed under the recorded sound.
// Browsers can't concatenate MediaRecorder files byte-wise, so the clips are played back in order into a
// canvas + WebAudio graph that a single MediaRecorder captures (real-time; paused between clips). The music plays
// from its start while clips play and pauses with them, so it runs continuously through the joined video.
/** Level of an added music track under the recorded sound. */
export const MUSIC_GAIN = 0.8;

export async function mergeClips(clips: Blob[], width: number, height: number, mimeType: string, musicUrl?: string | null): Promise<Blob> {
  if (clips.length === 1 && !musicUrl) return clips[0];
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const vstream = canvas.captureStream(30);
  const video = document.createElement("video");
  video.playsInline = true;
  video.preload = "auto";

  const music = musicUrl ? new Audio() : null;
  if (music) {
    music.crossOrigin = "anonymous";
    music.loop = true;
    music.preload = "auto";
    music.src = musicUrl!;
  }

  let ac: AudioContext | null = null;
  let audioTracks: MediaStreamTrack[] = [];
  try {
    ac = new AudioContext();
    const dest = ac.createMediaStreamDestination();
    ac.createMediaElementSource(video).connect(dest);
    if (music) {
      const gain = ac.createGain();
      gain.gain.value = MUSIC_GAIN;
      ac.createMediaElementSource(music).connect(gain).connect(dest);
    }
    audioTracks = dest.stream.getAudioTracks();
    await ac.resume().catch(() => {});
  } catch {
    ac = null;
  }
  if (music) await new Promise<void>((res) => { music.oncanplay = () => res(); music.onerror = () => res(); window.setTimeout(res, 5000); });

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
    if (music) await music.play().catch(() => {});
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
    music?.pause();
    URL.revokeObjectURL(url);
  }
  rec.stop();
  await stopped;
  vstream.getTracks().forEach((t) => t.stop());
  void ac?.close();
  if (music) { music.removeAttribute("src"); music.load(); }
  return new Blob(chunks, { type: mimeType.split(";")[0] });
}
