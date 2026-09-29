// Pure scoring rules for a round of Follow the Coach: no rendering, no
// controllers, no network. The scene reports hits and misses; the rules keep
// the score and decide the grade, the rank and whether the round was won.

export const ROUND_POSES = 24;       // scored poses in one round
export const COUNTDOWN_POSES = 2;    // poses' worth of "get ready" before the first scored pose
export const LINGER_POSES = 50;      // how long the result stays up before free practice resumes
export const POINTS = {PERFECT:100, GOOD:60};
export const WIN_PER_POSE = 50;      // win with an average of 50 points per pose
export const RANKS = [['S',110],['A',80],['B',WIN_PER_POSE],['C',0]];   // points per pose

// closeness: 0 at the edge of the target, 1 at its centre (mean of both hands).
// beats: how far into the two-beat pose the hit was registered.
export const gradeOf = (closeness, beats) => closeness >= .45 && beats <= 1.4 ? 'PERFECT' : 'GOOD';

// Every fourth hit in a row raises the multiplier by a quarter, up to double.
export const multiplier = combo => 1 + .25*Math.min(4,Math.floor(Math.max(0,combo)/4));

export const goalFor = poses => poses*WIN_PER_POSE;
export const rankFor = (score, poses) => RANKS.find(([,perPose]) => score >= perPose*poses)[0];

// A round is shared as {k0, n}: the index of its first scored pose and its length.
// k is the index of the pose being shown right now.
export function roundPhase(round, k) {
   if (!round || !Number.isFinite(round.k0) || !(round.n > 0)) return {phase:'free'};
   if (k < round.k0) return {phase:'countdown', posesLeft:round.k0-k};
   if (k < round.k0+round.n) return {phase:'playing', index:k-round.k0, count:round.n};
   // A finished round expires, so a stale one restored from storage is ignored.
   if (k < round.k0+round.n+LINGER_POSES) return {phase:'done', count:round.n};
   return {phase:'free'};
}

export class RoundScore {
   constructor(poses = ROUND_POSES) { this.poses = poses; this.reset(); }
   reset() {
      this.score = 0; this.combo = 0; this.best = 0; this.judged = 0;
      this.perfect = 0; this.good = 0; this.missed = 0; this.last = null;
   }
   hit(grade) {
      if (this.judged >= this.poses || !POINTS[grade]) return 0;
      const points = Math.round(POINTS[grade]*multiplier(this.combo));
      this.score += points; this.combo++; this.judged++;
      this.best = Math.max(this.best,this.combo);
      this[grade === 'PERFECT' ? 'perfect' : 'good']++;
      this.last = {grade, points};
      return points;
   }
   miss() {
      if (this.judged >= this.poses) return;
      this.combo = 0; this.judged++; this.missed++;
      this.last = {grade:'MISS', points:0};
   }
   get multiplier() { return multiplier(this.combo); }
   get goal() { return goalFor(this.poses); }
   get won() { return this.score >= this.goal; }
   get rank() { return rankFor(this.score,this.poses); }
}
