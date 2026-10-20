import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const url = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
const read = file => readFile(new URL(file,import.meta.url),'utf8');
const cgURL = url(await read('../../render/core/cg.js'));
const rulesURL = url(await read('./pocketCityRules.js'));

class Node {
   constructor() { this.nodes = []; }
   add() { const n = new Node(); this.nodes.push(n); return n; }
   nChildren() { return this.nodes.length; }
   remove(index) { this.nodes.splice(index,1); }
   animate(fn) { this.frame = fn; }
}
for (const method of ['move','scale','color','dull','opacity','identity'])
   Node.prototype[method] = function() { return this; };
Node.prototype.scale = function(...args) { this.lastScale = args; return this; };
Node.prototype.identity = function() { this.lastScale = [1]; return this; };
const findChildCount = (node,count) => node.nodes.length === count || node.nodes.some(child => findChildCount(child,count));

test('building an example asks AI for four buildings and renders their cubes', async () => {
   const labels = {}, listeners = {};
   const answer = {title:'Mini Harbor',buildings:Array.from({length:4},(_,i) => ({
      name:`House ${i+1}`,blocks:[
         {x:0,y:0,z:0,kind:'stone'}, {x:1,y:0,z:0,kind:'clay'},
         {x:0,y:1,z:0,kind:'glass'}, {x:1,y:1,z:0,kind:'light'},
      ]}))};
   Object.assign(globalThis,{
      window:globalThis, inputEvents:{},
      clay:{defineTextMesh:(name,text) => {labels[name] = text;}},
      addEventListener:(name,fn) => {listeners[name] = fn;},
      removeEventListener:name => {delete listeners[name];},
      testCityAnswer:answer, testCityQuery:null, testBeamMatrix:null,
      testJoy:{left:{x:0,y:0},right:{x:0,y:0}},
   });
   const stubs = {
      "'../../render/core/cg.js'": JSON.stringify(cgURL),
      "'../../render/core/controllerInput.js'": JSON.stringify(url('export const joyStickState=globalThis.testJoy; export class ControllerBeam {constructor(model,hand){this.hand=hand} update(){} beamMatrix(){return globalThis.testBeamMatrix?.[this.hand] || null}}')),
      "'../../util/aiquery.js'": JSON.stringify(url('export async function askAIJson(prompt){globalThis.testCityQuery=prompt;return globalThis.testCityAnswer;}')),
      "'./pocketCityRules.js'": JSON.stringify(rulesURL),
   };
   let source = await read('./pocketCity.js');
   for (const [from,to] of Object.entries(stubs)) {
      assert.ok(source.includes(from)); source = source.replace(from,to);
   }
   const scene = await import(url(source));
   const model = new Node();
   await scene.init(model);
   const key = key => listeners.keydown({key,preventDefault(){},target:null});
   key('v');
   model.frame();
   assert.equal(labels.pocketCity_status,'GROW THE CITY BEFORE ENTERING');
   assert.deepEqual(model.nodes[1].lastScale,[0], 'street view stays hidden before generation');
   for (let i = 0; i < 4; i++) key(' ');
   // The left controller points straight down at a different empty cell.
   globalThis.testBeamMatrix = {left:[1,0,0,0,0,1,0,0,0,1,0,0,-.36,1.4,-1.16,1]};
   inputEvents.onPress('left');
   key('=');
   assert.equal(labels.pocketCity_zoom,'SCALE 1.2X');
   // Point at the visible centre of cell 0,2 after the build area has grown.
   globalThis.testBeamMatrix.left = [1,0,0,0,0,1,0,0,0,1,0,0,-.558,1.4,-1.142,1];
   inputEvents.onPress('left');
   key('g');
   model.frame();
   assert.match(labels.pocketCity_status,/AI BUILDING/);
   assert.equal(labels.pocketCity_progress,'0S');
   await Promise.resolve(); await Promise.resolve();
   model.frame();
   assert.match(globalThis.testCityQuery,/"y":3/);
   assert.match(globalThis.testCityQuery,/"x":2,"y":0,"z":2/);
   assert.match(globalThis.testCityQuery,/"x":0,"y":0,"z":2/);
   assert.equal(labels.pocketCity_status,'CITY READY');
   assert.ok(findChildCount(model,22), 'six example cubes plus sixteen AI cubes');
   key('v');
   assert.deepEqual(model.nodes[0].lastScale,[0], 'the table hides in street view');
   assert.deepEqual(model.nodes[1].lastScale,[1], 'the full-size district appears');
   key('v');
   assert.deepEqual(model.nodes[0].lastScale,[1], 'the table returns with the same city');
   scene.deinit();
   assert.equal(listeners.keydown,undefined);
});
