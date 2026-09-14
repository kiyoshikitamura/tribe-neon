import { getRaidAreaStrategy } from '@/domain/raidStrategy';
import './RaidStrategySummary.css';

export default function RaidStrategySummary({ areaId }: { areaId: string }) {
  const strategy = getRaidAreaStrategy(areaId);
  if (!strategy) return null;
  return <div className="raid-strategy-summary">
    <strong>特徴：{strategy.identity}</strong>
    <span>{strategy.description}</span>
    <span className="raid-strategy-summary__counter">有効：{strategy.counter}</span>
  </div>;
}
