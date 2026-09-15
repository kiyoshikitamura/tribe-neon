import { notFound } from "next/navigation";
import { isQaHarnessAvailable } from "@/domain/presentation/qaHarness";
import ShopUiHarness from "./ShopUiHarness";

export const dynamic = "force-dynamic";

export default function ShopUiPage() {
  if (!isQaHarnessAvailable(process.env.NEXT_PUBLIC_APP_ENV, process.env.NODE_ENV)) notFound();
  return <ShopUiHarness />;
}
