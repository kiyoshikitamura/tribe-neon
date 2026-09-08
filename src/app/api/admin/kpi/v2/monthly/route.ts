import { NextRequest } from "next/server";
import { dailyOverview, noStore, respond, TIMEZONE } from "../_shared";
import { monthlyRows } from "@/utils/kpiMonthly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: TIMEZONE }).format(new Date());
  const end = request.nextUrl.searchParams.get("month") || today.slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(end) || end > today.slice(0, 7) || end < "2000-01") {
    return noStore({ error: "Invalid JST month" }, 400);
  }
  const last = new Date(`${end}-01T00:00:00Z`);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  const from = new Date(`${end}-01T00:00:00Z`);
  from.setUTCMonth(from.getUTCMonth() - 11);
  const url = request.nextUrl.clone();
  url.searchParams.set("from", from.toISOString().slice(0, 10));
  url.searchParams.set("to", end === today.slice(0, 7) ? today : last.toISOString().slice(0, 10));
  return respond(new NextRequest(url), async (service, range) => {
    const daily = await dailyOverview(service, range);
    return { ...daily, rows: monthlyRows(daily.rows, today), from: range.from, to: range.to };
  });
}
