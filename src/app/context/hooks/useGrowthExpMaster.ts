"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/utils/supabase";
import { GrowthExpMaster, parseGrowthExpMaster } from "@/domain/gameplay/canonical/growthExp";

export function useGrowthExpMaster(ownerId?: string) {
  const [master, setMaster] = useState<GrowthExpMaster | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    let cancelled = false;
    setMaster(null);
    setError(false);
    if (!ownerId) return;
    void (async () => {
      try {
        const result = await supabase.rpc("get_growth_exp_master");
        if (result.error) throw result.error;
        const parsed = parseGrowthExpMaster(result.data);
        if (!cancelled) setMaster(parsed);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [ownerId, attempt]);
  return { master, error, retry };
}
