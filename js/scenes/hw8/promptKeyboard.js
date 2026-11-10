// The in-world keyboard for AI prompts: typed by pointing a controller beam at a key and pulling
// the trigger. Adapted from the coach scene's keyboard (coach/coachKeyboard.js); the ready-made
// ideas are things to build instead of dances. GO hands the text to the scene.

export const MAX_PROMPT = 120;

// Four ready-made ideas for players who do not want to type a whole sentence.
export const IDEAS = [
   { label: 'LIGHTHOUSE', text: 'a red and white lighthouse with a glowing lamp on top' },
   { label: 'CASTLE',     text: 'a small stone castle with four towers and a gate' },
   { label: 'TREE HOUSE', text: 'a tree with a wooden house in its branches' },
   { label: 'WINDMILL',   text: 'a windmill with four blades and a little door' },
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

// ---- The keyboard can stand anywhere, turned any way (it opens in front of whoever asks for it) ----
// A place is {centre, yaw, tilt, size}: where it is, which way it faces, how far its top leans
// away from me (like a lectern, so I look at it squarely), and how much bigger than 1:1 it is.
// Keys are laid out in its own flat coordinates, so:
//    toWorld(local)  = centre + R_y(yaw) · R_x(-tilt) · (size · local)       to draw a key
//    toLocalRay(ray) = the same steps undone, in reverse order                to find the key under a beam
const turnY = (v, a) => [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], -v[0] * Math.sin(a) + v[2] * Math.cos(a)];
const turnX = (v, a) => [v[0], v[1] * Math.cos(a) - v[2] * Math.sin(a), v[1] * Math.sin(a) + v[2] * Math.cos(a)];
export const toWorld = (local, {centre, yaw = 0, tilt = 0, size = 1}) =>
   turnY(turnX(local.map(v => v * size), -tilt), yaw).map((v, i) => v + centre[i]);
export const toLocalRay = (r, {centre, yaw = 0, tilt = 0, size = 1}) => r && ({
   o: turnX(turnY(r.o.map((v, i) => v - centre[i]), -yaw), tilt).map(v => v / size),
   dir: turnX(turnY(r.dir, -yaw), tilt)});

// label(id, size, color) returns show(text, at, yaw, tilt, size), as in giantMini.js.
export function createPromptKeyboard(model, label) {
   const keys = keyboardLayout(), ZERO = [0, 0, 0];
   const nodes = keys.map(k => ({ key: k, cube: model.add('cube'), text: label('kb_' + k.id, k.label.length > 1 ? .62 : .9, [.95, 1, 1]) }));
   const xs = keys.map(k => [k.x - k.w / 2, k.x + k.w / 2]).flat(), ys = keys.map(k => [k.y - k.h / 2, k.y + k.h / 2]).flat();
   // The plate behind the keys. A press that lands on it, between keys, does nothing,
   // instead of falling through to the house behind and grabbing it.
   const plate = { id: 'PLATE', x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 + .03,
                   w: Math.max(...xs) - Math.min(...xs) + .06, h: Math.max(...ys) - Math.min(...ys) + .12 };
   const plateCube = model.add('cube');
   const draftText = label('kb_draft', .9, [1, 1, 1]), statusText = label('kb_status', .72, [.6, .9, 1]);
   let open = false, text = '', status = '', fromIdea = false, place = {centre: [0, 1, -.6], yaw: 0};

   const ascii = s => String(s).replace(/[^\x20-\x7e]/g, '').toUpperCase();
   const setStatus = message => { status = ascii(message).slice(0, 44); };

   return {
      setStatus,
      get open() { return open; },
      get text() { return text; },
      // Open it at a place: {centre, yaw}. Its keys face the +z side of its own frame.
      show(at) { place = at; open = true; if (!status) setStatus('POINT AND PULL THE TRIGGER TO TYPE'); },
      hide() { open = false; },
      // A trigger press, r = {o, dir}. Returns null if the beam was not on the keyboard;
      // otherwise { go: true, text } when GO was pressed, or { typed: true }.
      press(r) {
         if (!open) return null;
         const local = toLocalRay(r, place), key = keyAt(keys, ZERO, local);
         if (!key) return keyAt([plate], ZERO, local, 0) ? { typed: true } : null;
         if (key.id === 'GO') {
            if (!text.trim()) { setStatus('TYPE OR PICK AN IDEA FIRST'); return { typed: true }; }
            return { go: true, text };
         }
         text = editText(text, key, fromIdea);
         fromIdea = !!key.idea;
         return { typed: true };
      },
      // Every frame: the rays of both hands, for highlighting the key under a beam.
      update(rays) {
         const hot = new Set(rays.map(r => keyAt(keys, ZERO, toLocalRay(r, place))?.id).filter(Boolean));
         const k = place.size || 1, tilt = place.tilt || 0;
         const put = (node, local, half) => node.identity().move(toWorld(local, place)).turnY(place.yaw).turnX(-tilt)
                                                .scale(open ? half[0] * k : 0, open ? half[1] * k : 0, half[2]);
         const write = (show, str, local) => show(open ? str : '', toWorld(local, place), place.yaw, tilt, k);
         for (const { key, cube, text: show } of nodes) {
            put(cube, [key.x, key.y, -.01], [key.w / 2, key.h / 2, .008])
               .color(key.id === 'GO' ? (hot.has(key.id) ? [.5, 1.6, .7] : [.15, .5, .25])
                    : key.idea ? (hot.has(key.id) ? [1.2, .7, 1.6] : [.38, .2, .5])
                               : (hot.has(key.id) ? [.6, .9, 1.4] : [.12, .2, .28]));
            write(show, key.label, [key.x, key.y - .008, .012]);
         }
         put(plateCube, [plate.x, plate.y, -.02], [plate.w / 2, plate.h / 2, .004]).color(.05, .08, .11);
         const tail = text.length > 34 ? '...' + text.slice(-31) : text;
         write(draftText, '> ' + ascii(tail) + '_', [0, .3, 0]);
         write(statusText, status, [0, .36, 0]);
      },
   };
}
