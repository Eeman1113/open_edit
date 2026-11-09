// Optional anonymous session: a random id in a signed, httpOnly cookie, used only to give each browser its own
// rate-limit bucket. There are no accounts and nothing is stored server-side about the session: the id is not
// linked to any data, not logged, and expires after a day. See docs/platform.md ("Privacy model").
import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config, warnOnce } from "./env";

export const SESSION_COOKIE = "oe_sid";
const MAX_AGE = 60 * 60 * 24;

let processSecret: Buffer | null = null;
function secret(): Buffer {
  const s = config.sessionSecret();
  if (s && s.length >= 32) return Buffer.from(s);
  if (s) warnOnce("session-secret-short", "[session] OE_SESSION_SECRET is shorter than 32 characters; using a random per-process secret");
  else if (process.env.NODE_ENV === "production") warnOnce("session-secret", "[session] OE_SESSION_SECRET is not set; using a random per-process secret (sessions reset on restart and differ between instances)");
  processSecret ??= randomBytes(32);
  return processSecret;
}

const sign = (id: string) => createHmac("sha256", secret()).update(id).digest("base64url").slice(0, 32);

/** The session id from a valid cookie value, or null. */
export function verifySession(value: string | undefined): string | null {
  if (!value) return null;
  const [id, sig] = value.split(".");
  if (!id || !sig || !/^[\w-]{22}$/.test(id)) return null;
  const want = Buffer.from(sign(id)), got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? id : null;
}

export interface Session {
  /** Anonymous id, or null when sessions are disabled. */
  id: string | null;
  /** Set-Cookie header value when a new session was issued. */
  setCookie?: string;
}

/** Reads the session cookie and issues a new one when it is missing or invalid (`mint` = allowed to create one). */
export function getSession(req: Request, cookieValue: string | undefined, mint: boolean): Session {
  if (!config.sessionsEnabled()) return { id: null };
  const id = verifySession(cookieValue);
  if (id || !mint) return { id };
  const fresh = randomBytes(16).toString("base64url");
  const secure = new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  const cookie = [`${SESSION_COOKIE}=${fresh}.${sign(fresh)}`, "Path=/api", `Max-Age=${MAX_AGE}`, "HttpOnly", "SameSite=Lax", secure ? "Secure" : ""].filter(Boolean).join("; ");
  return { id: fresh, setCookie: cookie };
}
