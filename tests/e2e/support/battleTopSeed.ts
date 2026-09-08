export function seedBattleTop() {
  if (localStorage.getItem('battle_top_seeded')) return;
  localStorage.setItem('battle_top_seeded','true');
  const me='00000000-0000-4000-8000-000000000701';
  localStorage.setItem('tribe_demo_uuid',me);
  localStorage.setItem('mock_auth_mode','EMAIL');
  localStorage.setItem('mock_db_tutorial_progress',JSON.stringify([{user_id:me,step_id:'AUTHENTICATION'}]));
  localStorage.setItem('mock_db_user_account_auth_methods',JSON.stringify([{user_id:me,auth_method:'EMAIL'}]));
  const chars=['char_ageha_01','char_reiji_01','char_kengo_01','char_koharu_01','char_mio_01'];
  const users=chars.map((c,i)=>({id:i?`00000000-0000-4000-8000-00000000070${i+1}`:me,username:['アゲハ','レイジ','ケンゴ','コハル','ミオ'][i],favorite_character_id:c,level:10,pvp_points:5,current_base_id:'shinjuku',last_active_at:new Date().toISOString()}));
  localStorage.setItem('mock_db_users',JSON.stringify(users));
  localStorage.setItem('mock_db_user_power_rankings',JSON.stringify(users.map((u,i)=>({user_id:u.id,total_power:185240-i*11040}))));
  localStorage.setItem('mock_db_user_characters',JSON.stringify(users.flatMap((u,i)=>chars.map((c,s)=>({id:`owned-${i}-${s}`,user_id:u.id,character_id:chars[(i+s)%5],level:10})))));
  localStorage.setItem('mock_db_user_main_formations',JSON.stringify(users.flatMap((u,i)=>chars.map((c,s)=>({user_id:u.id,slot:s+1,user_character_id:`owned-${i}-${s}`})))));
  localStorage.setItem('mock_db_pvp_defense_decks',JSON.stringify(users.map((u,i)=>({user_id:u.id,character_1_id:`owned-${i}-0`,character_2_id:`owned-${i}-1`,character_3_id:`owned-${i}-2`,character_4_id:`owned-${i}-3`,character_5_id:`owned-${i}-4`,tactic:'ATTACK_PRIORITY'}))));
  localStorage.setItem('mock_db_pvp_ranks',JSON.stringify(users.map((u,i)=>({user_id:u.id,rank_points:1500-i*100,daily_wins:5-i}))));
  localStorage.setItem('mock_db_user_funnel_milestones',JSON.stringify(['tutorial_complete','first_pvp','ranking_viewed','first_raid','guild_joined','guild_activation','activation_mission_handoff'].map(milestone=>({user_id:me,milestone}))));
}
