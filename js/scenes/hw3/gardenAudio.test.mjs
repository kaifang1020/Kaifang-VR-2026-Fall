// Run: node --test js/scenes/hw3/gardenAudio.test.mjs
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = await readFile(new URL('./gardenAudio.js', import.meta.url),'utf8');
const { BEAT_SECONDS, beatNumber, listenerFromMatrix, placeListener } =
   await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const close = (a,b) => a.forEach((v,i) => assert.ok(Math.abs(v-b[i]) < 1e-9, `${a} vs ${b}`));

test('a head that has not turned looks down -z with y up', () => {
   const m = [1,0,0,0, 0,1,0,0, 0,0,1,0, .2,1.6,.3,1];
   const pose = listenerFromMatrix(m);
   close(pose.position,[.2,1.6,.3]); close(pose.forward,[0,0,-1]); close(pose.up,[0,1,0]);
});

test('turning the head 90 degrees to the left turns the ears with it', () => {
   const c = Math.cos(Math.PI/2), s = Math.sin(Math.PI/2);   // rotation about y, column-major
   const m = [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,1.6,0,1];
   close(listenerFromMatrix(m).forward,[-1,0,0]);             // now looking toward -x, the left
});

test('a missing or broken head gives no listener', () => {
   assert.equal(listenerFromMatrix({}),null);
   assert.equal(listenerFromMatrix(new Array(16).fill(0)),null);
});

test('placeListener writes AudioParams, or falls back to the old API', () => {
   const param = () => ({v:null, setValueAtTime(v){ this.v = v; }});
   const L = {}; for (const k of ['positionX','positionY','positionZ','forwardX','forwardY','forwardZ','upX','upY','upZ']) L[k] = param();
   placeListener({listener:L, currentTime:0},{position:[1,2,3],forward:[0,0,-1],up:[0,1,0]});
   assert.deepEqual([L.positionX.v,L.positionY.v,L.positionZ.v,L.forwardZ.v,L.upY.v],[1,2,3,-1,1]);
   const old = {calls:[], setPosition(...a){ this.calls.push(a); }, setOrientation(...a){ this.calls.push(a); }};
   placeListener({listener:old, currentTime:0},{position:[1,2,3],forward:[0,0,-1],up:[0,1,0]});
   assert.deepEqual(old.calls,[[1,2,3],[0,0,-1,0,1,0]]);
});

test('two headsets that loaded at different times agree on the beat', () => {
   const now = 1_700_000_000_123;
   assert.equal(beatNumber(now),beatNumber(now + 40));        // 40 ms of clock difference, same beat
   assert.equal(beatNumber(now + BEAT_SECONDS*1000) - beatNumber(now),1);
});
