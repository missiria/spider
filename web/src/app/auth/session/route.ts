import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const SESSION_COOKIE = "spider_session";
const MAX_AGE = 60 * 60 * 24; // matches JWT_EXPIRES_IN=24h

function cookieOptions(req: NextRequest) {
  const secure = req.nextUrl.protocol === "https:" || process.env.NODE_ENV === "production";
  return { httpOnly: true, sameSite: "lax" as const, secure, path: "/" };
}

/**
 * The API returns the JWT in JSON; the browser never keeps it in JS-readable storage.
 * This handler moves it into an httpOnly cookie the API also accepts (JwtStrategy cookie extractor).
 */
export async function POST(req: NextRequest) {
  let token: unknown;
  try {
    token = (await req.json())?.token;
  } catch {
    token = undefined;
  }
  if (typeof token !== "string" || token.split(".").length !== 3 || token.length > 4096) {
    return NextResponse.json({ message: "Invalid token" }, { status: 400 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, { ...cookieOptions(req), maxAge: MAX_AGE });
  return res;
}

export async function DELETE(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...cookieOptions(req), maxAge: 0 });
  return res;
}
