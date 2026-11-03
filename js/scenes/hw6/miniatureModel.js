/*
 * The miniature is the player's own body drawn a second time under one extra node.
 * Everything that makes it small is that node's matrix:
 *
 *    stage = T(spot) · R_y(π) · S(k) · T(−origin)
 *
 * Read from right to left: move the player so the floor point under their head is
 * the origin, shrink around that point, optionally turn it to face the player, carry
 * it to the table. The body itself is drawn at full size in ordinary room
 * coordinates; it never knows it is small.
 *
 * Viewing mode 2 ("be the miniature") is the same matrix inverted and applied to the
 * world instead: the table and everything on it grow twelve times around the spot,
 * which lands exactly under the player's feet. The camera never moves; the world does.
 */
import * as cg from '../../render/core/cg.js';

export const INCH = .0254;
export const SCALE = 1 / 12;                                   // one inch on the table is one foot to the miniature
export const TABLE = {width: 60 * INCH, depth: 24 * INCH, height: 30 * INCH, at: [0, 0, -.7]};   // the classroom table
export const SPOT = [TABLE.at[0], TABLE.height, TABLE.at[2] + 8 * INCH];  // near the table's front edge: where the miniature stands
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

// Mode 2: the inverse product, applied to the world. T(origin) · S(1/k) · R_y(−π) · T(−spot).
export function placeWorld(node, origin, {scale = SCALE, spot = SPOT, faceMe = false} = {}) {
   node.identity().move(origin[0], origin[1], origin[2]).scale(1 / scale, 1 / scale, 1 / scale);
   if (faceMe) node.turnY(-Math.PI);
   return node.move(-spot[0], -spot[1], -spot[2]);
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

// ---- The house on the table, in table units (metres at 1/12) ----
export const HOUSE = {
   width: 10 * INCH, depth: 8 * INCH, wall: 8 * INCH, thick: .3 * INCH,     // a 10 x 8 ft house with 8 ft walls
   doorWidth: 3 * INCH, doorHeight: 6.5 * INCH,
   // Built with its door on the local -x wall, then turned a quarter turn so the door faces +z:
   // toward the miniature and toward me. Turned, the house is `depth` wide along x and `width` along z.
   turn: Math.PI / 2,
   at: [SPOT[0], SPOT[1], TABLE.at[2] - 5 * INCH],                            // the door is 8 ft in front of the miniature
};
// Keep the house on the table top when it is moved.
export function clampHouse(at) {
   const hx = TABLE.width / 2 - HOUSE.depth / 2 - .2 * INCH, hz = TABLE.depth / 2 - HOUSE.width / 2 - .2 * INCH;
   return [Math.max(TABLE.at[0] - hx, Math.min(TABLE.at[0] + hx, at[0])), TABLE.height,
           Math.max(TABLE.at[2] - hz, Math.min(TABLE.at[2] + hz, at[2]))];
}
// Door centre, in table coordinates, for a house standing at `at`: on the +z wall after the turn.
export const doorCentre = at => [at[0], at[1], at[2] + HOUSE.width / 2];
// The door opens when the miniature (the player's point mapped onto the table) is within 3 ft of it.
export function nearDoor(tablePoint, at, reach = 3 * INCH) {
   const d = doorCentre(at);
   return Math.hypot(tablePoint[0] - d[0], tablePoint[2] - d[2]) < reach;
}
// Axis-aligned bounds of the house for grabbing: centre and half size.
export const houseBounds = at => ({centre: [at[0], at[1] + HOUSE.wall / 2, at[2]],
                                   half: [HOUSE.depth / 2, HOUSE.wall / 2 + 2.5 * INCH, HOUSE.width / 2]});

// Walking in mode 2 with the left stick: a step in the player's own floor directions.
// Moving the origin backward carries the world backward, which walks me forward.
export const WALK_SPEED = 4 * 12 * INCH;          // 4 ft/s to the miniature, about a brisk walk
export function walkOrigin(origin, head, stick, dt, speed = WALK_SPEED) {
   const f = [-head[8], 0, -head[10]], n = Math.hypot(f[0], f[2]);
   if (n < 1e-6) return origin;
   const fw = [f[0] / n, 0, f[2] / n], rt = [-fw[2], 0, fw[0]];
   const ahead = -stick.y, side = stick.x;                    // hardware: pushing the stick up is negative y
   return [origin[0] - (fw[0] * ahead + rt[0] * side) * speed * dt, origin[1],
           origin[2] - (fw[2] * ahead + rt[2] * side) * speed * dt];
}
