import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import {bootstrap,user,value,Client,connection} from '../raid-top-data/pg-harness.mjs';
const {db,config,database}=await bootstrap();const second=new Client(config);const results=[];
try{
 await second.connect();await db.query('update raid_room_creation_settings set enabled=true');await user(db,1);await user(second,1);
 const choices=await value(db,'select list_raid_room_boss_choices_v1() value');const request=randomUUID();
 const sql="select create_raid_room_v1('beginner',$1,$2) value";const args=[choices.choices[0].raidVariantId,request];
 const [a,b]=await Promise.all([value(db,sql,args),value(second,sql,args)]);assert.equal(a.roomId,b.roomId);
 await db.query('reset role');assert.equal(Number(await value(db,'select count(*) value from raid_rooms where id=$1',[a.roomId])),1);
 results.push({name:'two simultaneous authenticated Room create requests return same Room',status:'PASS'});
 await db.query('begin; lock table public.raid_rooms in access exclusive mode');await second.query("reset role;set lock_timeout='100ms'");
 await assert.rejects(()=>second.query('select * from public.raid_rooms'),e=>e.code==='55P03');await db.query('rollback');await second.query('select * from public.raid_rooms');
 results.push({name:'conflicting access stops with lock_timeout and succeeds after rollback releases locks',status:'PASS'});
 fs.writeFileSync('docs/development/raid-production-preparation/rehearsal/native-concurrency.json',JSON.stringify({database,results,scope:'PG17 native two connections, real Raid SQL on minimal fixture. Separate from Production catalog bundle rehearsal. No HTTP Auth/Edge/Cron.'},null,2)+'\n');console.log(JSON.stringify(results));
}finally{await second.end();await db.end();}
