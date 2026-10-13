// A small 2D input surface for Quest Browser or a companion desktop browser.
// It is shown while the Coach scene is selected; immersive VR shows the result.
export function mountCoachPromptUI(onGenerate) {
   if (typeof document === 'undefined') return { remove() {} };

   const panel = document.createElement('details');
   panel.setAttribute('aria-label', 'AI choreography prompt');
   panel.style.cssText = `position:fixed;right:14px;top:14px;z-index:10000;
      width:min(360px,calc(100vw - 28px));box-sizing:border-box;padding:12px 14px;
      color:#e9f3f6;background:rgba(10,20,30,.95);border:1px solid #80a5b2;
      border-radius:8px;font:14px/1.45 system-ui,sans-serif;box-shadow:0 5px 24px #0008;`;

   const summary = document.createElement('summary');
   summary.textContent = 'AI CHOREOGRAPHY  ·  TYPE A PROMPT';
   summary.style.cssText = 'cursor:pointer;font-weight:650;letter-spacing:.03em;';
   panel.appendChild(summary);

   const explanation = document.createElement('p');
   explanation.textContent = 'Describe the movement you want. Generate before entering VR, or use a computer while the headset is connected.';
   explanation.style.cssText = 'margin:12px 0 8px;color:#bcd0d6;';
   panel.appendChild(explanation);

   const form = document.createElement('form');
   const input = document.createElement('textarea');
   input.setAttribute('aria-label', 'Describe the choreography');
   input.placeholder = 'Example: Move like you are drifting underwater, then reaching toward the surface.';
   input.maxLength = 240;
   input.rows = 3;
   input.style.cssText = `display:block;width:100%;box-sizing:border-box;resize:vertical;
      padding:9px 10px;color:#f5fbff;background:#1a2b37;border:1px solid #7194a0;
      border-radius:5px;font:inherit;`;
   const button = document.createElement('button');
   button.type = 'submit';
   button.textContent = 'GENERATE 8 MOVES';
   button.style.cssText = `margin-top:9px;padding:8px 12px;color:#061b25;background:#99d6e2;
      border:0;border-radius:5px;font:600 13px system-ui,sans-serif;cursor:pointer;`;
   const status = document.createElement('p');
   status.setAttribute('role', 'status');
   status.style.cssText = 'min-height:1.4em;margin:8px 0 0;color:#c4dce2;';
   status.textContent = 'The generated routine will appear in Coach for everyone.';
   form.append(input, button, status);
   panel.appendChild(form);
   panel.addEventListener('keydown', event => event.stopPropagation());
   form.addEventListener('submit', async event => {
      event.preventDefault();
      if (button.disabled) return;
      button.disabled = true;
      button.style.opacity = '.6';
      try {
         await onGenerate(input.value, message => { status.textContent = message; });
      } finally {
         button.disabled = false;
         button.style.opacity = '1';
      }
   });
   document.body.appendChild(panel);
   return { remove() { panel.remove(); } };
}
