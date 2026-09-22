/*
   FOLLOW THE COACH — one or two players dance / work out with a small coach

   A small coach stands on a podium and changes pose every two beats. You face
   it and mirror it, as if looking in a mirror: when it raises the hand on your
   left, you raise your left hand. Two target spheres float in front of you (red
   for the left hand, blue for the right); put a controller inside one and that
   hand counts. Fitness mode adds squats, which you have to actually perform
   (the headset height has to drop).

   Haptics:
   - Both controllers tick softly on every beat (harder on the beat that changes
     pose), so you can hold the rhythm without watching
   - One beat before a change, the hand that has to travel far buzzes on its own:
     a "get ready to move this hand" cue
   - The nearer a hand gets to its target the denser the pulses; a click the
     moment it arrives
   - Everyone hits the same beat -> the coach jumps and throws a ring of light,
     and every controller gives one long buzz

   Beams:
   - Point at the icons beside the podium and pull the trigger: note = dance
     mode, dumbbell = fitness mode (switches for everyone)
   - Point at the coach and hold the trigger to enter choreography mode. The
     coach's arms follow your hands live and a pose is recorded every two beats;
     after four poses (or when you release) the coach loops the routine you made
     so the other player can mirror it

   Multiplayer: the beat comes from the system clock, so every player sees the
   coach in sync without any syncing. Inside the shared coach state, mode / live
   / each player's score are separate elements, and each is broadcast on its own,
   so nobody overwrites anyone. The eight beads around the stage are the combo
   counter: they light only while everyone keeps hitting, and filling all eight
   sets off fireworks.

   Music: one track for dance and one for fitness, synthesized live with
   WebAudio (no audio files), aligned with the beat and the haptics. Browsers
   require one click or trigger press before any sound can play.

   With no headset connected, a pair of ghost hands demonstrates the routine, so
   the scene can be previewed on a desktop.
*/

import * as cg from "../../render/core/cg.js";
import { ControllerBeam } from "../../render/core/controllerInput.js";

// ---------- Pose library. Per hand: [outward, height relative to the head, forward] (life size, metres) ----------

const DOWN = [.25,-.75,.05], UP   = [.20, .30,.05], OUT   = [.65,-.20,  0], FWD = [.15,-.25,.55],
      HIGH = [.45, .25,  0], CHEST= [.10,-.30,.25], CROSS = [-.2,-.25,.35];

// a = the coach's hand on your left (mirrored), b = the one on your right.
// squat: crouch down, feet: feet apart, sway: hip sway
const DANCE = [
   { a: UP   , b: DOWN , sway:-1 }, { a: DOWN , b: UP   , sway: 1 },
   { a: OUT  , b: OUT  , sway: 0 }, { a: HIGH , b: HIGH , sway: 0 },
   { a: OUT  , b: CHEST, sway:-1 }, { a: CHEST, b: OUT  , sway: 1 },
   { a: CROSS, b: CROSS, sway: 0 }, { a: UP   , b: UP   , sway: 0 },
];
const FIT = [
   { a: HIGH , b: HIGH , feet: 1 }, { a: DOWN , b: DOWN  },             // jumping jack
   { a: FWD  , b: FWD  , squat:1 }, { a: DOWN , b: DOWN  },             // squat
   { a: FWD  , b: CHEST          }, { a: CHEST, b: FWD   },             // left / right punch
   { a: UP   , b: UP             }, { a: FWD  , b: FWD  , squat:1 },    // press + squat
];
const BEAT = { dance: .6, fit: .75 };            // seconds per beat
const TOL  = .28;                                // how near a hand must be to count (metres)

// ---------- Layout ----------

const BASE = [0, .55, -1.1];                     // centre of the podium's top face
const S    = .5;                                 // the coach is half life size
const BTN  = { dance: cg.add(BASE, [-.55,.35,0]), fit: cg.add(BASE, [.55,.35,0]) };

// ---------- Shared state ----------

window.coach = { mode: { mode: 'dance', custom: null, rec: -1 },   // current mode / custom routine / who is choreographing
                 live: { a: DOWN, b: DOWN, squat: 0 } };           // the choreographer's pose right now
                                                                   // plus one 'p'+id per player: { k, ok }
export const init = async model => {

   const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
   const ease  = t => t * t * (3 - 2 * t);
   const isVec = p => Array.isArray(p) && p.length >= 3 && ! isNaN(p[0]) && cg.norm(p) > 0;
   const buzz  = (hand, intensity, duration) => {
      try { if (window.vibrate) vibrate(hand, intensity, duration); } catch (e) { }
   }
   const send  = key => { try { server.broadcastGlobalElement('coach', key); } catch (e) { } }
   const alive = id => window.clients ? clients.map(c => '' + c).includes('' + id) : id == window.clientID;

   // ---------- Music: synthesized live with WebAudio, no audio files needed ----------
   // Notes are scheduled against the system clock's beat, so the music, the coach's
   // motion and the controllers' beat ticks all line up — and everyone hears the same
   // beat in their own headset. Dance = a four-beat groove in A minor, fitness = a
   // driving pattern in E minor.

   const SONG = {
      dance: { roots: [57,53,48,55], minor: [1,0,0,0] },           // Am F C G
      fit  : { roots: [52,48,50,52], minor: [1,0,0,1] },           // Em C D Em
   };
   let actx = null, master = null, noiseBuf = null, nextStep = -1, songMode = '';
   let audioOn = () => {
      try {
         if (! actx) {
            actx = new (window.AudioContext || window.webkitAudioContext)();
            master = actx.createGain();
            master.gain.value = .22;
            master.connect(actx.destination);
            noiseBuf = actx.createBuffer(1, actx.sampleRate / 2, actx.sampleRate);
            let d = noiseBuf.getChannelData(0);
            for (let i = 0 ; i < d.length ; i++) d[i] = 2 * Math.random() - 1;
         }
         if (actx.state == 'suspended') actx.resume();            // browsers need one click / trigger first
      } catch (e) { actx = null; }
      return actx && actx.state == 'running';
   }
   if (window._coachAudioHook) removeEventListener('pointerdown', window._coachAudioHook);
   window._coachAudioHook = audioOn;
   addEventListener('pointerdown', audioOn);

   let hz = midi => 440 * Math.pow(2, (midi - 69) / 12);
   let env = (when, dur, vol) => {
      let g = actx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(vol, when + .005);
      g.gain.exponentialRampToValueAtTime(.001, when + dur);
      g.connect(master);
      return g;
   }
   let tone = (type, midi, when, dur, vol, cutoff) => {
      let o = actx.createOscillator(), f = actx.createBiquadFilter();
      o.type = type;
      o.frequency.value = hz(midi);
      f.type = 'lowpass';
      f.frequency.value = cutoff ?? 4000;
      o.connect(f).connect(env(when, dur, vol));
      o.start(when);
      o.stop(when + dur + .05);
   }
   let kick = (when, vol) => {
      let o = actx.createOscillator();
      o.frequency.setValueAtTime(150, when);
      o.frequency.exponentialRampToValueAtTime(42, when + .12);
      o.connect(env(when, .22, vol));
      o.start(when);
      o.stop(when + .3);
   }
   let noise = (when, dur, vol, type, freq) => {
      let n = actx.createBufferSource(), f = actx.createBiquadFilter();
      n.buffer = noiseBuf;
      f.type = type;
      f.frequency.value = freq;
      n.connect(f).connect(env(when, dur, vol));
      n.start(when);
      n.stop(when + dur + .05);
   }

   // 16 steps per bar (4 per beat), and the chord progression cycles every 4 bars
   let playStep = (m, n, when, hype) => {
      let s = n % 16, bar = Math.floor(n / 16) % 4, song = SONG[m];
      let root = song.roots[bar], third = song.minor[bar] ? 3 : 4;
      if (m == 'dance') {
         if (s % 4 == 0) kick(when, .9);
         if (s % 8 == 4) noise(when, .12, .35, 'bandpass', 1800);                // clap
         if (s % 2 == 1) noise(when, .03, .10, 'highpass', 8000);                // closed hat
         if (s % 4 == 2) { noise(when, .09, .16, 'highpass', 7000);              // offbeat open hat + bass
                           tone('sawtooth', root - 24, when, .16, .5, 500); }
         if (s % 2 == 0) {                                                       // arpeggio, brighter with a longer combo
            let notes = [root, root + third, root + 7, root + 12];
            tone('square', notes[[0,2,1,2,3,2,1,2][s / 2]] + 12, when, .13, .10, 1200 + 3000 * hype);
         }
      }
      else {
         if (s % 4 == 0 || s == 10) kick(when, 1);
         if (s % 8 == 4) noise(when, .16, .45, 'bandpass', 1200);                // snare
         if (s % 2 == 0) noise(when, .03, .08, 'highpass', 9000);
         tone('sawtooth', root - 24, when, .1, s % 4 == 0 ? .45 : .28, 380 + 500 * hype);   // sixteenth-note bass
         if (s == 0 || s == 6 || s == 12)                                        // power chord
            for (let iv of [0, 7, 12])
               tone('sawtooth', root - 12 + iv, when, .3, .12, 1500);
      }
   }
   let ding = ok => {                                                            // I hit it / everyone hit it
      if (! audioOn()) return;
      let t = actx.currentTime + .01;
      if (ok == 1) tone('triangle', 88, t, .18, .25);
      else for (let i = 0 ; i < 3 ; i++) tone('triangle', [81,85,88][i] , t + .07 * i, .4, .22);
   }

   // ---------- Podium, combo beads, mode icons ----------

   model.add('tubeY').move(cg.add(BASE, [0,-.28,0])).scale(.34,.28,.34).color(.12,.12,.18);
   let rim = model.add('tubeY').move(cg.add(BASE, [0,-.005,0])).scale(.36,.006,.36);

   let beads = [];
   for (let i = 0 ; i < 8 ; i++) {
      let th = Math.PI * (i + .5) / 8;                              // a half circle facing the player
      beads.push(model.add('sphere').move(cg.add(BASE, [-.42*Math.cos(th), .02, .42*Math.sin(th)])).scale(.022));
   }

   let icon = { dance: model.add(), fit: model.add() };
   icon.dance.add('sphere').move(-.03,-.05,0).scale(.04,.03,.03);   // musical note
   icon.dance.add('tubeY' ).move(.005,.02,0).scale(.006,.07,.006);
   icon.dance.add('cube'  ).move(.03,.075,0).scale(.03,.014,.006);
   icon.fit  .add('tubeX' ).scale(.07,.01,.01);                     // dumbbell
   icon.fit  .add('tubeX' ).move(-.07,0,0).scale(.018,.04,.04);
   icon.fit  .add('tubeX' ).move( .07,0,0).scale(.018,.04,.04);

   // ---------- The coach's body ----------

   const SKIN = [.95,.75,.55], SHIRT = [.15,.55,.9], PANTS = [.2,.2,.3];
   let part   = (shape, c) => model.add(shape).color(c);
   let torso  = part('tubeZ', SHIRT), hips = part('sphere', PANTS), head = part('sphere', SKIN);
   let band   = part('tubeY', [.9,.2,.2]);
   let eyes   = [ part('sphere', [0,0,0]), part('sphere', [0,0,0]) ];
   let limb   = c => ({ up: part('tubeZ', c), lo: part('tubeZ', c), joint: part('sphere', c), end: part('sphere', SKIN) });
   let arms   = { a: limb(SHIRT), b: limb(SHIRT) }, legs = { a: limb(PANTS), b: limb(PANTS) };
   let rings  = [ model.add('tubeY').opacity(.5), model.add('tubeY').opacity(.5) ];

   // My own target spheres and ghost hands
   let targets = { left: model.add('sphere').opacity(.45), right: model.add('sphere').opacity(.45) };
   let ghosts  = { left: model.add('sphere'), right: model.add('sphere') }, ghostPos = {};

   let beams = { left: new ControllerBeam(model, 'left'), right: new ControllerBeam(model, 'right') };

   // ---------- Beams: which point is it aimed at? ----------

   let ray = hand => {
      let bm = beams[hand].beamMatrix();
      if (! bm || isNaN(bm[12])) return null;
      let inv = cg.mInverse(worldCoords);
      let o   = cg.mTransform(inv, bm.slice(12,15));
      let o2  = cg.mTransform(inv, cg.subtract(bm.slice(12,15), bm.slice(8,11)));
      return { o: o, dir: cg.normalize(cg.subtract(o2, o)) };
   }
   let pointsAt = (hand, P, radius) => {
      let r = ray(hand);
      if (! r) return false;
      let v = cg.subtract(P, r.o), d = cg.dot(v, r.dir);
      return d > 0 && cg.norm(cg.subtract(v, cg.scale(r.dir, d))) < radius;
   }

   // ---------- State ----------

   let mode    = () => coach.mode && BEAT[coach.mode.mode] ? coach.mode : { mode: 'dance', custom: null, rec: -1 };
   let recID   = () => { let m = mode(); return m.rec !== undefined && m.rec != -1 && alive(m.rec) ? m.rec : -1; }
   let poses   = () => { let m = mode(); return Array.isArray(m.custom) && m.custom.length ? m.custom
                                              : m.mode == 'fit' ? FIT : DANCE; }
   let poseAt  = k => { let L = poses(); return L[((k % L.length) + L.length) % L.length]; }

   let shown   = { a: DOWN.slice(), b: DOWN.slice(), squat: 0, feet: 0, sway: 0 };   // how the coach looks right now
   let chest   = cg.add(BASE, [0,.6,0]), headPos = cg.add(BASE, [0,.75,0]);
   let lastK = -1, lastBeat = -1, judged = -1, myHit = false, nearT = 0;
   let combo = 0, jump = 0, burst = [9,9], fireworks = 9;
   let standH = 0, recording = null, snaps = [], nextPulse = { left: 0, right: 0 };

   // My (or the ghost's) body frame, facing the coach. Returns where both hands sit in that frame
   let bodyFrame = (headP) => {
      let f = cg.normalize([BASE[0] - headP[0], 0, BASE[2] - headP[2]]);
      let r = [-f[2], 0, f[0]];
      return { f: f, r: r, aIsLeft: r[0] >= 0,                       // does the coach's hand a map to my left hand?
               toWorld: v => cg.add(headP, cg.add(cg.add(cg.scale(r, v[0]), [0,v[1],0]), cg.scale(f, v[2]))),
               toBody : P => { let v = cg.subtract(P, headP); return [cg.dot(v, r), v[1], cg.dot(v, f)]; } };
   }

   // ---------- Trigger: switch mode / start choreographing ----------

   inputEvents.onPress = hand => {
      audioOn();
      for (let m in BTN)
         if (pointsAt(hand, BTN[m], .1)) {
            coach.mode = { mode: m, custom: null, rec: -1 };
            send('mode');
            buzz(hand, .8, 80);
            return;
         }
      if (recID() == -1 && pointsAt(hand, chest, .3)) {
         recording = hand;
         snaps = [];
         coach.mode = { mode: mode().mode, custom: mode().custom, rec: clientID };
         send('mode');
         buzz(hand, 1, 120);
      }
   }
   inputEvents.onRelease = hand => {
      if (recording == hand)
         finishRecording();
   }
   let finishRecording = () => {
      recording = null;
      coach.mode = { mode: mode().mode, custom: snaps.length >= 2 ? snaps : mode().custom, rec: -1 };
      send('mode');
      buzz('left', 1, 200); buzz('right', 1, 200);
   }

   // ---------- Every frame ----------

   model.animate(() => {
      coach = server.synchronize('coach');
      if (! coach || typeof coach != 'object') coach = { };
      let dt = clamp(model.deltaTime || 1/60, 1/200, 1/20);
      for (let h in beams) beams[h].update();

      let M = mode(), beat = BEAT[M.mode], clock = Date.now() / 1000;
      let k = Math.floor(clock / (2*beat));                          // which pose
      let u = clock / beat % 2;                                      // how far into this pose, in beats (0..2)
      let beatNo = Math.floor(clock / beat);
      let rec = recID();

      // 1. Where am I? Use the real controllers if there are any, otherwise the ghosts

      let headM = clientState.head(clientID);
      let L = inputEvents.pos('left'), R = inputEvents.pos('right');
      let real = Array.isArray(headM) && isVec(L) && isVec(R);
      let headP = real ? headM.slice(12,15) : [.0, 1.6, .4];
      standH = real ? Math.max(standH - .01 * dt, headP[1]) : 1.6;   // head height when standing (decays slowly, so it adapts to a new player)
      let size = clamp(standH / 1.65, .6, 1.2);
      let frame = bodyFrame(headP);

      let target = poseAt(k);
      let want = { left : frame.aIsLeft ? target.a : target.b,
                   right: frame.aIsLeft ? target.b : target.a };
      let goal = {};
      for (let h in want)
         goal[h] = frame.toWorld([ (h == 'left' ? -1 : 1) * want[h][0] * size, want[h][1] * size, want[h][2] * size ]);

      let hands = { left: L, right: R };
      if (! real) {                                                  // ghost hands: chase the target half a beat behind
         for (let h in ghosts) {
            ghostPos[h] = cg.mix(ghostPos[h] ?? goal[h], goal[h], 1 - Math.exp(-5 * dt));
            hands[h] = ghostPos[h];
         }
      }
      for (let h in ghosts)
         ghosts[h].identity().move(hands[h]).scale(real ? 0 : .04).color(h == 'left' ? [1,.5,.5] : [.5,.6,1]);

      let squatting = real ? headP[1] < standH - .2 * size : !! target.squat && u > .8 && k % 5 != 4;

      // 2. While choreographing: broadcast my pose live, and record one every time the pose changes

      if (recording) {
         let side = h => { let v = frame.toBody(hands[h]);
                           return [ (h == 'left' ? -1 : 1) * v[0] / size, v[1] / size, v[2] / size ].map(x => +x.toFixed(3)); }
         let l = side('left'), r = side('right');
         coach.live = { a: frame.aIsLeft ? l : r, b: frame.aIsLeft ? r : l, squat: squatting ? 1 : 0 };
         send('live');
         if (k != lastK && lastK != -1) {
            snaps.push(coach.live);
            buzz(recording, .9, 60);
            if (snaps.length >= 4)
               finishRecording();
         }
      }

      // 3. Beat haptics

      if (beatNo != lastBeat) {
         let strong = beatNo % 2 == 0;
         for (let h of ['left','right'])
            buzz(h, strong ? .55 : .2, strong ? 45 : 25);
         if (! strong && rec == -1) {                                // the pose changes next beat: cue the hand that has to travel far
            let next = poseAt(k+1);
            let nw = { left: frame.aIsLeft ? next.a : next.b, right: frame.aIsLeft ? next.b : next.a };
            for (let h in nw)
               if (cg.distance(nw[h], want[h]) > .4)
                  buzz(h, .9, 90);
         }
         lastBeat = beatNo;
      }

      // 3b. Music: schedule the next 0.15 seconds of notes onto WebAudio's timeline

      if (audioOn()) {
         let step = beat / 4, stepNow = clock / step;
         if (songMode != M.mode || nextStep < stepNow - 8) {
            songMode = M.mode;
            nextStep = Math.ceil(stepNow);
         }
         master.gain.value = rec != -1 ? .08 : .22;                  // duck the music while choreographing
         while (nextStep * step < clock + .15) {
            playStep(M.mode, nextStep, actx.currentTime + Math.max(0, nextStep * step - clock), clamp(combo / 8, 0, 1));
            nextStep++;
         }
      }

      // 4. Scoring: during the second beat, both hands inside their targets counts
      //    (a squat pose also requires actually crouching)

      if (k != lastK) {
         if (lastK != -1 && rec == -1 && real && ! myHit) {          // missed the previous pose
            coach['p'+clientID] = { k: lastK, ok: false };
            send('p'+clientID);
         }
         myHit = false;
         nearT = 0;
         lastK = k;
      }
      let acc = {}, ok = true;
      for (let h in goal) {
         let d = cg.distance(hands[h], goal[h]);
         acc[h] = clamp(1 - d / (2*TOL), 0, 1);
         if (d > TOL) ok = false;
      }
      if (target.squat && ! squatting) ok = false;
      if (rec == -1 && ! myHit) {
         for (let h in acc)                                          // the closer, the denser the pulses
            if (real && acc[h] > .2 && clock > nextPulse[h]) {
               buzz(h, .25 + .4 * acc[h], 20);
               nextPulse[h] = clock + .3 - .24 * acc[h];
            }
         nearT = ok ? nearT + dt : 0;
         if (u > .7 && nearT > .12) {
            myHit = true;
            buzz('left', 1, 50); buzz('right', 1, 50);               // the click
            ding(1);
            if (real) {
               coach['p'+clientID] = { k: k, ok: true };
               send('p'+clientID);
            }
         }
      }

      // 5. How did everyone do on the previous pose? (wait 0.3 of a beat so scores arrive over the network)

      if (u > .3 && judged != k - 1 && rec == -1) {
         judged = k - 1;
         let n = 0, good = 0;
         for (let key in coach) {
            let p = coach[key];
            if (key[0] == 'p' && p && p.k == k - 1 && alive(key.slice(1))) {
               n++;
               if (p.ok) good++;
            }
         }
         if (n == 0 && ! real) {                                     // nobody real: judge the ghost's performance
            n = 1;
            good = (k - 1) % 5 != 4 ? 1 : 0;
         }
         if (n > 0 && good == n) {
            combo++;
            jump = 1;
            ding(2);
            burst[0] = 0;
            if (n > 1) burst[1] = -.15;                              // both players hit: a second ring + one long shared buzz
            for (let h of ['left','right']) buzz(h, n > 1 ? 1 : .6, n > 1 ? 300 : 120);
            if (combo >= 8) { combo = 0; fireworks = 0; }
         }
         else if (n > 0)
            combo = 0;
      }

      // 6. The coach's pose: follow live while choreographing, otherwise slide from the
      //    previous pose to this one across the two beats

      let aim;
      if (rec != -1 && coach.live && isVec(coach.live.a) && isVec(coach.live.b))
         aim = { a: coach.live.a, b: coach.live.b, squat: coach.live.squat ? 1 : 0, feet: 0, sway: 0 };
      else {
         let p0 = poseAt(k-1), p1 = target, t = ease(clamp(u / .7, 0, 1));
         aim = { a: cg.mix(p0.a, p1.a, t), b: cg.mix(p0.b, p1.b, t),
                 squat: cg.mixf(p0.squat ?? 0, p1.squat ?? 0, t), feet: cg.mixf(p0.feet ?? 0, p1.feet ?? 0, t),
                 sway : cg.mixf(p0.sway  ?? 0, p1.sway  ?? 0, t) };
      }
      let follow = 1 - Math.exp(-18 * dt);
      shown.a = cg.mix(shown.a, aim.a, follow);
      shown.b = cg.mix(shown.b, aim.b, follow);
      for (let key of ['squat','feet','sway'])
         shown[key] = cg.mixf(shown[key], aim[key], follow);

      // 7. Place the coach

      let hype  = clamp(combo / 8, 0, 1);                            // the longer the combo, the more hyped
      let bob   = M.mode == 'dance' ? (.025 + .03 * hype) * Math.abs(Math.sin(Math.PI * clock / beat)) : 0;
      jump = Math.max(0, jump - dt / .45);
      let air   = .22 * Math.sin(Math.PI * jump) + (fireworks < 1.5 ? .1 * Math.abs(Math.sin(8 * fireworks)) : 0);
      let legUp = .42 * S, legLo = .42 * S, armUp = .3 * S, armLo = .3 * S;
      let pelvisY = (legUp + legLo - .01) * (1 - .45 * shown.squat) - bob;
      let pelvis  = cg.add(BASE, [ .05 * shown.sway * (1 + hype), pelvisY + air, -.06 * shown.squat ]);
      chest   = cg.add(pelvis, [ -.02 * shown.sway, .5 * S, .1 * S * shown.squat ]);
      headPos = cg.add(chest, [ 0, .3 * S, .02 * shown.squat ]);

      torso.placeLimb(chest, pelvis, .13 * S);
      hips .identity().move(pelvis).scale(.15 * S, .1 * S, .13 * S);
      head .identity().move(headPos).scale(.13 * S);
      band .identity().move(cg.add(headPos, [0,.06*S,0])).scale(.125*S, .02*S, .125*S);
      for (let i = 0 ; i < 2 ; i++)
         eyes[i].identity().move(cg.add(headPos, [(i ? 1 : -1) * .05 * S, .01, .115 * S])).scale(.02 * S);

      let pose2 = (Lb, A, B, l1, l2, r, elbow) => {
         let d = cg.subtract(B, A), n = cg.norm(d), reach = l1 + l2 - .003;
         if (n > reach) B = cg.add(A, cg.scale(d, reach / n));
         let J = cg.ik2(A, B, l1, l2, elbow);
         if (isNaN(J[0])) J = cg.mix(A, B, .5);
         Lb.up.placeLimb(A, J, r);
         Lb.lo.placeLimb(J, B, r * .85);
         Lb.joint.identity().move(J).scale(r * 1.15);
         Lb.end  .identity().move(B).scale(r * 1.5);
         return B;
      }
      let handAt = {};
      for (let s of ['a','b']) {
         let x = s == 'a' ? -1 : 1, p = shown[s];
         let sho = cg.add(chest, [x * .2 * S, .02, 0]);
         let tip = cg.add(headPos, [x * p[0] * S, p[1] * S, p[2] * S]);
         handAt[s] = pose2(arms[s], sho, tip, armUp, armLo, .045 * S, [x, -.6, -.8]);
         let hip  = cg.add(pelvis, [x * .09 * S, 0, 0]);
         let foot = cg.add(BASE, [x * (.1 + .22 * shown.feet) * S, .02 + air * (1 + .3 * shown.feet), 0]);
         pose2(legs[s], hip, foot, legUp, legLo, .055 * S, [x * .3, 0, 1]);
      }

      // The coach's hands: the one matching my left hand is reddish, my right bluish;
      // both brighten when I hit the pose
      let lit = myHit ? 2 : 1;
      arms[frame.aIsLeft ? 'a' : 'b'].end.color(cg.scale([1,.35,.35], lit));
      arms[frame.aIsLeft ? 'b' : 'a'].end.color(cg.scale([.35,.5,1], lit));
      torso.color(rec != -1 ? [1,.75,.1] : cg.mix(SHIRT, [.4,1,1], hype));   // the coach turns yellow while being choreographed

      // 8. My target spheres (hidden while choreographing)

      for (let h in targets) {
         let c = h == 'left' ? [1,.25,.25] : [.25,.4,1];
         let show = rec == -1;
         targets[h].identity().move(goal[h]).scale(show ? (myHit ? .05 : .075 - .02 * acc[h]) : 0)
                   .color(myHit ? [.3,2,.5] : cg.scale(c, .6 + 1.2 * acc[h]));
      }

      // 9. Rings, fireworks, combo beads, icons

      for (let i = 0 ; i < 2 ; i++) {
         burst[i] += dt / .7;
         let b = burst[i], on = b > 0 && b < 1;
         rings[i].identity().move(cg.add(BASE, [0, .01 + .1 * i, 0]))
                 .scale(on ? .36 + 1.2 * b : 0, .004, on ? .36 + 1.2 * b : 0)
                 .color(i ? [1,.9,.3] : [.3,1,1]).opacity(on ? .6 * (1 - b) : .001);
      }
      fireworks += dt;
      for (let i = 0 ; i < 8 ; i++) {
         let on = i < combo, fw = fireworks < 1.5;
         let th = Math.PI * (i + .5) / 8;
         let P  = cg.add(BASE, [-.42*Math.cos(th), .02, .42*Math.sin(th)]);
         if (fw) P = cg.add(P, [0, 1.2 * fireworks - .6 * fireworks * fireworks + .1 * Math.sin(20*fireworks + i), 0]);
         beads[i].identity().move(P).scale(fw ? .03 : on ? .028 : .018)
                 .color(fw ? [2 * Math.abs(Math.sin(i+9*fireworks)), 1.5, 2 * Math.abs(Math.cos(i+7*fireworks))]
                           : on ? [.4,2,2] : [.2,.2,.25]);
      }
      let pulse = u < .25 ? 1 - u / .25 : 0;                         // the podium rim flashes on the beat
      rim.color(cg.mix([.15,.2,.3], M.mode == 'fit' ? [1.5,.5,.2] : [.4,.6,2], .3 + .7 * pulse));

      for (let m in icon) {
         let active = M.mode == m && ! (Array.isArray(M.custom) && M.custom.length);
         let hot = pointsAt('left', BTN[m], .1) || pointsAt('right', BTN[m], .1);
         icon[m].identity().move(BTN[m]).turnY(.6 * Math.sin(clock)).scale(hot ? 1.6 : 1.3);
         for (let i = 0 ; i < icon[m].nChildren() ; i++)
            icon[m].child(i).color(active ? (m == 'fit' ? [2,.7,.2] : [.5,.8,2]) : hot ? [1,1,1] : [.35,.35,.4]);
      }
   });
}
