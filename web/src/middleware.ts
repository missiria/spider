import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

// sign-in / sign-up / password pages; a signed-in visitor is sent to the app instead
const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
];

export function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value || null;
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!token && !isPublic) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  // reset links stay reachable while signed in (the reset signs every session out anyway)
  if (token && isPublic && !pathname.startsWith("/reset-password")) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
}

export const config = {
  // everything except Next internals, static files and the API rewrite
  matcher: [
    "/((?!api|auth/session|auth/account|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|txt)$).*)",
  ],
};
