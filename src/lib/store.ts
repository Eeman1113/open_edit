// Local gallery: saved photos and videos live in IndexedDB (never uploaded). Cleared from Settings.

/** Album of everything made in the app (camera, editor, collage, video). */
export const CAMERA_ALBUM = "Open_Edit";
/** Album of picked files. */
export const IMPORT_ALBUM = "Imported";
/** Window event fired after the gallery changes. */
export const PHOTOS_EVENT = "oe:photos";

export interface Photo {
  id: string;
  blob: Blob;
  width: number;
  height: number;
  createdAt: number;
  album: string; // CAMERA_ALBUM for things made in the app, IMPORT_ALBUM for picked files
  /** Videos only: duration in ms. */
  duration?: number;
}

export const isVideoPhoto = (p: Photo) => p.blob.type.startsWith("video/");
export const isGifPhoto = (p: Photo) => p.blob.type === "image/gif";

const DB = "openedit";
const STORE = "photos";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore(STORE, { keyPath: "id" });
      s.createIndex("createdAt", "createdAt");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function savePhoto(blob: Blob, width: number, height: number, album = CAMERA_ALBUM, extra?: { duration?: number; createdAt?: number }): Promise<Photo> {
  const photo: Photo = { id: crypto.randomUUID(), blob, width, height, createdAt: extra?.createdAt ?? Date.now(), album };
  if (extra?.duration !== undefined) photo.duration = extra.duration;
  await tx("readwrite", (s) => s.put(photo));
  window.dispatchEvent(new Event(PHOTOS_EVENT));
  return photo;
}

export async function listPhotos(): Promise<Photo[]> {
  const all = await tx<Photo[]>("readonly", (s) => s.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export const getPhoto = (id: string) => tx<Photo | undefined>("readonly", (s) => s.get(id));

export async function deletePhoto(id: string) {
  await tx("readwrite", (s) => s.delete(id));
  window.dispatchEvent(new Event(PHOTOS_EVENT));
}

/** Delete several items in one transaction (one PHOTOS_EVENT). */
export async function deletePhotos(ids: string[]) {
  if (!ids.length) return;
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite");
    for (const id of ids) t.objectStore(STORE).delete(id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  window.dispatchEvent(new Event(PHOTOS_EVENT));
}

/** Gallery buckets: the "all" bucket first, then each album by its newest item. */
export interface Album {
  /** null = all photos ("Albums") */
  name: string | null;
  count: number;
  cover?: Photo;
}

export function groupAlbums(photos: Photo[], filter: (p: Photo) => boolean = () => true): Album[] {
  const list = photos.filter(filter);
  const by = new Map<string, Photo[]>();
  for (const p of list) {
    const a = by.get(p.album);
    if (a) a.push(p);
    else by.set(p.album, [p]);
  }
  const out: Album[] = [{ name: null, count: list.length, cover: list[0] }];
  for (const [name, ps] of by) out.push({ name, count: ps.length, cover: ps[0] });
  return out;
}

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|3gp|mkv)$/i;
const isVideoFile = (f: File) => f.type.startsWith("video/") || VIDEO_EXT.test(f.name);

/** Read width/height/duration of a video blob; rejects if the browser can't decode it. */
export function probeVideo(blob: Blob): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(blob);
    const done = (fn: () => void) => { URL.revokeObjectURL(url); v.removeAttribute("src"); v.load(); fn(); };
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => {
      const r = { width: v.videoWidth, height: v.videoHeight, duration: Math.round(v.duration * 1000) };
      done(() => (r.width && isFinite(r.duration) && r.duration > 0 ? resolve(r) : reject(new Error("video"))));
    };
    v.onerror = () => done(() => reject(new Error("video")));
    v.src = url;
  });
}

const isHeic = (f: File) => /image\/hei[cf]/.test(f.type) || /\.hei[cf]$/i.test(f.name);

/** Browsers other than Safari can't decode HEIC: convert it to JPEG with libheif (heic-to, wasm), loaded on demand. */
async function toDecodable(file: File): Promise<Blob> {
  if (!isHeic(file)) return file;
  try {
    await createImageBitmap(file).then((b) => b.close());
    return file; // natively supported (Safari)
  } catch {
    const { heicTo } = await import("heic-to/next");
    return heicTo({ blob: file, type: "image/jpeg", quality: 0.95 });
  }
}

/**
 * Import picked files. HEIC is converted to JPEG; files that still can't be decoded are skipped
 * and reported through `onFail`, and the remaining files still import.
 */
export async function importFiles(files: FileList | File[], onFail?: (file: File) => void): Promise<Photo[]> {
  const out: Photo[] = [];
  for (const file of Array.from(files)) {
    if (isVideoFile(file)) {
      // videos must have a size and a duration
      const blob = file.type ? file : new Blob([file], { type: "video/mp4" });
      try {
        const m = await probeVideo(blob);
        out.push(await savePhoto(blob, m.width, m.height, IMPORT_ALBUM, { duration: m.duration }));
      } catch {
        onFail?.(file);
      }
      continue;
    }
    const isImage = file.type.startsWith("image/") || /\.(heic|heif|avif|webp|jpe?g|png|gif|bmp)$/i.test(file.name);
    if (!isImage) { onFail?.(file); continue; }
    let bmp: ImageBitmap;
    let blob: Blob;
    try {
      blob = await toDecodable(file);
      bmp = await createImageBitmap(blob);
    } catch {
      onFail?.(file);
      continue;
    }
    out.push(await savePhoto(blob, bmp.width, bmp.height, IMPORT_ALBUM));
    bmp.close();
  }
  return out;
}

export function download(blob: Blob, name = `OpenEdit_${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}.jpg`) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
