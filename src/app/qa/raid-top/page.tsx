import { notFound } from 'next/navigation';
import { isQaHarnessAvailable } from '@/domain/presentation/qaHarness';
import RaidTopHarness from './RaidTopHarness';
export const dynamic = 'force-dynamic';
export default function RaidTopQaPage() {
  if (process.env.NEXT_PUBLIC_USE_MOCK_DB !== 'true' || !isQaHarnessAvailable(process.env.NEXT_PUBLIC_APP_ENV, process.env.NODE_ENV)) notFound();
  return <RaidTopHarness />;
}
