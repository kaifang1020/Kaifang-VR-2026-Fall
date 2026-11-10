import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const url = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const cgURL = url(await read('../../render/core/cg.js'));
const modelURL = url((await read('../hw6/miniatureModel.js')).replace('../../render/core/cg.js', cgURL));
const {INCH, TABLE} = await import(modelURL);
const {LIMITS, thingPrompt, validateThing, thingBounds, clampToTable, giantSlot, miniSlot,
       splitPrompt, sectionCount, sectionBounds, restSection, SNAP, roomFit, fitThing, placeInRoom} =
   await import(url((await read('./things.js')).replace('../hw6/miniatureModel.js', modelURL)));

const box = (at, size, extra = {}) => ({shape: 'box', at, size, color: [1, 0, 0], ...extra});

test('the prompt states the limits of the role and quotes the request safely', () => {
   const giant = thingPrompt('a "castle"', 'table'), mini = thingPrompt('a bed', 'inside');
   assert.ok(giant.includes('-6 to 6') && giant.includes('0 to 16'));
   assert.ok(mini.includes('-3.5 to 3.5') && mini.includes('furniture') && mini.includes('REAL-LIFE SIZE'));
   assert.ok(!giant.includes('a "castle"'), 'quotes in the request are removed');
});

test('validateThing keeps good parts and pulls every part back inside the box', () => {
   const thing = validateThing({name: 'my tower!', parts: [
      box([0, 0, 0], [4, 3, 4]),
      box([50, 99, -50], [4, 3, 4]),                       // far outside: moved in
      box([0, 0, 0], [100, 100, 100], {glow: true}),       // far too big: shrunk
   ]});
   assert.equal(thing.name, 'MY TOWER');
   assert.equal(thing.parts.length, 3);
   for (const p of thing.parts) {
      assert.ok(Math.abs(p.at[0]) + p.size[0] / 2 <= 6 + 1e-9 && Math.abs(p.at[2]) + p.size[2] / 2 <= 6 + 1e-9, 'inside in x and z');
      assert.ok(p.at[1] >= 0 && p.at[1] + p.size[1] <= 16 + 1e-9, 'inside in y');
   }
   assert.equal(thing.parts[2].glow, true);
   assert.equal(thing.parts[0].glow, false);
});

test('validateThing throws away what it does not understand, and refuses an empty thing', () => {
   const thing = validateThing({parts: [
      box([0, 0, 0], [1, 1, 1]),
      {shape: 'teapot', at: [0, 0, 0], size: [1, 1, 1]},
      {shape: 'box', at: [0, 'x', 0], size: [1, 1, 1]},
      {shape: 'box', at: [0, 0, 0], size: [1, NaN, 1]},
      null,
      {shape: 'sphere', at: [0, 1, 0], size: [1, 1, 1], color: [9, -3, .5]},
   ]});
   assert.equal(thing.parts.length, 2);
   assert.equal(thing.discarded, 4);
   assert.deepEqual(thing.parts[1].color, [1, 0, .5], 'colours are clamped to 0..1');
   assert.equal(thing.name, 'THING');
   assert.throws(() => validateThing({parts: [{shape: 'teapot'}]}));
   assert.throws(() => validateThing('rm -rf'));
});

test('the number of parts is capped, and the mini gets smaller limits', () => {
   const many = {parts: Array.from({length: 200}, () => box([0, 0, 0], [1, 1, 1]))};
   assert.equal(validateThing(many, 'table').parts.length, LIMITS.table.parts);
   const bed = validateThing({parts: [box([0, 0, 0], [12, 12, 12])]}, 'inside');
   assert.deepEqual(bed.parts[0].size, [7, 7, 7]);
});

test('thingBounds wraps all parts, in table metres (1 ft = 1 in)', () => {
   const spec = validateThing({parts: [box([0, 0, 0], [4, 2, 4]), box([3, 2, 0], [2, 6, 2])]});
   const b = thingBounds(spec, [1, TABLE.height, -1]);
   assert.ok(Math.abs(b.half[1] - (4 * INCH + .01)) < 1e-9, '8 ft tall: half is 4 in');
   assert.ok(Math.abs(b.centre[0] - (1 + 1 * INCH)) < 1e-9, 'x runs from -2 to 4 ft: centre at +1 ft');
});

test('new things land on the table: the giant\'s in slots, the mini\'s 4 ft ahead', () => {
   for (let n = 0; n < 12; n++) assert.deepEqual(clampToTable(giantSlot(n)), giantSlot(n), 'slot ' + n + ' is on the table');
   assert.notDeepEqual(giantSlot(0), giantSlot(1));
   const at = miniSlot([0, 1, -.5], [0, 0, -3], .8);
   assert.ok(Math.abs(at[2] - (-.5 - 4 * INCH)) < 1e-9 && at[1] === .8 && at[0] === 0);
   assert.equal(clampToTable([99, 0, 99])[1], TABLE.height);
});

const KB = await import(url(await read('./promptKeyboard.js')));
test('the keyboard finds the key under a beam wherever it stands and however it is turned', () => {
   const keys = KB.keyboardLayout(), q = keys.find(k => k.id === 'Q'), go = keys.find(k => k.id === 'GO');
   for (const place of [{centre: [0, 1, -.6], yaw: 0}, {centre: [3, 1.2, 2], yaw: 1.9, tilt: .5, size: 1.25}, {centre: [-1, .8, 5], yaw: -2.6, tilt: .9, size: .8}]) {
      for (const key of [q, go]) {
         const target = KB.toWorld([key.x, key.y, 0], place), eye = KB.toWorld([.1, .3, .7], place);   // I stand on its +z side
         const d = target.map((v, i) => v - eye[i]), n = Math.hypot(...d);
         const hit = KB.keyAt(keys, [0, 0, 0], KB.toLocalRay({o: eye, dir: d.map(v => v / n)}, place));
         assert.equal(hit?.id, key.id, 'yaw ' + place.yaw);
      }
      const away = KB.toLocalRay({o: KB.toWorld([0, 0, .7], place), dir: KB.toWorld([0, 0, 1], {centre: [0, 0, 0], yaw: place.yaw, tilt: place.tilt})}, place);
      assert.equal(KB.keyAt(keys, [0, 0, 0], away), null, 'a beam pointing away hits nothing');
   }
   assert.equal(KB.editText('ca', {id: 'T'}), 'cat');
   assert.equal(KB.editText('cat', {id: 'DEL'}), 'ca');
});

test('a tilted keyboard leans its top away from me', () => {
   const place = {centre: [0, 1, 0], yaw: 0, tilt: .5, size: 1};
   const top = KB.toWorld([0, .2, 0], place);
   assert.ok(top[2] < 0 && top[1] > 1, 'I stand at +z: the top edge is further away and higher: ' + top);
});

test('a thing without sections is one section; sections are renumbered from the bottom with no gaps', () => {
   assert.equal(sectionCount(validateThing({parts: [box([0, 0, 0], [1, 1, 1])]})), 1);
   const spec = validateThing({sections: ['base', 'unused', 'roof!'], parts: [
      box([0, 0, 0], [8, 0.3, 8], {section: 0}), box([0, 8, 0], [9, 3, 9], {section: 2}), box([0, 1, 0], [1, 1, 1], {section: 99})]});
   assert.deepEqual(spec.sections, ['BASE', 'ROOF']);
   assert.deepEqual(spec.parts.map(p => p.section), [0, 1, 0], 'section 2 became 1; a wrong number went to the base');
   assert.ok(splitPrompt(spec).includes('"section"') && !splitPrompt(spec).includes('"section":1,'), 'the request lists the parts without their old sections');
});

test('the box of one section follows its offset, and letting go either clicks it back or sets it on the table', () => {
   const spec = validateThing({sections: ['BASE', 'ROOF'], parts: [
      box([0, 0, 0], [8, 8, 8], {section: 0}), box([0, 8, 0], [10, 4, 10], {section: 1})]});
   const at = [0, TABLE.height, -.7], roof = sectionBounds(spec, 1, at);
   assert.ok(Math.abs(roof.centre[1] - (TABLE.height + 10 * INCH)) < 1e-9, 'the roof runs from 8 to 12 ft: centre at 10 in');
   assert.ok(Math.abs(roof.bottom - 8 * INCH) < 1e-9);
   assert.ok(Math.abs(sectionBounds(spec, 1, at, [.3, 0, 0]).centre[0] - .3) < 1e-9, 'moved by its offset');
   assert.equal(restSection(spec, 1, at, [SNAP * .5, .01, 0]), null, 'near its place: back on');
   const down = restSection(spec, 1, at, [.3, .05, 0]);
   assert.ok(Math.abs(at[1] + down[1] + roof.bottom - TABLE.height) < 1e-9, 'set down: its underside is on the table');
   assert.equal(down[0], .3);
});

test('in a room, the AI is told its size, a too-big thing is shrunk evenly, and it is put inside the walls', () => {
   const room = {centre: [0, -.83], size: [8, 8, 10]};
   assert.deepEqual(roomFit(room), [4.8, 7, 6]);
   const prompt = thingPrompt('a bed', 'inside', room);
   assert.ok(prompt.includes('8 wide (x), 10 deep (z)') && prompt.includes('at most 4.8 in x, 6 in z'));
   assert.ok(!thingPrompt('a bed', 'inside').includes('SMALL ROOM'), 'outdoors nothing is said about a room');

   const big = validateThing({parts: [box([0, 0, 0], [6, 2, 7]), box([0, 2, 3], [6, 1, 1])]}, 'inside');
   const bed = fitThing(big, roomFit(room));
   const k = bed.parts[0].size[0] / 6;
   assert.ok(Math.abs(k - .8) < .01, 'shrunk to 80 %: 6 ft wide became 4.8');
   assert.ok(Math.abs(bed.parts[0].size[2] - 7 * k) < .02 && Math.abs(bed.parts[1].at[2] - 3 * k) < .02, 'every size and place by the same factor');
   assert.equal(fitThing(bed, roomFit(room)), bed, 'something that fits is left alone');

   const at = placeInRoom(bed, [.5, TABLE.height, -.83], room), b = thingBounds(bed, at);
   const wallX = 4 * INCH, wallZ = 5 * INCH;
   assert.ok(b.centre[0] + b.half[0] <= wallX + .011 && b.centre[0] - b.half[0] >= -wallX - .011, 'inside the side walls');
   assert.ok(Math.abs(b.centre[2] - (-.83)) + b.half[2] <= wallZ + .011, 'inside the front and back walls');
   assert.ok(at[0] > 0, 'but as far toward where I asked for it as the room allows');
});
