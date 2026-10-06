/*
 * ECHO GARDEN — two people compose one spatial instrument.
 * Click an empty place on the panel to plant a note. Point at a note and hold
 * the trigger to move it in 3D; double-press a note to remove it. Nearby notes
 * connect; notes from different people take priority when they can form a duet.
 *
 * Multiplayer: send plant/move/remove/clear operations via server.send/sync.
 * server.sync also exchanges the current echoGarden state with a late joiner.
 * gardenNet.js keeps every message, even when this tab skips frames.
 * Desktop preview: 1 and 2 plant notes of different colors; R clears the panel.
 */
import * as cg from '../../render/core/cg.js';
import { createKit, buzz } from '../hw2/gameKit.js';
import { GARDEN, MAX_SEEDS, applyGardenMessage, emptyGarden, gardenLinks,
         gardenPosition, midiToHz, noteAtHeight } from './echoGardenRules.js';
import { createGardenSync } from './gardenNet.js';
import { beatNumber, listenerFromMatrix, placeListener } from './gardenAudio.js';

server.init('echoGarden', emptyGarden());

const COLORS = [[1,.43,.35], [.34,.78,1]];
const PLANE_Z = GARDEN.minZ;
const RESET = [.75,2.19,GARDEN.z+.10];
let cleanup = () => {};
export const deinit = () => cleanup();

export const init = async model => {
   cleanup();
   const kit = createKit(model,'echoGarden');
   const nodes = new Map(), strands = new Map(), activeLinks = new Set();
   const held = {left:null,right:null}, pressedSeed = {left:false,right:false};
   const dragStart = {left:null,right:null};
   const lastAudition = {left:null,right:null};
   const doubleDeleted = {left:false,right:false};
   const removedSinceJoin = new Set();
   let clearedSinceJoin = false;
   let serial = 0, previewStep = 0, audio = null, lastBeat = null, lastMove = {left:0,right:0};

   const state = () => {
      if (!window.echoGarden || typeof window.echoGarden !== 'object') window.echoGarden = emptyGarden();
      window.echoGarden.seeds ||= {};
      return window.echoGarden;
   };
   const myID = () => String(window.clientID ?? 'local');
   const colorForMe = () => {
      const mine = Object.values(state().seeds).find(s => s.owner === myID());
      if (mine) return mine.color;
      const others = Object.values(state().seeds).filter(s => s.owner !== myID());
      if (others.length) return others[0].color === 0 ? 1 : 0;
      const ids = [...(window.clients || [window.clientID])].map(String).sort((a,b) => a.localeCompare(b,undefined,{numeric:true}));
      return Math.max(0,ids.indexOf(myID())) % 2;
   };
   const audioOn = () => {
      try {
         const Context = window.AudioContext || window.webkitAudioContext;
         if (Context && !audio) audio = new Context();
         if (audio?.state === 'suspended') audio.resume().catch(() => {});
      } catch (_) { /* Sound is optional. */ }
   };
   // The listener is this headset's head, in the same coordinates as the
   // panners below: clientState.head is in shared coordinates, and worldCoords
   // turns shared coordinates into this headset's own (as getGlobalMatrix does).
   const followHead = () => {
      const head = window.clientState?.head?.(window.clientID);
      if (!audio || !Array.isArray(head)) return;
      placeListener(audio,listenerFromMatrix(cg.mMultiply(window.worldCoords || cg.mIdentity(),head)));
   };
   const tone = (midi, position, color, duration = .26) => {
      if (!audio || audio.state !== 'running') return;
      try {
         const where = cg.mTransform(model.getGlobalMatrix(), position);
         const panner = audio.createPanner(), now = audio.currentTime;
         // Far notes sound more reflective; near notes remain almost dry.
         const depth = (GARDEN.maxZ - position[2]) / (GARDEN.maxZ - GARDEN.minZ);
         const delay = .17 + .20 * depth;
         panner.panningModel = 'HRTF';
         panner.distanceModel = 'inverse'; panner.refDistance = .6;
         panner.setPosition(...where);
         panner.connect(audio.destination);
         const voices = [];
         const playVoice = (at, peak) => {
            const oscillator = audio.createOscillator(), gain = audio.createGain();
            oscillator.type = color === 0 ? 'sine' : 'triangle';
            oscillator.frequency.value = midiToHz(midi);
            gain.gain.setValueAtTime(.0001,at);
            gain.gain.exponentialRampToValueAtTime(peak,at+.018);
            gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
            oscillator.connect(gain); gain.connect(panner);
            oscillator.start(at); oscillator.stop(at+duration+.01);
            voices.push({oscillator,gain});
         };
         playVoice(now,.045);
         if (depth > .03) {
            playVoice(now+delay,.024*depth);
            playVoice(now+2*delay,.012*depth);
         }
         voices.at(-1).oscillator.onended = () => {
            for (const {oscillator,gain} of voices) { oscillator.disconnect(); gain.disconnect(); }
            panner.disconnect();
         };
      } catch (_) { /* Keep the garden usable if audio fails. */ }
   };
   // Every change is a message: apply it here, send it, and the other pages
   // apply it in server.sync. gardenNet.js makes sure no message is lost.
   const net = createGardenSync({
      server, name:'echoGarden',
      apply: message => {
         if (message.op === 'remove') removedSinceJoin.add(message.id);
         if (message.op === 'clear') clearedSinceJoin = true;
         return applyGardenMessage(state(),message);
      },
      snapshot: () => state(),
      mergeSnapshot: incoming => {
         if (clearedSinceJoin || !incoming?.seeds) return;
         const seeds = state().seeds;
         for (const [id,seed] of Object.entries(incoming.seeds))
            if (!seeds[id] && !removedSinceJoin.has(id) &&
                id !== '__proto__' && id !== 'constructor' &&
                Object.keys(seeds).length < MAX_SEEDS && gardenPosition(seed?.pos) &&
                typeof seed.owner === 'string' && seed.owner)
               seeds[id] = structuredClone(seed);
      },
      onRemote: message => {
         if (message.op === 'plant') tone(noteAtHeight(message.pos[1]),message.pos,message.color);
         if (message.op === 'move' && message.audition) {
            const seed = state().seeds[message.id];
            if (seed) tone(noteAtHeight(seed.pos[1]),seed.pos,seed.color,.2);
         }
      },
   });
   // The course framework answers a late joiner's snapshot request in sync().
   // Keep running it when Chrome pauses requestAnimationFrame in a hidden tab.
   const syncTimer = window.setInterval(() => net.frame(),500);
   const dispatch = message => {
      if (!net.dispatch(message)) return false;
      if (message.op === 'plant') tone(noteAtHeight(message.pos[1]),message.pos,message.color);
      if (message.op === 'move' && message.audition) {
         const seed = state().seeds[message.id];
         if (seed) tone(noteAtHeight(seed.pos[1]),seed.pos,seed.color,.2);
      }
      return true;
   };

   // A quiet night panel: both participants see the same shared space.
   model.add('cube').move(0,1.62,GARDEN.z-.06).scale(.94,.57,.025).color(.10,.15,.25).dull();
   model.add('cube').move(0,.69,GARDEN.z-.06).scale(.98,.035,.19).color(.12,.20,.28).dull();
   for (const x of [-.93,.93])
      model.add('tubeY').move(x,1.62,GARDEN.z-.03).scale(.009,.56,.009).color(.55,.75,.9).dull();
   for (const y of [1.07,2.17])
      model.add('tubeX').move(0,y,GARDEN.z-.03).scale(.94,.009,.009).color(.55,.75,.9).dull();
   for (let i=0;i<23;i++) {
      const x = .79*Math.sin(i*11.3), y = 1.62+.45*Math.sin(i*7.7);
      model.add('sphere').move(x,y,GARDEN.z-.022).scale(.002+(i%3)*.001)
           .color(.30,.44,.62).dull();
   }
   const title = kit.label('title',[0,2.35,GARDEN.z+.04],2.3,[.86,.94,1]);
   const score = kit.label('score',[0,2.23,GARDEN.z+.05],1.22,[.74,.86,.93]);
   const status = kit.label('status',[0,.93,GARDEN.z+.06],1.28,[.86,.94,1]);
   const help = kit.label('help',[0,.84,GARDEN.z+.06],1.0,[.55,.69,.79]);
   title('ECHO GARDEN');
   help('CLICK PLANT / HOLD MOVE UP-DOWN + IN-OUT / DOUBLE CLICK REMOVE');
   kit.label('desktop',[0,.78,GARDEN.z+.06],.9,[.55,.69,.79])('1,2 DESKTOP / R CLEAR');
   model.add('cube').move(RESET).scale(.105,.038,.018).color(.16,.23,.30);
   kit.label('reset',[RESET[0],RESET[1]+.006,RESET[2]+.022],.78,[.8,.87,.94])('CLEAR');

   const pointOnPanel = hand => {
      const p = kit.plane(hand,PLANE_Z);
      return p && p[0] >= GARDEN.minX && p[0] <= GARDEN.maxX &&
             p[1] >= GARDEN.minY && p[1] <= GARDEN.maxY ? gardenPosition(p) : null;
   };
   const nearestSeed = hand => {
      const ray = kit.ray(hand);
      if (!ray) return null;
      let best = .085, found = null;
      for (const [id,seed] of Object.entries(state().seeds)) {
         const v = cg.subtract(seed.pos,ray.o), along = cg.dot(v,ray.d);
         if (along <= 0) continue;
         const distance = cg.norm(cg.subtract(v,cg.scale(ray.d,along)));
         if (distance < best) { best = distance; found = id; }
      }
      return found;
   };
   const plant = (owner,color,pos) => dispatch({op:'plant',id:owner+'-'+Date.now().toString(36)+'-'+serial++,owner,color,pos});
   const press = hand => {
      audioOn();
      if (doubleDeleted[hand]) { doubleDeleted[hand] = false; pressedSeed[hand] = true; return; }
      held[hand] = nearestSeed(hand);
      pressedSeed[hand] = !!held[hand];
      if (held[hand]) {
         const ray = kit.ray(hand), seed = state().seeds[held[hand]];
         dragStart[hand] = ray && seed ? {controllerZ:ray.o[2], noteZ:seed.pos[2],
                                          startPos:seed.pos.slice()} : null;
         lastAudition[hand] = seed ? {at:performance.now()/1000,
                                     pitch:noteAtHeight(seed.pos[1]),z:seed.pos[2]} : null;
         buzz(hand,.35,45);
      }
   };
   const draggedPosition = hand => {
      const start = dragStart[hand], ray = kit.ray(hand);
      if (!start || !ray) return null;
      const z = Math.max(GARDEN.minZ,Math.min(GARDEN.maxZ,start.noteZ + ray.o[2] - start.controllerZ));
      return gardenPosition(kit.plane(hand,z));
   };
   const drag = hand => {
      const id = held[hand], now = performance.now()/1000;
      if (!id || now-lastMove[hand] < .05) return;
      const pos = draggedPosition(hand);
      if (pos) {
         const pitch = noteAtHeight(pos[1]), previous = lastAudition[hand];
         const audition = previous && now-previous.at >= .18 &&
                          (pitch !== previous.pitch || Math.abs(pos[2]-previous.z) >= .12);
         if (dispatch({op:'move',id,pos,audition})) {
            if (audition) lastAudition[hand] = {at:now,pitch,z:pos[2]};
            lastMove[hand] = now;
         }
      }
   };
   const release = hand => {
      const id = held[hand], start = dragStart[hand], pos = draggedPosition(hand);
      if (id && start && pos && Math.hypot(...cg.subtract(pos,start.startPos)) > .015)
         dispatch({op:'move',id,pos,audition:true});
      held[hand] = null; dragStart[hand] = null; lastAudition[hand] = null;
   };
   const click = hand => {
      if (pressedSeed[hand]) { pressedSeed[hand] = false; return; }
      if (kit.pointsAt(hand,RESET,.095)) { dispatch({op:'clear'}); return; }
      const pos = pointOnPanel(hand);
      if (pos && plant(myID(),colorForMe(),pos)) buzz(hand,.5,65);
   };
   const doublePress = hand => {
      const id = nearestSeed(hand);
      if (id) { dispatch({op:'remove',id}); held[hand] = null; dragStart[hand] = null;
                lastAudition[hand] = null; doubleDeleted[hand] = true; }
   };
   const previous = {
      press:inputEvents.onPress,drag:inputEvents.onDrag,release:inputEvents.onRelease,
      click:inputEvents.onClick,double:inputEvents.onDoublePress
   };
   inputEvents.onPress = press; inputEvents.onDrag = drag;
   inputEvents.onRelease = release; inputEvents.onClick = click;
   inputEvents.onDoublePress = doublePress;
   kit.onKey(key => {
      audioOn();
      if (key === 'r') dispatch({op:'clear'});
      if (key === '1' || key === '2') {
         const n = previewStep++, color = key === '1' ? 0 : 1;
         const owner = 'preview-'+color;
         const x = -.44 + (n%5)*.19, y = 1.42 + Math.floor(n/5)*.15 + (color ? .09 : 0);
         plant(owner,color,[x,y,PLANE_Z]);
      }
   });

   cleanup = () => {
      window.clearInterval(syncTimer);
      net.dispose();
      kit.dispose();
      if (audio) audio.close().catch(() => {});
      if (inputEvents.onPress === press) inputEvents.onPress = previous.press;
      if (inputEvents.onDrag === drag) inputEvents.onDrag = previous.drag;
      if (inputEvents.onRelease === release) inputEvents.onRelease = previous.release;
      if (inputEvents.onClick === click) inputEvents.onClick = previous.click;
      if (inputEvents.onDoublePress === doublePress) inputEvents.onDoublePress = previous.double;
   };

   model.animate(() => {
      kit.update();
      net.frame();
      followHead();
      const seeds = state().seeds;
      const seen = new Set();
      const hover = new Set([nearestSeed('left'),nearestSeed('right')]);
      for (const [id,seed] of Object.entries(seeds)) {
         if (!seed?.pos) continue;
         seen.add(id);
         let node = nodes.get(id);
         if (!node) {
            const root = model.add(), core = root.add('sphere'), halo = root.add('torusZ');
            const light = root.add('sphere');
            const shadow = model.add('torusZ'), stem = model.add('tubeZ');
            node = {root,core,halo,light,shadow,stem}; nodes.set(id,node);
         }
         const color = COLORS[seed.color] || COLORS[0], pulse = 1+.13*Math.sin(model.time*3+seed.pos[0]*8);
         node.root.identity().move(seed.pos);
         node.core.identity().scale(.045*pulse).color(color).dull();
         node.halo.identity().scale(hover.has(id) ? .078 : .065).color(color);
         node.light.identity().move(0,0,.035).scale(.014).color(1,1,1);
         const anchor = [seed.pos[0],seed.pos[1],PLANE_Z-.006];
         const lift = seed.pos[2] - PLANE_Z;
         node.shadow.identity().move(anchor).scale(.04).color(.24,.31,.40).dull();
         if (lift > .02) node.stem.placeLimb(anchor,seed.pos,.002).color(.35,.44,.55).dull();
         else node.stem.identity().scale(0);
      }
      for (const [id,node] of nodes) if (!seen.has(id)) {
         model.remove(node.root); model.remove(node.shadow); model.remove(node.stem); nodes.delete(id);
      }

      const links = gardenLinks(seeds), connected = new Set();
      for (const link of links) {
         connected.add(link.id);
         let strand = strands.get(link.id);
         if (!strand) { strand = model.add('tubeZ'); strands.set(link.id,strand); }
         const a = seeds[link.a], b = seeds[link.b];
         strand.placeLimb(a.pos,b.pos,.004+.002*Math.sin(model.time*3)**2)
               .color(link.shared ? .70 : .40,link.shared ? .63 : .57,link.shared ? .91 : .68);
         if (!activeLinks.has(link.id)) {
            const mid = cg.mix(a.pos,b.pos,.5);
            tone(noteAtHeight(a.pos[1]),mid,a.color,.42);
            tone(noteAtHeight(b.pos[1]),mid,b.color,.42);
         }
      }
      for (const [id,strand] of strands) if (!connected.has(id)) { model.remove(strand); strands.delete(id); }
      activeLinks.clear(); for (const id of connected) activeLinks.add(id);

      // The beat comes from the wall clock, so every headset plays the same
      // link at the same moment (links are sorted by id, so all agree on the order).
      const beat = beatNumber();
      if (links.length && beat !== lastBeat) {
         const link = links[beat % links.length], a = seeds[link.a], b = seeds[link.b];
         tone(noteAtHeight(a.pos[1]),a.pos,a.color,.28);
         if (beat % 2 === 0) tone(noteAtHeight(b.pos[1]),b.pos,b.color,.33);
      }
      lastBeat = beat;
      const owners = new Set(Object.values(seeds).map(s => s.owner));
      const duets = links.filter(link => link.shared).length;
      score(`${Object.keys(seeds).length}/${MAX_SEEDS} NOTES    ${links.length} CONNECTION${links.length === 1 ? '' : 'S'}    ${duets} DUET${duets === 1 ? '' : 'S'}    YOU #${myID()}`);
      status(links.length ? owners.size < 2 ? 'SOLO LOOP / ADD A SECOND VOICE FOR A DUET' :
                                                'UP: HIGHER PITCH / PUSH BACK: MORE ECHO' :
               Object.keys(seeds).length < 2 ? 'PLANT TWO NOTES TO START A SOLO LOOP' :
                                               'BRING ANY TWO NOTES TOGETHER IN 3D');
   });
};
