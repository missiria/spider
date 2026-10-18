import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { API_URL, clientIpHeaders, rejectCrossSite } from "@/lib/authProxy";

const ACTIONS = new Set(["register", "forgot-password", "reset-password"]);

/**
 * Public account actions (sign up, forgot / reset password). Proxied here rather than through
 * the /api rewrite so the API's per-IP throttles see the visitor, not this server.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  const { action } = await params;
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  const blocked = rejectCrossSite(req);
  if (blocked) return blocked;
  const body = await req.text();
  if (body.length > 4096) {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }
  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/auth/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...clientIpHeaders(req) },
      body,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ message: "API unavailable" }, { status: 502 });
  }
  if (upstream.status === 204) return new NextResponse(null, { status: 204 });
  const data = (await upstream.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  return NextResponse.json(data, { status: upstream.status });
}
