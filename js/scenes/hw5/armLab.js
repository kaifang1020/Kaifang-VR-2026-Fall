/*
 * ARM LAB (HW5): the SO101 robot arm with graphical annotations.
 *
 * Step 1: a label beside every joint showing its angle and its range in degrees,
 * which turns orange near a limit and red at the limit.
 * Step 2: a target ball, a line from the gripper to it, and the distance.
 * The robot itself is built exactly as the course's SO101.js builds it; the
 * tables live in so101Model.js.
 *
 * Step 3: controller input, like a teach pendant. Point either beam at a joint's
 * ring and pull the trigger to select it; push either thumbstick the way you want
 * the gripper to go and the selected motor turns that way (the sign comes from
 * forward kinematics, so "right" is the player's right and "up" is up). For the
 * gripper itself, up opens. Point at the target ball and hold the trigger to drag
 * it along the beam (the beamSphere.js technique).
 *
 * Step 4: a teach pendant panel beside the robot: a 2D canvas (the course's G2
 * library) textured onto a square, with a dial and a slider for every motor.
 * Dragging a slider with the beam, or the mouse, turns that motor.
 *
 * Desktop controls: keys 1-6 select a joint, J / K turn it, R resets, M plays
 * the professor's demo motion. W A S D move the target, Q / E raise and lower it.
 */
import * as cg from '../../render/core/cg.js';
import { stl } from '../../render/core/stl.js';
import { ControllerBeam, joyStickState } from '../../render/core/controllerInput.js';
import { buzz } from '../hw2/gameKit.js';
import { G2 } from '../../util/g2.js';
import { LINKS, JOINTS, MOTORS, clampAngle, limitFraction, jointLabel, NEAR_LIMIT, demoMotion, distanceLabel, GRAB_CM, jawsOverlap, stickSigns, physicalLo, toDeg, dial, dialAngle, sliderToAngle, angleToSlider } from './so101Model.js';

const WHITE = [.92, .96, 1], ORANGE = [1, .6, .15], RED = [1, .2, .2], CYAN = [.4, 1, 1], GREEN = [.3, 1, .4];
const SCALE = 2;                                   // the robot is shown at twice life size
let cleanup = () => {};
export const deinit = () => cleanup();

export const init = async model => {
   cleanup();

   // ---------- 1. Load the STL parts (asynchronously, like SO101.js) ----------
   for (const meshes of Object.values(LINKS))
      for (const mesh of meshes) stl('SO101/' + mesh.stl);

   // ---------- 2. The kinematic chain: one empty node per joint, child of its parent ----------
   // URDF has z up; the scene has y up, so the base is turned to stand the robot up.
   // Twice life size, on a table in front of the player.
   const base = model.add().move(0, 1.0, -.8).turnX(-Math.PI / 2).scale(SCALE);
   const node = { robotBaseFrame: base };
   for (const j of JOINTS) node[j.name] = node[j.parent].add();

   // ---------- 3. The six joint angles: the robot's whole input ----------
   const rest = () => MOTORS.map(j => clampAngle(j, 0));          // zero, except the gripper starts closed (jaws touching)
   const angle = rest();
   const placed = new Set();                                   // which mesh entries are already in the scene
   let selected = 0, demo = false;
   const GRIP = MOTORS.findIndex(j => j.name === 'gripper');

   // ---------- 4. Annotations: one floating text per motor ----------
   // Text meshes are rebuilt only when their text changes; their position is set every frame.
   const text = (id, size = .85) => {               // the line font is thin: large sizes read better in a headset
      const name = 'armLab_' + id;
      let last, n;
      return (str, pos, color) => {
         if (str !== last) { last = str; clay.defineTextMesh(name, str); if (!n) n = model.add(name).dull(); }
         const width = .019 * Math.max(0, str.length - 1) + .015;       // the line font's spacing
         n.identity().move(pos[0] - width * size / 2, pos[1], pos[2]).scale(size).color(color);
      };
   };
   const labels = MOTORS.map(j => text(j.name));
   const title = text('title', 1.3), help = text('help', .7), help2 = text('help2', .7), help3 = text('help3', .7), help4 = text('help4', .7);

   // ---------- Step 2: a target, and the line from the gripper to it ----------
   // gripper_frame is the URDF's "tool centre point": a link with no mesh that marks
   // the spot between the jaws. Distances to things are measured from here.
   const GRIPPER = JOINTS.find(j => j.name === 'gripper_frame');
   let targetPos = [.3, 1.2, -.65];                            // scene metres; the player moves it
   const target = model.add('sphere').color(1, .55, .3);
   // A dashed line: the engine has no dashes, so it is up to 40 short tubes laid end to
   // end with gaps; unused ones are scaled to nothing.
   const DASH = .035, dashes = Array.from({ length: 40 }, () => model.add('tubeZ'));
   const dashedLine = (a, b, radius, color) => {
      const length = cg.distance(a, b), dir = length > 1e-6 ? cg.scale(cg.subtract(b, a), 1 / length) : [0, 0, 1];
      dashes.forEach((d, i) => {
         const from = i * 2 * DASH, to = Math.min(length, from + DASH);
         if (from >= length) { d.identity().scale(0); return; }
         d.placeLimb(cg.add(a, cg.scale(dir, from)), cg.add(a, cg.scale(dir, to)), radius).color(color);
      });
   };
   const distText = text('distance', .95);

   // ---------- Step 3: controller beams ----------
   // A ring on every motor to point at, like the START button in coach.js.
   const beams = { left: new ControllerBeam(model, 'left'), right: new ControllerBeam(model, 'right') };
   const rings = MOTORS.map(() => model.add('sphere'));
   const ray = hand => {                                        // the beam as origin + direction, in scene coordinates
      const bm = beams[hand].beamMatrix();
      if (!bm || !Number.isFinite(bm[12])) return null;
      const inv = cg.mInverse(worldCoords);
      const o = cg.mTransform(inv, bm.slice(12, 15)), o2 = cg.mTransform(inv, cg.subtract(bm.slice(12, 15), bm.slice(8, 11)));
      return { o, dir: cg.normalize(cg.subtract(o2, o)) };
   };
   // Which point of a list is the beam closest to, within `radius`? Returns {index, along} or null.
   const nearest = (hand, points, radius) => {
      const r = ray(hand);
      if (!r) return null;
      let best = radius, found = null;
      points.forEach((P, index) => {
         const v = cg.subtract(P, r.o), along = cg.dot(v, r.dir);
         if (along <= 0) return;
         const d = cg.norm(cg.subtract(v, cg.scale(r.dir, along)));
         if (d < best) { best = d; found = { index, along }; }
      });
      return found;
   };
   const dragging = { left: null, right: null };                // {dist}: holding the target this far along the beam
   const hover = { left: null, right: null };                   // the ring each beam points at, for highlighting
   const jointPoints = () => MOTORS.map(j => jointPos(j));
   const onPress = hand => {
      const ring = nearest(hand, jointPoints(), .06);
      if (ring) { selected = ring.index; demo = false; buzz(hand, .5, 40); return; }
      const ball = nearest(hand, [targetPos], .07);
      if (ball) { dragging[hand] = { dist: ball.along }; buzz(hand, .4, 30); }
   };
   const onRelease = hand => { dragging[hand] = null; };
   const previous = { press: inputEvents.onPress, release: inputEvents.onRelease };
   inputEvents.onPress = onPress; inputEvents.onRelease = onRelease;

   // Where is a joint right now, in the scene's own coordinates? Its global matrix,
   // seen from the scene root, gives the position in column 3 (elements 12-14).
   const toScene = m => cg.mMultiply(cg.mInverse(model.getGlobalMatrix()), m);
   const jointPos = j => toScene(node[j.name].getGlobalMatrix()).slice(12, 15);

   // ---------- Step 4: the teach pendant: dials and sliders on a 2D canvas ----------
   // G2 draws with the browser's ordinary 2D canvas API onto a <canvas>; the engine
   // uploads that canvas as a texture every frame, and a square shows it. G2's widgets
   // ask where a controller beam (or the mouse) hits the square, in the canvas's own
   // -1..+1 coordinates, so a slider can be dragged without any ray maths here.
   const g2 = new G2();
   model.txtrSrc(8, g2.getCanvas());                                     // texture channel 8 (fonts use 12-15)
   const panel = model.add('square').txtr(8).move(-.8, 1.2, -.62).turnY(.6).scale(.3);
   const ROW = k => .58 - .27 * k;                                        // canvas y of motor k's row
   const sliders = MOTORS.map((j, k) => g2.addWidget(panel, 'slider', .45, ROW(k), '#d8e2ec', '', v => {
      angle[k] = sliderToAngle(j, v); selected = k; demo = false;         // only while dragging: G2 calls this on 'drag'
   }, 1.6));
   const css = c => '#' + c.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
   const arc = (cx, cy, r, t0, t1) => g2.drawCurve(24, u => {             // part of a dial's arc, from t0 to t1
      const a = dialAngle(t0 + (t1 - t0) * u); return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
   });
   g2.render = function () {
      this.setColor([.08, .1, .14, .94]).fillRect(-1, -1, 2, 2);
      this.setColor('#dfe8f2').textHeight(.09).text('TEACH PENDANT', 0, .86, 'center');
      MOTORS.forEach((j, k) => {
         const y = ROW(k), d = dial(j, angle[k]), f = limitFraction(j, angle[k]);
         const bad = f >= 1 || angle[k] <= physicalLo(j) + 1e-9;
         const color = css(bad ? RED : f >= NEAR_LIMIT ? ORANGE : k === selected ? CYAN : WHITE);
         if (k === selected) this.setColor([.2, .3, .4, .5]).fillRect(-1, y - .13, 2, .26);
         // the dial: a grey arc over the whole range, orange in the warning bands, and a needle
         const cx = -.74, r = .11;
         this.lineWidth(.025).setColor('#55606c'); arc(cx, y, r, 0, 1);
         this.setColor(css(ORANGE)); if (d.nearLo > 0) arc(cx, y, r, 0, d.nearLo); arc(cx, y, r, d.nearHi, 1);
         const a = dialAngle(d.t);
         this.lineWidth(.02).setColor(color).line([cx, y], [cx + .85 * r * Math.cos(a), y + .85 * r * Math.sin(a)]);
         this.setColor(color).textHeight(.06).text(j.name.toUpperCase().replace('_', ' '), -.56, y + .055, 'left');
         this.setColor('#aab4c0').textHeight(.055).text(j.name === 'gripper' ? jointLabel(j, angle[k]).replace('GRIPPER  ', '') : `${toDeg(angle[k]).toFixed(0)} DEG`, -.56, y - .055, 'left');
      });
      this.setColor('#8c98a6').textHeight(.05).text('DRAG A SLIDER: BEAM + TRIGGER, OR MOUSE', 0, -.92, 'center');
   };

   // ---------- 5. Keyboard ----------
   const onKey = e => {
      if (e.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
      const k = e.key.toLowerCase();
      if (k >= '1' && k <= '6') { selected = Number(k) - 1; demo = false; }
      else if ('wasdqe'.includes(k)) { /* held: handled every frame */ }
      else if (k === 'm') demo = !demo;
      else if (k === 'r') { rest().forEach((a, i) => angle[i] = a); demo = false; }
      else return;
      e.preventDefault();
   };
   const held = new Set();
   const down = e => { held.add(e.key.toLowerCase()); onKey(e); };
   const up = e => held.delete(e.key.toLowerCase());
   window.addEventListener('keydown', down);
   window.addEventListener('keyup', up);
   cleanup = () => {
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up);
      if (inputEvents.onPress === onPress) inputEvents.onPress = previous.press;
      if (inputEvents.onRelease === onRelease) inputEvents.onRelease = previous.release;
   };

   let last = 0;
   model.animate(() => {
      const dt = Math.min(.05, model.time - last); last = model.time;

      // Add a part to its joint node as soon as its STL has loaded (once per scene start).
      const place = (parent, mesh) => {
         if (placed.has(mesh) || !clay.formMesh('SO101/' + mesh.stl)) return;
         placed.add(mesh);
         parent.add('SO101/' + mesh.stl).move(mesh.xyz).turnZ(mesh.rpy[2]).turnY(mesh.rpy[1]).turnX(mesh.rpy[0]).color(mesh.color);
      };
      for (const mesh of LINKS.base_link) place(base, mesh);
      for (const j of JOINTS) for (const mesh of LINKS[j.link]) place(node[j.name], mesh);

      for (const b of Object.values(beams)) b.update();

      // Controllers: a held target rides along the beam. Either thumbstick drives the
      // selected motor: its x and y are turned into "move the gripper right / up" with the
      // signs from stickSigns, so the arm goes the way the stick is pushed. Dead zone 0.15.
      for (const hand of ['left', 'right']) {
         const r = ray(hand);
         if (dragging[hand] && r) targetPos = cg.add(r.o, cg.scale(r.dir, dragging[hand].dist));
         hover[hand] = nearest(hand, jointPoints(), .06)?.index ?? null;
      }
      const stick = v => Math.abs(v) > .15 ? v : 0;
      const sx = stick(joyStickState.left?.x ?? 0) + stick(joyStickState.right?.x ?? 0);
      const sy = -(stick(joyStickState.left?.y ?? 0) + stick(joyStickState.right?.y ?? 0));   // hardware: up is negative
      if (sx || sy) {
         const sign = stickSigns(angle, selected);
         const input = Math.max(-1, Math.min(1, sx * sign.right + sy * sign.up));
         if (input) { angle[selected] = clampAngle(MOTORS[selected], angle[selected] + input * 1.2 * dt); demo = false; }
      }

      // Move the target: W/S forward and back, A/D left and right, Q/E down and up.
      const step = .3 * dt;                                                // metres per second
      if (held.has('w')) targetPos[2] -= step; if (held.has('s')) targetPos[2] += step;
      if (held.has('a')) targetPos[0] -= step; if (held.has('d')) targetPos[0] += step;
      if (held.has('e')) targetPos[1] += step; if (held.has('q')) targetPos[1] -= step;

      // Input: hold J / K to turn the selected joint, or let the demo swing all six.
      if (demo) demoMotion(model.time).forEach((a, i) => angle[i] = clampAngle(MOTORS[i], a));
      else {
         const speed = 1.2 * dt;                                          // radians per second
         if (held.has('j')) angle[selected] = clampAngle(MOTORS[selected], angle[selected] - speed);
         if (held.has('k')) angle[selected] = clampAngle(MOTORS[selected], angle[selected] + speed);
      }

      // Pose the chain: each joint's fixed placement, plus its angle about its own axis.
      let i = 0;
      for (const j of JOINTS) {
         let [x, y, z] = j.rpy;
         if (!j.fixed) { if (j.axis === 'z') z += angle[i]; else y += angle[i]; i++; }
         node[j.name].identity().move(j.xyz).turnZ(z).turnY(y).turnX(x);
      }

      // Annotation 1: the angle beside every joint, coloured by how close it is to a limit.
      MOTORS.forEach((j, k) => {
         const p = jointPos(j), f = limitFraction(j, angle[k]);
         const bad = f >= 1 || angle[k] <= physicalLo(j) + 1e-9;             // at a limit (the gripper's is the contact angle)
         const color = bad ? RED : f >= NEAR_LIMIT ? ORANGE : k === selected ? CYAN : WHITE;
         labels[k]((k === selected ? '> ' : '') + jointLabel(j, angle[k]), [p[0], p[1] + .05 + .018 * k, p[2] + .12], color);
         const hot = hover.left === k || hover.right === k;
         rings[k].identity().move(p).scale(hot ? .03 : k === selected ? .024 : .016).color(hot ? [1, 1, 1] : k === selected ? CYAN : [.5, .6, .7]).dull();
      });
      // Annotation 2: the distance from the gripper to the target. Scene distances are
      // SCALE times real ones, so the label converts back to the real robot's centimetres.
      const tip = jointPos(GRIPPER);
      const real = cg.distance(tip, targetPos) / SCALE;
      const grab = real * 100 <= GRAB_CM;
      target.identity().move(targetPos).scale(grab ? .03 : .025).color(grab ? GREEN : [1, .55, .3]);
      dashedLine(tip, targetPos, grab ? .007 : .005, grab ? GREEN : ORANGE);
      const mid = cg.mix(tip, targetPos, .5);
      distText(distanceLabel(real), [mid[0], mid[1] + .04, mid[2] + .06], grab ? GREEN : ORANGE);

      // The pendant: sliders follow the angles unless one is being dragged, then G2 reads
      // the beams or mouse, redraws the canvas, and moves the dragged slider's motor.
      if (!g2.isActiveWidget()) sliders.forEach((s, k) => s.setValue(angleToSlider(MOTORS[k], angle[k])));
      g2.update();

      title('SO101 ARM LAB', [0, 1.75, -.8], [.85, .95, 1]);
      help(demo ? 'DEMO MOTION   M STOP   R RESET' : `KEYS 1-6 SELECT   J / K TURN ${MOTORS[selected].name.toUpperCase().replace('_', ' ')}   M DEMO   R RESET`,
           [0, .66, -.6], [.6, .8, 1]);
      help2('W A S D  MOVE TARGET   Q / E  LOWER / RAISE IT', [0, .58, -.6], [.6, .8, 1]);
      help3('VR: POINT AT A JOINT RING + TRIGGER TO SELECT IT', [0, .50, -.6], [.6, .8, 1]);
      help4('PUSH EITHER STICK THE WAY THE GRIPPER SHOULD GO   TRIGGER ON THE BALL DRAGS IT', [0, .42, -.6], [.6, .8, 1]);
   });
};
