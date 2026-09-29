/* HAPTIC FISHING — one or more players. Catch 800 points of fish in two minutes.

   You fish by feel. The controller is the rod: pull your hand back, then throw
   it forward toward the pond, and the line flies out the way your hand went. Then wait. Each fish announces itself through
   the controller before it bites: a minnow taps once, a bass twice, a golden koi
   three times quickly, and an old boot is one long dull rumble. After the taps
   comes the bite, a hard jolt: pull the trigger (or flick the rod upward) at
   once to set the hook, and keep holding the trigger to reel in.
   Striking during the taps scares the fish away; striking at a boot costs points.

   Once hooked, hold the trigger (the index-finger trigger on the front of the
   controller) to reel in. The line's tension is felt as
   pulses that get faster and stronger, and seen in the bend of the rod and the
   colour of the line. When the fish surges, let go, or the line snaps. You have
   three lines.

   Several players: everyone fishes their own line side by side along the dock
   and sees the others' rods, lines, bobbers, names and scores. Whoever presses
   START begins a shared match for everyone at the pond after a 3 second
   countdown; the first to 800 wins and everyone else loses. Each player's fish,
   bites and haptics are computed on their own headset; only a small snapshot
   (rod, bobber, state, score) is broadcast, 15 times a second. Rules for who is
   at the pond and when the match runs are in pondSync.js.

   Desktop: Space start / cast / strike, hold W to reel, R restart. */
import * as cg from '../../render/core/cg.js';
import * as global from '../../global.js';
import { Gltf2Node } from '../../render/nodes/gltf2.js';
import { createKit, clamp, buzz } from './gameKit.js';
import { FishingGame, FISH, LANDED_FOR } from './fishingRules.js';
import { MATCH_SECONDS, COUNTDOWN, LATE_JOIN, SEND_HZ, slotX, matchPhase, presentPlayers,
         standings, winnerOf, anyonePlaying } from './pondSync.js';

const WATER = .06, POND = [0,WATER,-2.9], RADIUS = 1.7;      // pond surface, centre and radius
const HANDLE = .25, SEGMENT = .45, ROD = HANDLE + 3*SEGMENT; // the rod is a handle plus three jointed segments
const LEASH = .45;                                           // line length while the bobber hangs from the tip
const THROW_SPEED = 1.3;                                     // forward hand speed (m/s) that counts as a cast
const CAST_GAIN = 2.2, CAST_MIN = 2.2, CAST_MAX = 5;         // hand speed (m/s) -> bobber launch speed
const CAST_ANGLE = .6;                                       // launch elevation (radians)
const STRIKE_SPEED = 1.8;                                    // upward tip speed (m/s) that counts as a strike
const SHOW = [0,1.25,-1.0];                                  // where a landed catch is held up
const HUD_Z = POND[2];

window.fishingPond = {match:null};                           // shared: see pondSync.js

let cleanup = () => {};
export const deinit = () => cleanup();
export const init = async model => {
   cleanup();
   const kit = createKit(model,'fishing'), game = new FishingGame(MATCH_SECONDS,3,800);
   const add = (shape,color,parent = model) => parent.add(shape).color(color);
   window.fishingGame = game;                                // read-only handle for debugging from the console
   const isVec = p => Array.isArray(p) && p.length >= 3 && p.every(Number.isFinite) && cg.norm(p) > 0;

   // ---------- Scenery: a meadow, a pond ringed with stones, a short dock, trees, sunflowers ----------

   // GLTF models made elsewhere: sunflowers growing on the bank.
   for (const [x,z,turn,size] of [[-2.7,-1.1,.4,1.5],[-2.4,-3.4,1.9,1.9],[2.8,-1.3,2.6,1.6],[1.6,-4.7,.9,2.1],[-1.3,-4.8,3.3,1.7]]) {
      const flower = new Gltf2Node({url:'./media/gltf/sunflower/sunflower.gltf'});
      flower.translation = [x,0,z];
      flower.scale = [size,size,size];
      flower.rotation = [0,Math.sin(turn/2),0,Math.cos(turn/2)];
      global.gltfRoot.addNode(flower);
   }

   add('tubeY',[.2,.42,.18]).move(0,-.011,-2.5).scale(7,.01,7).dull();                              // meadow
   add('tubeY',[.05,.09,.12]).move(POND[0],WATER-.3,POND[2]).scale(RADIUS,.01,RADIUS);              // pond bed
   for (let i = 0; i < 26; i++) {                                                                    // stone rim
      const a = 2*Math.PI*i/26, r = RADIUS+.07+.03*Math.sin(5*i), size = .1+.035*Math.sin(3.1*i);
      if (Math.abs(Math.sin(a/2)) > .99) continue;                                                   // gap for the dock
      add('sphere',cg.scale([.42,.4,.38],.8+.3*Math.sin(7*i))).move(POND[0]+r*Math.sin(a),.03,POND[2]-r*Math.cos(a))
                                                               .scale(size*1.3,size*.7,size).dull();
   }
   for (let i = 0; i < 5; i++)                                                                       // dock planks
      add('cube',i%2 ? [.5,.33,.18] : [.44,.29,.15]).move(0,.03,-.2-.26*i).scale(.45,.02,.12);
   for (const x of [-.4,.4]) add('tubeY',[.3,.2,.1]).move(x,.12,-1.3).scale(.035,.14,.035);
   for (const [x,z,h] of [[-3.4,-4.6,2.6],[3.3,-5.2,3.1],[-4.4,-2.2,2.2],[4.3,-2.6,2.4],[.4,-6.3,3.4],[-2,-6.2,2.8]]) {
      const tree = model.add();                                                                      // pine: trunk + three tiers
      tree.move(x,0,z).scale(h);
      add('tubeY',[.3,.2,.12],tree).move(0,.12,0).scale(.035,.12,.035);
      for (let i = 0; i < 3; i++)
         add('coneY',[.1,.34-.05*i,.16],tree).move(0,.38+.2*i,0).scale(.26-.06*i,.2,.26-.06*i).dull();
   }

   // Fish are small hierarchies: body -> tail joint -> tail fin, so the tail can wag.
   const makeFish = (body,fin) => {
      const root = model.add(), tail = root.add();
      add('sphere',body,root).scale(.5,.2,.13);
      add('cube',fin,root).move(.02,.2,0).turnZ(.5).scale(.14,.08,.008);
      add('cube',fin,root).move(.1,-.14,0).turnZ(-.6).scale(.09,.05,.008);
      for (const z of [-.085,.085]) add('sphere',[.02,.02,.02],root).move(.33,.05,z).scale(.03);
      add('cube',fin,tail).move(-.14,0,0).scale(.15,.17,.008);
      add('cube',fin,tail).move(-.05,0,0).scale(.06,.07,.02);
      return {root, place: (p,heading,wag,size,pitch = 0) => {
         root.identity().move(p).turnY(heading).turnZ(pitch).scale(size);
         tail.identity().move(-.45,0,0).turnY(wag);
      }};
   };
   const swimmers = [[.35,.45,.5],[.3,.5,.45],[.45,.4,.35],[.8,.55,.15]].map((c,i) =>
      ({fish: makeFish(c,cg.scale(c,.7)), radius:.55+.3*i, speed:(i%2 ? -1 : 1)*(.5-.07*i), phase:1.7*i}));
   const looks = {                                           // the hooked / landed catch, one model per species
      'MINNOW'    : {fish: makeFish([.7,.75,.8],[.5,.6,.7])   , size:.14},
      'BASS'      : {fish: makeFish([.3,.5,.25],[.2,.35,.2])  , size:.26},
      'GOLDEN KOI': {fish: makeFish([1,.6,.1],[1,.85,.5])     , size:.36},
   };
   const boot = model.add();
   add('cube',[.3,.2,.12],boot).move(0,.1,0).scale(.07,.14,.07);
   add('cube',[.3,.2,.12],boot).move(.07,-.02,0).scale(.14,.05,.07);
   add('cube',[.12,.08,.05],boot).move(.07,-.08,0).scale(.15,.015,.075);

   const water = add('tubeY',[.1,.35,.55]).opacity(.62);
   const ripples = [0,1,2].map(() => ({node: add('torusY',[.7,.9,1]).opacity(.5), p:[0,0,0], age:9}));
   const ripple = p => { const r = ripples.reduce((a,b) => a.age > b.age ? a : b); r.p = p.slice(); r.age = 0; };

   // ---------- The rod: handle -> joint -> segment -> joint -> segment -> joint -> segment ----------

   const wood = [.35,.2,.1], carbon = [.12,.13,.16];
   const rod = model.add();
   add('tubeZ',wood,rod).move(0,0,HANDLE/2).scale(.016,.016,HANDLE/2);
   const reelNode = rod.add();                               // the reel's crank turns while reeling
   add('tubeX',[.6,.62,.66],reelNode).scale(.02,.035,.035);
   add('cube',[.8,.2,.15],reelNode).move(.03,.03,0).scale(.008,.03,.008);
   const joints = [];
   for (let i = 0, parent = rod; i < 3; i++) {
      const joint = parent.add();
      add('tubeZ',carbon,joint).move(0,0,SEGMENT/2).scale(.011-.003*i,.011-.003*i,SEGMENT/2);
      add('torusZ',[.7,.7,.75],joint).move(0,0,SEGMENT).scale(.012-.003*i);
      joints.push(parent = joint);
   }
   const line = Array.from({length:8},() => add('tubeZ',[1,1,1]));
   const bobber = model.add();
   add('sphere',[1,.15,.1],bobber).move(0,.012,0).scale(.03);
   add('sphere',[1,1,1],bobber).move(0,-.012,0).scale(.03);
   add('tubeY',[.1,.1,.1],bobber).move(0,.05,0).scale(.004,.025,.004);

   // ---------- Other players: a simple rod, line, bobber and a floating name tag each ----------

   const COLORS = [[1,.8,.2],[.3,.8,1],[1,.4,.7],[.5,1,.4],[.8,.5,1]];
   const others = new Map();
   const floatingText = (name,color) => {                   // a text tag that can move every frame
      let node = null, last = null;
      return (text,p,size) => {
         if (!text) { if (node) node.identity().scale(0); return; }
         if (text !== last) { clay.defineTextMesh(name,text); last = text; if (!node) node = model.add(name).dull(); }
         const width = .019*Math.max(0,text.length-1)+.015;
         node.identity().move(p[0]-width*size/2,p[1],p[2]).scale(size).color(color);
      };
   };
   const otherPlayer = (id,slot) => {
      if (others.has(id)) return others.get(id);
      const color = COLORS[slot % COLORS.length], n = others.size;
      const o = {rod:[add('tubeZ',[.35,.2,.1]),add('tubeZ',[.12,.13,.16])], line:[0,1,2,3].map(() => add('tubeZ',[.9,.95,1])),
                 bobber:add('sphere',color), tag:floatingText('fishingOther'+n+'a',color),
                 status:floatingText('fishingOther'+n+'b',[.9,.95,1]), o:null, d:null, b:null};
      others.set(id,o);
      return o;
   };

   // ---------- Text: title, live status, prompts, instructions, fish guide, gauges ----------

   kit.label('title',[0,2.42,HUD_Z],3.4,[.55,.9,1])('HAPTIC FISHING');
   const status  = kit.label('status' ,[0,2.22,HUD_Z],2.5);
   const message = kit.label('message',[0,2.03,HUD_Z],2.7,[1,.85,.45]);
   const board   = kit.label('board'  ,[0,2.62,HUD_Z],2.2,[.6,1,.7]);
   const catchText = kit.label('catch',[SHOW[0],SHOW[1]+.3,SHOW[2]],1.5,[.6,1,.7]);
   const tensionText = kit.label('tension',[-.62,1.81,HUD_Z],2.1);
   const reelText    = kit.label('reel'   ,[-.62,1.66,HUD_Z],2.1);
   const bars = {tension:{y:1.825}, reel:{y:1.675}};
   for (const bar of Object.values(bars)) {
      bar.back = add('cube',[.12,.14,.18]);
      bar.fill = add('cube',[.3,1,.5]);
   }
   const guide = [-1.35,1.5,-1.7];
   kit.label('how0',[guide[0],guide[1]     ,guide[2]],1.5,[.55,.9,1])('HOW TO FISH');
   kit.label('how1',[guide[0],guide[1]-0.11,guide[2]],1.3)('1 Pull hand back, throw it forward to cast');
   kit.label('how2',[guide[0],guide[1]-0.20,guide[2]],1.3)('2 Wait and feel the taps');
   kit.label('how3',[guide[0],guide[1]-0.29,guide[2]],1.3)('3 Hard jolt = bite: pull trigger NOW');
   kit.label('how4',[guide[0],guide[1]-0.38,guide[2]],1.3)('4 Hold front trigger to reel in');
   kit.label('how5',[guide[0],guide[1]-0.47,guide[2]],1.3)('5 Fast buzz = let go or it snaps');
   kit.label('keys',[guide[0],guide[1]-.59,guide[2]],1.05,[.6,.75,.9])('SPACE start/cast/strike | hold W reel | R restart');
   const chart = [1.35,1.5,-1.7];
   kit.label('fish0',[chart[0],chart[1],chart[2]],1.5,[.55,.9,1])('READ THE TAPS');
   FISH.forEach((fish,i) => kit.label('fish'+(i+1),[chart[0],chart[1]-.11-.09*i,chart[2]],1.3,fish.junk ? [1,.6,.45] : [.85,.93,1])(
      fish.junk ? 'LONG RUMBLE  ' + fish.name + '  ' + fish.points + '  leave it'
                : fish.nibbles + (fish.nibbles > 1 ? (fish.gap < .3 ? ' FAST TAPS  ' : ' TAPS  ') : ' TAP  ') + fish.name + '  +' + fish.points));
   const buttonP = [0,1.35,-1.7];
   const button = add('cube',[.1,.38,.3]);
   const inputText = kit.label('input',[0,1.24,-1.7],.9,[.6,.75,.9]);
   const buttonText = kit.label('button',[buttonP[0],buttonP[1]-.012,buttonP[2]+.03],1.5);

   // ---------- State ----------

   const held = {left:false,right:false};
   let rodHand = 'right', tip = [.2,2,-1.2], tipVel = [0,0,0], previousTip = null;
   let hand = null, handVel = [0,0,0], previousHand = null, idleFor = 0;
   let bob = {p:[.2,1.6,-1.2], q:[.2,1.6,-1.2], v:[0,0,0]};  // q: previous position, for the pendulum
   let spot = POND.slice();                                  // where the bobber landed
   let strikeCooldown = 0, keyStrike = false, keyLift = 0;
   let dip = 0, rumble = 0, nextRumble = 0, nextPulse = 0, crank = 0;
   let notice = '', noticeTime = 0, endTime = -10, lostReason = '', caught = null, elapsed = 0;

   // Multiplayer state
   const now = () => Date.now()/1000;
   const alive = id => window.clients ? clients.map(String).includes(String(id)) : String(id) === String(window.clientID);
   const me = () => String(window.clientID ?? 'local');
   const lastSeen = {}, lastSeq = {};
   let joined = null, seq = 0, nextSend = 0, present = [me()], winner = null, busyUntil = -1;
   let expecting = null;                                     // the match we saw coming and will join when it starts
   const entries = () => {                                   // {id: snapshot} of every player at the pond
      const out = {};
      for (const key in fishingPond) if (key[0] === 'p' && fishingPond[key]) out[key.slice(1)] = fishingPond[key];
      return out;
   };
   const nameOf = id => {
      const name = window.clientData?.[id]?.name;
      const clean = typeof name === 'string' ? name.replace(/[^A-Za-z0-9 ]/g,'').slice(0,12) : '';
      return clean && clean !== 'Guest' ? clean.toUpperCase() : 'PLAYER ' + (present.indexOf(String(id))+1);
   };
   const share = key => { try { server.broadcastGlobalElement('fishingPond',key); } catch (e) { } };
   // Start a shared match (or join the one that is running) instead of starting alone.
   const startOrJoin = hand => {
      const mp = matchPhase(fishingPond.match,now());
      if (mp.phase === 'countdown') return;                  // one is about to start: we join it automatically
      if (mp.phase === 'on' && joined !== fishingPond.match.id && mp.elapsed < LATE_JOIN) return join(fishingPond.match,mp.elapsed);
      if (anyonePlaying(entries(),present,me())) { busyUntil = model.time + 2; return; }
      const alone = present.length < 2;
      fishingPond.match = {id: Math.floor(Math.random()*1e9), t0: now() + (alone ? 0 : COUNTDOWN)};
      expecting = fishingPond.match.id;
      share('match');
      if (hand) rodHand = hand;
   };
   const join = (match,late = 0) => {
      joined = match.id; winner = null;
      reset();
      game.remaining = Math.max(1,MATCH_SECONDS - late);
   };

   const say = (text,seconds = 1.8) => { notice = text; noticeTime = seconds; };
   const reset = () => {
      game.reset(); caught = null; rumble = 0; dip = 0; noticeTime = 0; elapsed = 0;
      bob = {p:cg.add(tip,[0,-LEASH,0]), q:cg.add(tip,[0,-LEASH,0]), v:[0,0,0]};
      kit.tone(520);
   };
   const launch = velocity => {
      if (!game.cast()) return;
      const speed = cg.norm(velocity);
      bob.v = cg.scale(velocity, clamp(speed,CAST_MIN,CAST_MAX)/Math.max(speed,.001));
      bob.v[1] = Math.max(bob.v[1],1);
      buzz(rodHand,clamp(speed/CAST_MAX,.3,1),90); kit.tone(300,.18);
   };
   // Throw: the line flies out horizontally the way the hand moved, rising at CAST_ANGLE.
   const throwCast = v => {
      const flat = [v[0],0,v[2]], n = cg.norm(flat), speed = clamp(CAST_GAIN*cg.norm(v),CAST_MIN,CAST_MAX);
      const dir = n > .01 ? cg.scale(flat,1/n) : [0,0,-1];
      launch(cg.add(cg.scale(dir,speed*Math.cos(CAST_ANGLE)),[0,speed*Math.sin(CAST_ANGLE),0]));
   };

   const press = hand => {
      if (game.phase !== 'playing') {                        // any trigger starts; no need to aim at the button
         if (model.time-endTime > 1) { rodHand = hand; startOrJoin(hand); buzz(hand,.8,100); }
         return;
      }
      held[hand] = true;
      if (game.state === 'idle' && hand !== rodHand) { rodHand = hand; previousHand = null; }   // the rod moves to this hand
      if (['nibbling','bite'].includes(game.state)) { keyStrike = true; keyLift = 1; }            // the trigger strikes too
   };
   const release = hand => held[hand] = false;
   inputEvents.onPress = press; inputEvents.onRelease = release;
   kit.onKey(key => {
      if (key === ' ' && game.phase !== 'playing') return startOrJoin();
      if (key === 'r') return present.length < 2 ? (game.phase = 'lost', startOrJoin()) : say('R works only when fishing alone');
      if (key !== ' ') return;
      if (game.state === 'idle') launch([.8*(Math.random()-.5),2.6,-1.5-.9*Math.random()]);
      else { keyStrike = true; keyLift = 1; }
   });
   cleanup = () => {
      kit.dispose();
      if (inputEvents.onPress === press) inputEvents.onPress = () => {};
      if (inputEvents.onRelease === release) inputEvents.onRelease = () => {};
   };

   // One-shot rule events become haptics, sound and text.
   const react = event => {
      const fish = event.fish;
      switch (event.type) {
      case 'splash'    : ripple(spot); buzz(rodHand,.7,100); kit.tone(180,.15); break;
      case 'missedPond': say('Missed the pond - cast again'); kit.tone(150,.2); break;
      case 'nibble'    : dip = 1; ripple(spot); buzz(rodHand,.8,80); kit.tone(880,.04); break;
      case 'rumble'    : rumble = event.seconds; break;
      case 'bite'      : dip = 3; ripple(spot); buzz(rodHand,event.weak ? .5 : 1,event.weak ? 120 : 220);
                         kit.tone(event.weak ? 300 : 660,.2); break;
      case 'early'     : say('Too early - you scared it away'); buzz(rodHand,.3,60); kit.tone(200,.2); break;
      case 'escaped'   : say('It got away'); kit.tone(220,.25); break;
      case 'hooked'    : say('HOOKED a ' + fish.name + '!',1.2); buzz(rodHand,1,150); kit.tone(740,.15); break;
      case 'surge'     : buzz(rodHand,1,250); kit.tone(260,.25); break;
      case 'snap'      : say('SNAP! The line broke',2); buzz('left',1,300); buzz('right',1,300); kit.tone(110,.4); break;
      case 'junk'      : caught = {...event, kg:game.kg, from:bob.p.slice(), age:0};
                         buzz(rodHand,.6,200); kit.tone(140,.35); break;
      case 'caught'    : caught = {...event, from:bob.p.slice(), age:0};
                         for (let i = 0; i < 3; i++) setTimeout(() => { buzz(rodHand,.9,70); kit.tone(700+150*i,.12); },110*i);
                         break;
      case 'lost'      : lostReason = event.reason === 'time' ? 'out of time'
                                    : event.reason === 'beaten' ? (winner ? nameOf(winner.id) : 'someone') + ' reached ' + game.goal + ' first'
                                    : 'no lines left'; break;
      }
   };

   model.animate(() => {
      kit.update();
      const t = model.time, dt = clamp(model.deltaTime || 1/60,.001,.05), before = game.phase;
      // In VR the rod follows the controller's beam. Ask the XR session directly,
      // rather than the multiplayer client state, which may not be ready yet.
      const beamPose = kit.tracked(rodHand) ? kit.ray(rodHand) : null;
      const xr = !!beamPose;

      // 0. The pond: who is here, the shared match, and whether someone else already won

      if (window.server?.synchronize) fishingPond = server.synchronize('fishingPond') || fishingPond;
      if (!fishingPond || typeof fishingPond !== 'object') fishingPond = {match:null};
      const all = entries();
      for (const id in all) if (all[id].q !== lastSeq[id]) { lastSeq[id] = all[id].q; lastSeen[id] = t; }
      present = presentPlayers(all,lastSeen,me(),t,alive);
      const mp = matchPhase(fishingPond.match,now());
      // Join a match we saw coming (its countdown, or our own START) as soon as it is on,
      // even if this frame arrives late: a slow frame must not leave a player behind.
      if (mp.phase === 'countdown' && game.phase !== 'playing') expecting = fishingPond.match.id;
      if (mp.phase === 'on' && expecting === fishingPond.match.id && joined !== expecting && game.phase !== 'playing')
         join(fishingPond.match,mp.elapsed);
      if (game.phase === 'playing' && joined !== null) {
         winner = winnerOf(all,present,joined,me());
         if (winner) game.forfeit().forEach(react);
      }

      const playing = game.phase === 'playing';
      if (playing) elapsed += dt;
      noticeTime = Math.max(0,noticeTime-dt); strikeCooldown = Math.max(0,strikeCooldown-dt);
      keyLift = Math.max(0,keyLift-dt/.35); dip = Math.max(0,dip-dt/.35);

      // 1. Rod pose: along the controller beam, or a keyboard-driven pose on the desktop

      let pose = beamPose;
      if (!pose) {
         const pitch = .5 + .55*Math.sin(Math.PI*keyLift) + .03*Math.sin(1.3*t);
         pose = {o:[.3,1.0,-.45], d:cg.normalize([-.1,Math.sin(pitch),-Math.cos(pitch)])};
      }
      const Z = pose.d;
      let X = cg.cross([0,1,0],Z);
      X = cg.norm(X) > .05 ? cg.normalize(X) : [1,0,0];
      const Y = cg.cross(Z,X);
      const load = game.state === 'fight' ? clamp(game.tension,0,1.15) : game.state === 'bite' ? .5 : .06;
      const bend = .03 + .2*load;                            // every joint bends by the same angle
      rod.setMatrix([X[0],X[1],X[2],0, Y[0],Y[1],Y[2],0, Z[0],Z[1],Z[2],0, pose.o[0],pose.o[1],pose.o[2],1]);
      tip = cg.add(pose.o,cg.scale(Z,HANDLE));
      joints.forEach((joint,i) => {
         joint.identity().move(0,0,i ? SEGMENT : HANDLE).turnX(bend);
         const angle = bend*(i+1);
         tip = cg.add(tip,cg.scale(cg.add(cg.scale(Z,Math.cos(angle)),cg.scale(Y,-Math.sin(angle))),SEGMENT));
      });
      const reeling = playing && game.state === 'fight' && (held.left || held.right || kit.keys.has('w'));
      if (reeling) crank += 14*dt;
      reelNode.identity().move(0,-.045,HANDLE*.75).turnX(crank);

      if (previousTip) tipVel = cg.mix(tipVel,cg.scale(cg.subtract(tip,previousTip),1/dt),.35);
      previousTip = tip.slice();
      hand = pose.o;
      handVel = previousHand ? cg.mix(handVel,cg.scale(cg.subtract(hand,previousHand),1/dt),.4) : [0,0,0];
      previousHand = hand.slice();

      // Cast: throw the hand forward, toward the pond. No button needed. A short
      // pause after each catch keeps the reeling motion from casting by accident.
      idleFor = game.state === 'idle' ? idleFor+dt : 0;
      const forward = cg.dot(handVel,cg.normalize(cg.subtract([POND[0],hand[1],POND[2]],hand)));
      if (xr && playing && game.state === 'idle' && idleFor > .6 && forward > THROW_SPEED) throwCast(handVel);

      // 2. Strike: the trigger, a quick upward flick of the rod tip, or Space

      let strike = keyStrike;
      keyStrike = false;
      if (xr && strikeCooldown === 0 && tipVel[1] > STRIKE_SPEED && ['nibbling','bite'].includes(game.state)) strike = true;
      if (strike) strikeCooldown = .6;

      // 3. Rules

      const events = game.tick(dt,{reel:reeling,strike});

      // 4. The bobber: a pendulum on the rod, a projectile in the air, a float on the water

      if (!playing || game.state === 'idle' || game.state === 'landed') {
         for (let i = 0; i < 3; i++) {                       // verlet pendulum hanging from the tip
            const v = clamp((bob.p[i]-bob.q[i])*.97,-.05,.05);
            bob.q[i] = bob.p[i];
            bob.p[i] += v - (i === 1 ? 9.8*dt*dt : 0);
         }
         const d = cg.subtract(bob.p,tip), n = cg.norm(d);
         if (n > LEASH) bob.p = cg.add(tip,cg.scale(d,LEASH/n));
         if (n > 1.2) bob.q = bob.p.slice();                 // reeled back in from the pond: no slingshot
      }
      else if (game.state === 'flying') {
         bob.v[1] -= 9.8*dt;
         bob.p = cg.add(bob.p,cg.scale(bob.v,dt));
         if (bob.p[1] <= WATER+.02) {
            const inPond = Math.hypot(bob.p[0]-POND[0],bob.p[2]-POND[2]) < RADIUS-.1;
            spot = [bob.p[0],WATER,bob.p[2]];
            events.push(...game.land(inPond));
         }
      }
      else {
         const shore = [spot[0]*.3,WATER,POND[2]+RADIUS-.35];
         let p = spot;
         if (game.state === 'fight') {                       // the fish is dragged toward the dock, zigzagging
            const sway = (game.surging ? .45 : .2)*(1-game.progress)*Math.sin((game.surging ? 7 : 2.5)*t);
            p = cg.add(cg.mix(spot,shore,clamp(game.progress,0,1)),[sway,0,0]);
            if (game.surging && Math.random() < 6*dt) ripple(p);
         }
         const sink = game.state === 'fight' ? .05 : game.state === 'bite' ? .07 + .02*Math.sin(40*t) : .04*Math.min(1,dip);
         bob.p = [p[0],WATER+.02+.008*Math.sin(2.2*t)-sink,p[2]];
         bob.q = bob.p.slice();
      }
      events.forEach(react);
      bobber.identity().move(bob.p).turnZ(game.state === 'fight' ? .5*Math.sin(9*t) : 0);

      // 5. Haptics that last: the boot's rumble, and line tension while fighting

      if ((rumble = Math.max(0,rumble-dt)) > 0 && t > nextRumble) { buzz(rodHand,.35,70); nextRumble = t+.06; }
      if (game.state === 'fight' && t > nextPulse) {
         const k = clamp(game.tension,0,1);
         buzz(rodHand,.35+.65*k,game.surging ? 80 : 50);
         nextPulse = t + (game.surging ? .09 : .3-.2*k);
      }
      if (game.state !== 'nibbling') rumble = 0;

      // 6. The line sags when slack and straightens and reddens as tension rises

      const taut = game.state === 'fight' ? clamp(.3+game.tension,0,1) : game.state === 'flying' ? .7 : .45;
      const sag = (1-taut)*.22*cg.distance(tip,bob.p);
      const hot = game.state === 'fight' ? clamp((game.tension-.4)/.6,0,1) : 0;
      const point = u => { const p = cg.mix(tip,bob.p,u); p[1] -= 4*sag*u*(1-u); return p; };
      line.forEach((piece,i) => piece.placeLimb(point(i/8),point((i+1)/8),.0015+.001*hot)
                                     .color(cg.mix([.9,.95,1],[3,.1,.1],hot)));

      // 7. Fish: swimmers circling under the surface, the one on the hook, the catch held up

      swimmers.forEach(s => {
         const a = s.phase + s.speed*t;
         s.fish.place([POND[0]+s.radius*Math.cos(a),WATER-.12,POND[2]+s.radius*.8*Math.sin(a)],
                      -a - Math.sign(s.speed)*Math.PI/2, .5*Math.sin(6*t+s.phase), .2);
      });
      for (const look of Object.values(looks)) look.fish.root.identity().scale(0);
      boot.identity().scale(0);
      catchText('');
      const under = ['nibbling','bite','fight'].includes(game.state) && game.fish;
      if (under && !game.fish.junk) {
         const look = looks[game.fish.name];
         const thrash = game.state === 'fight' ? (game.surging ? 1.1 : .6) : .3;
         look.fish.place(cg.add(bob.p,[-.1*look.size,-.12,0]),Math.PI/2+.6*Math.sin(3*t),
                         thrash*Math.sin((game.surging ? 22 : 9)*t),look.size);
      }
      if (caught && game.state === 'landed') {
         caught.age += dt;
         const u = clamp(caught.age/.6,0,1), p = cg.mix(caught.from,SHOW,u*u*(3-2*u));
         p[1] += .5*Math.sin(Math.PI*u);
         if (caught.fish.junk) boot.identity().move(p).turnY(2*t).scale(1.2);
         else looks[caught.fish.name].fish.place(p,2*t,.8*Math.sin(14*t),looks[caught.fish.name].size*1.3,.3*Math.sin(5*t));
         if (u === 1) catchText(caught.fish.name + (caught.fish.junk ? '  ' : '  ' + caught.kg.toFixed(1) + ' KG  +') + caught.points);
         if (caught.age > LANDED_FOR) caught = null;
      }

      // 8. Water and ripples

      water.identity().move(POND[0],WATER,POND[2]).scale(RADIUS,.004,RADIUS);
      for (const r of ripples) {
         r.age += dt/.9;
         const on = r.age < 1;
         r.node.identity().move(r.p[0],WATER+.006,r.p[2]).scale(on ? .05+.4*r.age : 0,.05,on ? .05+.4*r.age : 0)
               .opacity(on ? .6*(1-r.age) : .001);
      }

      // 9. Share my snapshot, and draw everyone else at their place on the dock

      const r3 = v => v.map(x => Math.round(x*1000)/1000);
      if (t >= nextSend) {
         nextSend = t + 1/SEND_HZ;
         fishingPond['p'+me()] = {q:++seq, m:joined, ph:game.phase, s:game.state, sc:game.score, f:game.caught,
                                  l:game.lines, o:r3(pose.o), d:r3(pose.d), b:r3(bob.p),
                                  k:game.fish && ['fight','landed'].includes(game.state) ? game.fish.name : ''};
         share('p'+me());
      }
      const mySlot = slotX(present.indexOf(me()));
      const seen = new Set();
      present.forEach((id,i) => {
         if (id === me() || !all[id] || !Array.isArray(all[id].o)) return;
         const e = all[id], o = otherPlayer(id,i), shift = [slotX(i)-mySlot,0,0];
         const follow = 1-Math.exp(-15*dt);                  // smooth 15 snapshots a second into every frame
         const ease = (a,b) => a && cg.distance(a,b) < 3 ? cg.mix(a,b,follow) : b.slice();
         o.o = ease(o.o,cg.add(e.o,shift)); o.d = cg.normalize(ease(o.d,e.d)); o.b = ease(o.b,cg.add(e.b,shift));
         const tipP = cg.add(o.o,cg.scale(o.d,ROD)), grip = cg.add(o.o,cg.scale(o.d,HANDLE));
         o.rod[0].placeLimb(o.o,grip,.016); o.rod[1].placeLimb(grip,tipP,.009);
         const sag = e.s === 'fight' ? .02 : .15;
         const at = u => { const p = cg.mix(tipP,o.b,u); p[1] -= 4*sag*u*(1-u); return p; };
         o.line.forEach((piece,j) => piece.placeLimb(at(j/4),at((j+1)/4),.0015));
         o.bobber.identity().move(o.b).scale(.03);
         o.tag(nameOf(id) + '  ' + (e.sc|0),cg.add(o.o,[0,.8,0]),1.1);
         o.status(e.ph === 'won' ? 'WINS!' : e.ph === 'lost' ? 'OUT' : e.s === 'fight' ? 'FIGHTING ' + e.k + '!'
                  : e.s === 'landed' && e.k ? 'CAUGHT ' + e.k : e.s === 'bite' ? 'BITE!' : '', cg.add(o.o,[0,.72,0]),.9);
         seen.add(id);
      });
      for (const [id,o] of others) if (!seen.has(id)) {
         for (const n of [...o.rod,...o.line,o.bobber]) n.identity().scale(0);
         o.tag(''); o.status(''); o.o = null;
      }
      const ranking = joined === null ? [] : standings(all,present,joined,me());
      board(present.length < 2 ? ''
            : ranking.length ? ranking.map((p,i) => (i+1) + ' ' + (p.id === me() ? 'YOU' : nameOf(p.id)) + ' ' + (p.sc|0)).join('    ')
            : present.length + ' PLAYERS AT THE POND');

      // 10. Text and gauges

      if (before === 'playing' && game.phase !== 'playing') {
         endTime = t; held.left = held.right = false;
         kit.tone(game.phase === 'won' ? 1000 : 130,.4);
         buzz('left',1,game.phase === 'won' ? 400 : 150); buzz('right',1,game.phase === 'won' ? 400 : 150);
      }
      const live = game.phase === 'playing', fighting = live && game.state === 'fight';
      status('SCORE ' + game.score + '/' + game.goal + '   FISH ' + game.caught + '   LINES ' + game.lines +
             '   TIME ' + Math.ceil(game.remaining));
      const place = ranking.findIndex(p => p.id === me()) + 1, others2 = ranking.length > 1;
      message(mp.phase === 'countdown' && game.phase !== 'playing' ? 'MATCH STARTS IN ' + Math.ceil(mp.left)
            : game.phase !== 'playing' && t < busyUntil ? 'A match is running - wait for it to end'
            : game.phase === 'ready' ? (xr ? 'Pull a trigger to start' : 'Press SPACE to start')
                                       + (present.length > 1 ? ' a match for ' + present.length : '')
            : game.phase === 'won'   ? 'YOU WIN - ' + (others2 ? 'first to ' + game.goal + '! ' : '')
                                       + game.score + ' points, ' + game.caught + ' fish in ' + Math.round(elapsed) + ' s'
            : game.phase === 'lost'  ? 'YOU LOST - ' + lostReason + ' (' + game.score + '/' + game.goal
                                       + (others2 && place ? ', place ' + place + ' of ' + ranking.length : '') + ')'
            : noticeTime > 0         ? notice
            : game.state === 'idle'     ? (xr ? 'Pull your hand back, then THROW it toward the pond' : 'Press SPACE to cast')
            : game.state === 'flying'   ? '...'
            : game.state === 'waiting'  ? 'Wait... feel for taps'
            : game.state === 'nibbling' ? 'Something is there - hold still!'
            : game.state === 'bite'     ? (xr ? 'STRIKE! Pull the trigger now!' : 'STRIKE! Press SPACE now!')
            : game.state === 'fight'    ? (game.surging ? 'It is pulling - LET GO!'
                                          : game.tension > .8 ? 'Too tight - ease off!'
                                          : xr ? 'Hold trigger to reel in' : 'Hold W to reel in')
            : '');
      tensionText(fighting ? 'TENSION' : '');
      reelText(fighting ? 'REEL' : '');
      const values = {tension:clamp(game.tension,0,1), reel:clamp(game.progress,0,1)};
      for (const key in bars) {
         const bar = bars[key], w = .42, v = values[key];
         bar.back.identity().move(.12,bar.y,HUD_Z).scale(fighting ? w : 0,.028,.004);
         bar.fill.identity().move(.12-w+w*v,bar.y,HUD_Z+.006).scale(fighting ? Math.max(.001,w*v) : 0,.02,.004)
                 .color(key === 'reel' ? [.3,.8,1] : cg.mix([.3,1,.4],[1.5,.1,.1],clamp((v-.5)/.5,0,1)));
      }
      const waiting = !live && mp.phase === 'countdown';
      button.identity().move(buttonP).scale(live || waiting ? 0 : .27,live || waiting ? 0 : .07,.02);
      buttonText(live || waiting ? '' : game.phase === 'ready' ? 'START' : 'PLAY AGAIN');
      inputText(xr ? 'ROD IN ' + rodHand.toUpperCase() + ' HAND   TRIGGER ' + (held[rodHand] ? 'DOWN' : 'UP')
                     + '   HAND SPEED ' + cg.norm(handVel).toFixed(1)
                   : 'KEYBOARD MODE');
   });
};
