// Pure rules for fishing side by side: who is at the pond, where each player
// stands, when the shared match runs, and who is winning. No rendering and no
// networking; the scene passes in the shared state and the time.
//
// Shared state (window.fishingPond), one element per writer so that nobody
// overwrites anybody else:
//   match   : {id, t0}  the current match, started by whoever pressed START
//   'p'+id  : one player's latest snapshot, written only by that player

export const MATCH_SECONDS = 120;
export const COUNTDOWN = 3;          // seconds before a match starts when others are at the pond
export const LATE_JOIN = 20;         // a match can still be joined this long after it started
export const STALE = 2.5;            // a player not heard from for this long has left the pond
export const SEND_HZ = 15;           // snapshots per second
const FORGET = 30;                   // a finished match is forgotten after this many seconds

// Where each player stands along the dock, in metres from the centre:
// 0, then alternately right and left.
export const slotX = i => (i % 2 ? 1 : -1) * Math.ceil(i/2) * .9;

export function matchPhase(match, now) {
   if (!match || !Number.isFinite(match.t0) || match.id === undefined) return {phase:'none'};
   const since = now - match.t0;
   if (since < 0) return {phase:'countdown', left:-since};
   if (since < MATCH_SECONDS) return {phase:'on', elapsed:since};
   if (since < MATCH_SECONDS + FORGET) return {phase:'over'};
   return {phase:'none'};
}

// Players at the pond, sorted by client id so every device agrees on the slots.
// entries: {id: snapshot}. lastSeen: {id: local time the snapshot last changed}.
export function presentPlayers(entries, lastSeen, me, now, isAlive = () => true) {
   const ids = Object.keys(entries).filter(id =>
      id === String(me) || (isAlive(id) && now - (lastSeen[id] ?? -1e9) < STALE));
   if (!ids.includes(String(me))) ids.push(String(me));
   return ids.sort((a,b) => Number(a) - Number(b) || a.localeCompare(b));
}

// Everyone in a match, best score first; ties go to whoever has more fish.
export function standings(entries, ids, matchId) {
   return ids.map(id => ({id, ...entries[id]}))
             .filter(p => p.m === matchId)
             .sort((a,b) => (b.sc|0) - (a.sc|0) || (b.f|0) - (a.f|0));
}

// The first other player in this match who reached the goal, if any.
export function winnerOf(entries, ids, matchId, me) {
   return ids.map(id => ({id, ...entries[id]}))
             .find(p => p.id !== String(me) && p.m === matchId && p.ph === 'won') || null;
}

export const anyonePlaying = (entries, ids, me) =>
   ids.some(id => id !== String(me) && entries[id]?.ph === 'playing');
