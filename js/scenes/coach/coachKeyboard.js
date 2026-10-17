// An in-world keyboard, so a player in the headset can write an AI prompt too.
// The 2D prompt panel is HTML and disappears in immersive VR; this keyboard is
// made of scene objects and is typed by pointing a controller beam at a key and
// pulling the trigger, like the START and DANCE buttons. GO sends the text
// through the same generateFromText as the 2D panel, so both give the same result.

export const MAX_PROMPT = 120;

// Four ready-made ideas for players who do not want to type a whole sentence.
export const IDEAS = [
   { label: 'UNDERWATER', text: 'drifting underwater, then reaching for the surface' },
   { label: 'ROBOT',      text: 'a stiff robot that slowly learns to dance' },
   { label: 'TAI CHI',    text: 'slow tai chi, calm and balanced' },
   { label: 'FIREWORKS',  text: 'fireworks bursting into the night sky' },
];

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
const PITCH = .062, KEY = .054;

// Keys in the keyboard's own flat coordinates: x across, y up, metres from its centre.
export function keyboardLayout() {
   const keys = [];
   IDEAS.forEach((idea, i) => keys.push({ id: 'idea' + i, label: idea.label, idea: idea.text,
                                          x: (i - 1.5) * .155, y: .2, w: .145, h: .05 }));
   ROWS.forEach((row, r) => [...row].forEach((ch, i) =>
      keys.push({ id: ch, label: ch, x: (i - (row.length - 1) / 2) * PITCH, y: .1 - r * PITCH, w: KEY, h: KEY })));
   const y = .1 - 3 * PITCH;
   keys.push({ id: 'CLEAR', label: 'CLEAR', x: -.235, y, w: .11,  h: KEY },
             { id: 'SPACE', label: 'SPACE', x: -.065, y, w: .21,  h: KEY },
             { id: 'DEL',   label: 'DEL',   x:  .105, y, w: .1,   h: KEY },
             { id: 'GO',    label: 'GO',    x:  .235, y, w: .11,  h: KEY });
   return keys;
}

// What a key does to the text being written. After an idea was picked
// (fromIdea), typing starts a new prompt instead of adding to the idea's sentence,
// and DEL removes the whole idea.
export function editText(text, key, fromIdea = false) {
   if (key.idea) return key.idea.slice(0, MAX_PROMPT);
   if (key.id === 'CLEAR') return '';
   if (fromIdea && (key.id === 'DEL' || key.id === 'SPACE')) return '';
   if (fromIdea && key.id.length === 1) text = '';
   if (key.id === 'DEL') return text.slice(0, -1);
   if (key.id === 'SPACE') return text.length && !text.endsWith(' ') ? (text + ' ').slice(0, MAX_PROMPT) : text;
   if (key.id.length === 1) return (text + key.id.toLowerCase()).slice(0, MAX_PROMPT);
   return text;
}

// The key a beam points at: where the ray meets the keyboard's plane (z = centre z),
// then which key's rectangle contains that point.
// pad widens every key a little, so a slightly shaky beam still counts.
export function keyAt(keys, centre, r, pad = .005) {
   if (!r || Math.abs(r.dir[2]) < 1e-4) return null;
   const t = (centre[2] - r.o[2]) / r.dir[2];
   if (t <= 0) return null;
   const x = r.o[0] + r.dir[0] * t - centre[0], y = r.o[1] + r.dir[1] * t - centre[1];
   return keys.find(k => Math.abs(x - k.x) <= k.w / 2 + pad && Math.abs(y - k.y) <= k.h / 2 + pad) || null;
}

// The TYPE A PROMPT button is 1.4 m away, so it is hit like START: the beam only
// has to pass within `radius` of its centre (the projection from beamSphere.js).
export function nearBeam(point, r, radius) {
   if (!r) return false;
   const v = [point[0] - r.o[0], point[1] - r.o[1], point[2] - r.o[2]];
   const along = v[0] * r.dir[0] + v[1] * r.dir[1] + v[2] * r.dir[2];
   if (along <= 0) return false;
   return Math.hypot(v[0] - r.dir[0] * along, v[1] - r.dir[1] * along, v[2] - r.dir[2] * along) < radius;
}
const TOGGLE_RADIUS = .12;

// label(id, position, scale, color) returns a text setter, as coach.js textLine does.
export function createCoachKeyboard(model, label, { centre = [0, 1.02, -.58], toggleAt = [.94, 1.07, -1.04] } = {}) {
   const keys = keyboardLayout();
   const at = k => [centre[0] + k.x, centre[1] + k.y, centre[2]];
   const nodes = keys.map(k => ({ key: k, cube: model.add('cube'),
      text: label('kb_' + k.id, [at(k)[0], at(k)[1] - .008, centre[2] + .012], k.label.length > 1 ? .62 : .9, [.95, 1, 1]) }));
   const xs = keys.map(k => [k.x - k.w / 2, k.x + k.w / 2]).flat(), ys = keys.map(k => [k.y - k.h / 2, k.y + k.h / 2]).flat();
   // The plate behind the keys. A press that lands on it, between keys, does nothing,
   // instead of falling through to the coach behind and starting a recording.
   const plate = { id: 'PLATE', x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 + .03,
                   w: Math.max(...xs) - Math.min(...xs) + .06, h: Math.max(...ys) - Math.min(...ys) + .12 };
   const plateCube = model.add('cube');
   const toggleCube = model.add('cube');
   const toggleText = label('kb_toggle', [toggleAt[0], toggleAt[1] - .012, toggleAt[2] + .012], 1.05, [.9, 1, 1]);
   const draftText = label('kb_draft', [centre[0], centre[1] + .3, centre[2]], .9, [1, 1, 1]);
   const statusText = label('kb_status', [centre[0], centre[1] + .36, centre[2]], .72, [.6, .9, 1]);
   let open = false, text = '', status = '', fromIdea = false;

   const ascii = s => String(s).replace(/[^\x20-\x7e]/g, '').toUpperCase();
   const setStatus = message => { status = ascii(message).slice(0, 44); };

   return {
      setStatus,
      get open() { return open; },
      get text() { return text; },
      // A trigger press. Returns null if the beam was not on the keyboard or its
      // button; otherwise { go: true, text } when GO was pressed, or { typed: true }.
      press(r, allowed = true) {
         if (nearBeam(toggleAt, r, TOGGLE_RADIUS)) {
            if (!allowed) return { typed: true, blocked: true };   // the button says why (update)
            open = !open;
            if (open) setStatus('POINT AND PULL THE TRIGGER TO TYPE');
            return { typed: true };
         }
         if (!open || !allowed) return null;
         const key = keyAt(keys, centre, r);
         if (!key) return keyAt([plate], centre, r, 0) ? { typed: true } : null;
         if (key.id === 'GO') {
            if (!text.trim()) { setStatus('TYPE OR PICK AN IDEA FIRST'); return { typed: true }; }
            return { go: true, text };
         }
         text = editText(text, key, fromIdea);
         fromIdea = !!key.idea;
         return { typed: true };
      },
      // Every frame: rays of both hands for highlighting; allowed = may type now;
      // reason = what the button says while typing is not possible.
      update(rays, allowed = true, reason = '') {
         const hot = new Set(rays.map(r => keyAt(keys, centre, r)?.id).filter(Boolean));
         const show = open && allowed;
         for (const { key, cube, text: setText } of nodes) {
            const [x, y, z] = at(key);
            cube.identity().move(x, y, z - .01).scale(show ? key.w / 2 : 0, show ? key.h / 2 : 0, .008)
                .color(key.id === 'GO' ? (hot.has(key.id) ? [.5, 1.6, .7] : [.15, .5, .25])
                     : key.idea ? (hot.has(key.id) ? [1.2, .7, 1.6] : [.38, .2, .5])
                                : (hot.has(key.id) ? [.6, .9, 1.4] : [.12, .2, .28]));
            setText(show ? key.label : '');
         }
         plateCube.identity().move(centre[0] + plate.x, centre[1] + plate.y, centre[2] - .02)
                  .scale(show ? plate.w / 2 : 0, show ? plate.h / 2 : 0, .004).color(.05, .08, .11);
         const toggleHot = rays.some(r => nearBeam(toggleAt, r, TOGGLE_RADIUS));
         toggleCube.identity().move(toggleAt).scale(.17, .045, .01)
                   .color(!allowed ? [.12, .12, .14] : toggleHot ? [.6, .9, 1.4] : open ? [.35, .25, .5] : [.15, .3, .4]);
         toggleText(!allowed ? ascii(reason || 'NOT NOW') : open ? 'HIDE KEYBOARD' : 'TYPE A PROMPT');
         const tail = text.length > 34 ? '...' + text.slice(-31) : text;
         draftText(show ? '> ' + ascii(tail) + '_' : '');
         statusText(show ? status : '');
      },
   };
}
