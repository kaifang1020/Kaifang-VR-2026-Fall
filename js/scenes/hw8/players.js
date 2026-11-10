/*
 * Two players around one miniature table. Pure logic, no scene graph, so it can be tested.
 *
 * Every player is in one of two modes:
 *   'table'  — the GIANT: stands at the real table, real size.
 *   'inside' — the MINI:  lives on the table at 1/12, walking around with their origin.
 *
 * Where does a player's body go? Everything is drawn in TABLE coordinates (the real
 * room, where the table stands):
 *   giant → their body exactly where they are:           matrix = identity
 *   mini  → their body through their own miniature matrix: matrix = M(their origin)
 * The viewer then puts that whole "table frame" under their own world node, which is
 * identity for a giant and M⁻¹ for a mini. So a mini sees a giant twelve times bigger,
 * standing where the giant really stands, without any extra code.
 */
import * as cg from '../../render/core/cg.js';
import { SCALE, TABLE, HOUSE, validMatrix, miniatureMatrix, houseBounds } from '../hw6/miniatureModel.js';

// A giant on a laptop has no real body. Their camera is far back (about 1.7 m behind the
// table), which a mini would see 12 times further: 18 m away. So a laptop giant is shown
// standing at the front edge of the table, leaning over it. lift raises each hand (Q/A, E/D).
export function deskGiantPose(lift = {left: 0, right: 0}) {
   const z = TABLE.at[2] + TABLE.depth / 2 + .3;                    // 30 cm in front of the table edge
   const head = cg.mMultiply(cg.mTranslate(0, 1.55, z), cg.mRotateX(-.6));   // looking down at the table
   const hand = (x, up) => cg.mTranslate(x, TABLE.height + .12 + up * .5, z - .32);
   return {head, left: hand(-.28, lift.left), right: hand(.28, lift.right)};
}

export const POSE_PREFIX = 'giantMiniPose_';
export const poseKey = id => POSE_PREFIX + id;
export const roleName = mode => mode === 'inside' ? 'MINI' : 'GIANT';

const round = m => validMatrix(m) ? Array.from(m, v => Math.round(v * 1e4) / 1e4) : null;

// What I tell everyone. Head and hands in my scene coordinates; seq counts up so the
// others can tell when I stop sending (closed the tab).
export function packPlayer({mode, origin, faceMe, self, seq, standIn = false, hold = null}) {
   return {mode, faceMe: !!faceMe, seq, hold, standIn,      // standIn: a laptop giant's made-up body, not a tracked one
           origin: origin ? origin.map(v => Math.round(v * 1e4) / 1e4) : null,
           head: round(self?.head), left: round(self?.left), right: round(self?.right)};
}

// A player who has not sent anything new for `timeout` ms is gone.
export function createFreshness(timeout = 3000) {
   const last = new Map();                       // id -> {seq, at}
   return (id, seq, now) => {
      const seen = last.get(id);
      if (!seen || seen.seq !== seq) { last.set(id, {seq, at: now}); return true; }
      return now - seen.at < timeout;
   };
}

// The others, ready to draw. `published(id)` reads what that client sent; `xr(id)`
// returns their head and hands from clientState when they wear a headset (already in my
// scene coordinates), else null. A headset's clientState is fresher, so it wins.
export function readOthers({clients = [], myId, published, xr = () => null, fresh = () => true, now = 0}) {
   const others = [];
   for (const id of clients) {
      if (String(id) === String(myId)) continue;
      const p = published(id);
      if (!p || !p.origin || !fresh(id, p.seq, now)) continue;
      const tracked = xr(id);
      const head = tracked && validMatrix(tracked.head) ? tracked.head : p.head;
      if (!validMatrix(head)) continue;
      others.push({id, mode: p.mode, faceMe: !!p.faceMe, origin: p.origin, head, standIn: !!p.standIn && !tracked, hold: p.hold || null,
                   left:  tracked?.left  ?? p.left,
                   right: tracked?.right ?? p.right,
                   fromClientState: !!tracked});
   }
   return others;
}

// The matrix that puts a player's real-size body into table coordinates.
export const tableFrame = player => player.mode === 'inside'
   ? miniatureMatrix(player.origin, {faceMe: player.faceMe})
   : [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];

// Whom do I draw? A giant never needs a laptop giant's stand-in body: it stands at the table
// edge, exactly where a real giant stands, and would look like my own body. Minis see everyone.
export const visibleTo = (myMode, player) => !(myMode === 'table' && player.standIn);

// ---- Riding: a mini standing in the house goes where the house goes ----
// Is this point (table coordinates) within the house's walls?
export function insideHouse(tablePoint, houseAt) {
   const b = houseBounds(houseAt);
   return Math.abs(tablePoint[0] - b.centre[0]) < b.half[0] && Math.abs(tablePoint[2] - b.centre[2]) < b.half[2]
       && tablePoint[1] > houseAt[1] - .01 && tablePoint[1] < houseAt[1] + HOUSE.wall + HOUSE.depth;
}
// Move a mini by `delta` on the table. Their place on the table is M(origin) · head, so the
// only thing to change is their origin: delta, undone by M's turn and scale, with the sign flipped.
//    M = T(spot) · R · S(s) · T(-origin)   →   origin changes by  -R⁻¹ · delta / s
export function rideOrigin(origin, delta, {faceMe = false, scale = SCALE} = {}) {
   const turn = faceMe ? -1 : 1;                       // R_y(π) flips x and z, leaves y
   return [origin[0] - turn * delta[0] / scale, origin[1] - delta[1] / scale, origin[2] - turn * delta[2] / scale];
}

// ---- My two buttons sit at my left hip: always in reach, never between my eyes and my work ----
// (Straight ahead at the belt is exactly where a giant looks down at the table.)
// The tray's centre: 38 cm to my left, 25 cm ahead, 50 cm below my eyes, facing me.
export const TRAY = {left: .38, ahead: .25, below: .5};
export function hudTarget(head) {
   const f = [-head[8], 0, -head[10]], n = Math.hypot(f[0], f[2]) || 1, fw = [f[0] / n, 0, f[2] / n], left = [fw[2], 0, -fw[0]];
   return {at: [head[12] + fw[0] * TRAY.ahead + left[0] * TRAY.left, head[13] - TRAY.below,
                head[14] + fw[2] * TRAY.ahead + left[2] * TRAY.left],
           yaw: Math.atan2(-fw[0], -fw[2])};
}
// It stays put while I aim at it, and only comes back when I have turned or walked so far that
// its proper place is more than 35 cm from where it is.
export function hudNeedsMove(hud, head) {
   if (!hud) return true;
   const want = hudTarget(head).at;
   return Math.hypot(want[0] - hud.at[0], want[1] - hud.at[1], want[2] - hud.at[2]) > .35;
}

// ---- Holding on: the mini decides when to be carried ----
// While the mini keeps the grip button down they hold on to ONE thing and go where it goes:
// a giant's hand if one is within reach of their head or hands, otherwise the house they stand in.
// Letting go leaves them where they are. hold is 'hand', 'house' or 'none' (button down, nothing there).
export const REACH = 3.5 * .0254;                    // 3.5 in on the table: 3.5 ft to the mini
export function pickHold({mine = [], inHouse = false, hands = []}) {
   let best = null;
   for (const hand of hands) for (const point of mine) {
      if (!hand.at || !point) continue;
      const d = Math.hypot(hand.at[0] - point[0], hand.at[1] - point[1], hand.at[2] - point[2]);
      if (d < REACH && (!best || d < best.d)) best = {kind: 'hand', id: hand.id, side: hand.side, d};
   }
   if (best) return {kind: 'hand', id: best.id, side: best.side};
   return inHouse ? {kind: 'house'} : {kind: 'none'};
}
// What a mini's feet settle on (a table height): the floor of the house, if they are between its
// walls AND already up at its floor; else the table top. So when the giant lifts the house off a
// mini who is not holding on, the mini stays on the table.
export function groundUnder(feet, houseAt) {
   const b = houseBounds(houseAt);
   const between = Math.abs(feet[0] - b.centre[0]) < b.half[0] && Math.abs(feet[2] - b.centre[2]) < b.half[2];
   return between && feet[1] > houseAt[1] - .004 ? houseAt[1] : TABLE.height;
}
export const HOLD_TEXT = {hand: "HOLDING THE GIANT'S HAND", house: 'HOLDING ON TO THE HOUSE', none: 'NOTHING IN REACH TO HOLD'};

// ---- A robot partner, so one person with one headset can test both roles ----
// ROBOT GIANT (the laptop plays it): a 28 s loop.
//    0–6 s   its right hand comes down beside the mini's head and waits   → hold the grip to grab it
//    6–14 s  the hand lifts, carries across the table and comes down      → you are carried
//   14–16 s  the hand goes away                                           → let go
//   16–28 s  it slides the house sideways, lifts it and puts it back      → hold the grip inside to ride
// Returns where the hand is and how far the house is from where it stood, in table coordinates.
const ease = t => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
const mix3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
export function robotGiant(time, miniHead, rest) {
   const t = ((time % 28) + 28) % 28;
   const beside = miniHead ? [miniHead[0] + .04, miniHead[1] - .02, miniHead[2]] : rest;
   const up = [beside[0], beside[1] + .22, beside[2]], over = [up[0] + .3, up[1], up[2]], down = [over[0], beside[1], over[2]];
   let hand = rest, house = [0, 0, 0], doing = 'RESTING';
   if (t < 6)       { hand = mix3(rest, beside, ease(t / 2.5));            doing = 'HAND IS BESIDE THE MINI: GRAB IT'; }
   else if (t < 9)  { hand = mix3(beside, up, ease((t - 6) / 3));          doing = 'LIFTING'; }
   else if (t < 12) { hand = mix3(up, over, ease((t - 9) / 3));            doing = 'CARRYING'; }
   else if (t < 14) { hand = mix3(over, down, ease((t - 12) / 2));         doing = 'PUTTING DOWN'; }
   else if (t < 16) { hand = mix3(down, rest, ease((t - 14) / 2));         doing = 'LET GO NOW'; }
   else {
      const u = (t - 16) / 12;                                             // 0..1 over the house part
      house = [.18 * Math.sin(2 * Math.PI * u), .1 * Math.sin(Math.PI * u) ** 2, 0];
      doing = 'MOVING THE HOUSE';
   }
   return {hand, house, doing, carrying: t >= 6 && t < 14};
}
// ROBOT MINI (the laptop plays it): stands where it is and holds on for 9 s out of every 13.
export const robotMiniHolds = time => (((time % 13) + 13) % 13) < 9;
