import * as cg from '../../render/core/cg.js';

const validMatrix = m => m && m.length === 16 && Array.from(m).every(Number.isFinite);
const add = (a, b) => cg.add(a, b);
const offset = (p, axis, amount) => add(p, cg.scale(axis, amount));

// The existing multiplayer stream already shares head and controller matrices.
// A pose needs only those three tracked points; knees and elbows are inferred.
export function coachAvatarPose(headMatrix, leftMatrix, rightMatrix) {
   if (!validMatrix(headMatrix)) return null;
   const head = Array.from(headMatrix.slice(12, 15));
   if (head[1] < .3 || head[1] > 2.6) return null;
   const horizontal = v => {
      const flat = [v[0], 0, v[2]], length = cg.norm(flat);
      return length > .1 ? cg.scale(flat, 1 / length) : null;
   };
   // Matrix X is the player's right; negative Z is the headset's forward.
   const right = horizontal(headMatrix.slice(0, 3)) || [1, 0, 0];
   const forward = horizontal(cg.scale(headMatrix.slice(8, 11), -1)) || [0, 0, -1];
   const chest = offset(add(head, [0, -.32, 0]), forward, .035);
   const hips = offset(add(head, [0, -.68, 0]), forward, -.025);
   const shoulders = {}, elbows = {}, wrists = {}, hipJoints = {}, knees = {}, feet = {};
   for (const side of ['left', 'right']) {
      const sign = side === 'left' ? -1 : 1;
      shoulders[side] = offset(chest, right, sign * .18);
      hipJoints[side] = offset(hips, right, sign * .11);
      const matrix = side === 'left' ? leftMatrix : rightMatrix;
      if (validMatrix(matrix)) {
         const wrist = Array.from(matrix.slice(12, 15));
         if (cg.distance(head, wrist) < 1.8 && wrist[1] > -.1) {
            wrists[side] = wrist;
            const distance = cg.distance(shoulders[side], wrist);
            const half = Math.max(.34, distance / 2 + .005);
            const aim = add(cg.scale(right, sign), cg.scale(forward, .45));
            let elbow = cg.ik2(shoulders[side], wrist, half, half, aim);
            if (!elbow.every(Number.isFinite)) elbow = cg.mix(shoulders[side], wrist, .5);
            elbows[side] = elbow;
         }
      }
      // Feet stay at ground height while the hips follow a real squat.
      feet[side] = offset([hips[0], .055, hips[2]], right, sign * .15);
      const legDistance = cg.distance(hipJoints[side], feet[side]);
      const legHalf = Math.max(.37, legDistance / 2 + .005);
      let knee = cg.ik2(hipJoints[side], feet[side], legHalf, legHalf, forward);
      if (!knee.every(Number.isFinite)) knee = cg.mix(hipJoints[side], feet[side], .5);
      knees[side] = knee;
   }
   return {head, chest, hips, shoulders, elbows, wrists, hipJoints, knees, feet,
           face: offset(head, forward, .105), label: add(head, [0, .22, 0])};
}
