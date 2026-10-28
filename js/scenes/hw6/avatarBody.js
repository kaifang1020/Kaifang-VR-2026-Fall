/*
 * A stick figure built from the joints coachAvatarPose infers. Taken from the coach
 * scene's remote bodies so any pose, including the player's own, can be drawn under
 * any parent node. placeLimb(a, b, r) stretches a tube between two joints.
 */
const SKIN = [.96,.8,.69], PANTS = [.2,.24,.33];

export function makeBody(parent, shirt = [.25,.85,.7]) {
   const root = parent.add();
   const part = (shape, color) => root.add(shape).color(color).dull();
   const body = {root, head: part('sphere', SKIN), face: part('sphere', [.08,.12,.18]),
                 torso: part('tubeZ', shirt), hips: part('sphere', PANTS), arms: {}, legs: {}};
   for (const side of ['left','right']) {
      body.arms[side] = {upper: part('tubeZ', shirt), lower: part('tubeZ', shirt), elbow: part('sphere', shirt),
                         hand: part('sphere', side === 'left' ? [1,.4,.4] : [.4,.6,1])};
      body.legs[side] = {upper: part('tubeZ', PANTS), lower: part('tubeZ', PANTS),
                         knee: part('sphere', PANTS), foot: part('sphere', PANTS)};
   }
   return body;
}

// Returns true when a body was drawn, false when it was hidden.
export function drawBody(body, pose) {
   if (!pose) { body.root.identity().scale(0); return false; }
   body.root.identity();
   body.head.identity().move(pose.head).scale(.105,.12,.105);
   body.face.identity().move(pose.face).scale(.055,.025,.02);
   body.torso.placeLimb(pose.chest, pose.hips, .135);
   body.hips.identity().move(pose.hips).scale(.17,.1,.12);
   for (const side of ['left','right']) {
      const arm = body.arms[side], leg = body.legs[side];
      const wrist = pose.wrists[side], elbow = pose.elbows[side];
      for (const part of Object.values(arm)) part.identity().scale(0);
      if (wrist) {
         arm.upper.placeLimb(pose.shoulders[side], elbow, .045);
         arm.lower.placeLimb(elbow, wrist, .038);
         arm.elbow.identity().move(elbow).scale(.045);
         arm.hand.identity().move(wrist).scale(.055);
      }
      leg.upper.placeLimb(pose.hipJoints[side], pose.knees[side], .055);
      leg.lower.placeLimb(pose.knees[side], pose.feet[side], .047);
      leg.knee.identity().move(pose.knees[side]).scale(.055);
      leg.foot.identity().move(pose.feet[side]).scale(.075,.035,.11);
   }
   return true;
}
