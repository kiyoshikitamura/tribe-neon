"use client";

import { useState } from "react";
import { DEFAULT_OPERATIONS_STATE, type OperationsStateMap } from "@/domain/operations/operations";

export function useGacha() {
  const [featureOperatingStates, setFeatureOperatingStates] = useState<OperationsStateMap>({ ...DEFAULT_OPERATIONS_STATE });
  const [gachaMasters, setGachaMasters] = useState<any[]>([]);
  const [gachaItemsMaster, setGachaItemsMaster] = useState<any[]>([]);
  const [gachaRarityRates, setGachaRarityRates] = useState<any[]>([]);
  const [dailyFreeGachaFlags, setDailyFreeGachaFlags] = useState<{ CHARACTER: boolean; SKILL: boolean; EQUIPMENT: boolean }>({
    CHARACTER: false,
    SKILL: false,
    EQUIPMENT: false
  });
  const [dailyFreeGachaReady, setDailyFreeGachaReady] = useState(false);
  const [specialPityPoints, setSpecialPityPoints] = useState<number>(0);
  const [guideGachaCategory, setGuideGachaCategory] = useState<"SKILL" | "EQUIPMENT" | null>(null);

  const [scoutAnimationState, setScoutAnimationState] = useState<null | "PROCESSING" | "FLASHING" | "READY" | "SHOW_RESULTS">(null);
  const [scoutFlashingColor, setScoutFlashingColor] = useState<"BLUE" | "PURPLE" | "GOLD">("BLUE");
  const [scoutResults, setScoutResults] = useState<any[]>([]);
  const [scoutPresentationCategory, setScoutPresentationCategory] = useState<string | null>(null);

  return {
    featureOperatingStates, setFeatureOperatingStates,
    gachaMasters, setGachaMasters,
    gachaItemsMaster, setGachaItemsMaster,
    gachaRarityRates, setGachaRarityRates,
    dailyFreeGachaFlags, setDailyFreeGachaFlags,
    dailyFreeGachaReady, setDailyFreeGachaReady,
    guideGachaCategory, setGuideGachaCategory,
    specialPityPoints, setSpecialPityPoints,
    scoutAnimationState, setScoutAnimationState,
    scoutFlashingColor, setScoutFlashingColor,
    scoutResults, setScoutResults,
    scoutPresentationCategory, setScoutPresentationCategory
  };
}
