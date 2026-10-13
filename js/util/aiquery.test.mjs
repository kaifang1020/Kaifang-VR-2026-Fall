import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = await readFile(new URL('./aiquery.js', import.meta.url), 'utf8');
const { AIQuery } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('a timed-out query reports failure to its caller', async () => {
   const originalFetch = globalThis.fetch;
   globalThis.fetch = () => new Promise(() => {});
   try {
      const query = new AIQuery({timeout:10});
      await assert.rejects(query.askAIJson('four poses'), /Query timed out/);
      assert.equal(query.pendingQueries.size,0);
   } finally {
      globalThis.fetch = originalFetch;
   }
});
