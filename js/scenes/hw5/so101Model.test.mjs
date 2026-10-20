// Run: node --test js/scenes/hw5/so101Model.test.mjs
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = await readFile(new URL('./so101Model.js', import.meta.url), 'utf8');
const { LINKS, JOINTS, MOTORS, toDeg, clampAngle, limitFraction, jointLabel, NEAR_LIMIT, demoMotion, distanceLabel, GRAB_CM, GRIPPER_CLOSED, gripperOpeningCm, jawsOverlap, toRad } =
   await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('the tables match the course SO101.js: six motors in a chain, every joint carries a link', () => {
   assert.equal(MOTORS.length, 6);
   assert.deepEqual(MOTORS.map(j => j.name), ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll', 'gripper']);
   const names = new Set(['robotBaseFrame', ...JOINTS.map(j => j.name)]);
   for (const j of JOINTS) {
      assert.ok(names.has(j.parent), j.name + ' hangs from a known parent');
      assert.ok(LINKS[j.link], j.name + ' carries a known link');
      if (!j.fixed) assert.ok(j.lo < 0 && j.hi > 0 && ['y', 'z'].includes(j.axis), j.name + ' has limits and an axis');
   }
   assert.deepEqual(MOTORS.map(j => j.axis), ['z', 'y', 'z', 'z', 'y', 'y'], 'the axes of the switch in SO101.js');
});

test('angles are clamped to the limits and the limit fraction grows toward either end', () => {
   const elbow = MOTORS[2];                                      // ±1.69 rad = ±97°
   assert.equal(clampAngle(elbow, 3), elbow.hi);
   assert.equal(clampAngle(elbow, -3), elbow.lo);
   assert.equal(limitFraction(elbow, 0), 0);
   assert.ok(Math.abs(limitFraction(elbow, elbow.hi) - 1) < 1e-9);
   assert.ok(Math.abs(limitFraction(elbow, -elbow.hi / 2) - .5) < 1e-9);
   const roll = MOTORS[4];                                       // an asymmetric range: -157° .. +163°
   assert.ok(limitFraction(roll, 0) > 0, 'zero is not the middle of an asymmetric range');
});

test('the label shows the angle in degrees and warns near a limit', () => {
   const lift = MOTORS[1];
   assert.equal(jointLabel(lift, 0), 'SHOULDER LIFT  +0 / -100..+100');
   assert.equal(jointLabel(lift, -0.5), 'SHOULDER LIFT  -29 / -100..+100');
   assert.equal(jointLabel(lift, lift.hi * (NEAR_LIMIT + .01)), 'SHOULDER LIFT  +86 / -100..+100  NEAR LIMIT');
   assert.equal(jointLabel(lift, lift.hi), 'SHOULDER LIFT  +100 / -100..+100  AT LIMIT');
   assert.equal(jointLabel(MOTORS[4], 0), 'WRIST ROLL  +0 / -157..+163', 'an asymmetric range is shown as it is');
   assert.equal(Math.round(toDeg(Math.PI)), 180);
});

test('the demo motion slightly overshoots the gripper limit, so the scene clamps it', () => {
   // The professor's example swings the gripper to -0.2 rad; its lower limit is -0.1745 rad (-10 degrees).
   let worst = 0;
   for (let t = 0; t < 20; t += .05)
      demoMotion(t).forEach((a, i) => {
         const j = MOTORS[i];
         if (j.name !== 'gripper') assert.ok(a >= j.lo && a <= j.hi, j.name + ' at t=' + t);
         else worst = Math.min(worst, a - j.lo);
         assert.ok(clampAngle(j, a) >= j.lo && clampAngle(j, a) <= j.hi);
      });
   assert.ok(worst < 0 && worst > -.03, 'the gripper overshoots by a little: ' + worst.toFixed(3));
});

test('the distance label is in centimetres and says GRAB when the jaws can close on the target', () => {
   assert.equal(distanceLabel(.124), '12.4 CM');
   assert.equal(distanceLabel(.02), 'GRAB  2.0 CM');
   assert.equal(distanceLabel(GRAB_CM / 100), 'GRAB  3.0 CM');
});

test('the gripper label shows the jaw opening in cm, and flags the overlap below +12 degrees', () => {
   const g = MOTORS[5];
   assert.equal(jointLabel(g, toRad(-10)), 'GRIPPER  CLOSED  JAWS OVERLAP');
   assert.equal(jointLabel(g, 0), 'GRIPPER  CLOSED  JAWS OVERLAP', 'zero is still inside the fixed jaw');
   assert.equal(jawsOverlap(GRIPPER_CLOSED), false);
   assert.equal(gripperOpeningCm(GRIPPER_CLOSED), 0);
   // measured from the STL meshes: 2.5 cm at 30 degrees, 6.8 at 60, 11.7 at 100
   for (const [deg, cm] of [[30, 2.5], [60, 6.8], [100, 11.7]])
      assert.ok(Math.abs(gripperOpeningCm(toRad(deg)) - cm) < .3, deg + ' degrees opens ' + gripperOpeningCm(toRad(deg)).toFixed(1) + ' cm');
   assert.equal(jointLabel(g, toRad(60)), 'GRIPPER  OPEN 6.8 / 11.7 CM');
   assert.equal(jointLabel(g, g.hi), 'GRIPPER  OPEN 11.7 / 11.7 CM  AT LIMIT');
});
