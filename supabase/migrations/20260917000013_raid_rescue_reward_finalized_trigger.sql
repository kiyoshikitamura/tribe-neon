-- Preview reconciliation of the Production rescue-reward finalization trigger.
DROP TRIGGER IF EXISTS raid_room_rescue_reward_finalized_v1 ON public.battle_replay_sessions;
CREATE TRIGGER raid_room_rescue_reward_finalized_v1
AFTER UPDATE OF finalization_status ON public.battle_replay_sessions
FOR EACH ROW
EXECUTE FUNCTION public.on_raid_room_rescue_reward_finalized_v1();
