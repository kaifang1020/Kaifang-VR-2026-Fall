// Run: node --test js/scenes/hw3/echoGardenRules.test.mjs
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = await readFile(new URL('./echoGardenRules.js', import.meta.url),'utf8');
const url = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const { GARDEN, MAX_SEEDS, applyGardenMessage, emptyGarden, gardenLinks, gardenPosition,
        noteAtHeight, midiToHz } = await import(url);

const plant = (id,owner,x,y,color=0,z=GARDEN.minZ) => ({op:'plant',id,owner,color,pos:[x,y,z]});

test('operations reproduce the same garden on another client', () => {
   const first = emptyGarden(), second = emptyGarden();
   const messages = [plant('a','alice',-.1,1.5),plant('b','bob',.1,1.6,1),
                     {op:'move',id:'a',pos:[0,1.7,GARDEN.z]}];
   for (const message of messages) {
      assert.equal(applyGardenMessage(first,message),true);
      assert.equal(applyGardenMessage(second,message),true);
   }
   assert.deepEqual(first,second);
   assert.equal(gardenLinks(first.seeds).length,1);

   // A participant who arrives later starts from the current snapshot, then
   // applies only future operations; they still end with the same scene.
   const late = structuredClone(first);
   const removal = {op:'remove',id:'a'};
   applyGardenMessage(first,removal); applyGardenMessage(second,removal);
   applyGardenMessage(late,removal);
   assert.deepEqual(late,first);
   assert.equal(gardenLinks(late.seeds).length,0);
});

test('solo links work, duets take priority, and links disappear beyond reach', () => {
   const garden = emptyGarden();
   applyGardenMessage(garden,plant('a','alice',0,1.5));
   applyGardenMessage(garden,plant('b','alice',.1,1.5));
   assert.deepEqual(gardenLinks(garden.seeds).map(x => [x.id,x.shared]),[['a|b',false]]);
   applyGardenMessage(garden,plant('c','bob',.16,1.5,1));
   assert.deepEqual(gardenLinks(garden.seeds).map(x => [x.id,x.shared]),[['b|c',true]]);
   applyGardenMessage(garden,{op:'move',id:'c',pos:[.8,1.5,GARDEN.z]});
   assert.deepEqual(gardenLinks(garden.seeds).map(x => x.id),['a|b']);
   applyGardenMessage(garden,{op:'move',id:'b',pos:[.4,1.5,GARDEN.z]});
   assert.equal(gardenLinks(garden.seeds).length,0);
});

test('invalid and excessive operations do not corrupt shared state', () => {
   const garden = emptyGarden();
   assert.equal(applyGardenMessage(garden,plant('__proto__','alice',0,1.5)),false);
   assert.equal(applyGardenMessage(garden,plant('bad','alice',NaN,1.5)),false);
   for (let i=0;i<MAX_SEEDS;i++)
      assert.equal(applyGardenMessage(garden,plant('s'+i,'alice',0,1.5)),true);
   assert.equal(applyGardenMessage(garden,plant('extra','bob',0,1.5)),false);
   assert.equal(applyGardenMessage(garden,{op:'clear'}),true);
   assert.deepEqual(garden.seeds,{});
   assert.deepEqual(gardenPosition([10,-2,0]),[GARDEN.maxX,GARDEN.minY,GARDEN.maxZ]);
});

test('depth survives synchronization and controls three-dimensional connections', () => {
   const first = emptyGarden(), second = emptyGarden();
   const messages = [plant('near','alice',0,1.5,0,GARDEN.maxZ),
                     plant('far','bob',0,1.5,1,GARDEN.minZ)];
   for (const message of messages) {
      assert.equal(applyGardenMessage(first,message),true);
      assert.equal(applyGardenMessage(second,message),true);
   }
   assert.deepEqual(first,second);
   assert.equal(first.seeds.near.pos[2],GARDEN.maxZ);
   assert.equal(gardenLinks(first.seeds).length,0);
   const move = {op:'move',id:'far',pos:[0,1.5,GARDEN.maxZ-.15]};
   applyGardenMessage(first,move); applyGardenMessage(second,move);
   assert.deepEqual(first,second);
   assert.equal(gardenLinks(first.seeds).length,1);
});

test('moving a note vertically changes its musical pitch', () => {
   assert.equal(noteAtHeight(GARDEN.minY),60);
   assert.equal(noteAtHeight(GARDEN.maxY),72);
   assert.equal(midiToHz(69),440);
});
