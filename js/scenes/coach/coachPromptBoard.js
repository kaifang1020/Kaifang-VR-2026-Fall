// A canvas texture lets the in-world prompt board show the actual typed text,
// including characters that the scene's ASCII-only line font cannot render.

// The texture unit for the board. clay.js keeps each texture bound to its own
// unit and never binds it again. In the headset, the renderer that draws the
// controller models binds its textures to the low units (0, 1, 2, ...) every
// frame, so a board on an arbitrary low unit showed the wrong texture in VR
// while looking fine on a desktop. Units 12-15 hold the fonts; 11 is unused.
export const PROMPT_TEXTURE_UNIT = 11;

export function createCoachPromptBoard(model) {
   if (typeof document === 'undefined') return { update() {} };

   const canvas = document.createElement('canvas');
   canvas.width = 1024;
   canvas.height = 512;
   const ctx = canvas.getContext('2d');
   if (!ctx) return { update() {} };

   const board = model.add('square').move(.94, 1.43, -1.04)
      .scale(.52, .26, 1).dull().setTxtr(canvas, PROMPT_TEXTURE_UNIT, true);
   const textureChannel = PROMPT_TEXTURE_UNIT;
   let previous = '';

   const draw = ai => {
      ctx.fillStyle = '#10202d';
      ctx.fillRect(0, 0, 1024, 512);
      ctx.strokeStyle = '#80a5b2';
      ctx.lineWidth = 8;
      ctx.strokeRect(5, 5, 1014, 502);
      ctx.fillStyle = '#9bdce9';
      ctx.font = 'bold 38px system-ui, sans-serif';
      ctx.fillText('AI CHOREOGRAPHY', 40, 59);
      ctx.fillStyle = '#cfdeea';
      ctx.font = '28px system-ui, sans-serif';
      ctx.fillText(ai.state === 'thinking' ? 'GENERATING...' : ai.title || 'YOUR ROUTINE', 40, 103);

      ctx.fillStyle = '#6d91a1';
      ctx.fillRect(40, 124, 944, 2);
      ctx.fillStyle = '#f1f6fa';
      ctx.font = '34px system-ui, sans-serif';
      const chars = Array.from(ai.prompt);
      const lines = [];
      let line = '';
      for (const char of chars) {
         if (char === '\n' || ctx.measureText(line + char).width > 940) {
            lines.push(line);
            line = '';
            if (char === '\n') continue;
         }
         line += char;
      }
      if (line) lines.push(line);
      const visible = lines.slice(0, 8);
      if (lines.length > 8) visible[7] = visible[7].slice(0, -2) + '...';
      visible.forEach((text, index) => ctx.fillText(text, 40, 174 + 42 * index));
      board.txtrSrc(textureChannel, canvas, true);
   };

   return { update(ai) {
      const visible = ai?.source === 'prompt' && typeof ai.prompt === 'string' && !!ai.prompt;
      board.identity().move(.94, 1.43, -1.04).scale(visible ? .52 : 0, visible ? .26 : 0, 1);
      if (!visible) return;
      const key = JSON.stringify([ai.prompt, ai.state, ai.title]);
      if (key !== previous) { previous = key; draw(ai); }
   } };
}
