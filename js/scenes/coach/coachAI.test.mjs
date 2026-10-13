import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = await readFile(new URL('./coachAI.js', import.meta.url), 'utf8');
const { coachReplyPrompt, coachTextPrompt, validateCoachReply } = await import(
   'data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

const pose = (a = [.2,.3,.05], b = [.25,-.6,.05], squat = 0) => ({a,b,squat,sway:0});

test("the AI prompt includes the player's recorded movement and a constrained response format", () => {
   const human = [pose(), pose([.6,-.2,.2],[.2,.2,0])];
   const prompt = coachReplyPrompt(human);
   assert.match(prompt, /exactly four response poses/i);
   assert.ok(prompt.includes(JSON.stringify(human)));
   assert.match(prompt, /Do not simply copy/);
});

test('the response is four reachable poses with a safe display title', () => {
   const result = validateCoachReply({title:'  Tidal <Echo>  ', poses:[
      pose([100,-100,1],[.2,.2,0],1), pose([.2,.2,0],[.2,.2,0],1),
      pose(),pose()
   ]});
   assert.equal(result.title,'TIDAL ECHO');
   assert.deepEqual(result.poses[0].a,[.65,-.7,.5]);
   assert.equal(result.poses[0].squat,1);
   assert.equal(result.poses[1].squat,0);
   assert.equal(result.poses.length,4);
});

test('a typed movement idea requests a complete eight-pose routine', () => {
   const prompt = coachTextPrompt('drift underwater, then reach the surface');
   assert.match(prompt,/eight-pose choreography/);
   assert.match(prompt,/drift underwater/);
   const result = validateCoachReply({title:'Underwater Drift',poses:Array.from({length:8},()=>pose())},8);
   assert.equal(result.poses.length,8);
   assert.throws(() => validateCoachReply({title:'short',poses:[pose()]},8), /exactly 8 poses/);
});

test('invalid AI output is rejected before it reaches rendering and scoring', () => {
   assert.throws(() => validateCoachReply({poses:[pose()]}), /exactly 4 poses/);
   assert.throws(() => validateCoachReply({poses:[pose(),pose(),pose(),pose([NaN,0,0])]}), /invalid hand/);
   assert.throws(() => validateCoachReply({poses:[pose(),pose(),pose(),pose('bad')]}), /invalid hand/);
});
