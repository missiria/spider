import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const SESSION_COOKIE = "spider_session";
const MAX_AGE = 60 * 60 * 24; // matches JWT_EXPIRES_IN=24h
const API_URL = (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8012").replace(/\/$/, "");

function cookieOptions(req: NextRequest) {
  const secure = req.nextUrl.protocol === "https:" || process.env.NODE_ENV === "production";
  return { httpOnly: true, sameSite: "lax" as const, secure, path: "/" };
}

/**
 * Same-origin only: blocks login CSRF / session fixation from third-party pages.
 * The Origin header is compared with the host the request arrived on (X-Forwarded-Host
 * behind nginx/Cloudflare, else Host) because req.nextUrl.origin reflects the internal
 * listener, not the public hostname.
 */
function rejectCrossSite(req: NextRequest): NextResponse | null {
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const origin = req.headers.get("origin");
  if (origin) {
    const requestHost = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim().toLowerCase();
    let originHost = "";
    try {
      originHost = new URL(origin).host.toLowerCase();
    } catch {
      originHost = "";
    }
    if (!requestHost || originHost !== requestHost) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
  }
  if (req.method === "POST" && !req.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ message: "Unsupported media type" }, { status: 415 });
  }
  return null;
}

/**
 * Performs the login server-side: credentials go to the API, the returned JWT is written
 * into an httpOnly cookie and never reaches browser JavaScript. The API's own login
 * throttle still applies (client IP forwarded).
 */
export async function POST(req: NextRequest) {
  const blocked = rejectCrossSite(req);
  if (blocked) return blocked;

  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }
  if (typeof body.email !== "string" || typeof body.password !== "string" || body.email.length > 255 || body.password.length > 1024) {
    return NextResponse.json({ message: "Email and password are required" }, { status: 400 });
  }

  const forwardedFor = req.headers.get("x-forwarded-for") ?? "";
  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}) },
      body: JSON.stringify({ email: body.email, password: body.password }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ message: "API unavailable" }, { status: 502 });
  }

  const data = (await upstream.json().catch(() => ({}))) as { token?: string; user?: unknown; message?: string | string[] };
  if (!upstream.ok || typeof data.token !== "string") {
    const message = Array.isArray(data.message) ? data.message.join(", ") : (data.message ?? "Login failed");
    return NextResponse.json({ message }, { status: upstream.status === 200 ? 502 : upstream.status });
  }

  const res = NextResponse.json({ ok: true, user: data.user ?? null });
  res.cookies.set(SESSION_COOKIE, data.token, { ...cookieOptions(req), maxAge: MAX_AGE });
  return res;
}

export async function DELETE(req: NextRequest) {
  const blocked = rejectCrossSite(req);
  if (blocked) return blocked;
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...cookieOptions(req), maxAge: 0 });
  return res;
}
