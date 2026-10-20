/*
 * POCKET CITY — build one 3x3 voxel building, then ask AI for four variations.
 * The example is made with actual controller presses. The AI returns block data,
 * never executable code; pocketCityRules.js validates it before it is rendered.
 * Desktop: arrows select a cell, Space adds, Backspace removes, 1-4 select a
 * material, G generates, C clears. In VR, point a controller beam and trigger.
 */
import * as cg from '../../render/core/cg.js';
import { ControllerBeam } from '../../render/core/controllerInput.js';
import { askAIJson } from '../../util/aiquery.js';
import { CITY, MATERIALS, addExampleBlock, removeExampleBlock,
         cityPrompt, validateCityResponse } from './pocketCityRules.js';

const PALETTE = { stone:[.43,.53,.6], clay:[.95,.53,.38],
                  glass:[.38,.8,.86], light:[1,.86,.47] };
const toX = x => (x - (CITY.width - 1) / 2) * CITY.cell;
const toZ = z => CITY.centreZ + (z - (CITY.depth - 1) / 2) * CITY.cell;
const cellPos = (x, y, z) => [toX(x), CITY.top + (y + .5) * CITY.cell, toZ(z)];

let cleanup = () => {};
export const deinit = () => cleanup();

export const init = async model => {
   cleanup();
   let active = true, request = 0, example = [], city = null;
   let material = 'stone', erase = false, selected = [1, 1], status = 'BUILD AN EXAMPLE IN THE GOLD LOT';
   const beams = {left:new ControllerBeam(model,'left'), right:new ControllerBeam(model,'right')};

   const label = (id, at, size, color) => {
      let node, last;
      return str => {
         if (str === last) return;
         last = str;
         const name = 'pocketCity_' + id;
         clay.defineTextMesh(name, str);
         if (!node) node = model.add(name).color(color).dull();
         const width = str ? .019 * (str.length - 1) + .015 : 0;
         node.identity().move(at[0] - width * size / 2, at[1], at[2]).scale(size);
      };
   };
   label('title',[0,1.79,-1.27],1.55,[.95,.97,1])('POCKET CITY');
   const showStatus = label('status',[0,1.68,-1.27],.85,[.95,.75,.45]);
   const showHelp = label('help',[0,.50,-.73],.72,[.8,.9,1]);
   const showName = label('name',[0,1.59,-1.27],.85,[.6,.9,1]);
   label('example', [toX(2),.90,toZ(8)],.7,[1,.78,.45])('YOUR EXAMPLE');

   // A model table with four AI lots around the player's demonstration lot.
   model.add('cube').move(0,CITY.top-.045,CITY.centreZ)
      .scale(CITY.width*CITY.cell/2+.07,.04,CITY.depth*CITY.cell/2+.07)
      .color(.09,.14,.2).dull();
   for (let x = 0; x < CITY.width; x++) for (let z = 0; z < CITY.depth; z++)
      model.add('cube').move(toX(x),CITY.top+.001,toZ(z))
         .scale(CITY.cell*.46,.002,CITY.cell*.46)
         .color((x+z)%2 ? [.16,.22,.29] : [.19,.26,.33]).dull();
   const markLot = ([ox,oz], color) => {
      for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++)
         model.add('cube').move(toX(ox+x),CITY.top+.006,toZ(oz+z))
            .scale(CITY.cell*.45,.003,CITY.cell*.45).color(color).dull();
   };
   markLot(CITY.example,[.35,.26,.15]);
   CITY.lots.forEach(lot => markLot(lot,[.13,.27,.33]));

   const voxelRoot = model.add();
   const rebuild = () => {
      while (voxelRoot.nChildren() > 0) voxelRoot.remove(0);
      const draw = (blocks, lot) => blocks.forEach(b => {
         const [x,y,z] = cellPos(lot[0]+b.x,b.y,lot[1]+b.z);
         voxelRoot.add('cube').move(x,y,z).scale(CITY.cell*.48)
            .color(PALETTE[b.kind]).dull();
      });
      draw(example,CITY.example);
      city?.buildings.forEach((building,i) => draw(building.blocks,CITY.lots[i]));
   };
   const hover = model.add('cube').color(1,.85,.45).opacity(.55);

   const controls = [
      ...MATERIALS.map((kind,i) => ({kind, at:[-.56+i*.17,1.31,-1.04]})),
      {kind:'erase',at:[.17,1.31,-1.04]},
      {kind:'grow',at:[.49,1.31,-1.04]},
   ];
   const controlNodes = controls.map((c,i) => {
      const cube = model.add('cube').move(c.at).scale(c.kind==='grow'?.14:.065,.04,.025).dull();
      label('control'+i,[c.at[0],c.at[1]-.08,c.at[2]],.66,[.92,.95,1])(
         c.kind==='grow' ? 'GROW CITY' : c.kind==='erase' ? 'ERASE' : c.kind.toUpperCase());
      return cube;
   });

   const updateExample = remove => {
      const [x,z] = selected;
      example = remove ? removeExampleBlock(example,x,z) : addExampleBlock(example,x,z,material);
      city = null; request++; rebuild();
      status = `EXAMPLE ${example.length} BLOCKS - ${remove ? 'ERASE' : material.toUpperCase()}`;
   };
   const generate = async () => {
      if (example.length < 4) { status = 'PLACE AT LEAST 4 BLOCKS FIRST'; return; }
      const id = ++request, snapshot = example.map(b => ({...b}));
      status = 'AI IS GROWING THE NEIGHBORHOOD';
      try {
         const answer = await askAIJson(cityPrompt(snapshot), {timeout:30000});
         const generated = validateCityResponse(answer);
         if (!active || id !== request) return;
         city = generated; rebuild();
         status = generated.discarded ? `CITY READY - ${generated.discarded} INVALID BLOCKS OMITTED` : 'CITY READY';
      } catch (error) {
         if (!active || id !== request) return;
         console.warn('Pocket City generation failed:', error);
         status = 'AI FAILED - YOUR EXAMPLE IS STILL HERE';
      }
   };
   const choose = kind => {
      if (kind === 'grow') { generate(); return; }
      erase = kind === 'erase';
      if (!erase) material = kind;
      status = erase ? 'ERASE TOP BLOCK' : `BUILD WITH ${material.toUpperCase()}`;
   };

   const ray = hand => {
      const bm = beams[hand].beamMatrix();
      if (!bm || !Number.isFinite(bm[12])) return null;
      const inv = cg.mInverse(window.worldCoords || cg.mIdentity());
      const origin = cg.mTransform(inv,bm.slice(12,15));
      const end = cg.mTransform(inv,cg.subtract(bm.slice(12,15),bm.slice(8,11)));
      return {origin, dir:cg.normalize(cg.subtract(end,origin))};
   };
   const near = (r,p,radius) => {
      if (!r) return false;
      const v = cg.subtract(p,r.origin), t = cg.dot(v,r.dir);
      return t > 0 && cg.norm(cg.subtract(v,cg.scale(r.dir,t))) < radius;
   };
   const cellFromRay = r => {
      if (!r || Math.abs(r.dir[1]) < .0001) return null;
      const t = (CITY.top - r.origin[1]) / r.dir[1];
      if (t <= 0) return null;
      const p = cg.add(r.origin,cg.scale(r.dir,t));
      const x = Math.round(p[0]/CITY.cell+(CITY.width-1)/2) - CITY.example[0];
      const z = Math.round((p[2]-CITY.centreZ)/CITY.cell+(CITY.depth-1)/2) - CITY.example[1];
      return x>=0 && x<=2 && z>=0 && z<=2 ? [x,z] : null;
   };
   const onPress = hand => {
      const r = ray(hand);
      const control = controls.find(c => near(r,c.at,c.kind==='grow'?.16:.085));
      if (control) { choose(control.kind); return; }
      const cell = cellFromRay(r);
      if (cell) { selected = cell; updateExample(erase); }
   };
   const onKey = event => {
      if (event.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
      const moves = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
      if (moves[event.key]) selected = [Math.max(0,Math.min(2,selected[0]+moves[event.key][0])),
                                          Math.max(0,Math.min(2,selected[1]+moves[event.key][1]))];
      else if (event.key === ' ') updateExample(erase);
      else if (event.key === 'Backspace') updateExample(true);
      else if (/^[1-4]$/.test(event.key)) choose(MATERIALS[Number(event.key)-1]);
      else if (event.key.toLowerCase() === 'g') generate();
      else if (event.key.toLowerCase() === 'c') {example=[]; city=null; request++; rebuild(); status='BUILD AN EXAMPLE IN THE GOLD LOT';}
      else return;
      event.preventDefault();
   };
   inputEvents.onPress = onPress;
   addEventListener('keydown',onKey);
   cleanup = () => {
      active = false; request++;
      if (inputEvents.onPress === onPress) inputEvents.onPress = () => {};
      removeEventListener('keydown',onKey);
   };
   rebuild();
   model.animate(() => {
      for (const beam of Object.values(beams)) beam.update();
      const pointed = cellFromRay(ray('left')) || cellFromRay(ray('right'));
      const [x,z] = pointed || selected;
      const height = example.filter(b => b.x === x && b.z === z).length;
      hover.identity().move(cellPos(CITY.example[0]+x,Math.min(height,CITY.maxHeight-1),CITY.example[1]+z))
         .scale(CITY.cell*.49).color(erase ? [1,.35,.35] : PALETTE[material]);
      controls.forEach((c,i) => controlNodes[i].color(c.kind==='grow' ? [.33,.75,.65]
         : c.kind==='erase' ? erase ? [1,.35,.35] : [.36,.39,.44]
         : c.kind===material && !erase ? PALETTE[c.kind] : [.25,.3,.35]));
      showStatus(status);
      showHelp('TRIGGER: PLACE   SELECT MATERIAL / ERASE   GROW CITY: AI VARIATIONS');
      showName(city ? `${city.title} - ${city.buildings.map(b=>b.name).join(' / ')}` : '');
   });
};
