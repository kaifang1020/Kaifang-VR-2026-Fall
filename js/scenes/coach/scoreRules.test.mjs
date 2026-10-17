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
        ROUND_POSES, COUNTDOWN_POSES, LINGER_POSES, POINTS,
        activePlayers, teamResult, JUDGE_WAIT, ACTIVE_POSES } = await import(rulesURL);

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

test('team: a pose waits for every active player, then judges; a result that never comes is a miss', () => {
   const results = {'0': {10: true, 11: true}, '1': {10: true}};
   assert.deepEqual(activePlayers(results, 11), ['0','1'], 'player 1 reported recently, so pose 11 waits for them');
   assert.equal(teamResult(results, ['0','1'], 11, .5), null, 'still waiting');
   results['1'][11] = false;
   assert.deepEqual(teamResult(results, ['0','1'], 11, .5), {n:2, good:1, late:0});
   assert.deepEqual(teamResult({'0': {12: true}, '1': {}}, ['0','1'], 12, JUDGE_WAIT), {n:2, good:1, late:1}, 'gave up waiting');
   assert.deepEqual(teamResult({'0': {12: true}, '1': {12: true}}, ['0','1'], 12, 0), {n:2, good:2, late:0}, 'no need to wait');
   assert.deepEqual(activePlayers({'0': {20: true}, '1': {[20 - ACTIVE_POSES - 1]: true}}, 20), ['0'], 'a player silent for a while no longer counts');
   assert.deepEqual(activePlayers({'0': {20: true}, '1': {20: true}}, 20, id => id !== '1'), ['0'], 'a disconnected player no longer counts');
   assert.ok(JUDGE_WAIT < 2, 'judged before the next pose ends');
});

// Two devices on a slow network, as in the course's level 7. B's clock follows A's
// shared clock, so it runs one latency behind; every report takes one latency to
// arrive. Both players hit every pose at 1.0 beat, except that B misses every third.
function playTogether(latency, rule) {
   const beat = .6, dt = 1/120, devices = [0, 1].map(id => ({id, results: {}, judged: -1, combo: 0, lastK: null, hit: false, verdicts: {}}));
   const queue = [];
   const send = (from, k, ok) => { from.results[from.id] ||= {}; from.results[from.id][k] = ok;
      queue.push({to: devices[1 - from.id], id: from.id, k, ok, at: t + latency}); };
   let t = 0;
   for (; t < 40; t += dt) {
      for (let i = queue.length - 1; i >= 0; i--) if (queue[i].at <= t) { const m = queue.splice(i, 1)[0]; (m.to.results[m.id] ||= {})[m.k] = m.ok; }
      for (const d of devices) {
         const clock = t - (d.id === 1 ? latency : 0), k = Math.floor(clock/(2*beat)), u = clock/beat % 2;
         if (k < 2) continue;
         if (k !== d.lastK) { if (d.lastK !== null && !d.hit) send(d, d.lastK, false); d.hit = false; d.lastK = k; if (d.judged < 0) d.judged = k - 1; }
         const misses = d.id === 1 && k % 3 === 2;
         if (!d.hit && !misses && u >= 1) { d.hit = true; send(d, k, true); }
         if (rule === 'old') {                                  // the previous rule: judge 0.3 beat in, with what has arrived
            if (u > .3 && d.judged !== k - 1) {
               d.judged = k - 1;
               const good = Object.values(d.results).filter(r => r[k - 1] === true).length, n = Object.values(d.results).filter(r => r[k - 1] !== undefined).length;
               d.verdicts[k - 1] = n > 0 && good === n;
            }
         }
         else while (d.judged < k - 1) {                         // the new rule, exactly as coach.js step 5
            const pose = d.judged + 1, players = activePlayers(d.results, pose);
            const r = players.length ? teamResult(d.results, players, pose, 2*(k - pose - 1) + u) : {n: 0, good: 0};
            if (!r) break;
            d.judged = pose;
            d.verdicts[pose] = r.n > 0 && r.good === r.n;
         }
      }
   }
   const poses = Object.keys(devices[0].verdicts).filter(k => k in devices[1].verdicts && k >= 4 && k <= 28);
   return {poses, disagree: poses.filter(k => devices[0].verdicts[k] !== devices[1].verdicts[k]),
           wrong: poses.filter(k => devices[0].verdicts[k] !== (k % 3 !== 2))};
}

test('team: on a slow network the old rule makes the two devices disagree; the new rule never does', () => {
   const old = playTogether(.4, 'old');
   assert.ok(old.disagree.length > 5, 'the bug: devices disagreed on ' + old.disagree.length + ' poses');
   for (const latency of [0, .08, .2, .3, .4]) {
      const r = playTogether(latency, 'new');
      assert.ok(r.poses.length > 20, 'enough poses judged at ' + latency);
      assert.deepEqual(r.disagree, [], 'devices disagree at ' + latency + ' s: ' + r.disagree);
      assert.deepEqual(r.wrong, [], 'wrong verdicts at ' + latency + ' s: ' + r.wrong);
   }
});

// Run the real scene with a lightweight renderer, a fake clock and no headset:
// the ghost hands play a whole round. This checks the wiring from input to text.
const cgURL = url(await read('../../render/core/cg.js'));
const cg = await import(cgURL);
const stubs = {
   '"../../render/core/controllerInput.js"': JSON.stringify(url(
      'export function ControllerBeam(){this.update=()=>{};this.beamMatrix=()=>globalThis.testBeam||null;}')),
   '"./music.js"': JSON.stringify(url(
      'export const createMusic=()=>({audioOn(){},schedule(){},ding(){},cue:n=>globalThis.cues.push(n),reset(){},dispose(){globalThis.disposed=true;}});')),
   '"./coachClock.js"': JSON.stringify(url(await read('./coachClock.js'))),
   '"./coachAvatarPose.js"': JSON.stringify(url('export const coachAvatarPose=()=>null;')),
   '"../../util/aiquery.js"': JSON.stringify(url('export const askAIJson=async()=>{if(globalThis.testAIAnswer instanceof Error)throw globalThis.testAIAnswer;return globalThis.testAIAnswer;}')),
   '"./coachAI.js"': JSON.stringify(url(await read('./coachAI.js'))),
   '"./coachPromptUI.js"': JSON.stringify(url('export const mountCoachPromptUI=fn=>{globalThis.testPromptGenerate=fn;return {remove(){}}};')),
   '"./coachPromptBoard.js"': JSON.stringify(url('export const createCoachPromptBoard=()=>({update:ai=>globalThis.testBoardPrompt=ai?.prompt||null});')),
   '"./coachKeyboard.js"': JSON.stringify(url(await read('./coachKeyboard.js'))),
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
      testBeam:null, testAIAnswer:null, testPromptGenerate:null, testBoardPrompt:null,
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
   const started = performance.now();                    // a runaway judging loop once froze the first frame
   const s = await scene();
   try {
      assert.equal(s.labels.title,'FOLLOW THE COACH'); assert.equal(s.labels.start,'START');
      assert.equal(s.labels.score,''); assert.match(s.labels.help1,/START/);

      s.listeners.keydown(space); s.advance(.1);
      assert.ok(s.sent.includes('round')); assert.equal(s.labels.status,'GET READY');
      assert.match(s.labels.score,/^[1-6]$/); assert.equal(s.labels.start,'');
      assert.equal(s.labels.kb_toggle,'AFTER THE ROUND', 'the prompt button stays visible and says why it cannot be used');
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
      assert.ok(performance.now() - started < 5000, 'the scene must run in real time');
   } finally { s.restore(); }
});

test('recording a phrase asks AI once, then both phrases play in the shared routine', async () => {
   const s = await scene();
   try {
      const matrix = (x,y,z) => { const m = cg.mIdentity(); m[12]=x; m[13]=y; m[14]=z; return m; };
      globalThis.clientState.head = () => matrix(0,1.6,.4);
      globalThis.inputEvents.pos = hand => hand === 'left' ? [-.3,1.2,.1] : [.3,1.2,.1];
      globalThis.testBeam = matrix(0,.95,0); // beam points toward the coach's chest
      globalThis.testAIAnswer = { title:'Tidal Echo', poses:Array.from({length:4},(_,i) =>
         ({a:[.2,.3-i*.08,.1],b:[.25,-.5+i*.1,.1],squat:0,sway:0})) };
      s.advance(1/60);
      globalThis.inputEvents.onPress('left');
      assert.equal(globalThis.coach.mode.rec,0);
      s.advance(6);
      assert.equal(globalThis.coach.mode.ai.state,'thinking');
      assert.equal(globalThis.coach.mode.custom.length,4);
      assert.equal(s.labels.status,'AI IS WRITING A RESPONSE');
      await Promise.resolve();
      await Promise.resolve();
      s.advance(1/60);
      assert.equal(globalThis.coach.mode.ai.state,'ready');
      assert.equal(globalThis.coach.mode.ai.title,'TIDAL ECHO');
      assert.equal(globalThis.coach.mode.custom.length,8);
      assert.match(s.labels.status,/^(YOUR MOVES|AI RESPONSE)/);
      assert.equal(s.sent.filter(key => key === 'mode').length,3);
      s.module.deinit();
   } finally { s.restore(); }
});

test('an AI request failure leaves the player-recorded phrase playable', async () => {
   const s = await scene();
   try {
      const matrix = (x,y,z) => { const m = cg.mIdentity(); m[12]=x; m[13]=y; m[14]=z; return m; };
      globalThis.clientState.head = () => matrix(0,1.6,.4);
      globalThis.inputEvents.pos = hand => hand === 'left' ? [-.3,1.2,.1] : [.3,1.2,.1];
      globalThis.testBeam = matrix(0,.95,0);
      globalThis.testAIAnswer = new Error('offline');
      s.advance(1/60);
      globalThis.inputEvents.onPress('left');
      s.advance(6);
      await Promise.resolve();
      await Promise.resolve();
      s.advance(1/60);
      assert.equal(globalThis.coach.mode.ai.state,'error');
      assert.equal(globalThis.coach.mode.custom.length,4);
      assert.match(s.labels.status,/AI UNAVAILABLE/);
      s.module.deinit();
   } finally { s.restore(); }
});

test('a typed prompt creates an eight-pose shared routine without recording', async () => {
   const s = await scene();
   try {
      globalThis.testAIAnswer = {title:'Underwater Drift', poses:Array.from({length:8},(_,i) =>
         ({a:[.2,.3-i*.1,.1],b:[.25,-.5+i*.1,.1],squat:0,sway:0}))};
      let message = '';
      await globalThis.testPromptGenerate('drift underwater', text => { message = text; });
      s.advance(1/60);
      assert.equal(globalThis.coach.mode.ai.source,'prompt');
      assert.equal(globalThis.coach.mode.ai.state,'ready');
      assert.equal(globalThis.coach.mode.custom.length,8);
      assert.equal(globalThis.coach.mode.ai.title,'UNDERWATER DRIFT');
      assert.equal(globalThis.coach.mode.ai.prompt,'drift underwater');
      assert.equal(globalThis.testBoardPrompt,'drift underwater');
      assert.match(s.labels.status,/AI ROUTINE 1\/8/);
      assert.match(message,/Created: UNDERWATER DRIFT/);
      assert.ok(s.sent.includes('mode'));
      s.module.deinit();
   } finally { s.restore(); }
});

test('a player in VR types a prompt on the in-world keyboard and gets the same routine', async () => {
   const s = await scene();
   try {
      const beamAt = (x,y) => { const m = cg.mIdentity(); m[12]=x; m[13]=y; m[14]=0; globalThis.testBeam = m; };   // a beam straight ahead (-z)
      const pressAt = (x,y) => { beamAt(x,y); globalThis.inputEvents.onPress('left'); s.advance(1/60); };
      assert.equal(s.labels.kb_toggle,'TYPE A PROMPT');
      assert.equal(s.labels.kb_Q,'', 'the keyboard starts closed');
      pressAt(.94,1.07);                                      // TYPE A PROMPT, beside the coach
      assert.equal(s.labels.kb_toggle,'HIDE KEYBOARD'); assert.equal(s.labels.kb_Q,'Q');
      pressAt(.42-.2325,1.2);                                 // the UNDERWATER idea
      assert.match(s.labels.kb_draft,/^> \.\.\..*THE SURFACE_$/, 'a long prompt shows its end');
      pressAt(.42+.105,1.0+.1-3*.062);                        // DEL after an idea removes the whole idea
      assert.equal(s.labels.kb_draft,'> _');
      pressAt(.42-.2325,1.2);                                 // pick it again
      globalThis.testAIAnswer = {title:'Tidal Drift', poses:Array.from({length:8},(_,i) =>
         ({a:[.2,.3-i*.1,.1],b:[.25,-.5+i*.1,.1],squat:0,sway:0}))};
      pressAt(.42+.235,1.0+.1-3*.062);                        // GO
      await new Promise(resolve => setTimeout(resolve, 0));
      s.advance(1/60);
      assert.equal(globalThis.coach.mode.ai.source,'prompt');
      assert.equal(globalThis.coach.mode.ai.state,'ready');
      assert.equal(globalThis.coach.mode.ai.prompt,'drifting underwater, then reaching for the surface');
      assert.equal(globalThis.coach.mode.custom.length,8);
      assert.match(s.labels.kb_status,/CREATED: TIDAL DRIFT/);
      for (let i = 0; i < 6; i++) {                           // a few seconds of the new routine
         s.advance(1);
         assert.equal(s.labels.kb_toggle,'HIDE KEYBOARD', 'the button stays after a routine is generated (' + i + ' s)');
         assert.equal(s.labels.kb_Q,'Q', 'the keyboard stays open (' + i + ' s)');
      }
      globalThis.testAIAnswer = {title:'Swim Lanes', poses:Array.from({length:8},(_,i) =>
         ({a:[.3,.2-i*.1,.1],b:[.3,-.4+i*.1,.1],squat:0,sway:0}))};
      pressAt(.42-.235,1.0+.1-3*.062);                        // CLEAR
      for (const ch of 'SWIM') { const row = ['QWERTYUIOP','ASDFGHJKL','ZXCVBNM'].findIndex(r => r.includes(ch)), r = ['QWERTYUIOP','ASDFGHJKL','ZXCVBNM'][row];
         pressAt(.42 + (r.indexOf(ch) - (r.length - 1) / 2) * .062, 1.0 + .1 - row * .062); }
      assert.match(s.labels.kb_draft,/^> SWIM_$/);
      pressAt(.42+.235,1.0+.1-3*.062);                        // GO again
      await new Promise(resolve => setTimeout(resolve, 0));
      s.advance(1/60);
      assert.equal(globalThis.coach.mode.ai.prompt,'swim', 'a second prompt replaces the first');
      assert.equal(globalThis.coach.mode.ai.title,'SWIM LANES');
      s.module.deinit();
   } finally { s.restore(); }
});
