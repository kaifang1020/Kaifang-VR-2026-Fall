/*
 * A small house built from cubes, in table units. Its door hangs from a hinge node
 * and swings open by an angle; a lamp inside lights two windows that can be seen
 * from outside, so what happens in mode 2 is visible in mode 1.
 */
import { HOUSE, INCH } from './miniatureModel.js';

const WALL = [.93,.86,.74], ROOF = [.62,.3,.25], DOOR = [.45,.28,.16], FRAME = [.35,.3,.28];

export function makeHouse(parent) {
   const {width: W, depth: D, wall: H, thick: t, doorWidth: dw, doorHeight: dh} = HOUSE;
   const root = parent.add();
   const cube = (color, at, half, parentNode = root) => parentNode.add('cube').move(at).scale(half).color(color).dull();
   cube(WALL, [W/2, H/2, 0], [t, H/2, D/2]);                                    // back wall, +x
   for (const s of [-1, 1]) cube(WALL, [0, H/2, s * D/2], [W/2, H/2, t]);      // side walls
   for (const s of [-1, 1])                                                      // front wall, -x, either side of the door
      cube(WALL, [-W/2, H/2, s * (D/2 + dw/2) / 2], [t, H/2, (D/2 - dw/2) / 2]);
   cube(WALL, [-W/2, (H + dh) / 2, 0], [t, (H - dh) / 2, dw/2]);                // lintel above the door
   for (const s of [-1, 1])                                                      // gable roof: two slabs meeting at the ridge
      root.add('cube').move(0, H + D/4, s * D/4).turnX(s * Math.PI / 4)
          .scale(W/2 + .6 * INCH, .25 * INCH, D * Math.SQRT2 / 4 + .3 * INCH).color(ROOF).dull();
   const hinge = root.add().move(-W/2, 0, -dw/2);                                // the door turns about this edge
   cube(DOOR, [0, dh/2, dw/2], [t * .7, dh/2, dw/2], hinge);
   const windows = [-1, 1].map(s => cube(FRAME, [W/4, H/2, s * D/2], [1 * INCH, 1 * INCH, t * 1.3]));
   const lamp = root.add('sphere').move(W/4, H * .78, 0).scale(.5 * INCH).dull();
   const lampSwitch = cube(FRAME, [W/2 - t * 2.2, H * .45, D/4], [.25 * INCH, .45 * INCH, .25 * INCH]);
   return {root, hinge, windows, lamp, lampSwitch, switchLocal: [W/2 - t * 2.2, H * .45, D/4]};
}

// Place the house at `at` (table coordinates), swing the door, and light or darken it.
export function drawHouse(house, {at, doorAngle = 0, lampOn = false}) {
   house.root.identity().move(at).turnY(HOUSE.turn);              // door toward +z
   house.hinge.identity().move(-HOUSE.width / 2, 0, -HOUSE.doorWidth / 2).turnY(-doorAngle);  // negative: swings outward, away from -x
   const glow = lampOn ? [1, .9, .5] : [.22, .25, .3];
   for (const w of house.windows) w.color(glow);
   house.lamp.color(lampOn ? [1, .95, .7] : [.35, .33, .3]);
   house.lampSwitch.color(lampOn ? [.4, .9, .4] : [.9, .35, .3]);
}
