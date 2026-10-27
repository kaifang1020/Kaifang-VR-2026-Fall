// Run: node --test js/scenes/hw2/fishing.test.mjs
// Data URLs allow testing this browser ES module without changing the
// course server's CommonJS package configuration.
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
const url = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const rulesURL = url(await readFile(new URL('./fishingRules.js', import.meta.url), 'utf8'));
const { FishingGame, FISH, pickFish, SNAP_AFTER, LANDED_FOR } = await import(rulesURL);
const syncURL = url(await readFile(new URL('./pondSync.js', import.meta.url), 'utf8'));
const hapticsURL = url(await readFile(new URL('./haptics.js', import.meta.url), 'utf8'));
const castURL = url((await readFile(new URL('./castPhysics.js', import.meta.url), 'utf8'))
   .replace('../../render/core/cg.js', url(await readFile(new URL('../../render/core/cg.js', import.meta.url), 'utf8'))));
const pond = await import(syncURL);
const musicSource = await readFile(new URL('./fishingMusic.js', import.meta.url), 'utf8');
const { mixFor, tempoFor } = await import(url(musicSource));
// In the scene tests the synthesizer is replaced by a recorder: Node has no WebAudio.
const musicURL = url(`export const createFishingMusic = () => ({
   on(){}, dispose(){ globalThis.musicLog.push('dispose'); },
   update(g){ globalThis.musicState = g; }, cue(name,big){ globalThis.musicLog.push(name + (big ? '!' : '')); } });`);

const DT = 1/60;
const byName = name => FISH.find(f => f.name === name);
// A deterministic generator, so a failing run can be reproduced.
const seeded = seed => () => (seed = (seed*1664525+1013904223) % 4294967296) / 4294967296;
// Random source that always picks the named fish and otherwise returns .5.
const always = name => {
   const total = FISH.reduce((s,f) => s+f.weight,0);
   let before = 0;
   for (const f of FISH) { if (f.name === name) break; before += f.weight; }
   const pick = (before + byName(name).weight/2)/total;
   let calls = 0;
   // wait() draws first, then pickFish draws; every later draw is mid-range.
   return () => (calls++ % 2 === 1 && calls <= 2 ? pick : .5);
};
const run = (game, seconds, input = {}) => {
   const events = [];
   for (let t = 0; t < seconds; t += DT) events.push(...game.tick(DT, typeof input === 'function' ? input(game) : input));
   return events;
};
const until = (game, state, limit = 20) => {
   const events = [];
   for (let t = 0; t < limit && game.state !== state && game.phase === 'playing'; t += DT) events.push(...game.tick(DT));
   return events;
};
const hook = name => {
   const game = new FishingGame(120,3,800,always(name));
   game.reset(); game.cast(); game.land(true);
   const events = until(game,'bite');
   return {game,events};
};

test('nothing happens before the game starts, and casting needs an idle rod', () => {
   const g = new FishingGame();
   assert.equal(g.phase,'ready'); assert.equal(g.cast(),false);
   assert.deepEqual(g.tick(5,{strike:true,reel:true}),[]); assert.equal(g.remaining,120);
   g.reset(); assert.equal(g.cast(),true); assert.equal(g.cast(),false);
   assert.deepEqual(g.land(false),[{type:'missedPond'}]); assert.equal(g.state,'idle');
   g.cast(); assert.deepEqual(g.land(true),[{type:'splash'}]); assert.equal(g.state,'waiting');
});

test('every fish announces itself with its own number of nibbles before the bite', () => {
   for (const fish of FISH) {
      const {events} = hook(fish.name);
      assert.equal(events.filter(e => e.type === 'nibble').length, fish.nibbles, fish.name);
      assert.equal(events.filter(e => e.type === 'rumble').length, fish.junk ? 1 : 0, fish.name);
      assert.deepEqual(events.at(-1), {type:'bite',weak:!!fish.junk}, fish.name);
   }
});

test('striking during the nibbles scares the fish; waiting too long lets it escape', () => {
   const game = new FishingGame(120,3,800,always('GOLDEN KOI'));
   game.reset(); game.cast(); game.land(true);
   until(game,'nibbling');
   assert.deepEqual(game.tick(DT,{strike:true}),[{type:'early'}]);
   assert.equal(game.state,'waiting'); assert.equal(game.score,0);

   const late = hook('BASS').game;
   const events = run(late, byName('BASS').window + .1);
   assert.ok(events.some(e => e.type === 'escaped'));
   assert.equal(late.state,'waiting');
});

test('a boot costs points but never drops the score below zero', () => {
   const {game} = hook('OLD BOOT');
   game.score = 30;
   const events = game.tick(DT,{strike:true});
   assert.equal(events[0].type,'junk'); assert.equal(game.score,0); assert.equal(game.state,'landed');
   run(game, LANDED_FOR + .1); assert.equal(game.state,'idle');
});

test('holding the trigger without pause snaps the line and costs one line', () => {
   const {game} = hook('BASS');
   game.tick(DT,{strike:true}); assert.equal(game.state,'fight');
   const events = run(game, 6, {reel:true});
   assert.ok(events.some(e => e.type === 'snap'));
   assert.equal(game.lines,2); assert.equal(game.state,'idle'); assert.equal(game.score,0);
});

test('never reeling lets the hooked fish get away', () => {
   const {game} = hook('GOLDEN KOI');
   game.tick(DT,{strike:true});
   const events = run(game, 30);
   assert.ok(events.some(e => e.type === 'escaped'));
   assert.equal(game.lines,3);
});

test('reeling in pulses and easing off during surges lands every real fish', () => {
   const careful = g => ({reel: !g.surging && g.tension < .8});
   for (const fish of FISH.filter(f => !f.junk)) {
      const {game} = hook(fish.name);
      game.tick(DT,{strike:true});
      let seconds = 0, caught = null;
      while (game.state === 'fight' && seconds < 40) {
         caught = game.tick(DT,careful(game)).find(e => e.type === 'caught') || caught;
         seconds += DT;
      }
      assert.ok(caught, fish.name + ' should be landed');
      assert.equal(caught.points, fish.points);
      assert.ok(caught.kg >= fish.kg[0] && caught.kg <= fish.kg[1]);
      assert.ok(seconds < 16, fish.name + ' took ' + seconds.toFixed(1) + 's');
      assert.equal(game.lines,3);
   }
});

test('losing all three lines ends the game; so does the clock', () => {
   const game = new FishingGame(120,3,800,always('BASS'));
   game.reset();
   let last = [];
   for (let i = 0; i < 3 && game.phase === 'playing'; i++) {
      game.cast(); game.land(true); until(game,'bite');
      game.tick(DT,{strike:true});
      last = run(game, 6, {reel:true});
   }
   assert.equal(game.phase,'lost'); assert.equal(game.lines,0);
   assert.ok(last.some(e => e.type === 'lost' && e.reason === 'lines'));
   assert.deepEqual(game.tick(1,{reel:true,strike:true}),[]);

   const slow = new FishingGame(5,3,800);
   slow.reset();
   assert.ok(run(slow,5.2).some(e => e.type === 'lost' && e.reason === 'time'));
   assert.equal(slow.phase,'lost');
});

test('the goal is reachable but not guaranteed for a player with human timing', () => {
   // The bot plays the way the instructions describe, at a human pace: four
   // seconds to recast, .45 s to react to a bite (boots included, since it does
   // not read the haptics), and reeling in pulses up to 65% tension.
   let wins = 0;
   const games = 200;
   for (let seed = 1; seed <= games; seed++) {
      const game = new FishingGame(120,3,800,seeded(seed*7919));
      game.reset();
      let idle = 0, flying = 0, bite = 0;
      while (game.phase === 'playing') {
         let strike = false;
         if (game.state === 'idle' && (idle += DT) > 4) { game.cast(); idle = 0; flying = 0; }
         if (game.state === 'flying' && (flying += DT) > 1) game.land(true);
         if (game.state === 'bite') { if ((bite += DT) > .45) strike = true; } else bite = 0;
         game.tick(DT,{strike, reel: game.state === 'fight' && !game.surging && game.tension < .65});
      }
      if (game.phase === 'won') wins++;
   }
   assert.ok(wins >= games*.7, 'only ' + wins + ' of ' + games + ' games were won');
   assert.ok(wins <= games*.97, wins + ' of ' + games + ' games were won: too easy');
});

test('fish are picked in proportion to their weights', () => {
   assert.equal(pickFish(0).name,'MINNOW'); assert.equal(pickFish(.999).name,'OLD BOOT');
   const counts = {};
   const random = seeded(42);
   for (let i = 0; i < 4000; i++) { const f = pickFish(random()); counts[f.name] = (counts[f.name] || 0) + 1; }
   for (const fish of FISH) assert.ok(Math.abs(counts[fish.name]/4000 - fish.weight/100) < .04, fish.name);
   assert.ok(SNAP_AFTER > 0);
});

// Run the real scene callbacks with a lightweight renderer and controller stub.
// This checks the scene's wiring (input -> rules -> text), not just the rules.
const cgURL = url(await readFile(new URL('../../render/core/cg.js', import.meta.url), 'utf8'));
const cg = await import(cgURL);
const kitURL = url(`export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const buzz=(...a)=>globalThis.testBuzz.push(a); export const createKit=()=>globalThis.testKit;`);
const globalURL = url('export const gltfRoot={addNode:n=>globalThis.testGltf.push(n)};');
const gltfURL = url('export class Gltf2Node{constructor(o){Object.assign(this,o);}}');
class SceneNode {
   constructor() { this.nodes = []; this.time = 0; this.deltaTime = 1/60; }
   add() { const n = new SceneNode(); this.nodes.push(n); return n; }
   nChildren() { return this.nodes.length; } child(i) { return this.nodes[i]; }
   animate(fn) { this.frame = fn; }
}
for (const method of ['color','move','scale','identity','turnX','turnY','turnZ','placeLimb','dull','opacity'])
   SceneNode.prototype[method] = function(...args) {
      assert.ok(args.flat().every(v => typeof v !== 'number' || Number.isFinite(v)), method + ' received non-finite geometry');
      return this;
   };
SceneNode.prototype.setMatrix = function(m) {            // only the rod is placed with a whole matrix
   assert.ok(m.every(Number.isFinite),'setMatrix received non-finite geometry');
   globalThis.rodMatrix = m;
   return this;
};
async function scene({xr = false, id = 0, clients = [id]} = {}) {
   const labels = {}, model = new SceneNode(), texts = {};
   let seed = 12345;
   Math.random = () => (seed = (seed*1664525+1013904223) % 4294967296) / 4294967296;
   globalThis.window = globalThis; globalThis.clientID = id; globalThis.clients = clients;
   // The wall clock follows the simulated time, so shared match times are deterministic.
   Date.now = () => (1.7e9 + model.time)*1000;
   globalThis.sent = [];
   globalThis.fishingPond = undefined;
   globalThis.server = {synchronize: name => globalThis[name],
                        broadcastGlobalElement: (name,key) => globalThis.sent.push(structuredClone(globalThis[name][key]))};
   globalThis.clay = {defineTextMesh: (name,text) => texts[name] = text};
   globalThis.clientData = {};
   globalThis.musicLog = []; globalThis.musicState = null;
   globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
   globalThis.testBuzz = []; globalThis.testGltf = [];
   globalThis.inputEvents = {pos: () => xr ? [.2,1,-.3] : null};
   globalThis.clientState = {head: () => xr ? new Array(16).fill(0) : null};
   globalThis.isXR = () => xr;
   const kit = globalThis.testKit = {keys:new Set(), label:id => s => labels[id] = s,
      onKey:fn => kit.key = fn, update(){}, tone(){}, dispose(){ kit.disposed = true; },
      pointsAt:() => true, ray:() => kit.pose, tracked:() => xr};
   kit.pose = {o:[.2,1,-.3], d:cg.normalize([0,.5,-1])};
   const source = (await readFile(new URL('./fishing.js', import.meta.url), 'utf8'))
      .replace('../../render/core/cg.js',cgURL).replace('./gameKit.js',kitURL).replace('./fishingRules.js',rulesURL)
      .replace('../../global.js',globalURL).replace('../../render/nodes/gltf2.js',gltfURL).replace('./pondSync.js',syncURL).replace('./fishingMusic.js',musicURL).replace('./castPhysics.js',castURL).replace('./haptics.js',hapticsURL);
   const module = await import(url(source + '\n// ' + Math.random()));
   await module.init(model);
   const step = () => { model.time += 1/60; model.frame(); };
   const advance = seconds => { for (let i = 0; i < Math.ceil(seconds*60); i++) step(); };
   advance(1/60);
   return {model,kit,labels,texts,advance,step,module,game:globalThis.fishingGame};
}
// Plays with the keyboard the way the on-screen instructions describe.
function playByKeys({kit,step,game,labels}, seconds, seen = new Set()) {
   let idle = 0, bite = 0;
   for (let i = 0; i < seconds*60 && game.phase === 'playing'; i++) {
      if (game.state === 'idle' && ++idle > 90) { kit.key(' '); idle = 0; }
      if (game.state === 'bite') { if (++bite === 20 && !game.fish.junk) kit.key(' '); } else bite = 0;
      if (game.state === 'fight' && !game.surging && game.tension < .7) kit.keys.add('w'); else kit.keys.delete('w');
      step();
      seen.add(game.state); seen.add(labels.message); if (labels.catch) seen.add(labels.catch);
   }
}

test('fishing scene: keyboard play reaches YOU WIN; text shows score and status; restart resets', async () => {
   const s = await scene();
   assert.match(s.labels.message,/Press SPACE to start/); assert.equal(s.labels.button,'START');
   assert.equal(s.labels.input,'KEYBOARD MODE');
   assert.equal(globalThis.testGltf.length,5);
   assert.match(s.labels.how1,/cast/); assert.match(s.labels.fish3,/3 FAST TAPS  GOLDEN KOI  \+400/);
   assert.match(s.labels.fish4,/LONG RUMBLE  OLD BOOT  -50/);
   s.kit.key(' '); s.advance(.05);
   assert.equal(s.game.phase,'playing'); assert.equal(s.labels.button,'');
   assert.match(s.labels.message,/Press SPACE to cast/);
   const seen = new Set();
   playByKeys(s,125,seen);
   for (const state of ['flying','waiting','nibbling','bite','fight','landed']) assert.ok(seen.has(state), 'never reached ' + state);
   assert.ok(seen.has('STRIKE! Press SPACE now!')); assert.ok(seen.has('Hold W to reel in'));
   assert.ok([...seen].some(m => /^HOOKED a /.test(m)));
   assert.ok([...seen].some(m => /^[A-Z ]+  \d\.\d KG  \+\d00$/.test(m)), 'the catch should be announced with weight and points');
   assert.equal(s.game.phase,'won');
   assert.match(s.labels.message,/YOU WIN - \d+ points, \d+ fish in \d+ s/);
   assert.match(s.labels.status,/SCORE (8|9|1\d)\d\d\/800   FISH \d+   LINES \d   TIME \d+/);
   assert.equal(s.labels.button,'PLAY AGAIN');
   assert.ok(globalThis.testBuzz.length > 20, 'haptics should fire during play');
   s.kit.key('r'); s.advance(.05);
   assert.match(s.labels.status,/SCORE 0\/800   FISH 0   LINES 3   TIME 120/);
   s.module.deinit(); assert.equal(s.kit.disposed,true);
});

test('fishing scene: running out of time or lines says YOU LOST with the reason', async () => {
   const s = await scene();
   s.kit.key(' '); s.advance(121);
   assert.match(s.labels.message,/YOU LOST - out of time \(0\/800\)/);
   s.kit.key(' '); s.advance(.05);
   assert.equal(s.game.phase,'playing');
   // Reel without ever letting go: three broken lines.
   let idle = 0, bite = 0;
   for (let i = 0; i < 120*60 && s.game.phase === 'playing'; i++) {
      if (s.game.state === 'idle' && ++idle > 60) { s.kit.key(' '); idle = 0; }
      if (s.game.state === 'bite') { if (++bite === 15) s.kit.key(' '); } else bite = 0;
      if (s.game.state === 'fight') s.kit.keys.add('w'); else s.kit.keys.delete('w');
      s.step();
   }
   if (s.game.lines === 0) assert.match(s.labels.message,/YOU LOST - no lines left/);
   else assert.match(s.labels.message,/YOU LOST - out of time/);
   assert.ok(s.game.lines < 3, 'constant reeling should break lines');
   s.module.deinit();
});

// A VR player: the rod points along the beam from the controller at `o`.
const vrPlayer = s => {
   let o = [.2,1,-.3], pitch = .7;
   const place = () => s.kit.pose = {o:o.slice(), d:[0,Math.sin(pitch),-Math.cos(pitch)]};
   place();
   return {
      at: (p,a = pitch) => { o = p.slice(); pitch = a; place(); },
      // Move the hand by `delta` metres over `seconds`, frame by frame.
      move: (delta,seconds) => {
         const frames = Math.round(seconds*60), from = o.slice();
         for (let i = 1; i <= frames; i++) { o = cg.add(from,cg.scale(delta,i/frames)); place(); s.step(); }
      },
      flick: () => { for (let i = 0; i < 6; i++) { pitch += .05; place(); s.step(); } },
   };
};

test('fishing scene in VR: any trigger starts; throwing the hand forward casts that way', async () => {
   const s = await scene({xr:true});
   const hand = vrPlayer(s);
   s.advance(.2);
   assert.match(s.labels.message,/Pull a trigger to start/);
   assert.match(s.labels.input,/^ROD IN RIGHT HAND   TRIGGER UP/);
   s.kit.pointsAt = () => false;                          // no need to aim at START
   inputEvents.onPress('right'); inputEvents.onRelease('right'); s.advance(.05);
   assert.equal(s.game.phase,'playing');
   assert.match(s.labels.message,/THROW it toward the pond/);

   s.advance(1);
   hand.move([0,0,.25],.5);                               // pull back slowly: no cast
   hand.move([0,0,-.02],.4);                              // drift forward slowly: no cast
   assert.equal(s.game.state,'idle');

   hand.move([-.12,.1,-.5],.2);                            // throw forward and a little left: 2.5 m/s
   assert.equal(s.game.state,'flying');
   for (let i = 0; i < 240 && s.game.state === 'flying'; i++) { s.step(); }
   assert.equal(s.game.state,'waiting','the cast should land in the pond');

   for (let i = 0; i < 1200 && s.game.state !== 'bite'; i++) s.step();
   assert.equal(s.game.state,'bite'); assert.match(s.labels.message,/STRIKE/);
   const junk = s.game.fish.junk;
   hand.flick();
   assert.equal(s.game.state, junk ? 'landed' : 'fight');
   if (!junk) {
      inputEvents.onPress('left'); s.advance(.3);         // either trigger reels
      assert.ok(s.game.progress > .25); assert.match(s.labels.tension,/TENSION/);
      inputEvents.onRelease('left');
   }
   s.module.deinit();
});

test('fishing scene in VR: the cast follows the direction of the throw', async () => {
   const landing = async dx => {
      const s = await scene({xr:true});
      const hand = vrPlayer(s);
      inputEvents.onPress('right'); s.advance(1);
      hand.move([dx,.1,-.5],.2);
      assert.equal(s.game.state,'flying');
      for (let i = 0; i < 240 && s.game.state === 'flying'; i++) s.step();
      const x = s.game.state === 'waiting' ? 'pond' : 'missed';
      s.module.deinit();
      return {x, state: s.game.state};
   };
   // Thrown straight: lands in the pond. Thrown hard sideways: misses it.
   assert.equal((await landing(0)).x,'pond');
   assert.equal((await landing(-.9)).x,'missed');
});

test('fishing scene in VR: moving the hand while fighting or right after a catch never casts', async () => {
   const s = await scene({xr:true});
   const hand = vrPlayer(s);
   inputEvents.onPress('right'); s.advance(1);
   s.game.state = 'landed'; s.game.timer = .05;           // a catch is just finishing
   s.advance(.1);
   assert.equal(s.game.state,'idle');
   hand.move([0,0,-.5],.2);                                // still reeling-in motion right after the catch
   assert.equal(s.game.state,'idle','no cast in the first moments after a catch');
   s.module.deinit();
});

test('fishing scene in VR: gentle rod movement while waiting is not a strike', async () => {
   const s = await scene({xr:true});
   const hand = vrPlayer(s);
   inputEvents.onPress('right'); s.advance(1);
   hand.move([0,.1,-.5],.2);
   for (let i = 0; i < 240 && s.game.state === 'flying'; i++) s.step();
   for (let i = 0; i < 1200 && s.game.state !== 'nibbling'; i++) { hand.at([.2,1.1,-.8],.7 + .05*Math.sin(i/20)); s.step(); }
   assert.equal(s.game.state,'nibbling');
   for (let i = 0; i < 6; i++) { hand.at([.2,1.1,-.8],.7 + .05*Math.sin(i/20)); s.step(); }
   assert.notEqual(s.game.state,'waiting','swaying gently must not scare the fish');
   s.module.deinit();
});

test('fishing scene: the rod follows the tracked controller, and stays put on the desktop', async () => {
   const rodOrigins = async xr => {
      const s = await scene({xr});
      const hand = vrPlayer(s), origins = [];
      for (const p of [[.2,1,-.3],[-.3,1.3,-.1]]) { hand.at(p); s.step(); origins.push(globalThis.rodMatrix.slice(12,15)); }
      s.module.deinit();
      return origins;
   };
   const vr = await rodOrigins(true), desk = await rodOrigins(false);
   assert.deepEqual(vr.map(p => p.map(v => +v.toFixed(3))),[[.2,1,-.3],[-.3,1.3,-.1]]);
   assert.deepEqual(desk[0],desk[1]);
});

test('fishing scene in VR: pulling the trigger on the bite hooks the fish; during the taps it scares it', async () => {
   const bite = async wanted => {
      const s = await scene({xr:true});
      const hand = vrPlayer(s);
      inputEvents.onPress('right'); inputEvents.onRelease('right'); s.advance(1);
      hand.move([0,.1,-.5],.2);
      for (let i = 0; i < 240 && s.game.state === 'flying'; i++) s.step();
      for (let i = 0; i < 1200 && s.game.state !== wanted; i++) s.step();
      assert.equal(s.game.state,wanted);
      return s;
   };
   let s = await bite('bite');
   assert.match(s.labels.message,/STRIKE! Pull the trigger now!/);
   const junk = s.game.fish.junk;
   inputEvents.onPress('right'); s.step();
   assert.equal(s.game.state, junk ? 'landed' : 'fight');
   if (!junk) { s.advance(.3); assert.ok(s.game.progress > .25, 'keeping the trigger held reels in'); }
   inputEvents.onRelease('right'); s.module.deinit();

   s = await bite('nibbling');
   inputEvents.onPress('right'); s.step(); inputEvents.onRelease('right');
   assert.equal(s.game.state,'waiting'); assert.match(s.labels.message,/Too early/);
   s.module.deinit();
});

// ---------- Several players ----------

test('pond rules: slots, match phases, who is present, standings and the winner', () => {
   assert.deepEqual([0,1,2,3,4].map(pond.slotX),[-0,.9,-.9,1.8,-1.8]);
   assert.equal(pond.matchPhase(null,5).phase,'none');
   const m = {id:7, t0:100};
   assert.deepEqual(pond.matchPhase(m,98),{phase:'countdown',left:2});
   assert.deepEqual(pond.matchPhase(m,130),{phase:'on',elapsed:30});
   assert.equal(pond.matchPhase(m,100+pond.MATCH_SECONDS+1).phase,'over');
   assert.equal(pond.matchPhase(m,100+pond.MATCH_SECONDS+60).phase,'none');   // stale, e.g. restored from storage

   const entries = {'0':{m:7,sc:200,f:1,ph:'playing'}, '3':{m:7,sc:400,f:2,ph:'won'},
                    '9':{m:7,sc:900,ph:'won'}, '5':{m:6,sc:999,ph:'playing'}};
   const seen = {'3':9, '9':1, '5':9};
   const here = pond.presentPlayers(entries,seen,0,10,id => id !== '5');
   assert.deepEqual(here,['0','3']);                       // 9 went quiet, 5 left the room
   assert.deepEqual(pond.standings(entries,here,7).map(p => p.id),['3','0']);
   assert.equal(pond.winnerOf(entries,here,7,0).id,'3');
   assert.equal(pond.winnerOf(entries,['0'],7,0),null);
   assert.equal(pond.anyonePlaying(entries,here,3),true);
   assert.equal(pond.anyonePlaying(entries,here,0),false);
});

test('forfeit ends a running game once and only once', () => {
   const g = new FishingGame(); g.reset();
   assert.deepEqual(g.forfeit(),[{type:'lost',reason:'beaten'}]);
   assert.equal(g.phase,'lost'); assert.deepEqual(g.forfeit(),[]);
});

// Makes another player appear at the pond, as the network would.
const otherPlayer = (s,id,snapshot) => {
   globalThis.fishingPond['p'+id] = {q:(globalThis.fishingPond['p'+id]?.q|0)+1, o:[.1,1,-.3], d:[0,.5,-.87], b:[.1,.5,-.5],
                                    s:'idle', ph:'ready', sc:0, f:0, l:3, m:null, k:'', ...snapshot};
};

test('multiplayer: alone, SPACE starts at once; my snapshot is shared about 15 times a second', async () => {
   const s = await scene();
   s.kit.key(' '); s.advance(.05);
   assert.equal(s.game.phase,'playing');
   const match = globalThis.fishingPond.match;
   assert.ok(match && Number.isFinite(match.t0));
   globalThis.sent = []; s.advance(1);
   const mine = globalThis.sent.filter(e => e && e.q);
   assert.ok(mine.length >= 13 && mine.length <= 17, mine.length + ' snapshots in one second');
   assert.equal(mine.at(-1).m,match.id); assert.equal(mine.at(-1).ph,'playing');
   assert.equal(s.labels.board,'', 'no leaderboard when fishing alone');
   s.module.deinit();
});

test('multiplayer: with a second player the match starts for both after a countdown', async () => {
   const s = await scene({clients:[0,4]});
   otherPlayer(s,4,{}); s.advance(.2);
   assert.match(s.labels.message,/Press SPACE to start a match for 2/);
   assert.equal(s.labels.board,'2 PLAYERS AT THE POND');
   s.kit.key(' '); s.advance(.1);
   assert.equal(s.game.phase,'ready');
   assert.match(s.labels.message,/MATCH STARTS IN 3/);
   assert.equal(s.labels.button,'');
   s.advance(3);
   assert.equal(s.game.phase,'playing');
   // The other player, at the next place on the dock, is drawn with name and score.
   const id = globalThis.fishingPond.match.id;
   otherPlayer(s,4,{m:id, ph:'playing', s:'fight', sc:200, f:1, k:'BASS'}); s.advance(.3);
   const texts = Object.values(s.texts);
   assert.ok(texts.includes('PLAYER 2  200'), texts.join(' | '));
   assert.ok(texts.includes('FIGHTING BASS!'));
   assert.match(s.labels.board,/^1 PLAYER 2 200    2 YOU 0$/);
   s.module.deinit();
});

test('multiplayer: a match someone else starts pulls me in; their win ends my game', async () => {
   const s = await scene({id:4, clients:[0,4]});
   otherPlayer(s,0,{}); s.advance(.2);
   globalThis.fishingPond.match = {id:55, t0:Date.now()/1000 + 3};    // player 0 pressed START
   s.advance(1);
   assert.match(s.labels.message,/MATCH STARTS IN 2/);
   s.advance(2.1);
   assert.equal(s.game.phase,'playing','joined automatically');
   otherPlayer(s,0,{m:55, ph:'won', sc:800, f:4});
   s.advance(.1);
   assert.equal(s.game.phase,'lost');
   assert.match(s.labels.message,/^YOU LOST - PLAYER 1 reached 800 first \(0\/800, place 2 of 2\)$/);
   // While the winner's result is up, SPACE starts a fresh match.
   s.advance(1.2); s.kit.key(' '); s.advance(.1);
   assert.notEqual(globalThis.fishingPond.match.id,55);
   s.module.deinit();
});

test('multiplayer: a player who stops sending disappears; nobody can restart over a running match', async () => {
   const s = await scene({clients:[0,4]});
   otherPlayer(s,4,{ph:'playing', m:9}); s.advance(.2);
   s.kit.key(' '); s.advance(.1);
   assert.equal(globalThis.fishingPond.match,null,'the other player is still playing');
   assert.match(s.labels.message,/A match is running/);
   s.advance(3);                                             // no new snapshots from player 4
   assert.equal(s.labels.board,'');
   s.kit.key(' '); s.advance(.1);
   assert.equal(s.game.phase,'playing','alone again: starts at once');
   s.module.deinit();
});

test('multiplayer: a player whose frames arrive late still joins the match that was counted down', async () => {
   const s = await scene({id:4, clients:[0,4]});
   otherPlayer(s,0,{}); s.advance(.2);
   globalThis.fishingPond.match = {id:77, t0:Date.now()/1000 + 3};
   s.advance(.5);                                           // saw the countdown
   s.model.time += 4;                                       // then a long stall: the next frame is well after the start
   s.step();
   assert.equal(s.game.phase,'playing');
   assert.ok(s.game.remaining > 118 && s.game.remaining < 119, 'the late player gets the time that is left: ' + s.game.remaining);
   s.module.deinit();
});

test('multiplayer: a match that was never counted down on this device is not joined uninvited', async () => {
   const s = await scene({id:4, clients:[0,4]});
   otherPlayer(s,0,{}); s.advance(.2);
   globalThis.fishingPond.match = {id:78, t0:Date.now()/1000 - 10};   // already running when we arrived
   s.advance(.5);
   assert.equal(s.game.phase,'ready');
   s.kit.key(' '); s.advance(.1);                            // but pressing START joins it, with the time that is left
   assert.equal(s.game.phase,'playing');
   assert.ok(s.game.remaining < 111 && s.game.remaining > 109);
   assert.equal(globalThis.fishingPond.match.id,78,'joined, not restarted');
   s.module.deinit();
});

// ---------- Music ----------

test('music steps back while a fish tests the bait, goes quiet on the bite and turns tense in a fight', () => {
   const calm = mixFor({phase:'playing', state:'waiting'});
   const nibble = mixFor({phase:'playing', state:'nibbling'});
   const bite = mixFor({phase:'playing', state:'bite'});
   const loose = mixFor({phase:'playing', state:'fight', tension:.1});
   const tight = mixFor({phase:'playing', state:'fight', tension:.95});
   const surge = mixFor({phase:'playing', state:'fight', tension:.5, surging:true});
   assert.ok(nibble.pluck < calm.pluck/4 && nibble.bass < calm.bass/4, 'quiet enough to count the taps');
   assert.equal(bite.pluck + bite.bass + bite.shaker + bite.fight, 0);
   assert.equal(calm.fight, 0);
   assert.ok(tight.fight > loose.fight && tight.shaker > loose.shaker);
   assert.equal(surge.fight, 1);
   assert.ok(mixFor({phase:'playing', state:'waiting', remaining:10}).shaker > calm.shaker, 'hurry in the last seconds');
   assert.equal(mixFor({phase:'lost'}).pluck, 0);
   assert.ok(mixFor({phase:'ready'}).pluck > 0);
   for (const m of [calm,nibble,bite,loose,tight,surge]) for (const v of Object.values(m)) assert.ok(v >= 0 && v <= 1);
   assert.deepEqual([tempoFor({phase:'playing',state:'waiting'}), tempoFor({phase:'playing',state:'fight'}),
                     tempoFor({phase:'playing',state:'waiting',remaining:5})],[76,92,88]);
});

test('fishing scene: the music follows the game and plays the catch, flop, win and lose phrases', async () => {
   const s = await scene();
   s.kit.key(' '); s.advance(.05);
   assert.equal(globalThis.musicState.phase,'playing');
   const states = new Set();
   let idle = 0, bite = 0;
   for (let i = 0; i < 125*60 && s.game.phase === 'playing'; i++) {
      if (s.game.state === 'idle' && ++idle > 90) { s.kit.key(' '); idle = 0; }
      if (s.game.state === 'bite') { if (++bite === 20) s.kit.key(' '); } else bite = 0;
      if (s.game.state === 'fight' && !s.game.surging && s.game.tension < .7) s.kit.keys.add('w'); else s.kit.keys.delete('w');
      s.step();
      states.add(globalThis.musicState.state);
   }
   for (const state of ['waiting','nibbling','bite','fight']) assert.ok(states.has(state), 'music never heard ' + state);
   assert.ok(globalThis.musicLog.some(c => c.startsWith('catch')));
   assert.equal(globalThis.musicLog.at(-1), s.game.phase === 'won' ? 'win' : 'lose');
   s.module.deinit();
   assert.equal(globalThis.musicLog.at(-1),'dispose');

   // Reeling without ever letting go snaps the line: the flop phrase.
   const t = await scene();
   t.kit.key(' '); t.advance(.05);
   idle = 0; bite = 0;
   for (let i = 0; i < 120*60 && !globalThis.musicLog.includes('flop'); i++) {
      if (t.game.state === 'idle' && ++idle > 60) { t.kit.key(' '); idle = 0; }
      if (t.game.state === 'bite') { if (++bite === 15) t.kit.key(' '); } else bite = 0;
      if (t.game.state === 'fight') t.kit.keys.add('w'); else t.kit.keys.delete('w');
      t.step();
   }
   assert.ok(globalThis.musicLog.includes('flop'), 'a snapped line (or a boot) plays the flop');
   t.module.deinit();
});

// ---------- Casting math (castPhysics.js) ----------

const cast = await import(castURL);
const fly = v0 => {                                          // launch from a typical rod tip and fly until landing
   let p = [.2,1.9,-1.6], v = v0, t = 0;
   while (!cast.hasLanded(p) && t < 5) { ({p,v} = cast.flightStep(p,v,1/72)); t += 1/72; }
   return {p, t};
};

test('cast: hand velocity is smoothed, and a still hand has none', () => {
   assert.deepEqual(cast.handVelocity([0,0,0],null,[0,1,0],1/60),[0,0,0]);
   const v = cast.handVelocity([0,0,0],[0,1,0],[0,1,-.05],1/60);   // moved 5 cm in one frame: 3 m/s
   assert.ok(Math.abs(v[2] - -1.2) < 1e-9, 'only 40% of a single frame counts');
});

test('cast: only a fast enough movement toward the pond, after settling, is a throw', () => {
   const hand = [0,1,-.3];
   assert.ok(cast.forwardSpeed([0,0,-2],hand) > 1.9);
   assert.ok(cast.forwardSpeed([0,0,2],hand) < 0, 'pulling back is not forward');
   assert.ok(Math.abs(cast.forwardSpeed([2,0,0],hand)) < .1, 'sideways is not forward');
   assert.equal(cast.isThrow(2,1),true);
   assert.equal(cast.isThrow(1,1),false);
   assert.equal(cast.isThrow(2,.3),false, 'right after a catch');
});

test('cast: launch speed is kept between CAST_MIN and CAST_MAX and always rises', () => {
   for (const hand of [[0,0,-.2],[0,0,-1.5],[0,0,-9]]) {
      const v = cast.throwVelocity(hand), speed = Math.hypot(...v);
      assert.ok(speed >= cast.CAST_MIN - 1e-9 && speed <= cast.CAST_MAX + 1e-9, String(speed));
      assert.ok(v[1] >= 1);
   }
   assert.ok(cast.launchVelocity([0,-3,-3])[1] >= 1, 'even a downward request rises');
});

test('cast: a straight throw lands in the pond, a hard sideways one misses, a harder one goes farther', () => {
   const straight = fly(cast.throwVelocity([0,0,-1.5]));
   assert.ok(cast.inPond(straight.p), JSON.stringify(straight.p));
   assert.ok(!cast.inPond(fly(cast.throwVelocity([-2,0,-.3])).p));
   const soft = fly(cast.throwVelocity([0,0,-1.1])), hard = fly(cast.throwVelocity([0,0,-2.2]));
   assert.ok(hard.p[2] < soft.p[2] - .5, 'farther');
   assert.ok(straight.t > .5 && straight.t < 1.5, 'about a second in the air: ' + straight.t.toFixed(2));
});

// ---------- Vibration vocabulary (haptics.js) ----------

const haptics = await import(hapticsURL);

test('haptics: every entry is a list of valid pulses the motor can play', () => {
   for (const [name,{pulses}] of Object.entries(haptics.HAPTICS)) {
      assert.ok(pulses.length > 0, name);
      for (const p of pulses) {
         assert.ok(p.s > 0 && p.s <= 1, name + ' strength');
         assert.ok(p.ms >= 50, name + ': pulses shorter than 50 ms are hard to feel');
         assert.ok(p.at >= 0, name);
      }
   }
   assert.ok(haptics.HAPTICS.bite.pulses[0].s > haptics.HAPTICS.nibble.pulses[0].s, 'the bite is stronger than a tap');
   assert.ok(haptics.HAPTICS.biteWeak.pulses[0].s < haptics.HAPTICS.bite.pulses[0].s, 'a boot bites softer');
   assert.equal(haptics.HAPTICS.caught.pulses.length,3);
});

test('haptics: tighter line, stronger and faster pulses; a surge rattles fast', () => {
   const loose = haptics.tensionPulse(.1,false), tight = haptics.tensionPulse(.95,false), over = haptics.tensionPulse(1.1,false);
   assert.ok(tight.s > loose.s && tight.every < loose.every);
   assert.deepEqual(over,haptics.tensionPulse(1,false),'no stronger than full');
   assert.ok(haptics.tensionPulse(.1,true).every < tight.every);
   assert.ok(haptics.castPulse(10).s === 1 && haptics.castPulse(0).s === .3);
});

test('fishing scene: vibrations come from the shared table', async () => {
   const s = await scene();
   s.kit.key(' '); s.advance(.05);
   let idle = 0;
   for (let i = 0; i < 60*60 && s.game.state !== 'fight'; i++) {
      if (s.game.state === 'idle' && ++idle > 60) { s.kit.key(' '); idle = 0; }
      if (s.game.state === 'bite' && !s.game.fish.junk) s.kit.key(' ');
      s.step();
   }
   const felt = globalThis.testBuzz.map(([,st,ms]) => st + '/' + ms);
   assert.ok(felt.includes('0.7/100'),'splash');
   assert.ok(felt.includes('0.8/80'),'nibble');
   assert.ok(felt.includes('1/220') || felt.includes('0.5/120'),'bite');
   s.module.deinit();
});
