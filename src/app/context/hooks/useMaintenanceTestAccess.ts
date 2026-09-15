"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase";

/** UIの許可は表示用。DB/APIはリクエストごとに期限と本人を再検証する。 */
export function useMaintenanceTestAccess(userId: string | undefined, maintenance: boolean) {
  const [permission, setPermission] = useState<{ userId: string; allowed: boolean } | null>(null);
  useEffect(() => {
    setPermission(null);
    if (!userId || !maintenance) return;
    let disposed = false;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const { data, error } = await supabase.rpc("is_operations_maintenance_tester");
        if (!disposed) setPermission({ userId, allowed: !error && data === true });
      } catch {
        if (!disposed) setPermission({ userId, allowed: false });
      } finally { pending = false; }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [userId, maintenance]);
  return Boolean(maintenance && userId && permission?.userId === userId && permission.allowed);
}
