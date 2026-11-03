import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const url = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const cgURL = url(await read('../../render/core/cg.js'));
const cg = await import(cgURL);
const modelURL = url((await read('./miniatureModel.js')).replace('../../render/core/cg.js', cgURL));
const {SCALE, SPOT, floorPoint, miniatureMatrix, placeMiniature, desktopPose} = await import(modelURL);
const {makeBody, drawBody} = await import(url(await read('./avatarBody.js')));
const near = (a, b, msg) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-6, `${msg}: ${a} vs ${b}`));

test('the miniature matrix carries the floor origin to the table and shrinks heights by SCALE', () => {
   const origin = [1.2, 0, -.4];
   const m = miniatureMatrix(origin);
   near(cg.mTransform(m, origin), SPOT, 'origin lands on the spot');
   near(cg.mTransform(m, [1.2, 1.7, -.4]), [SPOT[0], SPOT[1] + 1.7 * SCALE, SPOT[2]], 'a 1.7 m head is 17 cm above the table');
   near(cg.mTransform(m, [2.2, 0, -.4]), [SPOT[0] + SCALE, SPOT[1], SPOT[2]], 'one step right is one tenth of a step');
});

test('facing me turns the figure around; check mode is the identity', () => {
   const origin = [0, 0, 2];
   const faced = miniatureMatrix(origin, {faceMe: true});
   near(cg.mTransform(faced, [1, 0, 2]), [SPOT[0] - SCALE, SPOT[1], SPOT[2]], 'right becomes left');
   near(cg.mTransform(faced, [0, 0, 1]), [SPOT[0], SPOT[1], SPOT[2] + SCALE], 'forward becomes backward');
   const check = miniatureMatrix(origin, {scale: 1, spot: origin});
   near(check, cg.mIdentity(), 'full size on the origin is the identity');
});

test('placeMiniature issues the same product through the scene graph calls', () => {
   // A node that composes its calls with cg, the way clay does.
   const node = {m: cg.mIdentity(),
      identity() { this.m = cg.mIdentity(); return this; },
      move(x, y, z) { this.m = cg.mMultiply(this.m, cg.mTranslate(x, y, z)); return this; },
      turnY(t) { this.m = cg.mMultiply(this.m, cg.mRotateY(t)); return this; },
      scale(x, y, z) { this.m = cg.mMultiply(this.m, cg.mScale(x, y, z)); return this; }};
   const origin = [.5, 0, -1];
   placeMiniature(node, origin, {faceMe: true});
   near(node.m, miniatureMatrix(origin, {faceMe: true}), 'node matrix equals miniatureMatrix');
});

test('the desktop stand-in puts the head at the camera and the hands in front of and below it', () => {
   const camera = cg.mTranslate(0, 1.6, .4);                  // a camera standing at (0, 1.6, .4) looking down -z
   const pose = desktopPose(cg.mInverse(camera), {left: .3, right: 0});
   near(pose.head.slice(12, 15), [0, 1.6, .4], 'head at the camera');
   near(pose.right.slice(12, 15), [.22, 1.22, .08], 'right hand in front and below');
   near(pose.left.slice(12, 15), [-.22, 1.52, .08], 'lifted left hand');
   near(floorPoint(pose.head), [0, 0, .4], 'floor point under the head');
});

test('drawBody places every limb for a full pose and hides the figure for none', () => {
   const calls = [];
   const fake = name => ({name,
      identity() { calls.push(name + ':identity'); return this; }, move() { return this; },
      scale(...s) { calls.push(name + ':scale' + s.join(',')); return this; },
      placeLimb(a, b) { calls.push(name + ':limb'); assert.ok(a.every(Number.isFinite) && b.every(Number.isFinite)); return this; },
      color() { return this; }, dull() { return this; }, add: shape => fake(shape)});
   const body = makeBody(fake('parent'));
   const side = () => ({left: [0, 1, 0], right: [1, 1, 0]});
   const pose = {head: [0, 1.6, 0], face: [0, 1.6, -.1], chest: [0, 1.3, 0], hips: [0, .9, 0],
      shoulders: side(), elbows: side(), wrists: {left: [0, 1, 0], right: null}, hipJoints: side(), knees: side(), feet: side()};
   assert.equal(drawBody(body, pose), true);
   assert.equal(calls.filter(c => c.endsWith(':limb')).length, 1 + 2 + 2 + 2, 'torso, one arm, two legs');
   calls.length = 0;
   assert.equal(drawBody(body, null), false);
   assert.deepEqual(calls, ['undefined:identity', 'undefined:scale0'], 'the root is hidden');
});

test('lookAtView puts the eye at the camera origin and the target straight ahead on -z', async () => {
   const {lookAtView, tableCamera, CAMERA_TARGET_HEIGHT} = await import(modelURL);
   const view = lookAtView([1, 2, 3], [1, 2, 0]);
   near(cg.mTransform(view, [1, 2, 3]), [0, 0, 0], 'the eye');
   near(cg.mTransform(view, [1, 2, 0]), [0, 0, -3], 'the target is 3 m ahead');
   near(cg.mTransform(view, [2, 2, 0]), [1, 0, -3], 'x stays to the right');
   const table = tableCamera(0);
   const chest = [SPOT[0], SPOT[1] + CAMERA_TARGET_HEIGHT * SCALE, SPOT[2]];
   const c = cg.mTransform(table, chest);
   near([c[0], c[1]], [0, 0], 'the table camera is aimed at the miniature');
   assert.ok(c[2] < 0, 'and the miniature is in front of it');
});

test('mode 2: placeWorld is the inverse of the miniature matrix, so the spot lands under my feet, twelve times bigger', async () => {
   const {placeWorld, TABLE} = await import(modelURL);
   const node = {m: cg.mIdentity(),
      identity() { this.m = cg.mIdentity(); return this; },
      move(x, y, z) { this.m = cg.mMultiply(this.m, cg.mTranslate(x, y, z)); return this; },
      turnY(t) { this.m = cg.mMultiply(this.m, cg.mRotateY(t)); return this; },
      scale(x, y, z) { this.m = cg.mMultiply(this.m, cg.mScale(x, y, z)); return this; }};
   const origin = [.4, 0, -.2];
   placeWorld(node, origin, {faceMe: true});
   near(cg.mMultiply(node.m, miniatureMatrix(origin, {faceMe: true})), cg.mIdentity(), 'world · stage = identity');
   near(cg.mTransform(node.m, SPOT), origin, 'the table top centre comes to my origin');
   const edge = cg.mTransform(node.m, [SPOT[0] + TABLE.width / 2, SPOT[1], SPOT[2]]);
   assert.ok(Math.abs(Math.hypot(edge[0] - origin[0], edge[2] - origin[2]) - 60 * .0254 * 12 / 2) < 1e-6, 'the 60 inch table is 60 feet wide');
});

test('the house stays on the table, its door knows when the miniature is close, and it has grab bounds', async () => {
   const {clampHouse, nearDoor, houseBounds, doorCentre, HOUSE, TABLE, INCH} = await import(modelURL);
   const far = clampHouse([TABLE.at[0] + 5, .2, TABLE.at[2] - 5]);
   near(far, [TABLE.at[0] + TABLE.width / 2 - HOUSE.depth / 2 - .2 * INCH, TABLE.height, TABLE.at[2] - TABLE.depth / 2 + HOUSE.width / 2 + .2 * INCH], 'clamped to the far corner, on the table top');
   near(clampHouse(HOUSE.at), HOUSE.at, 'the default spot is already on the table');
   const at = HOUSE.at, door = doorCentre(at);
   near(door, [at[0], at[1], at[2] + HOUSE.width / 2], 'the door faces +z, toward the miniature');
   assert.ok(door[2] < SPOT[2] - 6 * INCH, 'and is several feet in front of where the miniature stands');
   assert.ok(nearDoor([door[0], 0, door[2] + 2 * INCH], at), 'two feet from the door');
   assert.ok(!nearDoor([door[0], 0, door[2] + 4 * INCH], at), 'four feet away');
   assert.ok(!nearDoor([at[0], 0, at[2] - HOUSE.width / 2], at), 'the back wall is not the door');
   const b = houseBounds(at);
   near(b.centre, [at[0], at[1] + HOUSE.wall / 2, at[2]], 'bounds centre');
   assert.ok(b.half[1] > HOUSE.wall / 2, 'bounds include the roof');
});

test('drawHouse swings the door outward and lights the windows with the lamp', async () => {
   const {makeHouse, drawHouse} = await import(url((await read('./house.js')).replace('./miniatureModel.js', modelURL)));
   const made = [];
   const fake = () => { const n = {calls: [], colors: []}; for (const f of ['identity', 'move', 'turnX', 'turnY', 'scale', 'dull'])
      n[f] = (...a) => { n.calls.push([f, ...a]); return n; }; n.color = c => { n.colors.push(c); return n; }; n.add = () => { const c = fake(); made.push(c); return c; }; return n; };
   const house = makeHouse(fake());
   assert.ok(made.length >= 12, 'walls, roof, door, windows, lamp and switch');
   drawHouse(house, {at: [1, 2, 3], doorAngle: 1.2, lampOn: true});
   const turn = house.hinge.calls.find(c => c[0] === 'turnY');
   assert.equal(turn[1], -1.2, 'the hinge turns by minus the angle: outward');
   assert.deepEqual(house.windows[0].colors.at(-1), [1, .9, .5], 'windows glow');
   drawHouse(house, {at: [1, 2, 3], doorAngle: 0, lampOn: false});
   assert.notDeepEqual(house.windows[0].colors.at(-1), [1, .9, .5], 'windows dark');
});

test('the left stick walks me the way I face: pushing up moves the origin back, so the world comes toward me', async () => {
   const {walkOrigin, WALK_SPEED} = await import(modelURL);
   const facingMinusZ = cg.mIdentity();                          // head looking down -z
   const o = walkOrigin([0, 0, 0], facingMinusZ, {x: 0, y: -1}, 1);
   near(o, [0, 0, WALK_SPEED], 'origin moves to +z, i.e. I advance toward -z');
   const turned = cg.mRotateY(Math.PI / 2);                      // now looking down -x
   near(walkOrigin([0, 0, 0], turned, {x: 0, y: -1}, 1), [WALK_SPEED, 0, 0], 'forward follows the head');
   near(walkOrigin([0, 0, 0], facingMinusZ, {x: 1, y: 0}, 1), [-WALK_SPEED, 0, 0], 'stick right moves me right');
});
