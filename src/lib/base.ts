/** URL prefix for files in public/ (set NEXT_PUBLIC_BASE_PATH when the app is served from a sub-path). Empty in dev. */
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Prefix an absolute public path, e.g. asset("/models/LICENSES.txt"). Pack assets: use getAsset() from @/lib/assets. */
export const asset = (path: string) => `${BASE}${path}`;
