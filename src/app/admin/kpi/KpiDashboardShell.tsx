"use client";

import { useState } from "react";
import KpiDashboard from "./KpiDashboard";
import KpiDashboardV2 from "./KpiDashboardV2";
import KpiDailyOverview from "./KpiDailyOverview";

export default function KpiDashboardShell() {
  const [mode, setMode] = useState<"daily" | "v2" | "legacy">("daily");
  return (
    <>
      {mode === "daily" ? <KpiDailyOverview /> : mode === "v2" ? <KpiDashboardV2 /> : <KpiDashboard />}
      <details className="kpi-secondary-views">
        <summary>補助ビュー</summary>
        <div role="navigation" aria-label="Dashboard views">
          <button type="button" className={mode === "daily" ? "is-active" : ""} onClick={() => setMode("daily")}>日次一覧</button>
          <button type="button" className={mode === "v2" ? "is-active" : ""} onClick={() => setMode("v2")}>Validation V2</button>
          <button type="button" className={mode === "legacy" ? "is-active" : ""} onClick={() => setMode("legacy")}>Legacy Snapshot</button>
        </div>
      </details>
    </>
  );
}
