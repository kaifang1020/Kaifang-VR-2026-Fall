import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const url = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const cgURL = url(await read('../../render/core/cg.js'));
const modelURL = url((await read('../hw6/miniatureModel.js')).replace('../../render/core/cg.js', cgURL));
const {INCH, TABLE} = await import(modelURL);
const {LAMP, CUP, lampGround, deskRoomAt, makeDesk} =
   await import(url((await read('./desk.js')).replace('../hw6/miniatureModel.js', modelURL)));

const top = TABLE.height;
// A point at the lamp: s along its plane, `side` across it, feet h above the desk.
const spot = (s, h, side = 0) => [LAMP.at[0] + s * Math.sin(LAMP.yaw) + side * Math.cos(LAMP.yaw), top + h,
                                  LAMP.at[2] + s * Math.cos(LAMP.yaw) - side * Math.sin(LAMP.yaw)];
const ft = v => Math.round((v - top) / INCH * 1e6) / 1e6;       // a table height, as feet above the desk
// Walk from s0 to s1 the way the scene does: every frame the feet ease toward the ground under them.
const LOW = -LAMP.lane, HIGH = LAMP.lane;                       // the lower arm's lane and the upper arm's
const walk = (s0, s1, h, side) => {
   let biggest = 0;
   for (let s = s0, d = Math.sign(s1 - s0) * .0004; (s1 - s) * d > 0; s += d) {
      const ground = lampGround(spot(s, h, side)) - top;
      biggest = Math.max(biggest, Math.abs(ground - h));
      h += (ground - h) * .3;
   }
   return {h, biggest};
};

test('away from the lamp there is no lamp ground', () => {
   assert.equal(lampGround([0, top, -.5]), null);
   assert.equal(lampGround([CUP.at[0], top, CUP.at[2]]), null);
   assert.equal(lampGround(spot(LAMP.A[0] - 4 * INCH, 0, 4 * INCH)), null, 'beside the lower arm, on the desk');
});

test('up the lower arm to the elbow, then back the other way up the upper arm to the lookout', () => {
   const first = walk(LAMP.A[0] + .001, LAMP.B[0], LAMP.baseTop, LOW);
   assert.ok(Math.abs(first.h / INCH - 8) < .1, 'the landing at the elbow is 8 ft up: ' + (first.h / INCH).toFixed(2));
   const second = walk(LAMP.B[0], LAMP.C[0], first.h, HIGH);      // step across the landing to the other lane
   assert.ok(Math.abs(second.h / INCH - 14) < .1, 'the lookout is 14 ft up: ' + (second.h / INCH).toFixed(2));
   assert.ok(Math.max(first.biggest, second.biggest) < LAMP.step, 'never a jump bigger than one step');
});

test('and down again the same way', () => {
   const down = walk(LAMP.B[0], LAMP.A[0] + .001, walk(LAMP.C[0], LAMP.B[0], LAMP.C[1], HIGH).h, LOW);
   assert.ok(down.h / INCH < 1, 'back at the base: ' + (down.h / INCH).toFixed(2));
});

test('under an arm the mini stays on the desk; the arm overhead does not pull them up', () => {
   const s = (LAMP.A[0] + LAMP.B[0]) / 2;                         // halfway along: the lower arm is about 4 ft up here, the upper about 10
   assert.equal(ft(lampGround(spot(s, 0, LOW))), 0);
   assert.equal(ft(lampGround(spot(s, 0, HIGH))), 0);
   assert.ok(Math.abs(ft(lampGround(spot(s, 4.3 * INCH, LOW))) - 4.3) < .1, 'on the lower arm at its own height');
});

test('stepping off the side of a stairway is a fall to the desk; put down from above, the mini lands on the lookout', () => {
   const s = (LAMP.B[0] + LAMP.C[0]) / 2;
   assert.equal(lampGround(spot(s, 11 * INCH, 4 * INCH)), null, 'beside the upper arm there is no lamp: the scene uses the desk');
   assert.equal(ft(lampGround(spot(LAMP.C[0], LAMP.C[1] + 4 * INCH, HIGH))), 14, 'let go 4 ft above the lookout');
   assert.equal(ft(lampGround(spot(LAMP.C[0], LAMP.C[1], HIGH))), 14);
});

test('the cup is a room for furniture, and the desk builds without errors', () => {
   assert.equal(deskRoomAt([CUP.at[0], top, CUP.at[2]]).name, 'CUP');
   assert.equal(deskRoomAt([LAMP.at[0], top, LAMP.at[2]]), null);
   let count = 0;
   const node = () => { const n = {}; for (const f of ['move', 'turnY', 'turnX', 'turnZ', 'scale', 'color', 'dull', 'placeLimb']) n[f] = () => n; n.add = () => (count++, node()); return n; };
   makeDesk(node());
   assert.ok(count > 60);
});
