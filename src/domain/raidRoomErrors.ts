/** A known server operation stop, distinct from a transport or validation error. */
export class RaidRoomStoppedError extends Error {
  constructor() { super('Raid Room creation stopped'); this.name = 'RaidRoomStoppedError'; }
}
