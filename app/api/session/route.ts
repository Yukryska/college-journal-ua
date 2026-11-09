import { env } from "cloudflare:workers";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { accessConfig, keyHashFor, requestSession, sessionCookie, sessionLifetime, tokenHash } from "../../lib/session";

function redirect(location: string, cookie?: string) {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  if (cookie) headers.set("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const secure = url.protocol === "https:";
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if ((!secure && !loopback) || request.headers.get("origin") !== url.origin) {
    return new Response("Неприпустиме джерело запиту.", { status: 403 });
  }

  const db = env.DB;
  const config = accessConfig();
  if (!db || !config) return redirect("/sign-in?error=setup");
  const form = await request.formData().catch(() => null);
  if (!form) return redirect("/sign-in?error=invalid");
  const existing = requestSession(request);
  const attributes = "Path=/; HttpOnly; SameSite=Lax" + (secure ? "; Secure" : "");

  if (form.get("action") === "logout") {
    if (existing) await db.prepare("DELETE FROM journalSessions WHERE tokenHash=?").bind(existing).run();
    return redirect("/sign-in", `${sessionCookie}=; Max-Age=0; ${attributes}`);
  }

  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const key = String(form.get("key") ?? "").trim();
  const expectedHash = keyHashFor(config, email);
  if (email.length > 254 || !/^jrn_[A-Za-z0-9_-]{32}$/.test(key)) return redirect("/sign-in?error=invalid");
  const matches = timingSafeEqual(Buffer.from(tokenHash(key), "hex"), Buffer.from(expectedHash ?? "0".repeat(64), "hex"));
  if (!expectedHash || !matches) return redirect("/sign-in?error=invalid");

  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  await db.batch([
    db.prepare("DELETE FROM journalSessions WHERE expiresAt<=? OR tokenHash=?").bind(now, existing),
    db.prepare("INSERT INTO journalSessions(tokenHash,email,keyHash,expiresAt) VALUES (?,?,?,?)")
      .bind(tokenHash(token), email, expectedHash, now + sessionLifetime * 1000),
  ]);
  return redirect("/", `${sessionCookie}=${token}; Max-Age=${sessionLifetime}; ${attributes}`);
}
