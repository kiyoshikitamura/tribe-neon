"use client";

import UserAvatar from "@/app/components/profile/UserAvatar";
import { CHARACTERS_MASTER } from "@/utils/game_constants";
import { isQaHarnessAvailable } from "@/domain/presentation/qaHarness";

export default function IdentityQa() {
  if (!isQaHarnessAvailable(process.env.NEXT_PUBLIC_APP_ENV, process.env.NODE_ENV)) return null;
  return <main style={{padding:12,background:'#101720',color:'#fff'}}>
    <h1>Identity Avatar QA</h1>
    <p>22 / 32 / 38 / 48 / 64 px — existing Character metadata</p>
    {CHARACTERS_MASTER.map(character=><section key={character.id} data-character-id={character.id} style={{display:'flex',alignItems:'center',gap:8,minHeight:88}}>
      <span style={{width:72,fontSize:11}}>{character.jpName}</span>
      {[22,32,38,48,64].map(size=><div key={size} style={{width:size,height:size,flexShrink:0,borderRadius:'50%',overflow:'hidden'}}>
        <UserAvatar characterId={character.id} alt={character.jpName} />
      </div>)}
    </section>)}
  </main>;
}
