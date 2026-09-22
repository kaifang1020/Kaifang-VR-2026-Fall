/*
   MARIONETTE FOR TWO

   A puppet hangs from five strings above the stage: head, left hand, right
   hand, left foot, right foot. Each string ends in a small ball (the handle).

   - Point a controller beam at a handle -> it lights up and the controller ticks
   - Hold the trigger -> you grab that handle; drag it and the string pulls that
     part of the puppet along
   - Release the trigger -> the string goes slack and that part flops down
   - The tighter a string is pulled the redder it turns and the harder your
     controller buzzes; pull too far and the string snaps out of your grip
   - When a foot lands on the stage, whoever holds that foot feels the thump

   One hand can hold one string, so a single player controls at most two. Making
   the puppet walk, dance or wave takes two people: one holds the head and a
   hand while the other works both feet. Strings you hold are yellow, strings
   someone else holds are cyan.

   Multiplayer sync: each string is one element of the shared array
   puppetStrings, and only the player holding a string broadcasts that element,
   so two people pulling different strings never overwrite each other. The
   puppet's own swing is simulated locally on every machine (same inputs, so it
   looks the same everywhere).

   After six seconds with nobody touching it, the puppet dances a little on its
   own — also handy for previewing on a desktop with no headset.
*/

import * as cg from "../../render/core/cg.js";
import { ControllerBeam } from "../../render/core/controllerInput.js";

// ---------- Layout (metres) ----------

const STAGE   = [0, .82, -.55];                  // centre of the stage disc
const FLOOR   = STAGE[1] + .012;                 // height the feet can stand on
const TORSO   = .15, UPPER = .075, LOWER = .075; // torso length, upper and lower limb segments
const REACH   = UPPER + LOWER - .004;            // furthest a limb can stretch
const SHO_W   = .055, HIP_W = .032;              // half the shoulder width, half the hip width
const SNAP    = .07;                             // stretch beyond this and the string snaps free
const GRAB_R  = .05;                             // how near the beam must pass to "point at" a handle

//            name      point it pulls    handle rest position (stage-relative)   string length
const STRINGS = [
   { name: 'head' , rest: [   0, .74,   0], len: .45 },
   { name: 'handL', rest: [-.17, .70, .03], len: .56 },
   { name: 'handR', rest: [ .17, .70, .03], len: .56 },
   { name: 'footL', rest: [-.06, .66, .10], len: .64 },
   { name: 'footR', rest: [ .06, .66, .10], len: .64 },
];
const restPos = i => cg.add(STAGE, STRINGS[i].rest);

// ---------- Shared state: one element per string { p: handle position, o: who holds it ('' = nobody) } ----------

window.puppetStrings = STRINGS.map((s, i) => ({ p: restPos(i), o: '' }));

export const init = async model => {

   const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
   const isValid = p => Array.isArray(p) && p.length >= 3 && ! isNaN(p[0]);
   const buzz = (hand, intensity, duration) => {
      try { if (window.vibrate) vibrate(hand, intensity, duration); } catch (e) { }
   }

   // ---------- Stage and the beam it hangs from ----------

   model.add('tubeY').move(STAGE).scale(.30, .012, .30).color(.35, .08, .10);
   model.add('tubeY').move(cg.add(STAGE, [0,-.4,0])).scale(.03, .39, .03).color(.15,.1,.08);

   // ---------- The puppet's parts (positioned every frame with placeLimb) ----------

   const WOOD = [.85,.62,.38], DARK = [.45,.28,.15], RED = [.8,.15,.15];
   let part = (shape, c) => model.add(shape).color(c);

   let torso  = part('tubeZ', RED);
   let head   = part('sphere', WOOD);
   let nose   = part('sphere', RED);
   let hat    = part('coneY', DARK);
   let limbs  = {};                               // per limb: upper, lower, joint ball, end ball
   for (let k of ['handL','handR','footL','footR'])
      limbs[k] = { up: part('tubeZ', WOOD), lo: part('tubeZ', WOOD),
                   joint: part('sphere', DARK), end: part('sphere', k[0]=='h' ? WOOD : DARK) };

   let strings = STRINGS.map(() => model.add('tubeZ'));   // the strings
   let handles = STRINGS.map(() => model.add('sphere'));  // the handles
   let halos   = STRINGS.map(() => model.add('sphere').opacity(.3));

   let beams = { left : new ControllerBeam(model, 'left' ),
                 right: new ControllerBeam(model, 'right') };

   // ---------- Puppet physics: a few point masses under gravity + distance constraints (verlet) ----------

   let pts = {};
   let addPt = (k, p) => pts[k] = { p: p.slice(), q: p.slice() };   // p = position now, q = position last frame
   addPt('chest' , cg.add(STAGE, [   0, .29, 0]));
   addPt('pelvis', cg.add(STAGE, [   0, .14, 0]));
   addPt('handL' , cg.add(STAGE, [-.06, .15, 0]));
   addPt('handR' , cg.add(STAGE, [ .06, .15, 0]));
   addPt('footL' , cg.add(STAGE, [-.03, .02, 0]));
   addPt('footR' , cg.add(STAGE, [ .03, .02, 0]));

   const ATTACH = ['chest','handL','handR','footL','footR'];        // which point string i pulls
   let tension  = [0,0,0,0,0];                                      // how far each string is stretched
   let wasOnFloor = { footL: true, footR: true };

   // Keep a and b no further apart than (or exactly at) len. wa is a's share of the
   // correction. Returns how much the distance overshot.
   let link = (a, b, len, wa, exact) => {
      let d = cg.subtract(b, a), n = cg.norm(d);
      if (n < 1e-6 || (! exact && n <= len))
         return 0;
      let fix = cg.scale(d, (n - len) / n);
      for (let i = 0 ; i < 3 ; i++) {
         a[i] += fix[i] * wa;
         b[i] -= fix[i] * (1 - wa);
      }
      return n - len;
   }

   let simulate = (dt, H) => {
      for (let k in pts) {                                          // inertia + gravity + damping
         let P = pts[k];
         for (let i = 0 ; i < 3 ; i++) {
            let v = clamp((P.p[i] - P.q[i]) * .965, -.03, .03);   // speed cap, so a hard yank can't fling it away
            P.q[i] = P.p[i];
            P.p[i] += v - (i == 1 ? 9.8 * dt * dt * .6 : 0);
         }
      }
      tension = [0,0,0,0,0];
      for (let iter = 0 ; iter < 8 ; iter++) {
         let c = pts.chest.p, v = pts.pelvis.p;
         link(c, v, TORSO, .35, true);                              // torso
         let sho = { L: cg.add(c, [-SHO_W,0,0]), R: cg.add(c, [SHO_W,0,0]) };
         let hip = { L: cg.add(v, [-HIP_W,0,0]), R: cg.add(v, [HIP_W,0,0]) };
         for (let s of ['L','R']) {                                 // a limb can't stretch past its own length
            link(sho[s].slice(), pts['hand'+s].p, REACH, 0);
            link(hip[s].slice(), pts['foot'+s].p, REACH, 0);
            let f = pts['foot'+s].p;                                // and a foot can't sink through the stage
            if (f[1] < FLOOR && Math.hypot(f[0]-STAGE[0], f[2]-STAGE[2]) < .3) {
               f[1] = FLOOR;
               pts['foot'+s].q[0] = cg.mixf(pts['foot'+s].q[0], f[0], .5);   // ground friction
               pts['foot'+s].q[2] = cg.mixf(pts['foot'+s].q[2], f[2], .5);
            }
         }
         for (let i = 0 ; i < 5 ; i++)                              // strings: the handle stays put, only the point moves
            tension[i] = link(H[i].slice(), pts[ATTACH[i]].p, STRINGS[i].len, 0);
      }
      for (let i = 0 ; i < 5 ; i++)                                 // whatever stretch survives the solve is the tension
         tension[i] = Math.max(0, cg.distance(H[i], pts[ATTACH[i]].p) - STRINGS[i].len);
   }

   // ---------- Beam helper: a beam's origin and direction (in model space) ----------

   let ray = hand => {
      let bm  = beams[hand].beamMatrix();
      if (! bm || isNaN(bm[12])) return null;
      let inv = cg.mInverse(worldCoords);
      let o   = cg.mTransform(inv, bm.slice(12,15));
      let o2  = cg.mTransform(inv, cg.subtract(bm.slice(12,15), bm.slice(8,11)));
      return { o: o, dir: cg.normalize(cg.subtract(o2, o)) };
   }

   // Which handle is the beam pointing at? Returns { i, d } (d = distance along the beam), or null
   let pick = hand => {
      let r = ray(hand), best = null;
      if (! r) return null;
      for (let i = 0 ; i < 5 ; i++) {
         let v = cg.subtract(puppetStrings[i].p, r.o);
         let d = cg.dot(v, r.dir);
         if (d <= 0) continue;
         let off = cg.norm(cg.subtract(v, cg.scale(r.dir, d)));
         if (off < GRAB_R && (! best || off < best.off))
            best = { i: i, d: d, off: off };
      }
      return best;
   }

   // ---------- Who is holding which string ----------

   let me      = hand => clientID + ':' + hand;
   let isMine  = o => typeof o == 'string' && o.split(':')[0] == '' + window.clientID;
   let isAlive = o => {                                             // is the holder still in the room?
      if (! o) return false;
      if (! window.clients) return isMine(o);
      return clients.map(c => '' + c).includes(o.split(':')[0]);
   }
   let send = i => { try { server.broadcastGlobalElement('puppetStrings', i); } catch (e) { } }

   let held  = { left: null, right: null };                         // what each of my hands holds: { i, d }
   let hover = { left: -1, right: -1 };
   let lastTouched = -100;

   let letGo = (hand, snapped) => {
      let g = held[hand];
      if (! g) return;
      held[hand] = null;
      puppetStrings[g.i].o = '';
      send(g.i);
      if (snapped) buzz(hand, 1, 250);
   }

   inputEvents.onPress = hand => {
      let hit = pick(hand);
      if (! hit) return;
      let S = puppetStrings[hit.i];
      if (isAlive(S.o) && S.o != me(hand)) {                        // someone else (or my other hand) has it
         buzz(hand, .3, 40);
         return;
      }
      held[hand] = hit;
      S.o = me(hand);
      send(hit.i);
      buzz(hand, .7, 60);
   }

   inputEvents.onDrag = hand => {
      let g = held[hand], r = ray(hand);
      if (! g || ! r) return;
      let S = puppetStrings[g.i];
      if (S.o != me(hand)) { held[hand] = null; return; }           // someone took it from me
      let target = cg.add(r.o, cg.scale(r.dir, g.d));
      S.p = cg.mix(S.p, target, .5);                                // slight smoothing, so hand jitter doesn't reach the puppet
      send(g.i);
   }

   inputEvents.onRelease = hand => letGo(hand, false);

   // ---------- Every frame ----------

   model.animate(() => {
      puppetStrings = server.synchronize('puppetStrings');
      let t  = model.time;
      let dt = clamp(model.deltaTime || 1/60, 1/200, 1/30);

      for (let h in beams)
         beams[h].update();

      // 1. Handles nobody holds drift back to rest; after a long idle the puppet
      //    dances by itself (local only, never broadcast)

      let anyHeld = false;
      for (let i = 0 ; i < 5 ; i++)
         if (isAlive(puppetStrings[i].o))
            anyHeld = true;
      if (anyHeld)
         lastTouched = t;
      let auto = clamp((t - lastTouched - 6) / 2, 0, 1);            // 0: hanging quietly, 1: performing

      let H = [];
      for (let i = 0 ; i < 5 ; i++) {
         let S = puppetStrings[i];
         if (! isValid(S.p)) S.p = restPos(i);
         if (! isAlive(S.o)) {
            let home = restPos(i), w = 3.2 * t;
            if (auto > 0) {
               let dance = i == 0 ? [ .03*Math.sin(w/2), .025*Math.abs(Math.sin(w)), 0 ]
                         : i <  3 ? [ 0, .10*Math.max(0, Math.sin(w/2 + (i==1 ? 0 : Math.PI))), .04 ]
                         :          [ 0, .07*Math.max(0, Math.sin(w   + (i==3 ? 0 : Math.PI))), .03 ];
               home = cg.add(home, cg.scale(dance, auto));
            }
            S.p = cg.mix(S.p, home, 1 - Math.exp(-6 * dt));
         }
         H.push(S.p);
      }

      // 2. Physics

      simulate(dt, H);

      // 3. Strings I hold: tension -> vibration; pulled too far -> snaps free

      for (let hand of ['left','right']) {
         let g = held[hand];
         if (g) {
            let k = tension[g.i] / SNAP;
            if (k > 1)
               letGo(hand, true);
            else if (k > .08 && t % .05 < .025)
               buzz(hand, clamp(.15 + .85 * k, 0, 1), 30);
         }
         else {                                                     // beam sweeping across a handle: a light tick
            let hit = pick(hand), i = hit ? hit.i : -1;
            if (i >= 0 && i != hover[hand])
               buzz(hand, .25, 20);
            hover[hand] = i;
         }
      }

      // 4. A foot landing on the stage thumps whoever holds that foot

      for (let s of ['L','R']) {
         let k = 'foot'+s, P = pts[k];
         let onFloor = P.p[1] <= FLOOR + .002;
         if (onFloor && ! wasOnFloor[k])
            for (let hand of ['left','right'])
               if (held[hand] && ATTACH[held[hand].i] == k)
                  buzz(hand, .9, 50);
         wasOnFloor[k] = onFloor;
      }

      // 5. Place the puppet

      let c = pts.chest.p, v = pts.pelvis.p;
      let up = cg.normalize(cg.subtract(c, v));
      torso.placeLimb(cg.add(c, cg.scale(up, .02)), v, .036);
      let hc = cg.add(c, cg.scale(up, .075));
      head.identity().move(hc).scale(.042);
      nose.identity().move(cg.add(hc, [0,-.005,.042])).scale(.011);
      hat .identity().move(cg.add(hc, cg.scale(up, .055))).aimY(up).scale(.03,.035,.03);

      for (let s of ['L','R']) {
         let x = s == 'L' ? -1 : 1;
         let sho = cg.add(c, [x*SHO_W, 0, 0]), hip = cg.add(v, [x*HIP_W, 0, 0]);
         let pose = (L, A, B, aim) => {                             // two-link IK: A is the root, B the end
            let d = cg.subtract(B, A), n = cg.norm(d);
            if (n > REACH) B = cg.add(A, cg.scale(d, REACH / n));
            let J = cg.ik2(A, B, UPPER, LOWER, aim);
            if (isNaN(J[0])) J = cg.mix(A, B, .5);
            L.up.placeLimb(A, J, .013);
            L.lo.placeLimb(J, B, .011);
            L.joint.identity().move(J).scale(.016);
            L.end  .identity().move(B).scale(.02);
         }
         pose(limbs['hand'+s], sho, pts['hand'+s].p, [x, -.3, -1]);  // elbows bend outward and back
         pose(limbs['foot'+s], hip, pts['foot'+s].p, [x*.2, 0, 1]);  // knees bend forward
      }

      // 6. Strings and handles: white = free, yellow = mine, cyan = someone else's; redder the tighter

      for (let i = 0 ; i < 5 ; i++) {
         let S = puppetStrings[i], A = pts[ATTACH[i]].p;
         let end = i == 0 ? cg.add(hc, cg.scale(up, .09)) : A;      // the head string ties to the tip of the hat
         let k = clamp(tension[i] / SNAP, 0, 1);
         let slack = cg.distance(S.p, A) < STRINGS[i].len - .01;
         strings[i].placeLimb(S.p, end, .002 + .001 * k)
                   .color(slack ? [.5,.5,.5] : cg.mix([1,1,1], [3,0,0], k));

         let owned = isAlive(S.o), mine = owned && isMine(S.o);
         let lit = hover.left == i || hover.right == i;
         let col = mine ? [1,.8,.1] : owned ? [.1,.9,1] : [1,1,1];
         handles[i].identity().move(S.p).scale(lit && ! owned ? .03 : .024)
                   .color(cg.scale(col, lit || owned ? 1.6 : .8));
         halos[i].identity().move(S.p).scale(owned ? .04 + .004 * Math.sin(8*t) : 0)
                 .color(col);
      }
   });
}
