import { notFound } from "next/navigation";
import { AudioProvider } from "@/audio/AudioProvider";
import { isQaHarnessAvailable } from "@/domain/presentation/qaHarness";
import BattleFullSkillLoadHarness from "../battle-full-skill-load/BattleFullSkillLoadHarness";

export const dynamic = "force-dynamic";
export default function BattleLivePage() {
  if (!isQaHarnessAvailable(process.env.NEXT_PUBLIC_APP_ENV, process.env.NODE_ENV)) notFound();
  return <AudioProvider><BattleFullSkillLoadHarness withSetup /></AudioProvider>;
}
