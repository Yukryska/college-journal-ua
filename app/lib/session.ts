import { env } from "cloudflare:workers";
import { createHash } from "node:crypto";

type AccessConfig = { owner: string; keys: Record<string, string> };
type Session = { email: string; keyHash: string };

export const sessionLifetime = 8 * 60 * 60;
export const sessionCookie = "journal_session";

export function tokenHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function accessConfig(): AccessConfig | null {
  try {
    const value = JSON.parse(env.JOURNAL_ACCESS ?? "null") as AccessConfig | null;
    if (typeof value?.owner !== "string" || !value.keys || typeof value.keys !== "object") return null;
    return keyHashFor(value, value.owner) ? value : null;
  } catch {
    return null;
  }
}

export function keyHashFor(config: AccessConfig, email: string) {
  const hash = Object.hasOwn(config.keys, email) ? config.keys[email] : undefined;
  return typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash) ? hash : null;
}

export function requestSession(request: Request) {
  const cookie = request.headers.get("cookie")?.split(";")
    .map(part => part.trim()).find(part => part.startsWith(sessionCookie + "="));
  const token = cookie?.slice(sessionCookie.length + 1);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? tokenHash(token) : null;
}

export async function getJournalUser(request: Request) {
  const config = accessConfig();
  const hash = requestSession(request);
  if (!env.DB || !config || !hash) return null;
  const session = await env.DB.prepare("SELECT email,keyHash FROM journalSessions WHERE tokenHash=? AND expiresAt>?")
    .bind(hash, Date.now()).first<Session>();
  if (!session || keyHashFor(config, session.email) !== session.keyHash) return null;
  const isOwner = config.owner === session.email;
  return {
    userId: "journal:" + session.email,
    email: session.email,
    displayName: isOwner ? "Адміністратор" : session.email,
    isOwner,
  };
}
