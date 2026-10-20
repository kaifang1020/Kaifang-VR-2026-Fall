/*
 * ARM LAB (HW5): the SO101 robot arm with graphical annotations.
 *
 * Step 1: a label beside every joint showing its angle and its range in degrees,
 * which turns orange near a limit and red at the limit.
 * Step 2: a target ball, a line from the gripper to it, and the distance.
 * The robot itself is built exactly as the course's SO101.js builds it; the
 * tables live in so101Model.js.
 *
 * Step 3: controller input, like a teach pendant. Point a beam at a joint's ring
 * and pull the trigger to select it; the right thumbstick turns it. The left
 * thumbstick opens and closes the gripper. Point at the target ball and hold the
 * trigger to drag it along the beam (the beamSphere.js technique).
 *
 * Desktop controls: keys 1-6 select a joint, J / K turn it, R resets, M plays
 * the professor's demo motion. W A S D move the target, Q / E raise and lower it.
 */
import * as cg from '../../render/core/cg.js';
import { stl } from '../../render/core/stl.js';
import { ControllerBeam, joyStickState } from '../../render/core/controllerInput.js';
import { buzz } from '../hw2/gameKit.js';
import { LINKS, JOINTS, MOTORS, clampAngle, limitFraction, jointLabel, NEAR_LIMIT, demoMotion, distanceLabel, GRAB_CM, jawsOverlap } from './so101Model.js';

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
   const angle = MOTORS.map(() => 0);
   const placed = new Set();                                   // which mesh entries are already in the scene
   let selected = 0, demo = false;
   const GRIP = MOTORS.findIndex(j => j.name === 'gripper');

   // ---------- 4. Annotations: one floating text per motor ----------
   // Text meshes are rebuilt only when their text changes; their position is set every frame.
   const text = (id, size = .55) => {
      const name = 'armLab_' + id;
      let last, n;
      return (str, pos, color) => {
         if (str !== last) { last = str; clay.defineTextMesh(name, str); if (!n) n = model.add(name).dull(); }
         const width = .019 * Math.max(0, str.length - 1) + .015;       // the line font's spacing
         n.identity().move(pos[0] - width * size / 2, pos[1], pos[2]).scale(size).color(color);
      };
   };
   const labels = MOTORS.map(j => text(j.name));
   const title = text('title', .9), help = text('help', .5), help2 = text('help2', .5), help3 = text('help3', .5), help4 = text('help4', .5);

   // ---------- Step 2: a target, and the line from the gripper to it ----------
   // gripper_frame is the URDF's "tool centre point": a link with no mesh that marks
   // the spot between the jaws. Distances to things are measured from here.
   const GRIPPER = JOINTS.find(j => j.name === 'gripper_frame');
   let targetPos = [.3, 1.2, -.65];                            // scene metres; the player moves it
   const target = model.add('sphere').color(1, .55, .3);
   const line = model.add('tubeZ').color(ORANGE);
   const distText = text('distance', .6);

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

   // ---------- 5. Keyboard ----------
   const onKey = e => {
      if (e.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
      const k = e.key.toLowerCase();
      if (k >= '1' && k <= '6') { selected = Number(k) - 1; demo = false; }
      else if ('wasdqe'.includes(k)) { /* held: handled every frame */ }
      else if (k === 'm') demo = !demo;
      else if (k === 'r') { angle.fill(0); demo = false; }
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

      // Controllers: a held target rides along the beam; the right stick turns the selected
      // joint; the left stick opens and closes the gripper. Sticks have a small dead zone.
      for (const hand of ['left', 'right']) {
         const r = ray(hand);
         if (dragging[hand] && r) targetPos = cg.add(r.o, cg.scale(r.dir, dragging[hand].dist));
         hover[hand] = nearest(hand, jointPoints(), .06)?.index ?? null;
      }
      const stick = v => Math.abs(v) > .15 ? v : 0;
      const turn = stick(joyStickState.right?.x ?? 0), grip = -stick(joyStickState.right ? joyStickState.left?.y ?? 0 : 0);
      if (turn) { angle[selected] = clampAngle(MOTORS[selected], angle[selected] + turn * 1.2 * dt); demo = false; }
      if (grip) { angle[GRIP] = clampAngle(MOTORS[GRIP], angle[GRIP] + grip * 1.2 * dt); demo = false; }

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
         const bad = f >= 1 || (k === GRIP && jawsOverlap(angle[k]));          // at a limit, or the jaws through each other
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
      line.placeLimb(tip, targetPos, grab ? .006 : .004).color(grab ? GREEN : ORANGE);
      const mid = cg.mix(tip, targetPos, .5);
      distText(distanceLabel(real), [mid[0], mid[1] + .03, mid[2] + .06], grab ? GREEN : ORANGE);

      title('SO101 ARM LAB', [0, 1.75, -.8], [.85, .95, 1]);
      help(demo ? 'DEMO MOTION   M STOP   R RESET' : `KEYS 1-6 SELECT   J / K TURN ${MOTORS[selected].name.toUpperCase().replace('_', ' ')}   M DEMO   R RESET`,
           [0, .62, -.6], [.6, .8, 1]);
      help2('W A S D  MOVE TARGET   Q / E  LOWER / RAISE IT', [0, .56, -.6], [.6, .8, 1]);
      help3('VR: POINT AT A JOINT RING + TRIGGER TO SELECT   RIGHT STICK TURNS IT', [0, .50, -.6], [.6, .8, 1]);
      help4('LEFT STICK OPENS / CLOSES THE GRIPPER   TRIGGER ON THE BALL DRAGS IT', [0, .44, -.6], [.6, .8, 1]);
   });
};
