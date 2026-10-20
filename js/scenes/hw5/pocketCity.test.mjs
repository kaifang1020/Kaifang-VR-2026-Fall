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
      testCityAnswer:answer, testCityQuery:null,
   });
   const stubs = {
      "'../../render/core/cg.js'": JSON.stringify(cgURL),
      "'../../render/core/controllerInput.js'": JSON.stringify(url('export class ControllerBeam {update(){} beamMatrix(){return null}}')),
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
   for (let i = 0; i < 4; i++) key(' ');
   key('g');
   await Promise.resolve(); await Promise.resolve();
   model.frame();
   assert.match(globalThis.testCityQuery,/"y":3/);
   assert.equal(labels.pocketCity_status,'CITY READY');
   assert.ok(model.nodes.some(n => n.nodes.length === 20), 'four example cubes plus sixteen AI cubes');
   scene.deinit();
   assert.equal(listeners.keydown,undefined);
});
