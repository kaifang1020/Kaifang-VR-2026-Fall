import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = await readFile(new URL('./pocketCityRules.js', import.meta.url), 'utf8');
const { CITY, addExampleBlock, removeExampleBlock, cityPrompt, validateCityResponse, pickExampleCell } = await import(
   'data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('a controller can stack and erase an example, within the demonstration lot', () => {
   let example = [];
   example = addExampleBlock(example,1,1,'clay');
   example = addExampleBlock(example,1,1,'glass');
   assert.deepEqual(example.map(b => b.y),[0,1]);
   assert.equal(addExampleBlock(example,3,1,'stone'),example);
   example = removeExampleBlock(example,1,1);
   assert.deepEqual(example.map(b => b.kind),['clay']);
   assert.match(cityPrompt(example),/"kind":"clay"/);
});

test('AI buildings become bounded supported cubes; invalid geometry is omitted', () => {
   const example = [0,1,2,3].map(i => ({x:i%2,y:Math.floor(i/2),z:0,kind:'stone'}));
   const answer = {title:'Lantern district',buildings:Array.from({length:4},(_,i) => ({
      name:`Tower ${i+1}`,blocks:[
         {x:0,y:0,z:0,kind:'stone'}, {x:1,y:0,z:0,kind:'clay'},
         {x:0,y:1,z:0,kind:'glass'}, {x:1,y:1,z:0,kind:'light'},
         {x:2,y:5,z:2,kind:'stone'}, {x:0,y:0,z:0,kind:'stone'},
      ]}))};
   const result = validateCityResponse(answer);
   assert.equal(result.title,'LANTERN DISTRICT');
   assert.equal(result.buildings.length,4);
   assert.deepEqual(result.buildings[0].blocks,answer.buildings[0].blocks.slice(0,4));
   assert.equal(result.discarded,8);
   assert.ok(cityPrompt(example).includes(JSON.stringify(example)));
   assert.throws(() => validateCityResponse({buildings:[]}),/exactly four/);
});

test('a controller ray selects the visible stack before the table behind it', () => {
   const x = (CITY.example[0] - (CITY.width-1)/2)*CITY.cell;
   const z = CITY.centreZ + (CITY.example[1] - (CITY.depth-1)/2)*CITY.cell;
   const blocks = [0,1,2].map(y => ({x:0,y,z:0,kind:'stone'}));
   const side = pickExampleCell({origin:[x-.31,1.08,z],dir:[1,-.25,0]},blocks);
   assert.deepEqual(side.cell,[0,0]);
   const emptyX = (CITY.example[0]+2-(CITY.width-1)/2)*CITY.cell;
   const emptyZ = CITY.centreZ+(CITY.example[1]+2-(CITY.depth-1)/2)*CITY.cell;
   assert.deepEqual(pickExampleCell({origin:[emptyX,1.4,emptyZ],dir:[0,-1,0]},blocks).cell,[2,2]);
   assert.equal(pickExampleCell({origin:[2,1.4,0],dir:[0,-1,0]},blocks),null);
});
