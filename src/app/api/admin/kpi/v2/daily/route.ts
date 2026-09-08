import type { NextRequest } from "next/server";
import { savedOverviewResponse } from "../_saved";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  return savedOverviewResponse(request, "daily");
}
