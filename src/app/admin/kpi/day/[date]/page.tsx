import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { validateKpiV2Runtime, validateProductionKpiRuntime } from "@/utils/kpiRuntime";
import KpiDashboardV2 from "../../KpiDashboardV2";
import "../../kpi-dashboard.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "日次KPI詳細 | TRIBE NEON", robots: { index: false, follow: false } };

export default async function KpiDayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) notFound();
  if (process.env.NEXT_PUBLIC_APP_ENV !== "preview") notFound();
  const config = { appEnvironment: process.env.NEXT_PUBLIC_APP_ENV, dataEnvironment: process.env.NEXT_PUBLIC_KPI_DATA_ENV, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL };
  const runtime = config.dataEnvironment === "production" ? validateProductionKpiRuntime(config) : validateKpiV2Runtime(config);
  if (!runtime.enabled) throw new Error(`KPI runtime configuration rejected: ${runtime.reason}`);
  return <KpiDashboardV2 fixedDate={date} />;
}
