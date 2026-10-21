// Run: node --test js/scenes/hw5/armLab.test.mjs
// Runs the real armLab scene with a fake renderer whose nodes keep real matrices
// (the game's own cg.js), so joint positions and labels can be checked without a headset.
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = f => readFile(new URL(f, import.meta.url), 'utf8');
const url = src => 'data:text/javascript;base64,' + Buffer.from(src).toString('base64');
const cgURL = url(await read('../../render/core/cg.js'));
const cg = await import(cgURL);
const modelSource = (await read('./so101Model.js')).replace("'../../render/core/cg.js'", JSON.stringify(cgURL));
const modelURL = url(modelSource);
const { MOTORS, GRAB_CM } = await import(modelURL);

// A scene node that composes matrices exactly as clay.js does (post-multiply).
class Node {
   constructor(form, parent) { this.form = form; this._parent = parent; this.children = []; this.m = cg.mIdentity(); this.time = 0; this._color = null; }
   add(form) { const n = new Node(form, this); this.children.push(n); return n; }
   remove(n) { this.children = this.children.filter(c => c !== n); }
   nChildren() { return this.children.length; } child(i) { return this.children[i]; }
   identity() { this.m = cg.mIdentity(); return this; }
   move(x, y, z) { this.m = cg.mMultiply(this.m, cg.mTranslate(x, y, z)); return this; }
   turnX(t) { this.m = cg.mMultiply(this.m, cg.mRotateX(t)); return this; }
   turnY(t) { this.m = cg.mMultiply(this.m, cg.mRotateY(t)); return this; }
   turnZ(t) { this.m = cg.mMultiply(this.m, cg.mRotateZ(t)); return this; }
   scale(x, y, z) { this.s = [x, y ?? x, z ?? x]; this.m = cg.mMultiply(this.m, cg.mScale(...this.s)); return this; }
   color(...c) { this._color = c.flat(); return this; } dull() { return this; }
   txtr(n) { this.texture = n; return this; } txtrSrc(n, src) { (globalThis.textures ||= {})[n] = src; }
   placeLimb(a, b, r) { this.limb = { a: a.slice(), b: b.slice(), r }; return this.identity().move(cg.mix(a, b, .5)).scale(r); }
   getMatrix() { return this.m.slice(); }
   getGlobalMatrix() { let M = this.getMatrix(); for (let n = this._parent; n; n = n._parent) M = cg.mMultiply(n.getMatrix(), M); return M; }
   animate(fn) { this.frame = fn; }
   all() { return [this, ...this.children.flatMap(c => c.all())]; }
}

async function scene() {
   const texts = {}, listeners = {}, requested = [];
   Object.assign(globalThis, {
      window: globalThis, worldCoords: cg.mIdentity(), buzzes: [], testBeam: null,
      inputEvents: { onPress() {}, onRelease() {}, pos: () => null },
      clay: { defineTextMesh: (name, text) => texts[name] = text, formMesh: () => true },   // every STL "has loaded"
      addEventListener: (type, fn) => (listeners[type] ||= []).push(fn),
      removeEventListener: (type, fn) => listeners[type] = (listeners[type] || []).filter(f => f !== fn),
   });
   let source = await read('./armLab.js');
   const stubs = {
      '"../../render/core/cg.js"': JSON.stringify(cgURL),
      '"../../render/core/controllerInput.js"': JSON.stringify(url(
         'export let joyStickState = globalThis.testJoy = { left: {x: 0, y: 0}, right: {x: 0, y: 0} };' +
         'export function ControllerBeam(model, hand) { this.update = () => {}; this.beamMatrix = () => globalThis.testBeam?.[hand] || null; }')),
      '"../hw2/gameKit.js"': JSON.stringify(url('export const buzz = (...a) => globalThis.buzzes.push(a);')),
      '"../../render/core/stl.js"': JSON.stringify(url('export const stl = name => { globalThis.requestedSTL.push(name); };')),
      '"./so101Model.js"': JSON.stringify(modelURL),
      // A fake G2: records the widgets and every drawing call, so render() can be exercised.
      '"../../util/g2.js"': JSON.stringify(url(`export function G2() {
         const g2 = globalThis.testG2 = this; this.widgets = []; this.calls = []; this.active = false;
         this.getCanvas = () => ({ fake: 'canvas' });
         this.addWidget = (obj, type, x, y, color, label, action, size) => { const w = { obj, type, x, y, action, size, value: .5, setValue(v) { this.value = v; } }; this.widgets.push(w); return w; };
         this.isActiveWidget = () => this.active;
         this.render = () => {};
         this.update = () => { this.calls = []; this.render(); };
         for (const f of ['setColor', 'fillRect', 'textHeight', 'text', 'lineWidth', 'line', 'drawCurve'])
            this[f] = (...a) => { this.calls.push([f, ...a]); if (f === 'drawCurve') a[1](0), a[1](1); return this; };
      }`)),
   };
   for (const [from, to] of Object.entries(stubs)) { assert.ok(source.includes(from.replace(/"/g, "'")), from); source = source.replace(from.replace(/"/g, "'"), to); }
   globalThis.requestedSTL = requested;
   const module = await import(url(source + '\n// ' + Math.random()));
   const model = new Node('root', null);
   await module.init(model);
   const advance = (seconds = 1 / 60) => { for (let i = 0; i < Math.round(seconds * 60); i++) { model.time += 1 / 60; model.frame(); } };
   const key = (k, type = 'keydown') => listeners[type].forEach(fn => fn({ key: k, preventDefault() {}, target: null }));
   const label = j => texts['armLab_' + j];
   const node = form => model.all().find(n => n.form === form);
   const pos = n => n.getGlobalMatrix().slice(12, 15);
   // a beam from O aimed at P: the beam points down the matrix's -z axis, so z = O - P
   const aim = (hand, O, P) => { const m = cg.mIdentity(); const z = cg.normalize(cg.subtract(O, P)); m[8] = z[0]; m[9] = z[1]; m[10] = z[2]; m[12] = O[0]; m[13] = O[1]; m[14] = O[2]; (globalThis.testBeam ||= {})[hand] = m; };
   return { model, module, texts, requested, advance, key, label, node, pos, aim, g2: globalThis.testG2 };
}

test('the robot is built from the 13 STL parts, each placed on its joint once', async () => {
   const s = await scene();
   assert.equal(new Set(s.requested).size, 13);
   s.advance(); s.advance();
   const parts = s.model.all().filter(n => String(n.form).startsWith('SO101/'));
   assert.equal(parts.length, 17, 'every mesh entry of every link, exactly once');
   s.module.deinit();
});

test('annotation 1: every motor has an angle label beside it, and the labels sit at different joints', async () => {
   const s = await scene(); s.advance();
   assert.equal(s.label('shoulder_pan'), '> SHOULDER PAN  +0 / -110..+110');
   for (const j of MOTORS.slice(1, 5)) assert.match(s.label(j.name), new RegExp('^' + j.name.toUpperCase().replace('_', ' ') + '  \\+0 / [-+]\\d+\\.\\.[-+]\\d+$'));
   assert.equal(s.label('gripper'), 'GRIPPER  CLOSED  0.0 / 11.7 CM', 'the gripper starts closed, with its own label');
   assert.equal(s.texts.armLab_title, 'SO101 ARM LAB');
   const where = MOTORS.map(j => s.pos(s.node('armLab_' + j.name)));
   for (let i = 1; i < where.length; i++)
      assert.ok(cg.distance(where[i], where[i - 1]) > .02, `labels ${i - 1} and ${i} are at different places`);
   // the gripper label is above the table and within two arm-lengths of the base
   const base = [0, 1.0, -.8], tip = where[5];
   assert.ok(tip[1] > base[1], 'the gripper is above the base');
   assert.ok(cg.distance(tip, base) < 1.2, 'and within reach');
   s.module.deinit();
});

test('keys 1-6 select a joint and J / K turn it, stopping at the limit with a red label', async () => {
   const s = await scene(); s.advance();
   s.key('3');                                              // elbow_flex
   const before = s.pos(s.node('armLab_wrist_flex'));
   s.key('k'); s.advance(.5); s.key('k', 'keyup');
   assert.match(s.label('elbow_flex'), /^> ELBOW FLEX  \+(3[0-9]|4[0-9]) \/ -97\.\.\+97$/, 'about 1.2 rad/s for half a second: ' + s.label('elbow_flex'));
   assert.equal(s.node('armLab_elbow_flex')._color.join(), [.4, 1, 1].join(), 'the selected joint is cyan');
   assert.ok(cg.distance(before, s.pos(s.node('armLab_wrist_flex'))) > .05, 'turning the elbow moves the wrist');
   s.key('k'); s.advance(3); s.key('k', 'keyup');
   assert.equal(s.label('elbow_flex'), '> ELBOW FLEX  +97 / -97..+97  AT LIMIT');
   assert.equal(s.node('armLab_elbow_flex')._color.join(), [1, .2, .2].join(), 'at the limit the label is red');
   s.key('j'); s.advance(.15); s.key('j', 'keyup');                 // back about 10 degrees: inside the warning band
   assert.match(s.label('elbow_flex'), /NEAR LIMIT$/);
   assert.equal(s.node('armLab_elbow_flex')._color.join(), [1, .6, .15].join(), 'near the limit it is orange');
   s.key('r'); s.advance();
   assert.equal(s.label('elbow_flex'), '> ELBOW FLEX  +0 / -97..+97');
   s.module.deinit();
});

test('M plays the demo motion inside the limits; deinit removes the key listeners', async () => {
   const s = await scene(); s.advance();
   s.key('m'); s.advance(2);
   assert.notEqual(s.label('shoulder_lift'), 'SHOULDER LIFT  +0 / -100..+100');
   assert.match(s.texts.armLab_help, /DEMO MOTION/);
   for (let i = 0; i < 60; i++) { s.advance(.1); assert.ok(!/AT LIMIT/.test(s.label('gripper')), 'the gripper is clamped, never past its limit'); }
   s.module.deinit();
   assert.equal(new Set(globalThis.requestedSTL).size, 13);
   s.key('m');                                              // no listener left to flip the demo
   const help = s.texts.armLab_help; s.advance(); assert.equal(s.texts.armLab_help, help);
});

test('annotation 2: a line from the gripper frame to the target, with the real distance in cm', async () => {
   const s = await scene(); s.advance();
   const line = s.node('tubeZ'), ball = s.node('sphere');
   assert.ok(line.limb && ball, 'the first dash and the target exist');
   const dashesOn = () => s.model.all().filter(n => n.form === 'tubeZ' && n.limb && n.s[0] > 0).length;
   assert.ok(dashesOn() > 3, 'the line is drawn as several dashes: ' + dashesOn());
   const tip = line.limb.a, cm = () => Number(s.texts.armLab_distance.match(/([\d.]+) CM$/)[1]);
   // the line starts at the gripper frame: the point between the jaws, a bit beyond the wrist
   const jaw = s.model.all().find(n => n.form === 'SO101/moving_jaw_so101_v1');
   assert.ok(cg.distance(tip, s.pos(jaw)) < .25, `the line starts at the gripper frame, next to the moving jaw: tip ${tip.map(v => v.toFixed(2))}, jaw ${s.pos(jaw).map(v => v.toFixed(2))}, label ${s.pos(s.node('armLab_gripper')).map(v => v.toFixed(2))}`);
   const lastDash = s.model.all().filter(n => n.form === 'tubeZ' && n.limb && n.s[0] > 0).at(-1);
   assert.ok(cg.distance(tip, lastDash.limb.b) > .05, 'and the dashes run out toward the target');
   const target = s.pos(ball);
   assert.equal(Math.round(cg.distance(tip, target) / 2 * 100 * 10) / 10, cm(), 'scene metres / 2 = real centimetres');
   // walk the target onto the gripper: the label says GRAB and everything turns green
   const start = cm();
   s.key('a'); s.advance(.5); s.key('a', 'keyup');
   assert.notEqual(cm(), start, 'A moves the target');
   const tip2 = s.node('tubeZ').limb.a;
   const press = (k, sec) => { s.key(k); s.advance(sec); s.key(k, 'keyup'); };
   // move with the keys until within GRAB_CM, axis by axis (0.3 m/s); the ball's own position is the target
   const go = (k1, k2, i) => { const d = tip2[i] - s.pos(ball)[i]; press(d > 0 ? k2 : k1, Math.min(3, Math.abs(d) / .3)); };
   go('a', 'd', 0); go('q', 'e', 1); go('w', 's', 2);
   assert.ok(cm() <= GRAB_CM, 'within grab distance: ' + s.texts.armLab_distance);
   assert.match(s.texts.armLab_distance, /^GRAB  /);
   assert.equal(ball._color.join(), [.3, 1, .4].join(), 'the target turns green');
   // turning the shoulder moves the gripper away again
   s.key('1'); press('k', 1.5);
   assert.ok(cm() > GRAB_CM, 'the gripper left the target: ' + s.texts.armLab_distance);
   s.module.deinit();
});

test('controllers: trigger on a ring selects a joint; either stick moves the gripper the way it is pushed', async () => {
   const s = await scene(); s.advance();
   const elbow = s.pos(s.node('armLab_elbow_flex'));                  // the label is just above the ring; aim at the ring itself
   const ringOf = i => s.model.all().filter(n => n.form === 'sphere')[i + 1];   // sphere 0 is the target, then the six rings
   s.aim('right', [0, 1.4, .2], s.pos(ringOf(2)));
   s.advance();
   globalThis.inputEvents.onPress('right');
   s.advance();
   assert.match(s.label('elbow_flex'), /^> ELBOW FLEX/, 'the elbow is selected');
   assert.equal(globalThis.buzzes.length, 1, 'a short buzz confirms the selection');
   const tipY = () => s.pos(s.node('armLab_gripper'))[1];
   const before = tipY();
   globalThis.testJoy.right.y = -.8; s.advance(.5); globalThis.testJoy.right.y = 0;   // push the right stick up
   assert.match(s.label('elbow_flex'), /[-+](2[0-9]|3[0-9]) \//, 'half a second of stick turns it about 27 degrees: ' + s.label('elbow_flex'));
   assert.ok(tipY() > before + .05, 'and the gripper went up, whichever sign the motor needed');
   globalThis.testJoy.left.y = .8; s.advance(.5); globalThis.testJoy.left.y = 0;      // the left stick down: back down
   assert.ok(Math.abs(tipY() - before) < .02, 'the left stick works the same joint the same way');
   assert.equal(s.label('gripper'), 'GRIPPER  CLOSED  0.0 / 11.7 CM', 'the gripper starts with the jaws touching');
   assert.equal(s.node('armLab_gripper')._color.join(), [1, .2, .2].join(), 'closed is a limit: red');
   s.key('6');                                                                        // select the gripper
   globalThis.testJoy.left.y = 1; s.advance(1); globalThis.testJoy.left.y = 0;       // push down: try to close it further
   assert.equal(s.label('gripper'), '> GRIPPER  CLOSED  0.0 / 11.7 CM', 'the jaws stop at contact; they never pass through each other');
   globalThis.testJoy.left.y = -1; s.advance(1); globalThis.testJoy.left.y = 0;      // up opens it
   assert.match(s.label('gripper'), /^> GRIPPER  OPEN \d+\.\d \/ 11\.7 CM$/, s.label('gripper'));
   s.key('1');                                                                        // the shoulder pan
   const tipZ = () => s.pos(s.node('armLab_gripper'))[2], z0 = tipZ();
   globalThis.testJoy.right.y = -1; s.advance(.5); globalThis.testJoy.right.y = 0;    // stick forward: the pan swings the gripper away from the player (scene -z)
   assert.ok(tipZ() < z0 - .05, 'stick forward moved the gripper away: ' + (tipZ() - z0).toFixed(3));
   s.module.deinit();
   assert.notEqual(globalThis.inputEvents.onPress, undefined);
});

test('controllers: trigger on the target ball drags it along the beam, and the distance follows', async () => {
   const s = await scene(); s.advance();
   const ball = () => s.pos(s.node('sphere'));
   const start = ball().slice(), O = [.1, 1.3, .3];
   s.aim('right', O, start); s.advance();
   globalThis.inputEvents.onPress('right');                           // grab the ball
   const dist = cg.distance(O, start);
   s.aim('right', O, [start[0] - .3, start[1] + .1, start[2]]); s.advance();   // swing the beam left and up
   const moved = ball();
   assert.ok(cg.distance(moved, start) > .2, 'the ball followed the beam');
   assert.ok(Math.abs(cg.distance(O, moved) - dist) < .01, 'at the same distance along the beam, as in beamSphere.js');
   const cm = () => Number(s.texts.armLab_distance.match(/([\d.]+) CM$/)[1]);
   const before = cm();
   globalThis.inputEvents.onRelease('right');
   s.aim('right', O, start); s.advance();
   assert.ok(cg.distance(ball(), moved) < 1e-9, 'released: the ball stays where it was left');
   assert.equal(cm(), before);
   s.module.deinit();
});

test('step 4: the pendant has a slider per motor; dragging one turns that motor and selects it', async () => {
   const s = await scene(); s.advance();
   const { MOTORS: M, sliderToAngle, angleToSlider, physicalLo } = await import(modelURL);
   assert.equal(s.g2.widgets.length, 6);
   assert.ok(s.g2.widgets.every(w => w.type === 'slider' && w.obj.form === 'square'));
   assert.equal(s.g2.widgets[0].obj.texture, 8, 'the square shows the canvas texture');
   assert.deepEqual(globalThis.textures[8], { fake: 'canvas' });
   // a slider's value follows the angle: the gripper starts closed, so its slider is at 0
   assert.equal(s.g2.widgets[5].value, 0);
   // drag the elbow slider to 25 %: the elbow angle is a quarter of the way up its range
   s.g2.active = true; s.g2.widgets[2].action(.25); s.advance();
   assert.ok(Math.abs(angleToSlider(M[2], sliderToAngle(M[2], .25)) - .25) < 1e-9);
   assert.match(s.label('elbow_flex'), /^> ELBOW FLEX  -4[89] /);               // -97 + .25 * 194 = -48.5, and now selected
   // the gripper slider cannot push past the contact angle
   s.g2.widgets[5].action(-1); s.advance();
   assert.equal(s.label('gripper'), '> GRIPPER  CLOSED  0.0 / 11.7 CM');
   // release: sliders are written from the angles again, so a keyboard turn moves the slider
   s.g2.active = false; s.key('1'); globalThis.held; s.advance();
   const before = s.g2.widgets[0].value;
   s.key('k'); s.advance(.5);
   assert.ok(s.g2.widgets[0].value > before + .05, 'the shoulder pan slider moved with the K key');
   assert.ok(Math.abs(s.g2.widgets[0].value - angleToSlider(M[0], sliderToAngle(M[0], s.g2.widgets[0].value))) < 1e-9);
   s.module.deinit();
});

test('step 4: render() draws a dial and a name for every motor, orange bands and a red needle at a limit', async () => {
   const s = await scene(); s.advance();
   const names = s.g2.calls.filter(c => c[0] === 'text').map(c => c[1]);
   for (const n of ['SHOULDER PAN', 'SHOULDER LIFT', 'ELBOW FLEX', 'WRIST FLEX', 'WRIST ROLL', 'GRIPPER']) assert.ok(names.includes(n), n);
   assert.ok(names.some(t => /CLOSED  0.0 \/ 11.7 CM/.test(t)), 'the gripper row shows its opening');
   const arcs = s.g2.calls.filter(c => c[0] === 'drawCurve').length, needles = s.g2.calls.filter(c => c[0] === 'line').length;
   assert.equal(needles, 6); assert.ok(arcs >= 6 * 2, 'a full arc and at least one warning band per dial');
   // the gripper starts at its physical limit: its needle is red
   const gripperNeedle = s.g2.calls.filter(c => c[0] === 'line')[5];
   const colorBefore = s.g2.calls.slice(0, s.g2.calls.indexOf(gripperNeedle)).reverse().find(c => c[0] === 'setColor')[1];
   assert.equal(colorBefore, '#ff3333');
   s.module.deinit();
});
