import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

// The browser imports by URL; here every module is turned into a data: URL with its imports rewritten.
const url = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const cgURL = url(await read('../../render/core/cg.js'));
const cg = await import(cgURL);
const modelURL = url((await read('../hw6/miniatureModel.js')).replace('../../render/core/cg.js', cgURL));
const {SCALE, TABLE, HOUSE, miniatureMatrix} = await import(modelURL);
const {packPlayer, readOthers, createFreshness, tableFrame, poseKey, deskGiantPose, visibleTo, insideHouse, rideOrigin, hudTarget, hudNeedsMove, pickHold, groundUnder, REACH, robotGiant, robotMiniHolds} =
   await import(url((await read('./players.js')).replace('../hw6/miniatureModel.js', modelURL)
                                               .replace('../../render/core/cg.js', cgURL)));
const near = (a, b, msg) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-6, `${msg}: ${a} vs ${b}`));

const at = (x, y, z) => cg.mTranslate(x, y, z);
const giant = {mode: 'table',  origin: [0, 0, 0],    faceMe: false, seq: 1, head: at(0, 1.6, 0),    left: at(-.3, 1, -.3), right: at(.3, 1, -.3)};
const mini  = {mode: 'inside', origin: [1, 0, -2],   faceMe: false, seq: 1, head: at(1, 1.6, -2),   left: null, right: null};

test('each client publishes under its own name', () => {
   assert.equal(poseKey(7), 'giantMiniPose_7');
   const p = packPlayer({mode: 'inside', origin: [1.23456789, 0, 0], faceMe: 0, self: {head: at(0, 1.6, 0)}, seq: 4});
   assert.deepEqual(p.origin, [1.2346, 0, 0]);
   assert.equal(p.faceMe, false);
   assert.equal(p.left, null, 'a missing hand is sent as null');
});

test('readOthers skips me, empty slots and players with no head', () => {
   const sent = {1: giant, 2: mini, 3: null, 4: {...mini, head: null}};
   const others = readOthers({clients: [1, 2, 3, 4], myId: 2, published: id => sent[id]});
   assert.deepEqual(others.map(p => p.id), [1]);
});

test('a headset head from clientState wins over what that player published', () => {
   const tracked = {head: at(5, 1.5, 5), left: at(5, 1, 5), right: null};
   const [p] = readOthers({clients: [1], myId: 9, published: () => giant, xr: () => tracked});
   near(p.head.slice(12, 15), [5, 1.5, 5], 'head from clientState');
   assert.equal(p.fromClientState, true);
   near(p.right.slice(12, 15), [.3, 1, -.3], 'a hand clientState lacks falls back to the published one');
});

test('a player who stops sending disappears after the timeout', () => {
   const fresh = createFreshness(3000);
   assert.ok(fresh(1, 5, 0));
   assert.ok(fresh(1, 5, 2900));
   assert.ok(!fresh(1, 5, 3100), 'same seq for too long: gone');
   assert.ok(fresh(1, 6, 3200), 'a new seq brings them back');
});

test('a mini appears on the table, a giant stays where they stand', () => {
   const onTable = cg.mTransform(tableFrame(mini), mini.head.slice(12, 15));
   near(onTable, cg.mTransform(miniatureMatrix(mini.origin), [1, 1.6, -2]), 'the mini goes through M(their origin)');
   near(cg.mTransform(tableFrame(giant), [0, 1.6, 0]), [0, 1.6, 0], 'the giant is not moved');
});

test('seen by the mini, the giant is twelve times bigger and in the right place', () => {
   // The mini's world node is M⁻¹. A giant's body sits in table coordinates under it.
   const view = cg.mInverse(miniatureMatrix(mini.origin));
   const head = cg.mTransform(view, [0, 1.6, 0]), hand = cg.mTransform(view, [.3, 1, -.3]);
   assert.ok(Math.abs(cg.distance(head, hand) - cg.distance([0, 1.6, 0], [.3, 1, -.3]) / SCALE) < 1e-6,
             'head to hand is 12 times longer');
   // Where the giant stands relative to the mini, on the table, is kept: the mini standing at the spot
   // sees the giant's real position blown up around themselves.
   const giantOnTableSeenByMini = cg.mTransform(miniatureMatrix(mini.origin), head);
   near(giantOnTableSeenByMini, [0, 1.6, 0], 'M · (M⁻¹ · giant) = the giant at the real table');
});

test('a laptop giant stands at the table edge, in front of a mini who faces them', () => {
   const giantHead = deskGiantPose().head.slice(12, 15);
   const me = {mode: 'inside', origin: [0, 0, 0], faceMe: true};
   // The mini stands at their origin looking down -z (into the room, toward the table).
   const view = cg.mInverse(tableFrame(me));
   const seen = cg.mTransform(view, giantHead);
   assert.ok(seen[2] < 0, 'the giant is in front of the mini (-z), not behind: ' + seen);
   const away = Math.hypot(seen[0], seen[2]);
   assert.ok(away > 2 && away < 8, 'a few metres away, not 18: ' + away.toFixed(2));
   assert.ok(seen[1] > 5, 'and the head is high above: ' + seen[1].toFixed(2));
});

test('a giant does not see a laptop giant\'s stand-in body; a mini does', () => {
   const laptop = {...giant, standIn: true};
   const [p] = readOthers({clients: [1], myId: 9, published: () => laptop});
   assert.equal(visibleTo('table', p), false);
   assert.equal(visibleTo('inside', p), true);
   const [tracked] = readOthers({clients: [1], myId: 9, published: () => laptop, xr: () => ({head: at(0, 1.6, 0)})});
   assert.equal(visibleTo('table', tracked), true, 'a headset giant is a real body: other giants see it');
});

test('a mini in the house rides with it: moving the origin moves them by exactly the house\'s step', () => {
   for (const faceMe of [false, true]) {
      const origin = [1, 0, -2], head = [1.3, 1.6, -2.4], step = [.05, .02, -.03];
      const was = cg.mTransform(miniatureMatrix(origin, {faceMe}), head);
      const now = cg.mTransform(miniatureMatrix(rideOrigin(origin, step, {faceMe}), {faceMe}), head);
      near(cg.subtract(now, was), step, 'faceMe ' + faceMe);
   }
});

test('insideHouse is true between the walls and false outside the door', () => {
   const at = [...HOUSE.at];
   assert.ok(insideHouse([at[0], at[1] + .13, at[2]], at));
   assert.ok(!insideHouse([at[0], at[1] + .13, at[2] + HOUSE.width / 2 + .03], at), 'in front of the door');
   assert.ok(!insideHouse([at[0] + HOUSE.depth, at[1] + .13, at[2]], at), 'beside the house');
});

test('my buttons sit at my left hip, out of the way, and wait until I turn or walk away', () => {
   const head = cg.mTranslate(0, 1.6, 0);                       // looking down -z
   const hud = hudTarget(head);
   assert.ok(hud.at[0] < -.3 && hud.at[2] < 0 && hud.at[1] < 1.6 - .4, 'left, a little ahead, at the hip: ' + hud.at);
   assert.equal(hudNeedsMove(hud, head), false, 'it stays while I stand here');
   assert.equal(hudNeedsMove(hud, cg.mMultiply(head, cg.mRotateY(.2))), false, 'a small turn of the head does not drag it along');
   assert.equal(hudNeedsMove(hud, cg.mMultiply(head, cg.mRotateY(Math.PI))), true, 'I turned around');
   assert.equal(hudNeedsMove(hud, cg.mTranslate(0, 1.6, 2)), true, 'I walked away');
   const turned = hudTarget(cg.mMultiply(head, cg.mRotateY(Math.PI / 2)));     // now looking down -x
   assert.ok(turned.at[2] > .3 && turned.at[0] < 0, 'my left is now +z: ' + turned.at);
});

test('holding on: a giant hand in reach wins, else the house I stand in, else nothing', () => {
   const mine = [[0, 1, 0], [.02, .95, 0]];
   const far = {id: 1, side: 'left', at: [.5, 1, 0]}, close = {id: 1, side: 'right', at: [.02 + REACH * .5, .95, 0]};
   assert.deepEqual(pickHold({mine, inHouse: true, hands: [far, close]}), {kind: 'hand', id: 1, side: 'right'});
   assert.deepEqual(pickHold({mine, inHouse: true, hands: [far]}), {kind: 'house'});
   assert.deepEqual(pickHold({mine, inHouse: false, hands: [far]}), {kind: 'none'});
});

test('a mini who does not hold on stays on the table when the house is lifted off them', () => {
   const at = [...HOUSE.at], lifted = [at[0], at[1] + .2, at[2]];
   assert.equal(groundUnder([at[0], TABLE.height, at[2]], at), at[1], 'standing in the house on the table');
   assert.equal(groundUnder([at[0], TABLE.height, at[2]], lifted), TABLE.height, 'the house went up without me');
   assert.equal(groundUnder([at[0], lifted[1], at[2]], lifted), lifted[1], 'I rode up with it: its floor holds me');
   assert.equal(groundUnder([at[0] + 1, lifted[1], at[2]], lifted), TABLE.height, 'stepped out in mid-air: back to the table');
});

test('the robot giant brings its hand within reach of the mini, then carries it away', () => {
   const head = [0, .9, -.5], rest = [.28, .88, -.4];
   const wait = robotGiant(4, head, rest);
   assert.ok(Math.hypot(...wait.hand.map((v, i) => v - head[i])) < REACH, 'at 4 s the hand is in reach of the head');
   assert.equal(pickHold({mine: [head], hands: [{id: 1, side: 'right', at: wait.hand}]}).kind, 'hand');
   const carry = robotGiant(11.9, head, rest);
   assert.ok(carry.hand[1] > head[1] + .15 && carry.hand[0] > head[0] + .25, 'lifted and carried sideways: ' + carry.hand);
   near(robotGiant(0, head, rest).hand, rest, 'starts at rest');
   assert.ok(Math.hypot(...robotGiant(27.999, head, rest).house) < 1e-3, 'the house is back at the end');
   assert.ok(robotGiant(19, head, rest).house[0] > .1, 'the house slides');
   assert.ok(robotMiniHolds(1) && !robotMiniHolds(10) && robotMiniHolds(14));
});
