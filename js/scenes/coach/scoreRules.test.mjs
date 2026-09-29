// Run: node --test js/scenes/coach/scoreRules.test.mjs
// Data URLs allow testing these browser ES modules without changing the
// course server's CommonJS package configuration.
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
const url = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const rulesURL = url(await read('./scoreRules.js'));
const { RoundScore, roundPhase, gradeOf, multiplier, goalFor, rankFor,
        ROUND_POSES, COUNTDOWN_POSES, LINGER_POSES, POINTS } = await import(rulesURL);

test('a hit is PERFECT only when it is both early and well centred', () => {
   assert.equal(gradeOf(.8,1.0),'PERFECT'); assert.equal(gradeOf(.45,1.4),'PERFECT');
   assert.equal(gradeOf(.8,1.7),'GOOD');    assert.equal(gradeOf(.2,1.0),'GOOD');
});

test('the multiplier rises by a quarter every fourth hit in a row and stops at double', () => {
   assert.deepEqual([0,3,4,7,8,12,16,40].map(multiplier),[1,1,1.25,1.25,1.5,1.75,2,2]);
   assert.equal(multiplier(-3),1);
});

test('hits score with the multiplier earned before them; a miss resets the combo', () => {
   const r = new RoundScore(24);
   for (let i = 0; i < 4; i++) assert.equal(r.hit('GOOD'),60);
   assert.equal(r.hit('PERFECT'),125); assert.equal(r.combo,5); assert.equal(r.multiplier,1.25);
   r.miss();
   assert.equal(r.combo,0); assert.equal(r.best,5); assert.equal(r.multiplier,1);
   assert.equal(r.hit('PERFECT'),100);
   assert.deepEqual([r.score,r.perfect,r.good,r.missed,r.judged],[465,2,4,1,7]);
   assert.deepEqual(r.last,{grade:'PERFECT',points:100});
   assert.equal(r.hit('AMAZING'),0); assert.equal(r.judged,7);
});

test('nothing is scored after the last pose of the round', () => {
   const r = new RoundScore(3);
   r.hit('GOOD'); r.miss(); r.hit('GOOD');
   assert.equal(r.hit('PERFECT'),0); r.miss();
   assert.deepEqual([r.score,r.judged,r.missed],[120,3,1]);
});

test('winning needs 50 points per pose; ranks follow the score', () => {
   assert.equal(goalFor(ROUND_POSES),1200);
   const allGood = new RoundScore(); for (let i = 0; i < 24; i++) allGood.hit('GOOD');
   const allPerfect = new RoundScore(); for (let i = 0; i < 24; i++) allPerfect.hit('PERFECT');
   const halfMissed = new RoundScore(); for (let i = 0; i < 24; i++) i % 2 ? halfMissed.miss() : halfMissed.hit('GOOD');
   assert.equal(allPerfect.score,3800); assert.equal(allPerfect.rank,'S'); assert.ok(allPerfect.won);
   assert.equal(allGood.score,2280);    assert.equal(allGood.rank,'A');    assert.ok(allGood.won);
   assert.equal(halfMissed.score,720);  assert.equal(halfMissed.rank,'C'); assert.ok(!halfMissed.won);
   assert.equal(rankFor(1200,24),'B'); assert.equal(rankFor(1199,24),'C');
   assert.equal(POINTS.PERFECT,100);
});

test('a shared round goes from countdown to playing to done, then expires', () => {
   const round = {k0:100, n:24};
   assert.deepEqual(roundPhase(null,50),{phase:'free'});
   assert.deepEqual(roundPhase({k0:NaN,n:24},50),{phase:'free'});
   assert.deepEqual(roundPhase(round,100-COUNTDOWN_POSES),{phase:'countdown',posesLeft:COUNTDOWN_POSES});
   assert.deepEqual(roundPhase(round,100),{phase:'playing',index:0,count:24});
   assert.deepEqual(roundPhase(round,123),{phase:'playing',index:23,count:24});
   assert.deepEqual(roundPhase(round,124),{phase:'done',count:24});
   assert.deepEqual(roundPhase(round,124+LINGER_POSES),{phase:'free'});
});

// Run the real scene with a lightweight renderer, a fake clock and no headset:
// the ghost hands play a whole round. This checks the wiring from input to text.
const cgURL = url(await read('../../render/core/cg.js'));
const cg = await import(cgURL);
const stubs = {
   '"../../render/core/controllerInput.js"': JSON.stringify(url(
      'export function ControllerBeam(){this.update=()=>{};this.beamMatrix=()=>null;}')),
   '"./music.js"': JSON.stringify(url(
      'export const createMusic=()=>({audioOn(){},schedule(){},ding(){},cue:n=>globalThis.cues.push(n),reset(){},dispose(){globalThis.disposed=true;}});')),
   '"./coachClock.js"': JSON.stringify(url(await read('./coachClock.js'))),
   '"./coachAvatarPose.js"': JSON.stringify(url('export const coachAvatarPose=()=>null;')),
   '"./scoreRules.js"': JSON.stringify(rulesURL),
   '"./coachRoutine.js"': JSON.stringify(url(await read('./coachRoutine.js'))),
   '"../../render/core/cg.js"': JSON.stringify(cgURL),
};
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
async function scene() {
   const labels = {}, listeners = {}, sent = [], model = new SceneNode();
   let now = 1.7e9;                                        // seconds; the scene reads Date.now()
   const realNow = Date.now;
   Date.now = () => now*1000;
   Object.assign(globalThis,{cues:[], disposed:false, clientID:0, clients:[0], worldCoords:cg.mIdentity(),
      window:globalThis, inputEvents:{pos:() => null},
      clientState:{head:() => null, hand:() => null},
      clay:{defineTextMesh:(name,text) => labels[name.replace('coachText_','')] = text},
      server:{synchronize:name => globalThis[name], broadcastGlobalElement:(name,key) => sent.push(key)},
      addEventListener:(type,fn) => listeners[type] = fn, removeEventListener:type => delete listeners[type]});
   let source = await read('./coach.js');
   for (const [from,to] of Object.entries(stubs)) { assert.ok(source.includes(from), from); source = source.replace(from,to); }
   const module = await import(url(source + '\n// ' + Math.random()));
   await module.init(model);
   const advance = seconds => { for (let i = 0; i < Math.ceil(seconds*60); i++) { now += 1/60; model.time += 1/60; model.frame(); } };
   advance(1/60);
   return {labels,listeners,sent,advance,module,restore:() => Date.now = realNow};
}
const space = {key:' ', preventDefault(){}, target:null};

test('coach scene: free practice, countdown, scored round, result text and replay', async () => {
   const s = await scene();
   try {
      assert.equal(s.labels.title,'FOLLOW THE COACH'); assert.equal(s.labels.start,'START');
      assert.equal(s.labels.score,''); assert.match(s.labels.help1,/START/);

      s.listeners.keydown(space); s.advance(.1);
      assert.ok(s.sent.includes('round')); assert.equal(s.labels.status,'GET READY');
      assert.match(s.labels.score,/^[1-6]$/); assert.equal(s.labels.start,'');
      s.listeners.keydown(space);                          // a second press must not restart the countdown
      const k0 = globalThis.coach.round.k0;

      const seen = new Set(), popups = new Set();
      for (let i = 0; i < 40*60 && !/^YOU (WIN|LOST)/.test(s.labels.score); i++) {
         s.advance(1/60); seen.add(s.labels.status.replace(/\d+\//,'N/')); if (s.labels.popup) popups.add(s.labels.popup.replace(/\d+/,'N'));
      }
      assert.equal(globalThis.coach.round.k0,k0);
      assert.ok(seen.has('POSE N/24 - Match both hand targets'));
      assert.ok(popups.has('GO!')); assert.ok(popups.has('MISS'), 'the ghost fumbles every fifth pose');
      assert.ok([...popups].some(p => /^(PERFECT|GOOD)  \+N$/.test(p)));
      assert.match(s.labels.score,/^YOU (WIN|LOST) - RANK [SABC] - \d+\/1200$/);
      const [, outcome, rank, score] = s.labels.score.match(/^YOU (WIN|LOST) - RANK (.) - (\d+)/);
      assert.equal(outcome === 'WIN', Number(score) >= 1200); assert.equal(rank === 'C', Number(score) < 1200);
      assert.match(s.labels.help1,/PERFECT \d+   GOOD \d+   MISS [3-6]/);
      assert.equal(s.labels.start,'PLAY AGAIN');
      assert.ok(globalThis.cues.includes('go')); assert.ok(globalThis.cues.includes(outcome === 'WIN' ? 'win' : 'lose'));

      s.listeners.keydown(space); s.advance(.1);
      assert.notEqual(globalThis.coach.round.k0,k0); assert.equal(s.labels.status,'GET READY');
      s.advance(4);
      assert.match(s.labels.score,/^SCORE \d+   x1(\.25)?   COMBO \d+$/);

      s.module.deinit();
      assert.equal(globalThis.disposed,true); assert.equal(s.listeners.keydown,undefined);
   } finally { s.restore(); }
});
