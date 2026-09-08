import { notFound } from "next/navigation";
import { isQaHarnessAvailable } from "@/domain/presentation/qaHarness";
import BattleFlowMock from "./BattleFlowMock";
export const dynamic = "force-dynamic";
export default function Page() {
  if (!isQaHarnessAvailable(process.env.NEXT_PUBLIC_APP_ENV, process.env.NODE_ENV)) notFound();
  return <BattleFlowMock />;
}
