/*
 * THINGS — what the AI builds from a prompt. Pure logic, no scene graph.
 *
 * The AI never sends code. It sends a list of PARTS: simple solids with a place, a size
 * and a colour, all in FEET in the mini's world (1 ft there = 1 in on the real table).
 *    {"name":"LIGHTHOUSE","parts":[{"shape":"cylinder","at":[0,0,0],"size":[3,9,3],"color":[1,1,1]}, ...]}
 *      at   = [x, y, z]: x and z are the part's centre, y is its BOTTOM (0 = standing on the ground)
 *      size = [width, height, depth]
 * validateThing checks every number and throws away what does not fit, so nothing the AI
 * says can put a part outside its allowed box or make the scene draw thousands of parts.
 *
 * The same code serves both players, with different limits:
 *    the GIANT builds buildings (up to 12 x 16 x 12 ft), the MINI builds furniture (up to 7 x 7 x 7 ft).
 * Those boxes are only limits: the prompt asks for true real-life sizes, so a pot is a foot wide, not five.
 */
import { INCH, TABLE } from '../hw6/miniatureModel.js';

export const SHAPES = ['box', 'cylinder', 'cone', 'pyramid', 'sphere'];
export const LIMITS = {
   table:  {what: 'a building or a piece of scenery for a town', wide: 12, tall: 16, parts: 40,
            sizes: 'a door is 3 wide and 6.5 tall, one storey is 8 to 9 tall, a cottage is about 10 wide, a tree is 8 to 15 tall, a bench is 5 long'},
   inside: {what: 'one piece of furniture or a household object', wide: 7, tall: 7, parts: 24,
            sizes: 'a cooking pot is 1 wide and 0.8 tall, a chair is 1.5 wide and 3 tall with its seat at 1.5, a table is 2.5 tall, a bed is 6.5 long and 2 tall, a bookshelf is 6 tall, a cup is 0.3'},
};

// room (optional): the room the mini stands in, {size: [x, y, z] in feet}. Then the AI is told
// how big the room is, and how much of it the thing may take (see roomFit).
export function thingPrompt(text, role = 'table', room = null) {
   const L = LIMITS[role] || LIMITS.table, h = L.wide / 2, fit = room && roomFit(room);
   const inRoom = !fit ? '' : `
IT GOES INTO A SMALL ROOM: the room is ${room.size[0]} wide (x), ${room.size[2]} deep (z) and ${room.size[1]} high.
It must fit with space left to walk around it: at most ${fit[0]} in x, ${fit[2]} in z and ${fit[1]} in y.
If its real-life size is bigger than that, make a smaller model of it (a child's bed, a narrow shelf).
Put its long side along the room's long side.`;
   return `You design ${L.what}, built from a few simple solid parts.
The request is: "${String(text).replace(/["\\\\]/g, ' ').slice(0, 200)}"

Units are feet. x is left-right, y is up, z is front-back. The thing stands on the ground at y = 0,
centred on x = 0, z = 0.
SIZE MATTERS: a person 5.5 feet tall will stand next to it and use it, so build it at its TRUE
REAL-LIFE SIZE. For example ${L.sizes}. A small object must stay small.
The largest allowed box is -${h} to ${h} in x and z and 0 to ${L.tall} in y: that is only a limit, do not fill it.${inRoom}
Each part is one solid:
  "shape": one of ${SHAPES.map(s => '"' + s + '"').join(', ')}  (cone and pyramid point up)
  "at":    [x, y, z]  where x,z is the CENTRE of the part and y is its BOTTOM
  "size":  [width, height, depth]
  "color": [r, g, b] each from 0 to 1
  "glow":  true only for lights, lamps, fire, lit windows
Use 6 to ${L.parts} parts. Make it recognisable at a glance: a clear silhouette, a few details
(a door, windows, a roof, a chimney, legs, a handle...). Parts must rest on the ground or on
other parts, never float. Use several colours.
Return JSON only, no markdown and no code, exactly in this form:
{"name":"SHORT NAME","parts":[{"shape":"box","at":[0,0,0],"size":[4,3,4],"color":[0.8,0.7,0.5],"glow":false}]}`;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const numbers = (a, n) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);

// Returns {name, parts, discarded}. Throws if nothing usable is left.
export function validateThing(value, role = 'table') {
   const L = LIMITS[role] || LIMITS.table, h = L.wide / 2;
   if (!value || !Array.isArray(value.parts)) throw new Error('The AI sent no parts');
   const parts = [];
   let discarded = 0;
   for (const p of value.parts) {
      if (parts.length >= L.parts) { discarded++; continue; }
      if (!p || !SHAPES.includes(p.shape) || !numbers(p.at, 3) || !numbers(p.size, 3)) { discarded++; continue; }
      // Sizes first, then the place, so that the whole part stays inside the box.
      const size = [clamp(Math.abs(p.size[0]), .03, L.wide), clamp(Math.abs(p.size[1]), .03, L.tall), clamp(Math.abs(p.size[2]), .03, L.wide)];
      const at = [clamp(p.at[0], -h + size[0] / 2, h - size[0] / 2), clamp(p.at[1], 0, L.tall - size[1]),
                  clamp(p.at[2], -h + size[2] / 2, h - size[2] / 2)];
      const color = numbers(p.color, 3) ? p.color.map(c => clamp(c, 0, 1)) : [.7, .7, .7];
      const round = a => a.map(v => Math.round(v * 100) / 100);
      parts.push({shape: p.shape, at: round(at), size: round(size), color: round(color), glow: p.glow === true,
                  section: Number.isInteger(p.section) && p.section > 0 && p.section < MAX_SECTIONS ? p.section : 0});
   }
   if (!parts.length) throw new Error('The AI sent no usable parts');
   const name = typeof value.name === 'string' ? value.name.toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 20) : '';
   // Sections (see splitPrompt): keep only the ones that have parts, numbered 0, 1, 2... from the bottom.
   const used = [...new Set(parts.map(p => p.section))].sort((a, b) => a - b);
   for (const p of parts) p.section = used.indexOf(p.section);
   const label = i => typeof value.sections?.[used[i]] === 'string'
      ? value.sections[used[i]].toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 12) : '';
   const sections = used.map((_, i) => label(i) || (i ? 'PART ' + (i + 1) : 'BASE'));
   return {name: name || 'THING', parts, discarded, sections};
}

// ---- Taking a building apart ----
// A building is one thing. Its parts may belong to SECTIONS (0 = the base, then upward). A section
// that was taken off has an offset from the building in the entry: entry.off = {1: [dx, dy, dz]}.
// No offset = it sits in place. The trigger always moves the whole building (entry.at, and every
// section with it); the grip moves one section (its offset).
export const MAX_SECTIONS = 4;
export const sectionCount = spec => spec?.sections?.length || 1;

// The follow-up request: the same building, rebuilt so that it comes apart and is hollow.
export function splitPrompt(spec, role = 'table') {
   const L = LIMITS[role] || LIMITS.table, h = L.wide / 2;
   const parts = spec.parts.map(({shape, at, size, color, glow}) => ({shape, at, size, color, glow}));
   return `Here is a building made of simple solid parts (units are feet, y is up, "at" is [x, y, z] with
x,z the CENTRE of the part and y its BOTTOM, "size" is [width, height, depth]):
${JSON.stringify({name: spec.name, parts})}

Rebuild THE SAME building so that a giant hand can take it apart like a doll's house and a small
person can live inside. Keep its look, its overall size, its colours and its details.
Give every part a "section" number, and list the section names from the bottom up:
  section 0 "BASE": the floor and everything up to the top of the ground-floor walls
  the last section, usually "ROOF": everything above the top storey's walls
  if it has more storeys, one section per storey in between (at most ${MAX_SECTIONS} sections)
The inside must be EMPTY, so that lifting a section shows a room:
  replace any solid block that fills a storey by a thin floor (0.3 thick) plus four thin walls
  (0.4 thick) around the edge; leave a door gap 3 wide and 6.5 tall in one wall of the base.
  Round towers may stay solid. Put nothing in the middle of a room.
Shapes allowed: ${SHAPES.map(s => '"' + s + '"').join(', ')}. Everything stays inside -${h} to ${h} in x and z and
0 to ${L.tall} in y. At most ${L.parts} parts.
Return JSON only, no markdown and no code, exactly in this form:
{"name":"${spec.name}","sections":["BASE","ROOF"],"parts":[{"shape":"box","at":[0,0,0],"size":[10,0.3,8],"color":[0.6,0.5,0.4],"glow":false,"section":0}]}`;
}

// The box around ONE section of a thing standing at `at`, moved by its offset `off` (table metres).
export function sectionBounds(spec, section, at, off = [0, 0, 0]) {
   const parts = spec.parts.filter(p => (p.section || 0) === section);
   if (!parts.length) return null;
   const lo = [0, 1, 2].map(i => Math.min(...parts.map(p => i === 1 ? p.at[1] : p.at[i] - p.size[i] / 2)));
   const hi = [0, 1, 2].map(i => Math.max(...parts.map(p => i === 1 ? p.at[1] + p.size[1] : p.at[i] + p.size[i] / 2)));
   return {centre: [0, 1, 2].map(i => at[i] + off[i] + (lo[i] + hi[i]) / 2 * INCH),
           half: [0, 1, 2].map(i => (hi[i] - lo[i]) / 2 * INCH + .006),
           bottom: lo[1] * INCH};                      // how high above the building's foot this section starts
}
// Letting go of a section: close to its place, it clicks back on (no offset). Elsewhere it is set
// down on the table: lowered by its own starting height. `ground` is the table height, at the building's foot.
export const SNAP = 1.5 * INCH;
export function restSection(spec, section, at, off, ground = TABLE.height) {
   if (Math.hypot(off[0], off[2]) < SNAP && Math.abs(off[1]) < 3 * SNAP) return null;
   const bottom = sectionBounds(spec, section, at)?.bottom || 0;
   return [off[0], ground - at[1] - bottom, off[2]];
}


// The box around a thing standing at `at` (table metres): centre and half size, for grabbing.
export function thingBounds(spec, at) {
   let lo = [Infinity, 0, Infinity], hi = [-Infinity, 0, -Infinity];
   for (const p of spec.parts) {
      lo = [Math.min(lo[0], p.at[0] - p.size[0] / 2), 0, Math.min(lo[2], p.at[2] - p.size[2] / 2)];
      hi = [Math.max(hi[0], p.at[0] + p.size[0] / 2), Math.max(hi[1], p.at[1] + p.size[1]), Math.max(hi[2], p.at[2] + p.size[2] / 2)];
   }
   const feet = v => v * INCH;                          // 1 ft in the thing = 1 in on the table
   return {centre: [at[0] + feet((lo[0] + hi[0]) / 2), at[1] + feet(hi[1] / 2), at[2] + feet((lo[2] + hi[2]) / 2)],
           half: [feet((hi[0] - lo[0]) / 2) + .01, feet(hi[1] / 2) + .01, feet((hi[2] - lo[2]) / 2) + .01]};
}

// Keep a thing on the table top.
export function clampToTable(at) {
   const hx = TABLE.width / 2 - 2 * INCH, hz = TABLE.depth / 2 - 2 * INCH;
   return [clamp(at[0], TABLE.at[0] - hx, TABLE.at[0] + hx), Math.max(TABLE.height, at[1]), clamp(at[2], TABLE.at[2] - hz, TABLE.at[2] + hz)];
}
// Where the giant's n-th building appears: free places along the table, left and right of the house.
export function giantSlot(n) {
   // Clear of the lamp and its pool of light (left), the cup (far right), the house (middle back)
   // and the mini's spot (middle front).
   const places = [[.3, .12], [.28, -.18], [-.26, -.2], [.33, -.03]];
   const [x, z] = places[n % places.length];
   return [TABLE.at[0] + x, TABLE.height, TABLE.at[2] + z];
}
// Where the mini's furniture appears: 4 ft in front of them, on whatever they stand on.
// headOnTable and forward (the way the mini faces, on the table) are in table coordinates.
export function miniSlot(headOnTable, forward, feetY) {
   const n = Math.hypot(forward[0], forward[2]) || 1;
   return [headOnTable[0] + forward[0] / n * 4 * INCH, feetY, headOnTable[2] + forward[2] / n * 4 * INCH];
}

// ---- Furniture that fits the room it is made in ----
// A room is {centre: [x, z] on the table (metres), size: [x, y, z] in feet}.
// A thing may take 60 % of the room's floor in each direction and stay 1 ft below the ceiling.
const r1 = v => Math.round(v * 10) / 10;
export const roomFit = room => [r1(room.size[0] * .6), r1(Math.max(1, room.size[1] - 1)), r1(room.size[2] * .6)];

// The AI may still send something too big. Then the whole thing is shrunk evenly (every place
// and every size by the same factor), so it keeps its shape and is guaranteed to fit.
export function fitThing(spec, fit) {
   const size = thingBounds(spec, [0, 0, 0]).half.map(v => (v - .01) * 2 / INCH);       // its real extent, in feet
   const k = Math.min(1, fit[0] / size[0], fit[1] / size[1], fit[2] / size[2]);
   if (k >= 1) return spec;
   const scale = a => a.map(v => Math.round(v * k * 100) / 100);
   return {...spec, parts: spec.parts.map(p => ({...p, at: scale(p.at), size: scale(p.size)}))};
}
// And it is put where all of it is inside the walls: as near to `at` as the room allows.
export function placeInRoom(spec, at, room) {
   const b = thingBounds(spec, [0, 0, 0]), wall = .5 * INCH;
   const fitAxis = (i, c) => {
      const reach = room.size[i] * INCH / 2 - wall - (b.half[i] - .01);                  // how far its centre may be from the room's
      return clamp(at[i], c - b.centre[i] - Math.max(0, reach), c - b.centre[i] + Math.max(0, reach));
   };
   return [fitAxis(0, room.centre[0]), at[1], fitAxis(2, room.centre[1])];
}
