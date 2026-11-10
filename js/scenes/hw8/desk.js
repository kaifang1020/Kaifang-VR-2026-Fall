/*
 * THE DESK — the giant's desk, which is the mini's whole landscape. Three things stand on it,
 * and each is one thing to the giant and another world to the mini:
 *
 *    the HOUSE (house.js)  a doll's house            → a home
 *    the LAMP              a swing-arm desk lamp     → two long stairways up its arms to a lookout behind the light
 *    the CUP               a mug of tea              → a walled courtyard around a tea pond, open to the sky
 *
 * The cup is hollow with a gap in its wall, so the mini can walk in: its round wall is a ring of
 * thin flat panels (see ring), because a 'tubeY' is solid. The lamp is climbed: see lampGround.
 * Everything is a child of the world node, so it grows twelve times with the desk when I am the mini.
 */
import { INCH, TABLE } from '../hw6/miniatureModel.js';

const WOOD = [.62,.44,.28], DARK_WOOD = [.36,.25,.17];
const T = TABLE;

// Where they stand (table metres) and how big their rooms are (feet, as the mini sees them).
// ---- The lamp: an ordinary swing-arm desk lamp, bent over the desk ----
// It leans in one vertical plane. `s` measures along that plane on the desk (forward = toward
// where the shade points), `y` is height. Lengths in table metres: 1 in here is 1 ft to the mini.
//
//      C ●━━ shade ▷ light           C  the lookout behind the shade, 14 ft up
//       ╱                            B  the elbow, 8 ft up: a landing where the stair turns back
//    B ●                             A  the foot of the lower arm, on the lamp's base
//       ╲
//        ╲ A
//    ━━━━━●━━━━ base
export const LAMP = {
   at: [T.at[0] - .5, T.height, T.at[2] - .15], yaw: .5,          // yaw turns the plane toward the middle front of the desk
   base: 3.5 * INCH, baseTop: .6 * INCH,
   A: [-1 * INCH, .6 * INCH], B: [-9 * INCH, 8 * INCH], C: [2 * INCH, 14 * INCH],      // [s, y]
   half: 1 * INCH,            // the stairways on the arms are 2 ft wide
   lane: 1.15 * INCH,         // the lower arm runs this far to one side of the plane, the upper arm to the other:
                              // side by side seen from above, so walking forward from the elbow you choose up or down
   landing: 2.5 * INCH, lookout: 2.2 * INCH,                       // radius of the two round platforms
   step: 1.5 * INCH,          // the biggest step a mini takes up or down without it being a fall
};
const lerp = (a, b, t) => a + (b - a) * t;

// What is under a mini's feet at the lamp? feet = [x, y, z] in table coordinates.
// Returns a table height, or null when the point is not at the lamp at all.
//
// One spot on the desk can have several surfaces over it at different heights. The answer therefore depends on where the feet
// ARE: of all the surfaces at this spot, take the HIGHEST one within one step of the feet, as a
// foot steps up onto what is in front of it. Walking along an arm, that surface rises a little
// at a time: that is climbing. If nothing is within a step, the mini is in the air (put down by
// the giant, or stepped off the side): take the highest surface below.
export function lampGround(feet, lamp = LAMP) {
   const dx = feet[0] - lamp.at[0], dz = feet[2] - lamp.at[2], y = feet[1] - lamp.at[1];
   const s = dx * Math.sin(lamp.yaw) + dz * Math.cos(lamp.yaw);        // along the lamp's plane
   const side = dx * Math.cos(lamp.yaw) - dz * Math.sin(lamp.yaw);     // sideways from it
   const surfaces = [];
   if (Math.hypot(s, side) < lamp.base) surfaces.push(lamp.baseTop);
   for (const [from, to, lane] of [[lamp.A, lamp.B, -lamp.lane], [lamp.B, lamp.C, lamp.lane]]) {    // the two stairways
      const t = (s - from[0]) / (to[0] - from[0]);
      if (t >= 0 && t <= 1 && Math.abs(side - lane) < lamp.half) surfaces.push(lerp(from[1], to[1], t));
   }
   if (Math.hypot(s - lamp.B[0], side) < lamp.landing) surfaces.push(lamp.B[1]);                    // the landing joins both lanes
   if (Math.hypot(s - lamp.C[0], side - lamp.lane) < lamp.lookout) surfaces.push(lamp.C[1]);
   if (!surfaces.length) return null;
   surfaces.push(0);                                                   // and the desk itself
   const reach = surfaces.filter(h => Math.abs(h - y) <= lamp.step);
   return lamp.at[1] + (reach.length ? Math.max(...reach) : Math.max(...surfaces.filter(h => h <= y), 0));
}
export const CUP  = {at: [T.at[0] + .60, T.height, T.at[2] - .02], radius: 3 * INCH,   wall: 4.5 * INCH};
// As rooms for furniture (things.js roomFit): the square that fits inside the round wall.
const roomOf = (p, name) => ({name, centre: [p.at[0], p.at[2]], radius: p.radius,
                              size: [p.radius * 1.4 / INCH, p.wall / INCH, p.radius * 1.4 / INCH].map(v => Math.round(v * 10) / 10)});
export const DESK_ROOMS = [roomOf(CUP, 'CUP')];
export const deskRoomAt = point => DESK_ROOMS.find(r => Math.hypot(point[0] - r.centre[0], point[2] - r.centre[1]) < r.radius) || null;

// A round wall from y0 to y1 made of `count` flat panels. gaps = [[angle, halfWidth], ...] in
// radians leaves openings; angle 0 faces +z (the front of the desk), a quarter turn faces +x.
function ring(parent, radius, y0, y1, color, gaps = [], count = 20, thick = .004) {
   const half = radius * Math.tan(Math.PI / count) + .0005;         // half the width of one panel
   for (let k = 0; k < count; k++) {
      const a = (k + .5) * 2 * Math.PI / count;
      const open = gaps.some(([at, w]) => Math.abs(Math.atan2(Math.sin(a - at), Math.cos(a - at))) < w);
      if (open) continue;
      // turnY(a) points the panel's own z axis outward, along (sin a, 0, cos a).
      parent.add('cube').move(radius * Math.sin(a), (y0 + y1) / 2, radius * Math.cos(a)).turnY(a)
            .scale(half, (y1 - y0) / 2, thick / 2).color(color).dull();
   }
}

export function makeDesk(world) {
   const top = T.height;
   const solid = (parent, form, color) => parent.add(form).color(color).dull();

   // ---- The room and the desk: plain, so that the three things on it stand out ----
   solid(world, 'cube', [.30,.23,.19]).move(0, -.004, -.4).scale(3, .004, 3);                 // floor
   solid(world, 'cube', [.86,.80,.70]).move(0, 1.4, T.at[2] - 1.0).scale(3, 1.4, .02);        // wall behind the desk
   solid(world, 'cube', WOOD).move(T.at[0], top - .5 * INCH, T.at[2]).scale(T.width / 2, .5 * INCH, T.depth / 2);
   for (const sx of [-1, 1]) for (const sz of [-1, 1])
      solid(world, 'cube', DARK_WOOD).move(T.at[0] + sx * (T.width / 2 - INCH), (top - INCH) / 2, T.at[2] + sz * (T.depth / 2 - INCH))
                                     .scale(.7 * INCH, (top - INCH) / 2, .7 * INCH);          // four legs

   // ---- The lamp (see LAMP above). Built in its own frame: local z is `s`, local x is sideways. ----
   const lamp = world.add().move(LAMP.at).turnY(LAMP.yaw);
   const {A, B, C, half} = LAMP, SHELL = [.9,.9,.88], METAL = [.33,.35,.38], TREAD = [.78,.78,.76];
   const at = ([sAlong, y], x = 0, up = 0) => [x, y + up, sAlong];                           // a point of the plane, in the lamp's frame
   const rod = (from, to, radius, color = METAL) => solid(lamp, 'tubeZ', color).placeLimb(from, to, radius);
   solid(lamp, 'tubeY', SHELL).move(0, LAMP.baseTop / 2, 0).scale(LAMP.base, LAMP.baseTop / 2, LAMP.base);   // the round base
   const L = LAMP.lane;
   for (const [from, to, lane] of [[A, B, -L], [B, C, L]]) {
      // An arm: two rods side by side, as on a real swing-arm lamp, with the steps between them...
      for (const x of [-1, 1]) {
         rod(at(from, lane + x * (half + .15 * INCH), -.25 * INCH), at(to, lane + x * (half + .15 * INCH), -.25 * INCH), .14 * INCH);
         rod(at(from, lane + x * (half + .15 * INCH), 3 * INCH), at(to, lane + x * (half + .15 * INCH), 3 * INCH), .06 * INCH);   // ...and a handrail 3 ft up
      }
      const steps = Math.round(Math.abs(to[1] - from[1]) / (.5 * INCH)), run = Math.abs(to[0] - from[0]) / steps;        // half a foot each
      for (let k = 0; k < steps; k++) {
         const t = (k + .5) / steps;
         solid(lamp, 'cube', TREAD).move(lane, lerp(from[1], to[1], (k + 1) / steps) - .08 * INCH, lerp(from[0], to[0], t))
                                   .scale(half, .08 * INCH, run / 2 * 1.05);
      }
   }
   solid(lamp, 'sphere', METAL).move(at(B, 0, -.5 * INCH)).scale(.5 * INCH);                  // the elbow joint...
   solid(lamp, 'tubeY', TREAD).move(at(B, 0, -.08 * INCH)).scale(LAMP.landing, .08 * INCH, LAMP.landing);   // ...and the landing on it
   solid(lamp, 'sphere', METAL).move(at(C, L, -.5 * INCH)).scale(.5 * INCH);                  // the head joint...
   solid(lamp, 'tubeY', TREAD).move(at(C, L, -.08 * INCH)).scale(LAMP.lookout, .08 * INCH, LAMP.lookout);   // ...and the lookout on it
   for (let k = 0; k < 7; k++) {                                                              // posts round the far side of the lookout
      const a = Math.PI * (k / 6 - .25);                                                      // not on the side the stairway arrives from
      solid(lamp, 'tubeY', METAL).move(L + LAMP.lookout * .93 * Math.cos(a), C[1] + 1.5 * INCH, C[0] + LAMP.lookout * .93 * Math.sin(a))
                                 .scale(.06 * INCH, 1.5 * INCH, .06 * INCH);
   }
   // The shade: a cone hanging forward of the lookout, its mouth turned down toward the desk.
   const tilt = .7, mouth = [C[0] + 6.5 * INCH, C[1] - 2.2 * INCH];                           // the centre of the cone, [s, y]
   rod(at(C, L, .3 * INCH), at([mouth[0] - 1.2 * INCH, mouth[1] + 1.6 * INCH], L), .2 * INCH); // the neck
   solid(lamp, 'coneY', SHELL).move(at(mouth, L)).turnX(-tilt).scale(4 * INCH, 2.6 * INCH, 4 * INCH);   // apex up and back, mouth down and forward
   lamp.add('sphere').move(at([mouth[0] + 1.3 * INCH, mouth[1] - 1.6 * INCH], L)).scale(1.1 * INCH).color(1.9, 1.7, 1.15);   // the bulb: no .dull(), it glows

   // ---- The cup: a courtyard 6 ft across with walls a little lower than the mini, and a pond of tea ----
   const cup = world.add().move(CUP.at);
   const r = CUP.radius, CHINA = [.96,.96,.93];
   solid(cup, 'tubeY', [.90,.92,.95]).move(0, .002, 0).scale(r * 1.6, .002, r * 1.6);         // the saucer: a round terrace
   ring(cup, r, .004, CUP.wall, CHINA, [[0, .5]]);                                            // the wall, with a gap to walk in
   ring(cup, r, CUP.wall - .006, CUP.wall, [.3,.5,.75]);                                      // a blue line round the rim, unbroken
   solid(cup, 'tubeY', [.55,.32,.14]).move(0, .0055, -.012).scale(r * .55, .0015, r * .55);   // the tea: a pond
   solid(cup, 'cube', [1,1,1]).move(.02, .016, -.015).turnY(.5).scale(.012);                  // a sugar cube: an island
   solid(cup, 'torusZ', CHINA).move(r + .022, CUP.wall * .5, 0).scale(.03, .036, .012);       // the handle, on the right
}
