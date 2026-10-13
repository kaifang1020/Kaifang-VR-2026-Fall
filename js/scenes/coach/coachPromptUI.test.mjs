import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = await readFile(new URL('./coachPromptUI.js', import.meta.url), 'utf8');
const { mountCoachPromptUI } = await import(
   'data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

class Element {
   constructor(tag) { this.tag = tag; this.children = []; this.style = {}; this.events = {}; }
   setAttribute(name,value) { this[name] = value; }
   appendChild(child) { this.children.push(child); }
   append(...children) { this.children.push(...children); }
   addEventListener(name,fn) { this.events[name] = fn; }
   remove() { this.removed = true; }
}

test('the browser panel accepts text and displays the generated routine status', async () => {
   const oldDocument = globalThis.document;
   const body = new Element('body');
   globalThis.document = { createElement:tag => new Element(tag), body };
   try {
      let received = '';
      const ui = mountCoachPromptUI(async (text,setStatus) => {
         received = text;
         setStatus('Created: UNDERWATER DRIFT');
      });
      const panel = body.children[0];
      const form = panel.children.find(child => child.tag === 'form');
      const [input,button,status] = form.children;
      input.value = 'drift underwater';
      await form.events.submit({preventDefault(){}});
      assert.equal(received,'drift underwater');
      assert.equal(status.textContent,'Created: UNDERWATER DRIFT');
      assert.equal(button.disabled,false);
      ui.remove();
      assert.equal(panel.removed,true);
   } finally {
      globalThis.document = oldDocument;
   }
});
