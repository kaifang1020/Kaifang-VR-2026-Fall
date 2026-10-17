import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = await readFile(new URL('./coachPromptBoard.js', import.meta.url), 'utf8');
const { createCoachPromptBoard, PROMPT_TEXTURE_UNIT } = await import(
   'data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('the 3D board shows a shared prompt, including Chinese text, and instructions without one', () => {
   const oldDocument = globalThis.document;
   const drawn = [];
   const ctx = {
      fillRect() {}, strokeRect() {},
      fillText(text) { drawn.push(text); },
      measureText(text) { return {width: Array.from(text).length * 20}; },
   };
   globalThis.document = {createElement: () => ({getContext: () => ctx})};
   const board = {
      _txtr: 7, scales: [], uploads: 0,
      move() { return this; }, scale(...size) { this.scales.push(size); return this; },
      dull() { return this; }, setTxtr(src, unit, still) { this.unit = unit; this.still = still; return this; },
      identity() { return this; }, txtrSrc(unit) { this.uploads++; this.lastUnit = unit; return this; },
   };
   try {
      const display = createCoachPromptBoard({add: () => board});
      display.update({source:'prompt',state:'thinking',prompt:'像水下漂浮一样移动'});
      assert.ok(drawn.includes('像水下漂浮一样移动'));
      assert.ok(drawn.includes('GENERATING...'));
      display.update({source:'prompt',state:'thinking',prompt:'像水下漂浮一样移动'});
      assert.equal(board.uploads,1, 'unchanged text is not uploaded every frame');
      display.update({source:'prompt',state:'ready',title:'UNDERWATER DRIFT',prompt:'像水下漂浮一样移动'});
      assert.ok(drawn.includes('UNDERWATER DRIFT'));
      assert.equal(board.unit, PROMPT_TEXTURE_UNIT, 'a fixed unit the VR controller renderer does not use');
      assert.equal(board.lastUnit, PROMPT_TEXTURE_UNIT, 'redraws go to the same unit');
      assert.ok(PROMPT_TEXTURE_UNIT > 10 && PROMPT_TEXTURE_UNIT < 12, 'below the font units 12-15');
      display.update(null);
      assert.deepEqual(board.scales.at(-1),[.52,.26,1], 'the board stays visible without a prompt');
      assert.ok(drawn.includes('TYPE A PROMPT'), 'and explains where the prompt comes from');
   } finally {
      globalThis.document = oldDocument;
   }
});
