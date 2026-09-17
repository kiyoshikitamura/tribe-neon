"""Build the reviewed 2026-09-17 release SQL; never execute it automatically."""
from pathlib import Path
import re
p=Path('supabase/migrations')
files=sorted(f for f in p.glob('20260916*.sql') if f.name.startswith(('20260916145956','202609161500','20260916150811','20260916151927','20260916165621','20260916165816')))
files += [p/n for n in ['20260917000005_raid_combat_profiles_20260917.sql','20260917000007_raid_room_three_battle_limit.sql','20260917000008_quest_encounter_fixed_difficulty_mapping.sql','20260917000009_quest_encounter_expert_difficulty.sql','20260917000016_q_shinjuku_2_runtime_power.sql']]
files += [Path('scripts/quest_release_progression_contract.sql'),Path('scripts/quest_release_system_news.sql')]
s='\n'.join('-- SOURCE: '+str(f)+'\n'+re.sub(r'(?im)^\s*(begin|commit);\s*$','',f.read_text()) for f in files)
s=s.replace('-- SOURCE: supabase/migrations/20260917000005','create table if not exists private.quest_release_20260917_raid_profiles_backup as table public.raid_room_combat_profiles;\nrevoke all on private.quest_release_20260917_raid_profiles_backup from public,anon,authenticated;\n-- SOURCE: supabase/migrations/20260917000005')
s=s.replace('$profiles$::jsonb) r;\nend $$;', '$profiles$::jsonb) r on conflict(raid_variant_id,difficulty_id) do update set max_hp=excluded.max_hp,profile=excluded.profile;\nend $$;')
Path('scripts/quest_production_release_bundle.sql').write_text(s)
print('Built release SQL from',len(files),'sources. Production reconciliation dependencies are intentionally excluded.')
