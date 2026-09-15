import type { NextRequest } from "next/server";
import { dailyOverview, respond } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return respond(request, dailyOverview);
}
