// A pose stores each hand relative to the player's head, in metres:
// [outward, up, forward]. The scene mirrors these hands toward the player.
export const DOWN = [.25,-.75,.05];
const UP = [.20,.30,.05], OUT = [.65,-.20,0],
      FWD = [.15,-.25,.55], HIGH = [.45,.25,0],
      CHEST = [.10,-.30,.25], CROSS = [-.2,-.25,.35];

export const DANCE = [
   { a: UP, b: DOWN, sway:-1 }, { a: DOWN, b: UP, sway:1 },
   { a: OUT, b: OUT, sway:0 }, { a: HIGH, b: HIGH, sway:0 },
   { a: OUT, b: CHEST, sway:-1 }, { a: CHEST, b: OUT, sway:1 },
   { a: CROSS, b: CROSS, sway:0 }, { a: UP, b: UP, sway:0 },
];

export const FIT = [
   { a: HIGH, b: HIGH, feet:1 }, { a: DOWN, b: DOWN },
   { a: FWD, b: FWD, squat:1 }, { a: DOWN, b: DOWN },
   { a: FWD, b: CHEST }, { a: CHEST, b: FWD },
   { a: UP, b: UP }, { a: FWD, b: FWD, squat:1 },
];

export const BEAT = { dance:.6, fit:.75 }; // seconds per beat; each pose lasts two beats
export const poseIndex = (time, beat) => Math.floor(time / (2 * beat));
export const poseAt = (poses, k) => poses[((k % poses.length) + poses.length) % poses.length];
