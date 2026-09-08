import { notFound } from "next/navigation";
import { AudioProvider } from "@/audio/AudioProvider";
import { isQaHarnessAvailable } from "@/domain/presentation/qaHarness";
import BattlePresentationMock from "./BattlePresentationMock";

export const dynamic = "force-dynamic";
export default function Page() {
  if (!isQaHarnessAvailable(process.env.NEXT_PUBLIC_APP_ENV, process.env.NODE_ENV)) notFound();
  return <AudioProvider><BattlePresentationMock /></AudioProvider>;
}
