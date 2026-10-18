import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Server-only helpers for the Next routes that proxy public auth calls to the API. */
export const API_URL = (
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8012"
).replace(/\/$/, "");

/**
 * Same-origin only: blocks login CSRF / session fixation from third-party pages.
 * The Origin header is compared with the host the request arrived on (X-Forwarded-Host
 * behind nginx/Cloudflare, else Host) because req.nextUrl.origin reflects the internal
 * listener, not the public hostname.
 */
export function rejectCrossSite(req: NextRequest): NextResponse | null {
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const origin = req.headers.get("origin");
  if (origin) {
    const requestHost = (
      req.headers.get("x-forwarded-host") ??
      req.headers.get("host") ??
      ""
    )
      .split(",")[0]
      .trim()
      .toLowerCase();
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
  if (
    req.method === "POST" &&
    !req.headers.get("content-type")?.startsWith("application/json")
  ) {
    return NextResponse.json(
      { message: "Unsupported media type" },
      { status: 415 },
    );
  }
  return null;
}

/**
 * Only `X-Real-IP` is trusted: our nginx sets it from $remote_addr on every request (overwriting
 * anything the client sent) and is configured with Cloudflare's ranges as `set_real_ip_from`
 * + `real_ip_header CF-Connecting-IP`, so $remote_addr is the visitor even behind the proxy.
 * `cf-connecting-ip` / `x-forwarded-for` straight from the request are never used: a client
 * can set them. Without nginx (local dev) there is no header and the API falls back to the
 * socket address.
 */
export function trustedClientIp(req: NextRequest): string {
  const real = req.headers.get("x-real-ip");
  return real ? real.trim().slice(0, 64) : "";
}

/**
 * Client IP for the API's rate limiter, sent with the shared secret so nothing else can
 * impersonate this hop. Without it every visitor would share the Next server's address.
 */
export function clientIpHeaders(req: NextRequest): Record<string, string> {
  const clientIp = trustedClientIp(req);
  const proxySecret = process.env.INTERNAL_PROXY_SECRET ?? "";
  return clientIp && proxySecret
    ? { "x-spider-client-ip": clientIp, "x-spider-proxy-secret": proxySecret }
    : {};
}
