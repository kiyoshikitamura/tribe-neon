import { redirect } from "next/navigation";

// Keep existing Stripe success/cancel URLs and old bookmarks working. The
// authenticated game restores the shop and checks the order in a dialog.
export default async function BillingReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string | string[] }>;
}) {
  const params = await searchParams;
  const order = typeof params.order === "string" ? params.order : "";
  redirect(`/?billing_order=${encodeURIComponent(order)}`);
}
