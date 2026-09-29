import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = await readFile(new URL('./coachClock.js', import.meta.url), 'utf8');
const { createCoachClock } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('desktop follows the headset clock despite a one-pose local clock offset', () => {
   const clock = createCoachClock();
   assert.deepEqual(clock({ owner: 2, self: 1, sample: null, now: 101.2, mono: 10 }),
                    { time: 101.2, changed: false });
   assert.deepEqual(clock({ owner: 2, self: 1, sample: {owner: 2, time: 100}, now: 101.2, mono: 10.1 }),
                    { time: 100, changed: true });
   const later = clock({ owner: 2, self: 1, sample: {owner: 2, time: 100}, now: 101.5, mono: 10.4 });
   assert.equal(later.changed, false);
   assert.ok(Math.abs(later.time - 100.3) < 1e-9);
   assert.equal(Math.floor(100.3 / 1.2), 83);
   assert.equal(Math.floor(101.5 / 1.2), 84);
});

test('new samples refresh the clock; a disconnected headset returns to local time', () => {
   const clock = createCoachClock();
   clock({ owner: 2, self: 1, sample: {owner: 2, time: 50}, now: 51, mono: 5 });
   assert.deepEqual(clock({ owner: 2, self: 1, sample: {owner: 2, time: 50.1}, now: 51.1, mono: 5.1 }),
                    { time: 50.1, changed: false });
   assert.deepEqual(clock({ owner: null, self: 1, sample: {owner: 2, time: 50.1}, now: 51.2, mono: 5.2 }),
                    { time: 51.2, changed: true });
   assert.deepEqual(clock({ owner: 3, self: 1, sample: {owner: 2, time: 50.1}, now: 51.3, mono: 5.3 }),
                    { time: 51.3, changed: false });
});
