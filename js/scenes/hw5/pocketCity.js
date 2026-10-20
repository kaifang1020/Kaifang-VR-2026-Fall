/*
 * POCKET CITY — build one 3x3 voxel building, then ask AI for four variations.
 * The example is made with actual controller presses. The AI returns block data,
 * never executable code; pocketCityRules.js validates it before it is rendered.
 * Desktop: arrows select a cell, Space adds, Backspace removes, 1-4 select a
 * material, G generates, C clears, V switches view, +/- zoom. In VR, point
 * and trigger; the right thumbstick zooms the build surface.
 */
import * as cg from '../../render/core/cg.js';
import { ControllerBeam, joyStickState } from '../../render/core/controllerInput.js';
import { askAIJson } from '../../util/aiquery.js';
import { CITY, MATERIALS, addExampleBlock, removeExampleBlock,
         cityPrompt, validateCityResponse, rayBoxDistance, pickExampleCell } from './pocketCityRules.js';

const PALETTE = { stone:[.43,.53,.6], clay:[.95,.53,.38],
                  glass:[.38,.8,.86], light:[1,.86,.47] };
const toX = x => (x - (CITY.width - 1) / 2) * CITY.cell;
const toZ = z => CITY.centreZ + (z - (CITY.depth - 1) / 2) * CITY.cell;
const cellPos = (x, y, z) => [toX(x), CITY.top + (y + .5) * CITY.cell, toZ(z)];
const BUILD_PIVOT = [toX(CITY.example[0]+1),CITY.top,toZ(CITY.example[1]+1)];
const WALK_CELL = .55;
const streetX = x => (x - (CITY.width - 1) / 2) * WALK_CELL;
const streetZ = z => (z - (CITY.depth - 1) / 2) * WALK_CELL;
const streetPos = (x,y,z) => [streetX(x),(y+.5)*WALK_CELL,streetZ(z)];

let cleanup = () => {};
export const deinit = () => cleanup();

export const init = async model => {
   cleanup();
   let active = true, request = 0, example = [], city = null;
   let mode = 'table';
   let generating = false, generationStarted = 0, growFlash = '', flashUntil = 0;
   let material = 'stone', erase = false, selected = [1, 1], status = 'BUILD AN EXAMPLE IN THE GOLD LOT';
   const beams = {left:new ControllerBeam(model,'left'), right:new ControllerBeam(model,'right')};
   const tableRoot = model.add();
   const buildRoot = tableRoot.add();
   const streetRoot = model.add();
   const streetHud = model.add();
   streetRoot.identity().scale(0);
   streetHud.identity().scale(0);

   const label = (id, at, size, color, parent = tableRoot) => {
      let node, last;
      return str => {
         if (str === last) return;
         last = str;
         const name = 'pocketCity_' + id;
         clay.defineTextMesh(name, str);
         if (!node) node = parent.add(name).color(color).dull();
         const width = str ? .019 * (str.length - 1) + .015 : 0;
         node.identity().move(at[0] - width * size / 2, at[1], at[2]).scale(size);
      };
   };
   label('title',[0,1.79,-1.27],1.55,[.95,.97,1])('POCKET CITY');
   const showStatus = label('status',[0,1.68,-1.27],.85,[.95,.75,.45]);
   const showHelp = label('help',[0,.50,-.73],.72,[.8,.9,1]);
   const showName = label('name',[0,1.59,-1.27],.85,[.6,.9,1]);
   const showZoom = label('zoom',[-.43,1.46,-1.04],.7,[.9,.93,1]);
   let zoom = 1;
   const setZoom = value => {
      const next = Math.max(1,Math.min(2.3,value));
      if (Math.abs(next-zoom) < .001 && showZoom) return;
      zoom = next;
      buildRoot.identity().move(BUILD_PIVOT).scale(zoom).move(BUILD_PIVOT.map(v => -v));
      showZoom(`SCALE ${zoom.toFixed(1)}X`);
   };
   // Set the pivot even at 1x so zooming keeps the gold example lot in place.
   buildRoot.identity().move(BUILD_PIVOT).scale(zoom).move(BUILD_PIVOT.map(v => -v));
   showZoom('SCALE 1.0X');
   label('example', [toX(2),.90,toZ(8)],.7,[1,.78,.45],buildRoot)('YOUR EXAMPLE');

   // A model table with four AI lots around the player's demonstration lot.
   buildRoot.add('cube').move(0,CITY.top-.045,CITY.centreZ)
      .scale(CITY.width*CITY.cell/2+.07,.04,CITY.depth*CITY.cell/2+.07)
      .color(.09,.14,.2).dull();
   for (let x = 0; x < CITY.width; x++) for (let z = 0; z < CITY.depth; z++)
      buildRoot.add('cube').move(toX(x),CITY.top+.001,toZ(z))
         .scale(CITY.cell*.46,.002,CITY.cell*.46)
         .color((x+z)%2 ? [.16,.22,.29] : [.19,.26,.33]).dull();
   const markLot = ([ox,oz], color) => {
      for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++)
         buildRoot.add('cube').move(toX(ox+x),CITY.top+.006,toZ(oz+z))
            .scale(CITY.cell*.45,.003,CITY.cell*.45).color(color).dull();
   };
   markLot(CITY.example,[.35,.26,.15]);
   CITY.lots.forEach(lot => markLot(lot,[.13,.27,.33]));

   const voxelRoot = buildRoot.add();
   const streetBuildings = streetRoot.add();
   // The same grid becomes a human-scale district around the viewer.
   for (let x = 0; x < CITY.width; x++) for (let z = 0; z < CITY.depth; z++)
      streetRoot.add('cube').move(streetX(x),-.035,streetZ(z))
         .scale(WALK_CELL*.49,.025,WALK_CELL*.49)
         .color((x+z)%2 ? [.13,.19,.24] : [.16,.22,.27]).dull();
   const streetLot = (lot, tint) => {
      for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++)
         streetRoot.add('cube').move(streetX(lot[0]+x),.002,streetZ(lot[1]+z))
            .scale(WALK_CELL*.47,.005,WALK_CELL*.47).color(tint).dull();
   };
   streetLot(CITY.example,[.33,.27,.17]);
   CITY.lots.forEach(lot => streetLot(lot,[.13,.29,.34]));
   const rebuild = () => {
      while (voxelRoot.nChildren() > 0) voxelRoot.remove(0);
      while (streetBuildings.nChildren() > 0) streetBuildings.remove(0);
      const draw = (blocks, lot) => blocks.forEach(b => {
         const [x,y,z] = cellPos(lot[0]+b.x,b.y,lot[1]+b.z);
         voxelRoot.add('cube').move(x,y,z).scale(CITY.cell*.48)
            .color(PALETTE[b.kind]).dull();
         streetBuildings.add('cube').move(streetPos(lot[0]+b.x,b.y,lot[1]+b.z))
            .scale(WALK_CELL*.48).color(PALETTE[b.kind]).dull();
      });
      draw(example,CITY.example);
      city?.buildings.forEach((building,i) => draw(building.blocks,CITY.lots[i]));
   };
   const hover = buildRoot.add('cube').color(1,.85,.45).opacity(.75);
   const hoverRight = buildRoot.add('cube').color(1,.85,.45).opacity(.75);

   const controls = [
      ...MATERIALS.map((kind,i) => ({kind, at:[-.56+i*.17,1.31,-1.04]})),
      {kind:'erase',at:[.17,1.31,-1.04]},
      {kind:'grow',at:[.49,1.31,-1.04]},
      {kind:'enter',at:[0,1.46,-1.04]},
   ];
   const controlNodes = controls.map((c,i) => {
      const cube = tableRoot.add('cube').move(c.at).scale(c.kind==='grow' || c.kind==='enter' ? .14 : .065,.04,.025).dull();
      label('control'+i,[c.at[0],c.at[1]-.08,c.at[2]],.66,[.92,.95,1])(
         c.kind==='grow' ? 'GROW CITY' : c.kind==='enter' ? 'ENTER CITY' : c.kind==='erase' ? 'ERASE' : c.kind.toUpperCase());
      return cube;
   });

   const exitAt = [.47,1.38,-.9];
   const exitButton = streetHud.add('cube').move(exitAt).scale(.18,.055,.025).color(.45,.72,.77).dull();
   label('exit', [.47,1.27,-.9],.75,[.92,.96,1],streetHud)('BACK TO TABLE');
   label('streetTitle',[0,1.73,-.9],1,[.9,.96,1],streetHud)('STREET VIEW');
   const showStreetHelp = label('streetHelp',[0,1.12,-.9],.72,[.75,.88,.91],streetHud);
   showStreetHelp('LOOK AROUND / TRIGGER BACK TO TABLE');

   // The AI endpoint gives no percentage updates, so this moving marker shows
   // that the request is active without pretending to know how far along it is.
   tableRoot.add('cube').move(.49,1.22,-1.04).scale(.14,.006,.006).color(.16,.22,.27).dull();
   const progressMarker = tableRoot.add('cube').scale(.027,.012,.012).color(.95,.85,.47).dull();
   const showProgress = label('progress',[.49,1.17,-1.04],.53,[.9,.9,.75]);
   const signal = (kind, message) => {
      growFlash = kind;
      flashUntil = Date.now() + 1600;
      status = message;
   };

   const updateExample = remove => {
      const [x,z] = selected;
      const next = remove ? removeExampleBlock(example,x,z) : addExampleBlock(example,x,z,material);
      if (next === example) {
         signal('error',remove ? `CELL ${x+1},${z+1} IS EMPTY` : `CELL ${x+1},${z+1} IS FULL`);
         return;
      }
      example = next; city = null; request++; generating = false; rebuild();
      signal('placed',`CELL ${x+1},${z+1} ${remove ? 'ERASED' : 'PLACED'} - ${example.length} BLOCKS`);
   };
   const generate = async () => {
      if (generating) { status = 'AI IS STILL BUILDING'; return; }
      if (example.length < 4) { signal('error','PLACE AT LEAST 4 BLOCKS FIRST'); return; }
      const id = ++request, snapshot = example.map(b => ({...b}));
      generating = true; generationStarted = Date.now();
      status = 'AI IS BUILDING YOUR CITY';
      try {
         const answer = await askAIJson(cityPrompt(snapshot), {timeout:30000});
         const generated = validateCityResponse(answer);
         if (!active || id !== request) return;
         generating = false; city = generated; rebuild();
         signal('success',generated.discarded ? `CITY READY - ${generated.discarded} INVALID BLOCKS OMITTED` : 'CITY READY');
      } catch (error) {
         if (!active || id !== request) return;
         console.warn('Pocket City generation failed:', error);
         generating = false;
         signal('error','AI FAILED - YOUR EXAMPLE IS STILL HERE');
      }
   };
   const switchMode = next => {
      if (next === 'street' && !city) {
         signal('error','GROW THE CITY BEFORE ENTERING');
         return;
      }
      mode = next;
      tableRoot.identity().scale(mode === 'table' ? 1 : 0);
      streetRoot.identity().scale(mode === 'street' ? 1 : 0);
      streetHud.identity().scale(mode === 'street' ? 1 : 0);
      if (mode === 'table') status = 'BACK AT THE TABLE - EDIT OR GROW AGAIN';
   };
   const choose = kind => {
      if (kind === 'grow') { generate(); return; }
      if (kind === 'enter') { switchMode('street'); return; }
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
   const rayInBuildSpace = r => r && {
      origin:BUILD_PIVOT.map((v,i) => v + (r.origin[i]-v)/zoom),
      // Keep the direction unnormalized so its hit distance stays comparable
      // with a button hit measured in the unscaled table coordinate system.
      dir:r.dir.map(v => v/zoom),
   };
   const pick = r => {
      if (!r) return null;
      const cell = pickExampleCell(rayInBuildSpace(r),example);
      let best = cell && {kind:'cell',cell:cell.cell,distance:cell.distance};
      for (const c of controls) {
         const half = c.kind === 'grow' || c.kind === 'enter' ? .14 : .065;
         const distance = rayBoxDistance(r,c.at,[half+.008,.052,.039]);
         if (distance !== null && (!best || distance < best.distance))
            best = {kind:'control',control:c.kind,distance};
      }
      return best;
   };
   const onPress = hand => {
      const r = ray(hand);
      const buzz = strength => { try { window.vibrate?.(hand,strength,55); } catch (_) {} };
      if (mode === 'street') {
         if (rayBoxDistance(r,exitAt,[.19,.065,.04]) !== null) {
            switchMode('table'); buzz(.5);
         }
         return;
      }
      const hit = pick(r);
      if (hit?.kind === 'control') { choose(hit.control); buzz(.45); return; }
      if (hit?.kind === 'cell') { selected = hit.cell; updateExample(erase); buzz(.55); return; }
      signal('error','NO TARGET - AIM AT GOLD LOT OR BUTTON');
      buzz(.2);
   };
   const onKey = event => {
      if (event.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
      if (event.key.toLowerCase() === 'v') {
         switchMode(mode === 'table' ? 'street' : 'table');
         event.preventDefault(); return;
      }
      if (mode === 'street') {
         if (event.key === 'Escape') { switchMode('table'); event.preventDefault(); }
         return;
      }
      if (event.key === '+' || event.key === '=') { setZoom(zoom+.2); event.preventDefault(); return; }
      if (event.key === '-' || event.key === '_') { setZoom(zoom-.2); event.preventDefault(); return; }
      if (event.key === '0') { setZoom(1); event.preventDefault(); return; }
      const moves = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
      if (moves[event.key]) selected = [Math.max(0,Math.min(2,selected[0]+moves[event.key][0])),
                                          Math.max(0,Math.min(2,selected[1]+moves[event.key][1]))];
      else if (event.key === ' ') updateExample(erase);
      else if (event.key === 'Backspace') updateExample(true);
      else if (/^[1-4]$/.test(event.key)) choose(MATERIALS[Number(event.key)-1]);
      else if (event.key.toLowerCase() === 'g') generate();
      else if (event.key.toLowerCase() === 'c') {example=[]; city=null; request++; generating=false; rebuild(); status='BUILD AN EXAMPLE IN THE GOLD LOT';}
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
   let lastFrame = Date.now();
   model.animate(() => {
      for (const beam of Object.values(beams)) beam.update();
      const now = Date.now(), dt = Math.min(.05,Math.max(0,(now-lastFrame)/1000));
      lastFrame = now;
      if (mode === 'street') {
         const aimed = ['left','right'].some(hand => rayBoxDistance(ray(hand),exitAt,[.19,.065,.04]) !== null);
         exitButton.color(aimed ? [1,.96,.58] : [.45,.72,.77]);
         return;
      }
      const stickY = joyStickState.right?.y ?? 0;
      if (Math.abs(stickY) > .16) setZoom(zoom-stickY*dt*1.2);
      const rays = [ray('left'),ray('right')];
      const hits = rays.map(pick);
      const aimedControl = hits.find(hit => hit?.kind === 'control')?.control;
      [hover,hoverRight].forEach((preview,i) => {
         const hit = hits[i];
         if (hit && hit.kind !== 'cell') { preview.identity().scale(0); return; }
         if (!hit && (i === 1 || rays.some(Boolean))) { preview.identity().scale(0); return; }
         const [x,z] = hit?.cell || selected;
         const height = example.filter(b => b.x === x && b.z === z).length;
         preview.identity().move(toX(CITY.example[0]+x),CITY.top+height*CITY.cell+.009,toZ(CITY.example[1]+z))
            .scale(CITY.cell*.45,.004,CITY.cell*.45).color(erase ? [1,.35,.35] : PALETTE[material]);
      });
      controls.forEach((c,i) => controlNodes[i].color(c.kind==='grow' && generating ? [.45+.25*Math.sin(now/180),.8,.48]
         : c.kind==='grow' && flashUntil > now && growFlash === 'success' ? [.55,1,.45]
         : c.kind==='grow' && flashUntil > now && growFlash === 'error' ? [1,.34,.3]
         : c.kind==='enter' ? city ? c.kind===aimedControl ? [.55,1,.75] : [.2,.72,.46] : [.27,.31,.36]
         : c.kind==='grow' ? c.kind===aimedControl ? [1,.62,1] : [.73,.28,.85]
         : c.kind === aimedControl ? [1,.98,.64]
         : c.kind==='erase' ? erase ? [1,.35,.35] : [.36,.39,.44]
         : c.kind===material && !erase ? PALETTE[c.kind] : [.25,.3,.35]));
      progressMarker.identity().move(generating ? .49+.11*Math.sin((now-generationStarted)/650) : .49,1.22,-1.04)
         .scale(generating ? .027 : .006,.012,.012)
         .color(generating ? [.95,.85,.47] : [.16,.22,.27]);
      showProgress(generating ? `${Math.floor((now-generationStarted)/1000)}S` : '');
      showStatus(generating ? `AI BUILDING... ${Math.floor((now-generationStarted)/1000)}S` : status);
      showHelp('TRIGGER: PLACE / GROW / ENTER   RIGHT STICK: SCALE BUILD AREA');
      showName(city ? `${city.title} - ${city.buildings.map(b=>b.name).join(' / ')}` : '');
   });
};
