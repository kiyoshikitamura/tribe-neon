import { respond, validation } from "../_shared";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const grain = request.nextUrl.searchParams.get("grain");
  return respond(request, (service, range) => validation(service, range, grain));
}
