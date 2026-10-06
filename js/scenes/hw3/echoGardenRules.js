// Shared, deterministic rules for the Echo Garden scene.
// The panel is at minZ; notes can be pulled toward the player up to maxZ.
export const GARDEN = Object.freeze({ minX: -.82, maxX: .82, minY: 1.18, maxY: 2.06,
                                     z: -1.5, minZ: -1.455, maxZ: -.85 });
export const MAX_SEEDS = 24;
export const LINK_DISTANCE = .37;
const NOTES = [60, 62, 64, 67, 69, 72]; // C-major pentatonic, then the octave.

export const emptyGarden = () => ({ seeds: {} });

export function gardenPosition(pos) {
   if (!Array.isArray(pos) || pos.length < 3 || !pos.slice(0,3).every(Number.isFinite)) return null;
   return [
      Math.max(GARDEN.minX, Math.min(GARDEN.maxX, pos[0])),
      Math.max(GARDEN.minY, Math.min(GARDEN.maxY, pos[1])),
      Math.max(GARDEN.minZ, Math.min(GARDEN.maxZ, pos[2]))
   ].map(v => Math.round(v * 1000) / 1000);
}

// Every client applies the same operation to its own copy of the garden.
export function applyGardenMessage(garden, message) {
   if (!garden || typeof garden !== 'object' || !message || typeof message !== 'object') return false;
   garden.seeds ||= {};
   if (message.op === 'clear') {
      garden.seeds = {};
      return true;
   }
   const id = message.id;
   if (typeof id !== 'string' || !id || id.length > 80 || id === '__proto__' || id === 'constructor') return false;
   if (message.op === 'plant') {
      const pos = gardenPosition(message.pos);
      if (!pos || garden.seeds[id] || Object.keys(garden.seeds).length >= MAX_SEEDS ||
          typeof message.owner !== 'string' || !message.owner) return false;
      garden.seeds[id] = { pos, owner: message.owner.slice(0,40), color: message.color === 1 ? 1 : 0 };
      return true;
   }
   if (!garden.seeds[id]) return false;
   if (message.op === 'move') {
      const pos = gardenPosition(message.pos);
      if (!pos) return false;
      garden.seeds[id].pos = pos;
      return true;
   }
   if (message.op === 'remove') {
      delete garden.seeds[id];
      return true;
   }
   return false;
}

// Nearby notes can form solo pairs. Prefer pairs from different participants
// when both are available, so collaboration still changes the composition.
// Each note gets one connection, keeping dense clusters legible and musical.
export function gardenLinks(seeds) {
   const entries = Object.entries(seeds || {}).filter(([,s]) =>
      s && typeof s.owner === 'string' && gardenPosition(s.pos));
   const candidates = [];
   for (let i=0;i<entries.length;i++)
      for (let j=i+1;j<entries.length;j++) {
         const [aId,a] = entries[i], [bId,b] = entries[j];
         const distance = Math.hypot(a.pos[0]-b.pos[0],a.pos[1]-b.pos[1],a.pos[2]-b.pos[2]);
         if (distance < LINK_DISTANCE)
            candidates.push({id:[aId,bId].sort().join('|'),a:aId,b:bId,distance,
                             shared:a.owner !== b.owner});
      }
   candidates.sort((a,b) => Number(b.shared)-Number(a.shared) ||
                            a.distance-b.distance || a.id.localeCompare(b.id));
   const used = new Set(), links = [];
   for (const pair of candidates) if (!used.has(pair.a) && !used.has(pair.b)) {
      used.add(pair.a); used.add(pair.b);
      links.push({id:pair.id,a:pair.a,b:pair.b,shared:pair.shared});
   }
   return links.sort((a,b) => a.id.localeCompare(b.id));
}

export function noteAtHeight(y) {
   const u = Math.max(0, Math.min(.999, (y - GARDEN.minY) / (GARDEN.maxY - GARDEN.minY)));
   return NOTES[Math.floor(u * NOTES.length)];
}

export const midiToHz = note => 440 * Math.pow(2, (note - 69) / 12);
