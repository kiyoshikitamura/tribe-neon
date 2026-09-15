import { redirect } from "next/navigation";

type LegacyCommercialPageProps = { searchParams: Promise<{ from?: string }> };

export default async function LegacyCommercialPage({ searchParams }: LegacyCommercialPageProps) {
  const { from } = await searchParams;
  redirect(from === "settings" ? "/legal/tokusho?from=settings" : "/legal/tokusho");
}
