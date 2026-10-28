/*
 * The miniature is the player's own body drawn a second time under one extra node.
 * Everything that makes it small is that node's matrix:
 *
 *    stage = T(spot) · R_y(π) · S(k) · T(−origin)
 *
 * Read from right to left: move the player so the floor point under their head is
 * the origin, shrink around that point, turn it to face the player, carry it to the
 * table. The body itself is drawn at full size in ordinary room coordinates; it
 * never knows it is small.
 */
import * as cg from '../../render/core/cg.js';

export const SCALE = .1;                          // 1.7 m tall becomes 17 cm
export const SPOT = [0, .80, -.6];                // table top, in front of the player
export const validMatrix = m => !!m && m.length === 16 && Array.from(m).every(Number.isFinite);

// The point on the floor under the head: the miniature's own origin.
export const floorPoint = head => [head[12], 0, head[14]];

export function miniatureMatrix(origin, {scale = SCALE, spot = SPOT, faceMe = false} = {}) {
   let m = cg.mTranslate(spot[0], spot[1], spot[2]);
   if (faceMe) m = cg.mMultiply(m, cg.mRotateY(Math.PI));
   m = cg.mMultiply(m, cg.mScale(scale, scale, scale));
   return cg.mMultiply(m, cg.mTranslate(-origin[0], -origin[1], -origin[2]));
}

// The same product written with the scene graph's own calls, so one node carries it.
export function placeMiniature(node, origin, {scale = SCALE, spot = SPOT, faceMe = false} = {}) {
   node.identity().move(spot[0], spot[1], spot[2]);
   if (faceMe) node.turnY(Math.PI);
   return node.scale(scale, scale, scale).move(-origin[0], -origin[1], -origin[2]);
}

// Without a headset nothing is tracked. The desktop camera stands in for the head
// and two hands hang in front of it; lift raises each hand (keys in the scene).
export function desktopPose(viewMatrix, lift = {left: 0, right: 0}) {
   const head = cg.mInverse(Array.from(viewMatrix));
   const hand = (sign, up) => {
      const p = cg.mTransform(head, [sign * .22, -.38 + up, -.32]);
      return cg.mTranslate(p[0], p[1], p[2]);
   };
   return {head, left: hand(-1, lift.left), right: hand(1, lift.right)};
}

// A camera at eye looking at target: returns the view matrix (world to camera) the
// renderer wants for a second view. The camera looks down its own -z axis.
export function lookAtView(eye, target, up = [0, 1, 0]) {
   const sub = (a, b) => a.map((v, i) => v - b[i]);
   const cross = (a, b) => [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]];
   const unit = v => { const n = Math.hypot(...v) || 1; return v.map(x => x / n); };
   const z = unit(sub(eye, target));                 // camera z points away from what it looks at
   const x = unit(cross(up, z));
   const y = cross(z, x);
   const camera = [x[0], x[1], x[2], 0,  y[0], y[1], y[2], 0,  z[0], z[1], z[2], 0,  eye[0], eye[1], eye[2], 1];
   return cg.mInverse(camera);
}

// Where the third-person camera sits: on the table, orbiting the miniature at a
// given angle, a little above its head height, looking at its chest.
export const CAMERA_TARGET_HEIGHT = 1.0;          // in player units: the chest of the miniature
export function tableCamera(angle, {spot = SPOT, scale = SCALE, distance = .38} = {}) {
   const eye = [spot[0] + distance * Math.sin(angle), spot[1] + 1.45 * scale, spot[2] + distance * Math.cos(angle)];
   const target = [spot[0], spot[1] + CAMERA_TARGET_HEIGHT * scale, spot[2]];
   return lookAtView(eye, target);
}
