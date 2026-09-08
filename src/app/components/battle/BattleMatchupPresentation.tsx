"use client";

import type { BattlePresentationContext } from "@/hooks/useBattle";
import CharacterPresentation from "../character/CharacterPresentation";
import "./BattleMatchupPresentation.css";
import "./StreetFlow.css";

type Participant = { characterId?: string; name?: string };

type Props = {
  playerLeader?: Participant;
  opponentLeader?: Participant;
  context: BattlePresentationContext | null;
  imageFor: (characterId?: string) => string | undefined;
  acceptanceState?: string;
};

export default function BattleMatchupPresentation({ playerLeader, opponentLeader, context, imageFor, acceptanceState }: Props) {
  const opponentName = context?.opponentLeaderName || opponentLeader?.name || context?.opponentLabel || "ENEMY";
  if (context?.mode !== "RAID") return <section className="sf-root sf-screen" style={context?.backgroundPath ? {"--battle-background-image":`url('${context.backgroundPath}')`} as React.CSSProperties : undefined} data-acceptance-state={acceptanceState} role="status" aria-label={`${opponentName}との対戦開始`}><header className="sf-heading"><small>BATTLE</small><h1>{context?.encounterLabel || context?.opponentLabel}</h1></header><div className="sf-matchup"><article className="sf-vs-person player">{imageFor(playerLeader?.characterId)&&<img src={imageFor(playerLeader?.characterId)} alt=""/>}<b>{playerLeader?.name || "PLAYER"}</b></article><article className="sf-vs-person enemy">{imageFor(context?.opponentLeaderCharacterId || opponentLeader?.characterId)&&<img src={imageFor(context?.opponentLeaderCharacterId || opponentLeader?.characterId)} alt=""/>}<b>{opponentName}</b></article><b className="sf-vs-mark">VS</b><strong className="sf-start">BATTLE START</strong></div></section>;
  return (
    <section className="battle-matchup" style={context?.backgroundPath ? { "--battle-background-image": `url(${context.backgroundPath})` } as React.CSSProperties : undefined} data-acceptance-state={acceptanceState} role="status" aria-label={`${context?.opponentLabel || opponentName}との対戦開始`}>
      <div className="battle-matchup-shade" aria-hidden="true" />
      <article className="battle-matchup-leader is-player">
        <CharacterPresentation src={imageFor(playerLeader?.characterId)} alt={playerLeader?.name || "PLAYER"} variant="battle-leader" />
        <div><small>PLAYER</small><strong>{playerLeader?.name || "PLAYER"}</strong></div>
      </article>
      <div className="battle-matchup-center">
        <span>VS</span>
        <strong>BATTLE START</strong>
        <small>{context?.encounterLabel || context?.opponentLabel}</small>
      </div>
      <article className="battle-matchup-leader is-enemy">
        <CharacterPresentation src={imageFor(context?.opponentLeaderCharacterId || opponentLeader?.characterId)} alt={opponentName} variant="battle-leader" />
        <div>
          <small>OPPONENT</small>
          <strong>{opponentName}</strong>
          {context?.opponentTotalPower ? <span>POWER {context.opponentTotalPower.toLocaleString()}</span> : context?.opponentProfile ? <span>{context.opponentProfile}</span> : null}
        </div>
      </article>
    </section>
  );
}
