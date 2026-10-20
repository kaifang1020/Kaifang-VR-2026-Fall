// A small voxel vocabulary keeps AI output renderable and lets the player
// compare the generated buildings with the example they built by hand.
export const CITY = Object.freeze({ width: 15, depth: 11, cell: .09, top: .78,
   centreZ: -1.25, maxHeight: 6, example: [1, 4],
   lots: [[5, 1], [10, 1], [5, 7], [10, 7]] });
export const MATERIALS = Object.freeze(['stone', 'clay', 'glass', 'light']);

export function addExampleBlock(blocks, x, z, kind) {
   if (!Number.isInteger(x) || !Number.isInteger(z) || x < 0 || x > 2 || z < 0 || z > 2 ||
       !MATERIALS.includes(kind)) return blocks;
   const y = blocks.filter(b => b.x === x && b.z === z).length;
   return y >= CITY.maxHeight ? blocks : [...blocks, { x, y, z, kind }];
}

export function removeExampleBlock(blocks, x, z) {
   const column = blocks.filter(b => b.x === x && b.z === z);
   if (!column.length) return blocks;
   const y = Math.max(...column.map(b => b.y));
   return blocks.filter(b => !(b.x === x && b.z === z && b.y === y));
}

export function cityPrompt(example) {
   return `A person built the following tiny building in a 3 by 3 voxel lot.
Create EXACTLY FOUR different buildings for the neighboring lots. Treat the
example as a design demonstration: repeat recognizable features, materials, or
proportions, but vary the silhouettes. A building can suggest an apartment,
workshop, tower, or pavilion. Make an interesting neighborhood, not four copies.

Each building has 4 to 24 blocks. Every block is one cube with integer x and z
from 0 to 2 and integer y from 0 to 5. A block at y > 0 must have a block at the
same x,z directly below it. Use only these kinds: stone, clay, glass, light.
Keep the first layer substantial and leave some gaps between structures.
Return JSON only, no code or markdown, exactly this structure:
{"title":"QUIET HARBOR","buildings":[{"name":"TOWER","blocks":[{"x":1,"y":0,"z":1,"kind":"stone"}]}]}
Names are short English labels. The buildings array must have exactly 4 entries.
Here is the person's example, in the same block format:
${JSON.stringify(example)}`;
}

export function validateCityResponse(value) {
   if (!value || !Array.isArray(value.buildings) || value.buildings.length !== CITY.lots.length)
      throw new Error('AI must return exactly four buildings');
   let discarded = 0;
   const buildings = value.buildings.map((building, index) => {
      if (!building || !Array.isArray(building.blocks)) throw new Error('Missing building blocks');
      const accepted = [], occupied = new Set();
      for (const block of building.blocks.slice(0, 96).sort((a,b) => (a?.y ?? 99) - (b?.y ?? 99))) {
         if (!block || ![block.x, block.y, block.z].every(Number.isInteger) ||
             block.x < 0 || block.x > 2 || block.z < 0 || block.z > 2 ||
             block.y < 0 || block.y >= CITY.maxHeight || !MATERIALS.includes(block.kind)) {
            discarded++; continue;
         }
         const key = `${block.x},${block.y},${block.z}`;
         if (occupied.has(key) || (block.y > 0 && !occupied.has(`${block.x},${block.y - 1},${block.z}`)) ||
             accepted.length >= 24) { discarded++; continue; }
         occupied.add(key);
         accepted.push({x:block.x,y:block.y,z:block.z,kind:block.kind});
      }
      if (accepted.length < 4) throw new Error(`Building ${index + 1} has too few valid blocks`);
      const name = typeof building.name === 'string'
         ? building.name.toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 16) : '';
      return {name:name || `BUILDING ${index + 1}`, blocks:accepted};
   });
   const title = typeof value.title === 'string'
      ? value.title.toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 28) : '';
   return {title:title || 'POCKET CITY', buildings, discarded};
}
