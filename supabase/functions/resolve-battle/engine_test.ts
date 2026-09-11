import { resolveBattle } from "./engine.ts";

const player = [{
  id: "player-1",
  name: "Player",
  team: "PLAYER" as const,
  alignment: "JUSTICE" as const,
  stats: { hp: 2_000, atk: 900, def: 100, spd: 120, luk: 20 },
  skills: [{
    id: "player-strike",
    name: "Strike",
    activationType: "ACTIVE" as const,
    target: "ENEMY_SINGLE" as const,
    effects: ["DAMAGE 160% ATK"],
    cooldown: 0,
    availableFromRound: 1,
  }],
}];

const enemy = [{
  id: "enemy-1",
  name: "Enemy",
  team: "ENEMY" as const,
  alignment: "EVIL" as const,
  stats: { hp: 400, atk: 10, def: 0, spd: 10, luk: 0 },
  skills: [],
}];

Deno.test("same replay seed produces the exact same resolution", () => {
  const first = resolveBattle(91_337, "ATTACK_PRIORITY", 30, player, enemy);
  const second = resolveBattle(91_337, "ATTACK_PRIORITY", 30, player, enemy);

  if (JSON.stringify(first) !== JSON.stringify(second)) {
    throw new Error("Replay resolution must be deterministic for a fixed seed");
  }
});

Deno.test("a defeated defense gives the player the win and records damage", () => {
  const result = resolveBattle(91_337, "ATTACK_PRIORITY", 30, player, enemy);

  if (result.winner !== "PLAYER") throw new Error("Expected player victory");
  if (result.playerRawDamage <= 0) throw new Error("Expected recorded player damage");
  if (!result.events.some((entry) => entry.type === "DEFEAT" && entry.payload.targetId === "enemy-1")) {
    throw new Error("Expected a defense defeat event");
  }
});

Deno.test("an unresolved round limit is an enemy win", () => {
  const result = resolveBattle(1, "BALANCED", 0, player, enemy);

  if (result.winner !== "ENEMY" || result.rounds !== 0) {
    throw new Error("Unresolved battles must not grant a player victory");
  }
});

Deno.test("an authored turn gate waits without changing the unit's SPD", () => {
  const waitingPlayer = [{
    ...player[0],
    id: "waiting-player",
    turnAvailableFromRound: 2,
    stats: { ...player[0].stats, spd: 250 },
  }];
  const durableEnemy = [{ ...enemy[0], stats: { ...enemy[0].stats, hp: 2_000, spd: 150 } }];
  const result = resolveBattle(91_337, "ATTACK_PRIORITY", 2, waitingPlayer, durableEnemy);
  const actions = result.events.filter((entry) => entry.type === "ACTION" && entry.payload.actorId === "waiting-player");
  if (actions.some((entry) => entry.round === 1) || !actions.some((entry) => entry.round === 2)) {
    throw new Error("Expected the authored unit to wait until round 2");
  }
});
