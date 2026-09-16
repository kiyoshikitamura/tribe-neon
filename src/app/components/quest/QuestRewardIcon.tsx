import CanonicalItemIcon from '../ui/CanonicalItemIcon';
import './QuestRewardIcon.css';

export default function QuestRewardIcon({ itemId, label, quantity }: { itemId: string; label: string; quantity: number }) {
  return <span className="quest-v2-reward-item quest-reward-icon" aria-label={`${label} × ${Number(quantity || 0).toLocaleString()}`} title={label}>
    {itemId === 'CASH' ? <img src="/ui/icon_cash.png" alt="" /> : itemId === 'PLAYER_XP' ? <b>XP</b> : <CanonicalItemIcon itemId={itemId} alt="" />}
    <strong>× {Number(quantity || 0).toLocaleString()}</strong>
  </span>;
}
