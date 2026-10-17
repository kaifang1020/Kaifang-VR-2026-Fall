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

   Multiplayer: the first connected headset shares its beat clock, so other
   players and desktop spectators follow the same coach pose. The shared mode / live
   / each player's score are separate elements, and each is broadcast on its own,
   so nobody overwrites anyone. The eight beads around the stage are the combo
   counter: they light only while everyone keeps hitting, and filling all eight
   sets off fireworks. Other players also appear as full-body avatars inferred
   from their already shared headset and controller positions.

   Music: one track for dance and one for fitness, synthesized live with
   WebAudio (no audio files), aligned with the beat and the haptics. Browsers
   require one click or trigger press before any sound can play.

   Rounds: point at START and pull the trigger (desktop: Space). After a short
   countdown the next 24 poses are scored. A hit is PERFECT (100) when it is
   early and well centred, otherwise GOOD (60); every fourth hit in a row raises
   the multiplier by a quarter, up to double. Reach 1200 points to win. Text
   shows the score, multiplier, combo and pose count while playing, the grade of
   every pose, and YOU WIN / YOU LOST with a rank at the end. In multiplayer the
   round starts for everyone and each player's score is shared. Outside a round
   the scene is free practice, exactly as before.

   With no headset connected, a pair of ghost hands demonstrates the routine, so
   the scene can be previewed on a desktop.

   Files: coach.js (this scene), music.js (synthesizer), scoreRules.js (scoring,
   tested by scoreRules.test.mjs), coachAvatarPose.js (partner avatars).
*/

import * as cg from "../../render/core/cg.js";
import { ControllerBeam } from "../../render/core/controllerInput.js";
import { coachAvatarPose } from "./coachAvatarPose.js";
import { askAIJson } from "../../util/aiquery.js";
import { coachReplyPrompt, coachTextPrompt, validateCoachReply } from "./coachAI.js";
import { mountCoachPromptUI } from "./coachPromptUI.js";
import { createCoachPromptBoard } from "./coachPromptBoard.js";
import { createCoachKeyboard } from "./coachKeyboard.js";
import { createCoachClock } from "./coachClock.js";
import { createMusic } from "./music.js";
import { RoundScore, roundPhase, gradeOf, ROUND_POSES, COUNTDOWN_POSES, activePlayers, teamResult } from "./scoreRules.js";
import { DOWN, DANCE, FIT, BEAT, poseIndex, poseAt as routinePoseAt } from "./coachRoutine.js";

// ---------- Pose library. Per hand: [outward, height relative to the head, forward] (life size, metres) ----------

const TOL  = .28;                                // how near a hand must be to count (metres)

// ---------- Layout ----------

const BASE = [0, .55, -1.1];                     // centre of the podium's top face
const S    = .5;                                 // the coach is half life size
const BTN  = { dance: cg.add(BASE, [-.55,.35,0]), fit: cg.add(BASE, [.55,.35,0]) };

// ---------- Shared state ----------

window.coach = { mode: { mode: 'dance', custom: null, rec: -1 },   // current mode / custom routine / who is choreographing
                 live: { a: DOWN, b: DOWN, squat: 0 },             // the choreographer's pose right now
                 round: null };                                    // the scored round: { k0, n }, or null for free practice
                                                                   // plus one 'p'+id per player: { k, ok, s: score, r: round }
let cleanup = () => {};
export const deinit = () => cleanup();
export const init = async model => {
   cleanup();
   let active = true;

   const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
   const ease  = t => t * t * (3 - 2 * t);
   const isVec = p => Array.isArray(p) && p.length >= 3 && ! isNaN(p[0]) && cg.norm(p) > 0;
   const buzz  = (hand, intensity, duration) => {
      try { if (window.vibrate) vibrate(hand, intensity, duration); } catch (e) { }
   }
   const send  = key => { try { server.broadcastGlobalElement('coach', key); } catch (e) { } }
   const alive = id => window.clients ? clients.map(c => '' + c).includes('' + id) : id == window.clientID;
   const sharedClock = createCoachClock();
   let lastClockSend = -Infinity;

   const music = createMusic();

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

   // Center each line using the line font's fixed character spacing. Rebuild
   // a text mesh only when its content changes, rather than on every frame.
   const textLine = (id, position, scale, color) => {
      const name = 'coachText_' + id;
      let node = null, previous = null;
      return text => {
         if (text === previous) return;
         previous = text;
         clay.defineTextMesh(name, text);
         if (!node) node = model.add(name).color(color).dull();
         const width = text.length ? .019 * (text.length - 1) + .015 : 0;
         node.identity().move(position[0] - width * scale / 2, position[1], position[2]).scale(scale);
      };
   };
   textLine('title', [0, 1.95, BASE[2]], 1.8, [.85,.95,1])('FOLLOW THE COACH');
   const setStatus = textLine('status', [0, 1.85, BASE[2]], 1.25, [.5,1,.85]);
   for (const m of ['dance', 'fit'])
      textLine(m, cg.add(BTN[m], [0,-.18,.03]), 1.35,
               m === 'dance' ? [.5,.8,1] : [1,.65,.3])(m === 'dance' ? 'DANCE' : 'FITNESS');
   const setHelp1 = textLine('help1', [0,.43,BASE[2]+.39], 1.05, [.9,.95,1]);
   const setHelp2 = textLine('help2', [0,.36,BASE[2]+.39], 1.05, [.9,.95,1]);
   const setHelp3 = textLine('help3', [0,.29,BASE[2]+.39], .95, [.6,.8,1]);
   const setScore = textLine('score', [0, 1.75, BASE[2]], 1.6, [1,.85,.4]);
   const setPopup = textLine('popup', [0, 1.5, BASE[2]+.35], 1.7, [1,1,1]);
   const START = [0, 1.63, BASE[2]];
   const startButton = model.add('cube').color(.1,.38,.3);
   const setStart = textLine('start', [START[0], START[1]-.012, START[2]+.03], 1.3, [.9,1,.95]);
   const promptBoard = createCoachPromptBoard(model);
   const keyboard = createCoachKeyboard(model, textLine, { centre: [.42, 1.0, -.6] });   // typing the AI prompt inside VR
   let watchingPartner = false;

   const updateText = () => {
      const recorder = recID();
      const ai = mode().ai;
      promptBoard.update(ai);
      if (recorder != -1) {
         const mine = recording && recorder == clientID;
         setStatus(mine ? 'RECORDING ' + snaps.length + '/4' : 'OTHER PLAYER RECORDING');
         setHelp1(mine ? 'Pose on the beat - wait for the buzz' : 'Watch the coach follow their hands');
         setHelp2(mine ? 'Release to finish (at least 2 poses)' : 'Your new routine will play next');
         setHelp3(mine ? '4 poses finish automatically' : 'Recording up to 4 poses');
      }
      else if (ai?.state == 'thinking' && round.phase == 'free') {
         setStatus(ai.source == 'prompt' ? 'AI IS MAKING YOUR ROUTINE' : 'AI IS WRITING A RESPONSE');
         setHelp1(ai.source == 'prompt' ? 'Your prompt is being turned into moves' : 'Your recorded phrase is playing now');
         setHelp2(ai.source == 'prompt' ? 'The current routine plays while you wait' : 'The coach will add four response poses');
         setHelp3('DANCE or FITNESS cancels the request');
      }
      else if (ai?.state == 'ready' && round.phase == 'free') {
         const total = poses().length;
         const index = Math.max(0, kNow - ai.startK) % total;
         const humanPart = ai.source != 'prompt' && index < ai.humanCount;
         setStatus(ai.source == 'prompt' ? 'AI ROUTINE ' + (index + 1) + '/' + total
                  : humanPart ? 'YOUR MOVES ' + (index + 1) + '/' + ai.humanCount
                              : 'AI RESPONSE ' + (index - ai.humanCount + 1) + '/4');
         setHelp1(ai.title);
         setHelp2(ai.source == 'prompt' ? 'Generated from your text prompt'
                                        : 'Your phrase and the AI answer loop together');
         setHelp3('Point at START for a scored round');
      }
      else if (ai?.state == 'error' && round.phase == 'free') {
         setStatus('AI UNAVAILABLE - YOUR MOVES PLAY');
         setHelp1('Your recorded phrase is saved');
         setHelp2('Record again to retry the AI response');
         setHelp3('DANCE or FITNESS restores default moves');
      }
      else if (round.phase == 'countdown') {
         setStatus('GET READY');
         setHelp1('Mirror the coach: its left is your left');
         setHelp2('Put both hands in the glowing targets');
         setHelp3('Early and centred = PERFECT');
      }
      else if (round.phase == 'playing') {
         setStatus('POSE ' + (round.index+1) + '/' + round.count + ' - Match both hand targets');
         setHelp1('PERFECT 100   GOOD 60   MISS 0');
         setHelp2('Every 4 hits in a row: multiplier up');
         setHelp3('Reach ' + tally.goal + ' points to win');
      }
      else if (round.phase == 'done') {
         setStatus('ROUND OVER - Point at PLAY AGAIN');
         setHelp1('PERFECT ' + tally.perfect + '   GOOD ' + tally.good + '   MISS ' + tally.missed);
         setHelp2('Best combo ' + tally.best);
         setHelp3('DANCE or FITNESS returns to free practice');
      }
      else if (watchingPartner) {
         setStatus('WATCH PARTNER - MIRROR THE COACH');
         setHelp1('Coach shows the target pose');
         setHelp2('Partner shows tracked movement');
         setHelp3('Slight network delay is normal');
      }
      else {
         const custom = mode().custom;
         setStatus(Array.isArray(custom) && custom.length
                   ? 'CUSTOM ROUTINE - Match both targets' : 'Match both hand targets');
         setHelp1('Point at START to play a scored round');
         setHelp2('Point at coach + hold trigger to record moves');
         setHelp3('AI: point at TYPE A PROMPT beside the coach');
      }

      // Score line, grade pop-up and the START / PLAY AGAIN button
      const partners = [];
      for (const key in coach) {
         const p = coach[key];
         if (key[0] == 'p' && key != 'p'+clientID && p && coach.round && p.r == coach.round.k0 && alive(key.slice(1)))
            partners.push(p.s | 0);
      }
      const theirs = partners.length ? '   PARTNER ' + partners.join(' ') : '';
      setScore(recorder != -1 ? ''
             : round.phase == 'countdown' ? String(Math.max(1, Math.ceil(round.beatsLeft)))
             : round.phase == 'playing'   ? (watchingPartner ? 'ROUND IN PROGRESS' + theirs
                                            : 'SCORE ' + tally.score + '   x' + tally.multiplier + '   COMBO ' + tally.combo + theirs)
             : round.phase == 'done'      ? (watchingPartner ? 'ROUND OVER' + theirs
                                            : (tally.won ? 'YOU WIN' : 'YOU LOST') + ' - RANK ' + tally.rank + ' - '
                                              + tally.score + '/' + tally.goal + theirs)
             : '');
      setPopup(Date.now() / 1000 < popup.until ? popup.text : '');
      const showStart = recorder == -1 && ai?.state != 'thinking' &&
                        (round.phase == 'free' || round.phase == 'done');
      startButton.identity().move(START).scale(showStart ? .24 : 0, showStart ? .06 : 0, .02);
      setStart(! showStart ? '' : round.phase == 'done' ? 'PLAY AGAIN' : 'START');
   };

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

   // The room already transmits each headset and controller matrix. Build a
   // lightweight body for every OTHER immersive client from those tracked points.
   // No extra network messages or full-body tracker are needed.
   const remoteBodies = new Map();
   const makeRemoteBody = id => {
      const root = model.add(), n = remoteBodies.size;
      const shirt = [[.75,.3,.9],[.25,.85,.7],[1,.6,.3]][n % 3];
      const part = (shape, color) => root.add(shape).color(color).dull();
      const body = {root, head:part('sphere',SKIN), face:part('sphere',[.08,.12,.18]),
                    torso:part('tubeZ',shirt), hips:part('sphere',PANTS),
                    arms:{}, legs:{}, nameNode:null, nameText:null};
      for (const side of ['left','right']) {
         body.arms[side] = {upper:part('tubeZ',shirt),lower:part('tubeZ',shirt),
                            elbow:part('sphere',shirt),hand:part('sphere',side==='left'?[1,.4,.4]:[.4,.6,1])};
         body.legs[side] = {upper:part('tubeZ',PANTS),lower:part('tubeZ',PANTS),
                            knee:part('sphere',PANTS),foot:part('sphere',PANTS)};
      }
      const mesh = 'coachRemoteName_' + n;
      body.setName = (name, position) => {
         if (name !== body.nameText) {
            body.nameText = name;
            clay.defineTextMesh(mesh,name);
            if (!body.nameNode) body.nameNode = root.add(mesh).color(shirt).dull();
         }
         const width = .019 * Math.max(0,name.length-1) + .015;
         body.nameNode.identity().move(position[0]-width*.85/2,position[1],position[2]).scale(.85);
      };
      remoteBodies.set(id,body);
      return body;
   };
   const updateRemoteBodies = () => {
      const visible = new Set();
      for (const id of window.clients || []) {
         if (String(id) === String(clientID)) continue;
         const pose = coachAvatarPose(clientState.head(id),
                                      clientState.hand(id,'left'),clientState.hand(id,'right'));
         if (!pose) continue;
         visible.add(String(id));
         const body = remoteBodies.get(String(id)) || makeRemoteBody(String(id));
         body.root.identity();
         body.head.identity().move(pose.head).scale(.105,.12,.105);
         body.face.identity().move(pose.face).scale(.055,.025,.02);
         body.torso.placeLimb(pose.chest,pose.hips,.135);
         body.hips.identity().move(pose.hips).scale(.17,.1,.12);
         for (const side of ['left','right']) {
            const arm = body.arms[side], leg = body.legs[side];
            const wrist = pose.wrists[side], elbow = pose.elbows[side];
            arm.upper.identity().scale(0);arm.lower.identity().scale(0);
            arm.elbow.identity().scale(0);arm.hand.identity().scale(0);
            if (wrist) {
               arm.upper.placeLimb(pose.shoulders[side],elbow,.045);
               arm.lower.placeLimb(elbow,wrist,.038);
               arm.elbow.identity().move(elbow).scale(.045);
               arm.hand.identity().move(wrist).scale(.055);
            }
            leg.upper.placeLimb(pose.hipJoints[side],pose.knees[side],.055);
            leg.lower.placeLimb(pose.knees[side],pose.feet[side],.047);
            leg.knee.identity().move(pose.knees[side]).scale(.055);
            leg.foot.identity().move(pose.feet[side]).scale(.075,.035,.11);
         }
         const name = window.clientData?.[id]?.name;
         const safeName = typeof name==='string' ? name.replace(/[^A-Za-z0-9 ]/g,'').slice(0,16) : '';
         body.setName(safeName && safeName!=='Guest' ? safeName : 'PARTNER',pose.label);
      }
      for (const [id,body] of remoteBodies)
         if (!visible.has(id)) body.root.identity().scale(0);
      return visible.size;
   };

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
   let poseAt  = k => {
      const m = mode(), ai = m.ai;
      return routinePoseAt(poses(), ai?.state == 'ready' ? Math.max(0, k - ai.startK) : k);
   };

   let shown   = { a: DOWN.slice(), b: DOWN.slice(), squat: 0, feet: 0, sway: 0 };   // how the coach looks right now
   let chest   = cg.add(BASE, [0,.6,0]), headPos = cg.add(BASE, [0,.75,0]);
   let lastK = -1, lastBeat = -1, judged = -1, myHit = false, nearT = 0;
   const results = {};                                              // every pose report heard: { id: { k: ok } }
   let combo = 0, jump = 0, burst = [9,9], fireworks = 9;
   let standH = 0, recording = null, snaps = [], nextPulse = { left: 0, right: 0 };

   // The scored round. `round` is this frame's view of the shared coach.round.
   const tally = new RoundScore(ROUND_POSES);
   let round = { phase: 'free' }, tallyRound = null, lastPhase = 'free', lastCount = -1;
   let closeness = 0, popup = { text: '', until: 0 }, kNow = 0;
   const pop = (text, seconds = .9) => popup = { text, until: Date.now() / 1000 + seconds };
   const startRound = () => {
      if (recID() != -1 || mode().ai?.state == 'thinking' ||
          round.phase == 'countdown' || round.phase == 'playing') return false;
      coach.round = { k0: kNow + 1 + COUNTDOWN_POSES, n: ROUND_POSES };
      send('round');
      music.cue('tick');
      return true;
   }
   const report = (k, ok) => {
      coach['p'+clientID] = { k, ok, s: tally.score, r: coach.round ? coach.round.k0 : -1 };
      send('p'+clientID);
   }

   // My (or the ghost's) body frame, facing the coach. Returns where both hands sit in that frame
   let bodyFrame = (headP) => {
      let f = cg.normalize([BASE[0] - headP[0], 0, BASE[2] - headP[2]]);
      let r = [-f[2], 0, f[0]];
      return { f: f, r: r, aIsLeft: r[0] >= 0,                       // does the coach's hand a map to my left hand?
               toWorld: v => cg.add(headP, cg.add(cg.add(cg.scale(r, v[0]), [0,v[1],0]), cg.scale(f, v[2]))),
               toBody : P => { let v = cg.subtract(P, headP); return [cg.dot(v, r), v[1], cg.dot(v, f)]; } };
   }

   // ---------- Trigger: switch mode / start choreographing ----------

   // The in-VR keyboard may be used while nobody is recording and no round is being played.
   const canType = () => recID() == -1 && ! recording && (round.phase == 'free' || round.phase == 'done');
   inputEvents.onPress = hand => {
      music.audioOn();
      const typed = keyboard.press(ray(hand), canType());
      if (typed) {                                                   // a key, or the TYPE A PROMPT button
         buzz(hand, .4, 30);
         if (typed.go) generateFromText(typed.text, keyboard.setStatus);
         return;
      }
      for (let m in BTN)
         if (pointsAt(hand, BTN[m], .1)) {
            coach.mode = { mode: m, custom: null, rec: -1 };
            send('mode');
            coach.round = null;                                     // back to free practice
            send('round');
            buzz(hand, .8, 80);
            return;
         }
      if (pointsAt(hand, START, .2) && startRound()) {
         buzz(hand, 1, 100);
         return;
      }
      const busy = round.phase == 'countdown' || round.phase == 'playing';
      if (! busy && recID() == -1 && pointsAt(hand, chest, .3)) {
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
      const human = snaps.length >= 2 ? snaps.map(p => ({ a:p.a.slice(), b:p.b.slice(), squat:p.squat })) : null;
      if (human) {
         const id = String(clientID) + '-' + Date.now() + '-' + Math.random().toString(36).slice(2);
         coach.mode = { mode: mode().mode, custom: human, rec: -1,
                        ai: { state:'thinking', id } };
         askAIJson(coachReplyPrompt(human), { timeout: 25000 })
            .then(answer => {
               const reply = validateCoachReply(answer);
               if (!active || coach.mode?.ai?.id !== id) return;
               coach.mode = { mode: coach.mode.mode, custom: human.concat(reply.poses), rec: -1,
                              ai: { state:'ready', id, title:reply.title,
                                    humanCount:human.length, startK:kNow + 1 } };
               send('mode');
            })
            .catch(error => {
               if (!active || coach.mode?.ai?.id !== id) return;
               console.warn('Coach AI response failed:', error);
               coach.mode = { mode: coach.mode.mode, custom: human, rec: -1,
                              ai: { state:'error', id } };
               send('mode');
            });
      }
      else coach.mode = { mode: mode().mode, custom: mode().custom, rec: -1 };
      send('mode');
      buzz('left', 1, 200); buzz('right', 1, 200);
   }
   const generateFromText = async (description, setStatus) => {
      const prompt = description.trim().slice(0, 240);
      if (!prompt) { setStatus('Write a movement idea first.'); return; }
      if (recording || recID() != -1 || round.phase == 'countdown' || round.phase == 'playing') {
         setStatus('Finish recording or the scored round first.');
         return;
      }
      const previous = mode();
      const id = String(clientID) + '-prompt-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      coach.mode = { mode: previous.mode, custom: previous.custom, rec: -1,
                     ai: { state:'thinking', source:'prompt', prompt, id } };
      coach.round = null;
      send('mode');
      send('round');
      setStatus('Generating a new eight-move routine...');
      try {
         const answer = await askAIJson(coachTextPrompt(prompt), { timeout: 25000 });
         const routine = validateCoachReply(answer, 8);
         if (!active || coach.mode?.ai?.id !== id) { setStatus('Generation canceled.'); return; }
         coach.mode = { mode: coach.mode.mode, custom: routine.poses, rec: -1,
                        ai: { state:'ready', source:'prompt', prompt, id, title:routine.title,
                              humanCount:0, startK:kNow + 1 } };
         send('mode');
         setStatus('Created: ' + routine.title + '. Enter VR to play it.');
      } catch (error) {
         if (!active || coach.mode?.ai?.id !== id) return;
         console.warn('Coach prompt generation failed:', error);
         coach.mode = previous;
         send('mode');
         setStatus('Could not generate. Your previous routine is still available; try again.');
      }
   };
   const promptUI = mountCoachPromptUI(generateFromText);
   const onKey = e => {
      if (e.key != ' ' || e.repeat || e.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
      e.preventDefault();
      music.audioOn();
      startRound();
   }
   addEventListener('keydown', onKey);
   const pressHandler = inputEvents.onPress, releaseHandler = inputEvents.onRelease;
   cleanup = () => {
      active = false;
      promptUI.remove();
      removeEventListener('keydown', onKey);
      music.dispose();
      if (inputEvents.onPress === pressHandler) inputEvents.onPress = () => {};
      if (inputEvents.onRelease === releaseHandler) inputEvents.onRelease = () => {};
   }

   // ---------- Every frame ----------

   model.animate(() => {
      coach = server.synchronize('coach');
      if (! coach || typeof coach != 'object') coach = { };
      let dt = clamp(model.deltaTime || 1/60, 1/200, 1/20);
      for (let h in beams) beams[h].update();
      const partnerCount = updateRemoteBodies();

      const mono = performance.now() / 1000;
      const headset = (window.clients || [clientID]).filter(id => clientState.isXR?.(id) ||
         Array.isArray(clientState.head(id))).sort((a,b) => String(a).localeCompare(String(b), undefined, { numeric:true }))[0];
      if (headset != null && String(headset) === String(clientID) && mono - lastClockSend >= .1) {
         coach.beatClock = { owner: clientID, time: Date.now() / 1000 };
         send('beatClock');
         lastClockSend = mono;
      }
      const beatClock = sharedClock({ owner: headset, self: clientID,
                                      sample: coach.beatClock, now: Date.now() / 1000, mono });
      let M = mode(), beat = BEAT[M.mode], clock = beatClock.time;
      let k = poseIndex(clock, beat);                                // which pose
      let u = clock / beat % 2;                                      // how far into this pose, in beats (0..2)
      let beatNo = Math.floor(clock / beat);
      let rec = recID();
      if (beatClock.changed) {                                      // a clock switch is not a missed pose
         lastK = k; lastBeat = beatNo; judged = k - 1;
         myHit = false; nearT = 0;
         nextPulse = { left: 0, right: 0 };
         music.reset();
      }

      // 0. The scored round, as seen this frame
      kNow = k;
      round = roundPhase(coach.round, k);
      if (round.phase == 'countdown') round.beatsLeft = 2 * round.posesLeft - u;
      if (coach.round && coach.round.k0 !== tallyRound) {            // a new round started (by anyone): fresh score
         tallyRound = coach.round.k0;
         tally.reset();
      }
      if (round.phase == 'countdown' && Math.ceil(round.beatsLeft) != lastCount) {
         lastCount = Math.ceil(round.beatsLeft);
         music.cue('tick');
      }
      if (round.phase != lastPhase) {
         if (round.phase == 'playing') { music.cue('go'); pop('GO!', .8); buzz('left', 1, 120); buzz('right', 1, 120); }
         if (round.phase == 'done' && lastPhase == 'playing') {
            const won = tally.won;
            music.cue(won ? 'win' : 'lose');
            for (let h of ['left','right']) buzz(h, 1, won ? 400 : 150);
            if (won) fireworks = 0;
         }
         lastPhase = round.phase;
      }

      // 1. Where am I? Use the real controllers if there are any, otherwise the ghosts

      let headM = clientState.head(clientID);
      let L = inputEvents.pos('left'), R = inputEvents.pos('right');
      let real = Array.isArray(headM) && isVec(L) && isVec(R);
      watchingPartner = !real && partnerCount > 0;
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
         ghosts[h].identity().move(hands[h]).scale(real || watchingPartner ? 0 : .04)
                  .color(h == 'left' ? [1,.5,.5] : [.5,.6,1]);

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

      // 3b. Music

      music.schedule({ mode: M.mode, beat, clock, hype: clamp(combo / 8, 0, 1), quiet: rec != -1 });

      // 4. Scoring: during the second beat, both hands inside their targets counts
      //    (a squat pose also requires actually crouching)

      if (k != lastK) {
         if (lastK != -1 && rec == -1 && ! myHit && ! watchingPartner) {   // missed the previous pose
            if (roundPhase(coach.round, lastK).phase == 'playing') {
               tally.miss();
               pop('MISS', .7);
               music.cue('miss');
            }
            if (real) report(lastK, false);
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
      if (! real && k % 5 == 4) ok = false;                          // the ghost fumbles every fifth pose
      closeness = (clamp(1 - cg.distance(hands.left , goal.left ) / TOL, 0, 1) +
                   clamp(1 - cg.distance(hands.right, goal.right) / TOL, 0, 1)) / 2;
      if (rec == -1 && ! myHit && !watchingPartner) {
         for (let h in acc)                                          // the closer, the denser the pulses
            if (real && acc[h] > .2 && clock > nextPulse[h]) {
               buzz(h, .25 + .4 * acc[h], 20);
               nextPulse[h] = clock + .3 - .24 * acc[h];
            }
         nearT = ok ? nearT + dt : 0;
         if (u > .7 && nearT > .12) {
            myHit = true;
            buzz('left', 1, 50); buzz('right', 1, 50);               // the click
            music.ding(1);
            if (round.phase == 'playing') {
               const grade = gradeOf(closeness, u);
               pop(grade + '  +' + tally.hit(grade));
            }
            if (real) report(k, true);
         }
      }

      // 5. How did everyone do? Each finished pose is judged once every active player's
      //    result for it has arrived, or JUDGE_WAIT beats after it ended (scoreRules.js).
      //    Judging after a fixed 0.3 beat missed slow reports, so on a slow network one
      //    device counted a partner's miss as a hit and the players' combos drifted apart.

      for (let key in coach) {                                        // remember every report heard
         let p = coach[key];
         if (key[0] == 'p' && p && Number.isFinite(p.k)) (results[key.slice(1)] ||= {})[p.k] = !! p.ok;
      }
      if (rec != -1) judged = k - 1;                                  // choreographing: nothing to judge
      if (judged < k - 4) judged = k - 2;                             // just started, or a long pause: only the last pose is still open
      while (judged < k - 1) {
         let pose = judged + 1;
         let players = activePlayers(results, pose, alive);
         let result = players.length ? teamResult(results, players, pose, 2 * (k - pose - 1) + u) : { n: 0, good: 0 };
         if (! result) break;                                         // still waiting for someone's result
         judged = pose;
         let { n, good } = result;
         if (n == 0 && ! real && !watchingPartner) {                  // nobody real: judge the ghost's performance
            n = 1;
            good = pose % 5 != 4 ? 1 : 0;
         }
         if (n > 0 && good == n) {
            combo++;
            jump = 1;
            music.ding(2);
            burst[0] = 0;
            if (n > 1) burst[1] = -.15;                              // both players hit: a second ring + one long shared buzz
            for (let h of ['left','right']) buzz(h, n > 1 ? 1 : .6, n > 1 ? 300 : 120);
            if (combo >= 8) { combo = 0; fireworks = 0; }
         }
         else if (n > 0)
            combo = 0;
      }
      for (let id in results)                                         // forget old poses
         for (let pose in results[id]) if (pose < k - 10) delete results[id][pose];

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
      const aiReply = M.ai?.state == 'ready' &&
         Math.max(0, k - M.ai.startK) % poses().length >= M.ai.humanCount;
      torso.color(rec != -1 ? [1,.75,.1] : aiReply ? [.65,.38,1] : cg.mix(SHIRT, [.4,1,1], hype));

      // 8. My target spheres (hidden while choreographing)

      for (let h in targets) {
         let c = h == 'left' ? [1,.25,.25] : [.25,.4,1];
         let show = rec == -1 && !watchingPartner;
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
      rim.color(cg.mix([.15,.2,.3], aiReply ? [1.4,.35,2] : M.mode == 'fit' ? [1.5,.5,.2] : [.4,.6,2], .3 + .7 * pulse));

      for (let m in icon) {
         let active = M.mode == m && ! (Array.isArray(M.custom) && M.custom.length);
         let hot = pointsAt('left', BTN[m], .1) || pointsAt('right', BTN[m], .1);
         icon[m].identity().move(BTN[m]).turnY(.6 * Math.sin(clock)).scale(hot ? 1.6 : 1.3);
         for (let i = 0 ; i < icon[m].nChildren() ; i++)
            icon[m].child(i).color(active ? (m == 'fit' ? [2,.7,.2] : [.5,.8,2]) : hot ? [1,1,1] : [.35,.35,.4]);
      }
      keyboard.update([ray('left'), ray('right')].filter(Boolean), canType());
      updateText();
   });
}
