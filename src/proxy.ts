import { NextRequest, NextResponse } from "next/server";

const challengeHeaders = {
  "WWW-Authenticate": 'Basic realm="TRIBE NEON KPI", charset="UTF-8"',
  "Cache-Control": "no-store",
};

function unauthorized() {
  return new NextResponse("Authentication required", { status: 401, headers: challengeHeaders });
}

export function proxy(request: NextRequest) {
  // KPIは内部運営ツール。Previewでは受入を止めないためBasic認証を要求しない。
  // Productionでは従来どおり環境変数によるBasic認証を必須とする。
  if (process.env.VERCEL_ENV === "preview") return NextResponse.next();

  const expectedUser = process.env.KPI_BASIC_AUTH_USER;
  const expectedPassword = process.env.KPI_BASIC_AUTH_PASSWORD;
  if (!expectedUser || !expectedPassword) {
    return new NextResponse("KPI authentication is not configured", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) return unauthorized();

  try {
    const decoded = atob(authorization.slice(6));
    const separator = decoded.indexOf(":");
    if (separator < 0) return unauthorized();
    const user = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    if (user !== expectedUser || password !== expectedPassword) return unauthorized();
  } catch {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/kpi/:path*", "/api/admin/kpi/:path*"],
};
