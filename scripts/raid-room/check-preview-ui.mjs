import fs from 'node:fs';
const url='https://tribe-neon-705g1hvhg-kiyoshi-kitamura.vercel.app/';
const r=await fetch(url),html=await r.text();
const paths=[...new Set([...html.matchAll(/src="([^"]+\.js[^"]*)"/g)].map(m=>m[1]))];
let ref=false;const chunks=[];
for(const p of paths){const s=await fetch(new URL(p,url)),t=await s.text();ref ||= t.includes('sufvuqdnqohpfzkwxohq');chunks.push({path:p,status:s.status});}
const out={url,status:r.status,checked_at:new Date().toISOString(),chunks,preview_ref_found:ref,limitation:'Fixed previously observed deployment URL only. No current alias/env control-plane assertion or authenticated gameplay.'};
fs.writeFileSync('docs/development/evidence/raid-room-edge-ui-prep-20260908/ui-http.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
