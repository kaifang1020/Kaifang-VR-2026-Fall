// Run: node --test js/scenes/coach/coachKeyboard.test.mjs
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = await readFile(new URL('./coachKeyboard.js', import.meta.url), 'utf8');
const { IDEAS, MAX_PROMPT, keyboardLayout, editText, keyAt, nearBeam, createCoachKeyboard } =
   await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const key = id => keyboardLayout().find(k => k.id === id);

test('keys edit the prompt: letters, space, delete, clear and ideas', () => {
   let text = '';
   for (const ch of 'HI') text = editText(text, key(ch));
   assert.equal(text, 'hi');
   text = editText(text, key('SPACE')); text = editText(text, key('SPACE'));
   assert.equal(text, 'hi ', 'no double spaces');
   assert.equal(editText(text, key('DEL')), 'hi');
   assert.equal(editText(text, key('CLEAR')), '');
   assert.equal(editText('', key('idea0')), IDEAS[0].text);
   assert.equal(editText('x'.repeat(MAX_PROMPT), key('A')).length, MAX_PROMPT);
});

test('a beam picks the key whose rectangle it crosses, and nothing beside or behind it', () => {
   const keys = keyboardLayout(), centre = [0, 1, -.6], q = key('Q');
   const at = (x, y, dirZ = -1) => keyAt(keys, centre, {o: [x, y, 0], dir: [0, 0, dirZ]});
   assert.equal(at(q.x, 1 + q.y)?.id, 'Q');
   assert.equal(at(q.x + .02, 1 + q.y + .02)?.id, 'Q');
   assert.equal(at(5, 5), null);
   assert.equal(at(q.x, 1 + q.y, 1), null, 'the keyboard is behind the beam');
   const ids = keys.map(k => k.id);
   assert.equal(new Set(ids).size, ids.length);
   for (const a of keys) for (const b of keys)                       // no two keys overlap
      if (a !== b) assert.ok(Math.abs(a.x - b.x) >= (a.w + b.w) / 2 - 1e-9 || Math.abs(a.y - b.y) >= (a.h + b.h) / 2 - 1e-9, a.id + ' overlaps ' + b.id);
});

test('the toggle opens the keyboard; GO hands over the text; it hides while not allowed', () => {
   const node = () => ({ identity() { return this; }, move() { return this; }, color() { return this; },
                         scale(...s) { this.s = s; return this; } });
   const labels = {};
   const kb = createCoachKeyboard({ add: node }, id => text => { labels[id] = text; },
                                  { centre: [0, 1, -.6], toggleAt: [1, 1, -1] });
   const beam = (x, y) => ({ o: [x, y, 0], dir: [0, 0, -1] });
   assert.equal(kb.press(beam(0, 1 + key('Q').y)), null, 'closed: keys do nothing');
   assert.deepEqual(kb.press(beam(1, 1)), { typed: true });
   assert.equal(kb.open, true);
   kb.press(beam(key('O').x, 1 + key('O').y)); kb.press(beam(key('K').x, 1 + key('K').y));
   assert.deepEqual(kb.press(beam(key('GO').x, 1 + key('GO').y)), { go: true, text: 'ok' });
   kb.update([], true);
   assert.equal(labels.kb_Q, 'Q'); assert.equal(labels.kb_draft, '> OK_');
   kb.update([], false);
   assert.equal(labels.kb_Q, ''); assert.equal(labels.kb_toggle, '');
   assert.equal(kb.press(beam(key('A').x, 1 + key('A').y), false), null, 'no typing during a round');
});

test('TYPE A PROMPT forgives an aim that is a few centimetres off, like START', () => {
   const ahead = (x, y) => ({ o: [x, y, 0], dir: [0, 0, -1] });
   assert.ok(nearBeam([1, 1, -1], ahead(1.08, 1.03), .12), '8.5 cm off still counts');
   assert.ok(!nearBeam([1, 1, -1], ahead(1.2, 1), .12), '20 cm off does not');
   assert.ok(!nearBeam([1, 1, -1], { o: [1, 1, -2], dir: [0, 0, -1] }, .12), 'not behind the controller');
   const node = () => ({ identity() { return this; }, move() { return this; }, color() { return this; }, scale() { return this; } });
   const kb = createCoachKeyboard({ add: node }, () => () => {}, { centre: [0, 1, -.6], toggleAt: [1, 1, -1] });
   kb.press(ahead(1.07, .95));
   assert.equal(kb.open, true);
});
