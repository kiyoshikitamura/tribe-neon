import { notFound } from "next/navigation";
import { isQaHarnessAvailable } from "@/domain/presentation/qaHarness";
import RaidRoomHarness from "./RaidRoomHarness";

export const dynamic = "force-dynamic";

export default function RaidRoomQaPage() {
  if (!isQaHarnessAvailable(process.env.NEXT_PUBLIC_APP_ENV, process.env.NODE_ENV)) notFound();
  return <RaidRoomHarness />;
}
