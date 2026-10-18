import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/session";
import { API_URL, clientIpHeaders, rejectCrossSite } from "@/lib/authProxy";
const MAX_AGE = 60 * 60 * 24; // matches JWT_EXPIRES_IN=24h

function cookieOptions(req: NextRequest) {
  const secure =
    req.nextUrl.protocol === "https:" || process.env.NODE_ENV === "production";
  return { httpOnly: true, sameSite: "lax" as const, secure, path: "/" };
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
  if (
    typeof body.email !== "string" ||
    typeof body.password !== "string" ||
    body.email.length > 255 ||
    body.password.length > 1024
  ) {
    return NextResponse.json(
      { message: "Email and password are required" },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...clientIpHeaders(req),
      },
      body: JSON.stringify({ email: body.email, password: body.password }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ message: "API unavailable" }, { status: 502 });
  }

  const data = (await upstream.json().catch(() => ({}))) as {
    token?: string;
    user?: unknown;
    message?: string | string[];
  };
  if (!upstream.ok || typeof data.token !== "string") {
    const message = Array.isArray(data.message)
      ? data.message.join(", ")
      : (data.message ?? "Login failed");
    return NextResponse.json(
      { message },
      { status: upstream.status === 200 ? 502 : upstream.status },
    );
  }

  const res = NextResponse.json({ ok: true, user: data.user ?? null });
  res.cookies.set(SESSION_COOKIE, data.token, {
    ...cookieOptions(req),
    maxAge: MAX_AGE,
  });
  return res;
}

export async function DELETE(req: NextRequest) {
  const blocked = rejectCrossSite(req);
  if (blocked) return blocked;
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...cookieOptions(req), maxAge: 0 });
  return res;
}
