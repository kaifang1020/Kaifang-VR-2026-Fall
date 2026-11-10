/*
 * GIANT & MINI — Assignment 8, step 2: two players see each other.
 *   GIANT ('table' mode): stands at the real table and sees the other player as a 1/12 figure on it.
 *   MINI ('inside' mode): lives on the table and sees the other player as a twelve-times giant,
 *   standing where they really stand.
 * Each player sends their own head, hands, mode and origin (see players.js). A headset's
 * head and hands are read from clientState, as in minime.js.
 *
 * Built on the Assignment 7 scene:
 * MINIATURE — A 1/12 model of myself and a small house on a 60 x 24
 * inch table. One inch on the table is one foot to the miniature.
 *
 * Mode 1, TABLE: I see the table, the house and my miniature from where I stand.
 *   Beam + trigger on the house grabs it; it follows the hand and drops back on the
 *   table when released.
 * Mode 2, INSIDE: the world grows twelve times around the miniature's spot, so I
 *   am the miniature. Walk (feet, or either stick) up to the door and it swings open; go in; point at the
 *   switch and press to light the lamp. The windows glow, which mode 1 can see.
 *
 * The body is drawn at full size under one shrinking node (mode 1); the world sits
 * under one growing node (mode 2). Both nodes carry the same matrix, one inverted.
 * Keys: V mode, F face me, M check, R reset origin, S split screen, [ ] orbit the
 *   table camera, arrows: mode 1 move the house / mode 2 walk, O door, L lamp,
 *   Q/A E/D raise and lower the hands when there is no headset.
 */
import * as cg from '../../render/core/cg.js';
import { ControllerBeam, joyStickState, buttonState } from '../../render/core/controllerInput.js';
import { coachAvatarPose } from '../coach/coachAvatarPose.js';
import { rayBoxDistance } from '../hw5/pocketCityRules.js';
import { makeBody, drawBody } from '../hw6/avatarBody.js';
import { makeHouse, drawHouse } from '../hw6/house.js';
import { INCH, SCALE, TABLE, HOUSE, validMatrix, floorPoint, miniatureMatrix, placeMiniature, placeWorld,
         desktopPose, tableCamera, clampHouse, nearDoor, houseBounds, walkOrigin } from '../hw6/miniatureModel.js';
import { poseKey, roleName, packPlayer, createFreshness, readOthers, tableFrame, deskGiantPose, visibleTo,
         insideHouse, rideOrigin, hudTarget, hudNeedsMove,
         pickHold, groundUnder, HOLD_TEXT, robotGiant, robotMiniHolds } from './players.js';
import { askAIJson } from '../../util/aiquery.js';
import { thingPrompt, validateThing, thingBounds, clampToTable, giantSlot, miniSlot, fitThing, placeInRoom, roomFit,
         splitPrompt, sectionCount, sectionBounds, restSection } from './things.js';
import { createThingViews } from './thingView.js';
import { makeDesk, deskRoomAt, lampGround } from './desk.js';
import { createPromptKeyboard, toWorld } from './promptKeyboard.js';

const SHIRTS = [[.35,.55,1], [.95,.35,.55], [.55,.85,.35], [.75,.5,.95]];

let cleanup = () => {};
export const deinit = () => cleanup();

export const init = async model => {
   // ---- The world: small in mode 1, twelve times bigger in mode 2 ----
   const world = model.add();
   const T = TABLE;
   makeDesk(world);                                   // the room, the desk and what lies on it (desk.js)
   const house = makeHouse(world);
   const thingViews = createThingViews(world);        // what the AI built (things.js), drawn on the table

   // ---- The other players: under the world node, in table coordinates ----
   // One node per player carries tableFrame(player): identity for a giant, M(origin) for a mini.
   const othersRoot = world.add();
   const otherBodies = new Map();                 // id -> {node, body}
   const otherBody = id => {
      if (!otherBodies.has(id)) {
         const node = othersRoot.add();
         otherBodies.set(id, {node, body: makeBody(node, SHIRTS[otherBodies.size % SHIRTS.length]),
                              halo: node.add('sphere').dull()});       // lit above a mini who is holding on
      }
      return otherBodies.get(id);
   };
   const fresh = createFreshness();
   let others = [], seq = 0;

   // ---- The miniature: my body under one shrinking node ----
   const stage = model.add();
   const body = makeBody(stage, [1,.6,.3]);
   const ring = model.add('tubeY').color(.9,.8,.4).opacity(.5);                              // marks my origin on the floor

   // ---- HUD and controllers, in real coordinates in both modes ----
   const beams = {left: new ControllerBeam(model, 'left'), right: new ControllerBeam(model, 'right')};
   // The mode button is not fixed in the room: it floats near me (see hudTarget), so that the
   // walls of a house I walked into cannot hide it.
   let hud = null, hudShown = null;
   const HUD_HALF = [.12, .08, .08];                                 // what a beam has to hit
   const modeButton = model.add('cube').color(.45,.72,.77).dull();
   const label = (id, size, color) => {
      let node, last, width = 0;
      return (str, at, yaw = 0, tilt = 0, grow = 1) => {
         if (str !== last) {
            last = str;
            clay.defineTextMesh('giantmini_' + id, str);
            width = str ? .019 * (str.length - 1) + .015 : 0;
         }
         if (!node) node = model.add('giantmini_' + id).color(color).dull().view(0);    // my own view only, not the table camera's
         node.identity().move(at).turnY(yaw).turnX(-tilt).move(-width * size * grow / 2, 0, 0).scale(size * grow);
      };
   };
   const showTitle = label('title', .9, [.95,.9,.7]);
   const showHelp = label('help', .55, [.7,.8,.85]);
   const showMode = label('mode', .5, [.92,.96,1]);
   const showHold = label('hold', .5, [.5,1,.6]);

   // The in-world keyboard for prompts, for the giant and for the mini. A second floating button,
   // next to the mode button, opens it right in front of me, wherever I am and whichever way I face.
   const keyboard = createPromptKeyboard(model, label);
   const buildButton = model.add('cube').color(.5,.4,.7).dull();
   const showBuild = label('build', .5, [.92,.96,1]);
   // The two buttons on the belt tray (see hudTarget), in the tray's own coordinates. The tray leans
   // back so that its buttons face my eyes when I look down at it.
   const TRAY_TILT = .9, MODE_X = -.13, BUILD_X = .13;
   const tray = (base, x, y = 0, z = 0) => toWorld([x, y, z], {centre: base.at, yaw: base.yaw, tilt: TRAY_TILT});
   const modeAt = () => hud && tray(hud, MODE_X), buildAt = () => hud && tray(hud, BUILD_X);
   const toggleKeyboard = () => {
      if (keyboard.open || !lastSelf) { keyboard.hide(); return; }
      const h = lastSelf.head, f = [-h[8], 0, -h[10]], n = Math.hypot(f[0], f[2]) || 1;
      // Half a metre ahead, a little below my eyes, leaning back like a lectern and a quarter bigger:
      // I look at it squarely instead of along its surface.
      keyboard.show({centre: [h[12] + f[0] / n * .5, h[13] - .3, h[14] + f[2] / n * .5], yaw: Math.atan2(-f[0], -f[2]),
                     tilt: .45, size: 1.25});
   };

   let origin = null, faceMe = true, check = false, lift = {left: 0, right: 0};
   let split = true, camAngle = .6;
   let mode = 'table', houseAt = [...HOUSE.at], doorAngle = 0, doorForced = false, lampOn = false, grab = null;
   let lastSelf = null, lastFrame = Date.now();
   // The giant can walk around the table without walking in the room: giantAt is where the
   // room's own origin stands in table coordinates. The world is drawn moved back by it.
   // Holding on (the mini): ONE press of the grip on either controller, or of the space bar, switches
   // it on; another press switches it off. No need to keep it squeezed. See pickHold.
   let hold = null, holdOn = false, gripWas = false;
   // P: this laptop plays a robot partner (see robotGiant / robotMiniHolds), for testing alone.
   let robot = null;                                   // {since, houseFrom}
   const gripDown = () => holdOn || (robot && mode === 'inside' && robotMiniHolds((Date.now() - robot.since) / 1000)) || ['left', 'right'].some(h => buttonState[h]?.[1]?.pressed);
   let giantAt = [0, 0, 0];
   const GIANT_SPEED = 1, GIANT_RANGE = 2.5;
   const moveGiant = d => { giantAt = [Math.max(-GIANT_RANGE, Math.min(GIANT_RANGE, giantAt[0] + d[0])), 0,
                                       Math.max(-GIANT_RANGE, Math.min(GIANT_RANGE, giantAt[2] + d[2]))]; };
   const shifted = (m, g) => { if (!m) return m; const c = Array.from(m); c[12] += g[0]; c[13] += g[1]; c[14] += g[2]; return c; };

   // The renderer asks this every frame; a view matrix means "draw a second camera on the right".
   window.splitView = () => split && mode === 'table' && !window.isXR?.()
      ? cg.mMultiply(tableCamera(camAngle), cg.mTranslate(giantAt[0], giantAt[1], giantAt[2])) : null;

   // My own head and hands, in this headset's coordinates. Without tracking, the camera.
   const selfPose = () => {
      const head = window.clientState?.head?.(window.clientID);
      if (validMatrix(head)) {
         const inv = cg.mInverse(window.worldCoords || cg.mIdentity());
         const own = m => validMatrix(m) ? cg.mMultiply(inv, m) : null;
         return {head: own(head), left: own(clientState.hand(clientID, 'left')),
                 right: own(clientState.hand(clientID, 'right')), tracked: true};
      }
      const view = window.views?.[0]?.viewMatrix;
      return view ? {...desktopPose(view, lift), tracked: false} : null;
   };
   const ray = hand => {
      const bm = beams[hand].beamMatrix();
      if (!bm || !Number.isFinite(bm[12])) return null;
      const inv = cg.mInverse(window.worldCoords || cg.mIdentity());
      const from = cg.mTransform(inv, bm.slice(12, 15));
      const to = cg.mTransform(inv, cg.subtract(bm.slice(12, 15), bm.slice(8, 11)));
      return {origin: from, dir: cg.normalize(cg.subtract(to, from))};
   };
   // ---- Sharing: each client owns one global, window['giantMiniPose_' + id], and broadcasts it ----
   const online = () => window.clientID !== undefined && window.server?.socket?.readyState === 1;
   const share = value => {
      if (!online()) return;
      window[poseKey(clientID)] = value;
      server.broadcastGlobal(poseKey(clientID));
   };
   // Another headset's head and hands from clientState, moved into my scene coordinates.
   const fromClientState = id => {
      if (!window.clientState?.isXR?.(id)) return null;
      const inv = cg.mInverse(window.worldCoords || cg.mIdentity());
      const mine = m => validMatrix(m) ? cg.mMultiply(inv, m) : null;
      return {head: mine(clientState.head(id)), left: mine(clientState.hand(id, 'left')),
              right: mine(clientState.hand(id, 'right'))};
   };

   // ---- The house and the lamp are shared: whoever changes one, broadcasts it ----
   const shareGlobal = (name, value) => { window[name] = value; if (online()) server.broadcastGlobal(name); };
   let houseTarget = [...houseAt];                       // where the house is; houseAt glides toward it
   const setHouse = at => { houseTarget = [...at]; shareGlobal('giantMiniHouse', {at: at.map(v => Math.round(v * 1e4) / 1e4)}); };
   const setLamp = on => { lampOn = on; shareGlobal('giantMiniLamp', {on}); };

   // ---- Things: everything the AI built, shared as one object {id: {spec, at, made}} ----
   // One thing changes → only that element is sent (broadcastGlobalElement), so two players
   // changing different things do not overwrite each other.
   if (!window.giantMiniThings || typeof window.giantMiniThings !== 'object') window.giantMiniThings = {};
   const things = () => window.giantMiniThings || {};
   const putThing = (id, entry) => {
      window.giantMiniThings[id] = entry;
      if (online()) server.broadcastGlobalElement('giantMiniThings', id);
   };
   // The room a point on the table is in: the house, or a building the AI made. In feet, as the mini sees it.
   const roomAround = point => {
      if (insideHouse(point, houseAt))                       // the house is turned: 8 ft along x, 10 ft along z, 8 ft walls
         return {centre: [houseAt[0], houseAt[2]], size: [HOUSE.depth / INCH, HOUSE.wall / INCH, HOUSE.width / INCH]};
      if (deskRoomAt(point)) return deskRoomAt(point);       // inside the lamp or the cup
      for (const entry of Object.values(things())) {
         if (entry?.role !== 'table' || !entry.spec) continue;
         const b = thingBounds(entry.spec, entry.at);
         if (Math.abs(point[0] - b.centre[0]) < b.half[0] && Math.abs(point[2] - b.centre[2]) < b.half[2])
            return {centre: [b.centre[0], b.centre[2]], size: [b.half[0] * 2 / INCH, 8, b.half[2] * 2 / INCH].map(v => Math.round(v * 10) / 10)};
      }
      return null;
   };
   let made = 0, building = false, buildStatus = '';
   // Without controllers: Tab picks what the arrow keys move, the house (null) or one of the things.
   let selected = null;
   const thingIds = () => Object.keys(things()).filter(id => things()[id]?.spec);
   const selectNext = () => { const ids = [null, ...thingIds()]; selected = ids[(ids.indexOf(selected) + 1) % ids.length]; };
   const say = text => { buildStatus = text; keyboard.setStatus(text); if (panelStatus) panelStatus.textContent = text; };
   // Ask the AI for a thing and put it on the table. role is my mode: the giant builds
   // buildings, the mini builds furniture in front of themselves.
   const build = async text => {
      text = String(text || '').trim();
      if (!text || building) return;
      building = true;
      const role = mode;
      // The mini: where am I on the table, and am I in a room? Furniture is made to fit the room.
      const M = role === 'inside' && origin && lastSelf ? miniatureMatrix(origin, {faceMe}) : null;
      const head = M && cg.mTransform(M, lastSelf.head.slice(12, 15));
      const room = head && roomAround(head);
      say('ASKING THE AI: ' + text.slice(0, 40).toUpperCase());
      try {
         let spec = validateThing(await askAIJson(thingPrompt(text, role, room), {timeout: 30000}), role);
         let at = giantSlot(Object.values(things()).filter(Boolean).length);
         if (M) {
            const h = lastSelf.head, ahead = cg.mTransform(M, [h[12] - h[8], h[13], h[14] - h[10]]);
            at = miniSlot(head, cg.subtract(ahead, head), TABLE.height - origin[1] * SCALE);
            if (room) { spec = fitThing(spec, roomFit(room)); at = placeInRoom(spec, at, room); }
         }
         const id = clientID + '_' + Date.now().toString(36) + '_' + made++;
         putThing(id, {spec, at, made: Date.now(), role});      // role: who built it. A mini can only carry a mini's things.
         if (role === 'table') selected = id;             // the arrow keys now move the new building
         say('BUILT: ' + spec.name + (spec.discarded ? '  (' + spec.discarded + ' PARTS LEFT OUT)' : ''));
      } catch (error) {
         console.error(error);
         say('THE AI COULD NOT BUILD THAT. TRY AGAIN.');
      }
      building = false;
   };
   // ---- Taking a building apart (the giant's GRIP; the trigger still moves the whole building) ----
   // The first grip on a building asks the AI to rebuild it in sections with an empty inside.
   const takeApart = async id => {
      const entry = things()[id];
      if (!entry?.spec || building) return;
      building = true;
      say('ASKING THE AI TO MAKE ' + entry.spec.name + ' COME APART...');
      try {
         const spec = validateThing(await askAIJson(splitPrompt(entry.spec, entry.role), {timeout: 45000}), entry.role);
         if (sectionCount(spec) < 2) throw new Error('The AI returned one section only');
         const now = things()[id];                          // it may have been moved while the AI was thinking
         if (now) putThing(id, {...now, spec, off: {}, made: Date.now()});
         say(spec.name + ' NOW COMES APART: ' + spec.sections.join(' + ') + '.  GRIP LIFTS A PART');
      } catch (error) {
         console.error(error);
         say('THE AI COULD NOT TAKE IT APART. TRY AGAIN.');
      }
      building = false;
   };
   // Which section of which thing does this ray (table coordinates) meet first?
   const sectionUnder = onTable => {
      let best = null;
      for (const [id, entry] of Object.entries(things())) {
         if (!entry?.spec) continue;
         for (let n = 0; n < sectionCount(entry.spec); n++) {
            const b = sectionBounds(entry.spec, n, entry.at, entry.off?.[n]), d = b && rayBoxDistance(onTable, b.centre, b.half);
            if (d != null && (!best || d < best.d)) best = {d, id, section: n, entry};
         }
      }
      return best;
   };
   let lifted = null;                                     // {hand, id, section, offset}: the section in my hand
   const gripWasHand = {left: false, right: false};
   const liftSection = (id, section, hand, hand3) => {
      const entry = things()[id];
      lifted = {hand, id, section, offset: cg.subtract(cg.add(entry.at, entry.off?.[section] || [0, 0, 0]), hand3)};
   };
   const dropSection = () => {
      if (!lifted) return;
      const entry = things()[lifted.id];
      if (entry) {
         const off = {...(entry.off || {})}, rest = restSection(entry.spec, lifted.section, entry.at, off[lifted.section] || [0, 0, 0]);
         if (rest) off[lifted.section] = rest; else delete off[lifted.section];
         putThing(lifted.id, {...entry, off});
         say(rest ? entry.spec.sections[lifted.section] + ' SET DOWN' : entry.spec.sections[lifted.section] + ' BACK IN PLACE');
      }
      lifted = null;
   };
   const gripOn = hand => {                               // the giant pressed the grip
      const r = ray(hand), hand3 = lastSelf?.[hand] && cg.add(lastSelf[hand].slice(12, 15), giantAt);
      if (!r || !hand3) return;
      const hit = sectionUnder({origin: cg.add(r.origin, giantAt), dir: r.dir});
      if (!hit) return;
      if (hit.entry.role !== 'table') say('ONLY BUILDINGS COME APART');
      else if (sectionCount(hit.entry.spec) < 2) takeApart(hit.id);
      else if (hit.section === 0) say('THE BASE STAYS. THE TRIGGER MOVES THE WHOLE BUILDING');
      else liftSection(hit.id, hit.section, hand, hand3);
   };
   // Without controllers: K takes the selected building apart, U lifts its top section off or puts it back.
   const keyLift = () => {
      const entry = selected && things()[selected];
      if (!entry?.spec) return say('TAB TO SELECT A BUILDING FIRST');
      const n = sectionCount(entry.spec) - 1;
      if (n < 1) return takeApart(selected);
      const off = {...(entry.off || {})};
      if (off[n]) delete off[n];
      else off[n] = restSection(entry.spec, n, entry.at, [(entry.at[0] > TABLE.at[0] ? -1 : 1) * 14 * INCH, 0, 0]);
      putThing(selected, {...entry, off});
   };

   // A 2D prompt box on the page, for a laptop (or for the headset's browser before entering VR).
   let panel = null, panelStatus = null;
   if (typeof document !== 'undefined') {
      panel = document.createElement('form');
      panel.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:10000;width:330px;padding:10px 12px;' +
         'background:rgba(10,20,30,.93);border:1px solid #80a5b2;border-radius:8px;font:13px system-ui,sans-serif;color:#e9f3f6;';
      panel.innerHTML = '<div style="font-weight:650;margin-bottom:6px">BUILD WITH AI</div>' +
         '<input name="prompt" maxlength="120" placeholder="a lighthouse, a castle, a bed, a bookshelf..." ' +
         'style="width:100%;box-sizing:border-box;padding:7px;background:#1a2b37;color:#fff;border:1px solid #7194a0;border-radius:5px">' +
         '<button style="margin-top:7px;padding:6px 12px;border:0;border-radius:5px;background:#99d6e2;font-weight:600">BUILD</button>' +
         '<div data-status style="margin-top:6px;min-height:1.3em;color:#c4dce2">Giant: a building on the table. Mini: furniture in front of you.</div>';
      panelStatus = panel.querySelector('[data-status]');
      panel.onsubmit = event => { event.preventDefault(); build(panel.prompt.value); panel.prompt.blur(); };
      document.body.appendChild(panel);
   }

   // Sending runs on a timer, not in the frame loop: a laptop whose Chrome window is covered or
   // in a background tab draws no frames at all, and its giant must still be there for the mini.
   // (Timers slow down to about one a second there, which the 3 s freshness check allows.)
   let outgoing = null, thingsSeen = '';
   const sender = setInterval(() => {
      if (!outgoing && !window.isXR?.())             // not one frame drawn yet: I am a laptop giant
         outgoing = {mode: 'table', origin: [0, 0, 0], faceMe, self: deskGiantPose(lift), standIn: true};
      if (outgoing) share(packPlayer({...outgoing, seq: ++seq}));
      // The first client repeats the house and the lamp once a second, for players who join late.
      if (seq % 16 === 0 && online() && window.isMasterClient?.()) {
         if (window.giantMiniHouse) server.broadcastGlobal('giantMiniHouse');
         if (window.giantMiniLamp) server.broadcastGlobal('giantMiniLamp');
         // ...and all the things, but only when none changed since last time (a move in progress must win).
         const now = JSON.stringify(things());
         if (now === thingsSeen && now !== '{}') server.broadcastGlobal('giantMiniThings');
         thingsSeen = now;
      }
   }, 60);

   const dropHouse = () => {                          // let go of whatever I carry: it settles on the table top
      if (!grab) return;
      const entry = grab.id && things()[grab.id];
      if (entry) putThing(grab.id, {...entry, at: [entry.at[0], groundUnder(entry.at, houseTarget), entry.at[2]]});   // onto the table, or the floor of the house
      else if (!grab.id) setHouse([houseTarget[0], TABLE.height, houseTarget[2]]);
      grab = null;
   };
   const switchMode = () => { dropHouse(); dropSection(); mode = mode === 'table' ? 'inside' : 'table'; hud = null; holdOn = false; keyboard.hide(); };
   // In mode 2 the switch is a real-size box at its global position; in mode 1 it is too small to aim at.
   const switchHit = r => {
      if (mode !== 'inside') return false;
      const at = house.lampSwitch.getGlobalMatrix().slice(12, 15);
      return rayBoxDistance(r, at, [.5, .7, .5].map(v => v * INCH / SCALE)) !== null;
   };
   const onPress = hand => {
      const r = ray(hand);
      if (!r) return;
      if (hud && rayBoxDistance(r, modeAt(), HUD_HALF) !== null) { switchMode(); return; }
      if (hud && rayBoxDistance(r, buildAt(), HUD_HALF) !== null) { toggleKeyboard(); return; }
      const typed = keyboard.press({o: r.origin, dir: r.dir});
      if (typed) { if (typed.go) build(typed.text); return; }
      if (mode === 'table') {
         // My hands and beams are in room coordinates; the house and the things are in table coordinates: add giantAt.
         const hand3 = lastSelf?.[hand] && cg.add(lastSelf[hand].slice(12, 15), giantAt);
         const onTable = {origin: cg.add(r.origin, giantAt), dir: r.dir};
         if (!hand3) return;
         // Whatever the beam meets first: the house, or one of the things.
         const b = houseBounds(houseAt);
         let best = {d: rayBoxDistance(onTable, b.centre, b.half), id: null, at: houseAt};
         for (const [id, entry] of Object.entries(things())) {
            if (!entry?.spec) continue;
            const tb = thingBounds(entry.spec, entry.at), d = rayBoxDistance(onTable, tb.centre, tb.half);
            if (d !== null && (best.d === null || d < best.d)) best = {d, id, at: entry.at};
         }
         if (best.d !== null) grab = {hand, id: best.id, offset: cg.subtract(best.at, hand3)};
      } else {
         // The mini: my beam and my hand, taken onto the table through my own matrix M.
         const M = miniatureMatrix(origin, {faceMe}), hand3 = lastSelf?.[hand] && cg.mTransform(M, lastSelf[hand].slice(12, 15));
         const from = cg.mTransform(M, r.origin), to = cg.mTransform(M, cg.add(r.origin, r.dir));
         const onTable = {origin: from, dir: cg.normalize(cg.subtract(to, from))};
         let best = null;
         for (const [id, entry] of Object.entries(things())) {
            if (!entry?.spec) continue;
            const tb = thingBounds(entry.spec, entry.at), d = rayBoxDistance(onTable, tb.centre, tb.half);
            if (d !== null && (!best || d < best.d)) best = {d, id, entry};
         }
         if (switchHit(r)) setLamp(!lampOn);
         else if (best && hand3) {
            // Furniture (built by a mini) I can carry. A building is far too heavy: that is the giant's job.
            if (best.entry.role === 'inside') grab = {hand, id: best.id, offset: cg.subtract(best.entry.at, hand3)};
            else say('TOO HEAVY FOR A MINI: ASK THE GIANT');
         }
      }
   };
   const onRelease = hand => { if (grab?.hand === hand) dropHouse(); };

   const step = (dx, dz) => {                        // arrows: mode 1 slides the house an inch, mode 2 walks a foot
      const head = lastSelf?.head;
      if (!head) return;
      const f = cg.normalize([-head[8], 0, -head[10]]), r = [-f[2], 0, f[0]];   // camera forward and right, on the floor
      const move = cg.add(cg.scale(f, dz), cg.scale(r, dx));
      if (mode === 'table') {
         const entry = selected && things()[selected];
         if (entry) putThing(selected, {...entry, at: clampToTable(cg.add(entry.at, cg.scale(move, INCH)))});
         else { selected = null; setHouse(clampHouse(cg.add(houseTarget, cg.scale(move, INCH)))); }
      }
      else if (origin) origin = cg.subtract(origin, cg.scale(move, 12 * INCH));          // moving the origin back walks me forward
   };
   const onKey = event => {
      if (event.target?.tagName === 'INPUT') return;          // typing a prompt, not pressing hotkeys
      const key = event.key.toLowerCase();
      if (key === ' ') { if (!event.repeat) holdOn = !holdOn; }
      else if (key === 'v') switchMode();
      else if (key === 'tab') selectNext();
      else if (key === 'k') { if (selected) takeApart(selected); else say('TAB TO SELECT A BUILDING FIRST'); }
      else if (key === 'u') keyLift();
      else if (key === 'x') { for (const id of Object.keys(things())) putThing(id, null); say('CLEARED'); }
      else if (key === 'p') robot = robot ? null : {since: Date.now(), houseFrom: [...houseTarget]};
      else if (key === 'f') faceMe = !faceMe;
      else if (key === 'm') check = !check;
      else if (key === 'r') origin = null;
      else if (key === 's') split = !split;
      else if (key === '[') camAngle -= .15;
      else if (key === ']') camAngle += .15;
      else if (key === 'o') doorForced = !doorForced;
      else if (key === 'l') setLamp(!lampOn);
      else if (key === 'q') lift.left = Math.min(.9, lift.left + .1);
      else if (key === 'a') lift.left = Math.max(-.3, lift.left - .1);
      else if (key === 'e') lift.right = Math.min(.9, lift.right + .1);
      else if (key === 'd') lift.right = Math.max(-.3, lift.right - .1);
      else if ('tgbn'.includes(key) && key.length === 1) {                 // T/B forward and back, G/N left and right: the laptop giant walks
         if (mode === 'table') moveGiant({t: [0, 0, -.15], b: [0, 0, .15], g: [-.15, 0, 0], n: [.15, 0, 0]}[key]);
      }
      else if (key === 'arrowup') step(0, 1);
      else if (key === 'arrowdown') step(0, -1);
      else if (key === 'arrowleft') step(-1, 0);
      else if (key === 'arrowright') step(1, 0);
      else return;
      event.preventDefault();
   };
   addEventListener('keydown', onKey);
   inputEvents.onPress = onPress;
   inputEvents.onRelease = onRelease;
   cleanup = () => {
      removeEventListener('keydown', onKey);
      if (inputEvents.onPress === onPress) inputEvents.onPress = () => {};
      if (inputEvents.onRelease === onRelease) inputEvents.onRelease = () => {};
      window.splitView = null;
      clearInterval(sender);
      panel?.remove();
      share(null);                                 // tell the others I left
   };

   model.animate(() => {
      for (const beam of Object.values(beams)) beam.update();
      const now = Date.now(), dt = Math.min(.05, (now - lastFrame) / 1000);
      lastFrame = now;
      const self = selfPose();
      lastSelf = self;
      const pose = self && coachAvatarPose(self.head, self.left, self.right);
      if (!self) { drawBody(body, null); ring.identity().scale(0); showHelp('NO HEAD POSITION YET', [0, 1.44, -.9]); return; }
      if (!origin) origin = floorPoint(self.head);
      // Either stick walks: whichever is pushed further this frame (one controller may be off).
      const sticks = [joyStickState.left, joyStickState.right].filter(Boolean);
      const stick = sticks.reduce((a, b) => Math.hypot(b.x, b.y) > Math.hypot(a.x, a.y) ? b : a, {x: 0, y: 0});
      if (Math.hypot(stick.x, stick.y) > .15) {
         if (mode === 'inside') origin = walkOrigin(origin, self.head, stick, dt);
         else {                                           // the giant: the same stick, at giant speed (what I carry comes along)
            const to = walkOrigin([0, 0, 0], self.head, stick, dt, GIANT_SPEED);
            moveGiant([-to[0], 0, -to[2]]);               // walkOrigin moves an origin backward; I move forward
         }
      }
      const g = mode === 'table' ? giantAt : [0, 0, 0];

      // Where my head is on the table, in table coordinates.
      let headOnTable = mode === 'inside' ? cg.mTransform(miniatureMatrix(origin, {faceMe}), self.head.slice(12, 15))
                                          : cg.add(self.head.slice(12, 15), g);

      // The house: carried by my hand, or gliding to where the shared state says it is.
      const before = [...houseAt];
      // The robot giant: where its hand is and where it has pushed the house, this frame.
      const miniHead = others.filter(p => p.mode === 'inside').map(p => cg.mTransform(tableFrame(p), p.head.slice(12, 15)))[0];
      const restHand = deskGiantPose(lift).right.slice(12, 15);
      const bot = robot && mode === 'table' && !self.tracked
         ? robotGiant((now - robot.since) / 1000, miniHead, cg.add(restHand, g)) : null;
      if (bot && !grab) {
         const at = clampHouse(cg.add(robot.houseFrom, bot.house));
         at[1] = TABLE.height + bot.house[1];
         if (cg.norm(cg.subtract(at, houseTarget)) > 1e-5) setHouse(at);
      }
      // The giant's grip, each hand on its own: down = take the section under the beam, up = let it go.
      for (const hand of ['left', 'right']) {
         const down = !!buttonState[hand]?.[1]?.pressed;
         if (mode === 'table' && down && !gripWasHand[hand] && !lifted) gripOn(hand);
         if (!down && gripWasHand[hand] && lifted?.hand === hand) dropSection();
         gripWasHand[hand] = down;
      }
      if (lifted && self[lifted.hand] && things()[lifted.id]) {       // the section follows my hand: only its offset changes
         const entry = things()[lifted.id], at = cg.add(cg.add(self[lifted.hand].slice(12, 15), g), lifted.offset);
         putThing(lifted.id, {...entry, off: {...(entry.off || {}), [lifted.section]: cg.subtract(at, entry.at)}});
      }
      if (grab?.id && self[grab.hand]) {                  // carrying a thing
         const entry = things()[grab.id];
         const hand3 = mode === 'inside' ? cg.mTransform(miniatureMatrix(origin, {faceMe}), self[grab.hand].slice(12, 15))
                                         : cg.add(self[grab.hand].slice(12, 15), g);
         if (entry) putThing(grab.id, {...entry, at: clampToTable(cg.add(hand3, grab.offset))});
         else grab = null;
      }
      if (grab && !grab.id && self[grab.hand]) {          // carrying the house
         const raw = cg.add(cg.add(self[grab.hand].slice(12, 15), g), grab.offset);
         const at = clampHouse(raw);
         at[1] = Math.max(TABLE.height, raw[1]);
         setHouse(at);
         houseAt = at;
      } else {
         const shared = window.giantMiniHouse?.at;
         if (Array.isArray(shared) && shared.every(Number.isFinite)) houseTarget = shared;
         houseAt = houseAt.map((v, i) => v + (houseTarget[i] - v) * Math.min(1, 15 * dt));
      }
      if (typeof window.giantMiniLamp?.on === 'boolean') lampOn = window.giantMiniLamp.on;
      // ---- Holding on. Only while I, the mini, keep the grip down do I go where something else goes. ----
      const gripNow = ['left', 'right'].some(h => buttonState[h]?.[1]?.pressed);
      if (gripNow && !gripWas && mode === 'inside') holdOn = !holdOn;       // the moment it goes down
      gripWas = gripNow;
      if (mode !== 'inside' || !gripDown()) hold = null;
      else if (!hold || hold.kind === 'none') {            // just pressed, or still reaching: look for something to hold
         const M = miniatureMatrix(origin, {faceMe});
         const mine = [self.head, self.left, self.right].filter(Boolean).map(m => cg.mTransform(M, m.slice(12, 15)));
         const hands = others.filter(p => p.mode === 'table').flatMap(p =>
            ['left', 'right'].filter(side => p[side]).map(side => ({id: p.id, side, at: p[side].slice(12, 15)})));
         hold = pickHold({mine, inHouse: insideHouse(headOnTable, before), hands});
      }
      // How far did the thing I hold move this frame? (The hand arrives in network steps, so it is smoothed.)
      let carried = null;
      if (hold?.kind === 'house') carried = cg.subtract(houseAt, before);
      else if (hold?.kind === 'hand') {
         const giant = others.find(p => String(p.id) === String(hold.id)), hand = giant?.[hold.side]?.slice(12, 15);
         if (!hand) hold = null;                           // the giant left
         else {
            const was = hold.at || hand;
            hold.at = was.map((v, i) => v + (hand[i] - v) * Math.min(1, 12 * dt));
            carried = cg.subtract(hold.at, was);
         }
      }
      if (carried && cg.norm(carried) > 1e-7) {
         origin = rideOrigin(origin, carried, {faceMe});   // the same step, applied to me
         headOnTable = cg.add(headOnTable, carried);
      }
      // Gravity: when I hold nothing my feet settle on what is under them (see groundUnder).
      // Feet height on the table = table top - origin.y / 12.
      if (mode === 'inside' && !carried) {
         const feet = [headOnTable[0], TABLE.height - origin[1] * SCALE, headOnTable[2]];
         // On the lamp the ground is its base, a stairway on an arm, the landing or the lookout (desk.js lampGround).
         const ground = lampGround(feet) ?? groundUnder(feet, houseAt);
         const target = -(ground - TABLE.height) / SCALE;
         origin = [origin[0], origin[1] + (target - origin[1]) * Math.min(1, 5 * dt), origin[2]];
      }
      // The door opens for any mini near it: me, or another player.
      const minis = [...(mode === 'inside' ? [headOnTable] : []),
                     ...others.filter(p => p.mode === 'inside').map(p => cg.mTransform(tableFrame(p), p.head.slice(12, 15)))];
      const doorOpen = doorForced || minis.some(at => nearDoor(at, houseAt));
      doorAngle += ((doorOpen ? 1.5 : 0) - doorAngle) * Math.min(1, 6 * dt);
      drawHouse(house, {at: houseAt, doorAngle, lampOn});
      thingViews.draw(things(), dt, lifted ? {id: lifted.id, section: lifted.section} : grab?.id ? {id: grab.id} : null);

      // Send myself every other frame; read everyone else. A laptop giant is sent standing at
      // the table edge instead of at its far-away camera (see deskGiantPose).
      const standIn = !self.tracked && mode === 'table';
      const body0 = standIn ? deskGiantPose(lift) : self;
      const sent = {head: shifted(body0.head, g), left: shifted(body0.left, g), right: shifted(body0.right, g)};
      if (bot) sent.right = cg.mTranslate(bot.hand[0], bot.hand[1], bot.hand[2]);      // already in table coordinates
      outgoing = {mode, origin, faceMe, self: sent, standIn, hold: hold?.kind || null};
      others = readOthers({clients: window.clients, myId: window.clientID, published: id => window[poseKey(id)],
                           xr: fromClientState, fresh, now});
      const shown = others.filter(p => visibleTo(mode, p));
      const present = new Set(shown.map(p => String(p.id)));
      for (const p of shown) {
         const {node, body: theirs, halo} = otherBody(String(p.id));
         node.setMatrix(tableFrame(p));
         drawBody(theirs, coachAvatarPose(p.head, p.left, p.right));
         // A light over the mini's head: green = holding on (will be carried), yellow = grip down but nothing in reach.
         if (p.mode === 'inside' && p.hold)
            halo.identity().move(p.head[12], p.head[13] + .5, p.head[14]).scale(.2).color(p.hold === 'none' ? [1,.85,.2] : [.3,1,.4]);
         else halo.identity().scale(0);
      }
      for (const [id, {body: theirs, halo}] of otherBodies) if (!present.has(id)) { drawBody(theirs, null); halo.identity().scale(0); }

      // My own body, first person, in both roles: real size, where I really am (the stage node stays
      // identity; it is the WORLD that changes size around me). The head is hidden so that the
      // camera is not inside it; looking down I see my torso, arms and hands.
      stage.identity();
      drawBody(body, pose);
      body.head.identity().scale(0);
      body.face.identity().scale(0);
      // Nor the arms: seen from inside they are thick tubes right across the view. The hands stay.
      for (const arm of Object.values(body.arms)) for (const part of [arm.upper, arm.lower, arm.elbow]) part.identity().scale(0);

      ring.identity().scale(0);
      if (mode === 'table') world.identity().move(-g[0], -g[1], -g[2]);    // the giant walked: the room slides back
      else placeWorld(world, origin, {faceMe});                            // the world grows around the spot: I am the miniature

      const rays = ['left', 'right'].map(ray).filter(Boolean).map(r => ({o: r.origin, dir: r.dir}));
      keyboard.update(rays);

      // The floating mode button: it glides to its place near me, then waits there to be aimed at.
      if (hudNeedsMove(hud, self.head)) hud = hudTarget(self.head);
      hudShown = hudShown ? {at: hudShown.at.map((v, i) => v + (hud.at[i] - v) * Math.min(1, 8 * dt)), yaw: hud.yaw} : hud;
      const aimedAt = at => ['left', 'right'].some(hand => rayBoxDistance(ray(hand), at, HUD_HALF) !== null);
      const button = (node, x, color, hot) => node.identity().move(tray(hudShown, x)).turnY(hudShown.yaw).turnX(-TRAY_TILT)
                                                  .scale(.11, .04, .012).color(hot ? [1, .96, .58] : color);
      const caption = (show, str, x, y) => show(str, tray(hudShown, x, y, .02), hudShown.yaw, TRAY_TILT);
      button(modeButton, MODE_X, [.45, .72, .77], aimedAt(modeAt()));
      caption(showMode, mode === 'table' ? 'BE THE MINI' : 'BE THE GIANT', MODE_X, -.075);
      button(buildButton, BUILD_X, keyboard.open ? [.35, .25, .5] : [.5, .4, .7], aimedAt(buildAt()));
      caption(showBuild, keyboard.open ? 'HIDE KEYBOARD' : 'BUILD WITH AI', BUILD_X, -.075);
      showHold(mode !== 'inside' ? '' : hold ? HOLD_TEXT[hold.kind] + '   GRIP: LET GO' : 'PRESS GRIP TO HOLD ON',
               tray(hudShown, 0, .085, .02), hudShown.yaw, TRAY_TILT);
      const miniHold = others.find(p => p.mode === 'inside' && p.hold)?.hold;
      showTitle('YOU: ' + roleName(mode) + '   ' + (others.length
         ? 'WITH ' + others.map(p => roleName(p.mode)).join(' + ') : 'WAITING FOR A PARTNER'), [0, 1.55, -.9]);
      showHelp((mode === 'table'
         ? (bot ? 'ROBOT GIANT: ' + bot.doing + '   ' : '') + (miniHold ? 'THE MINI: ' + HOLD_TEXT[miniHold] : 'THE MINI IS NOT HOLDING ON') + (lifted ? '   LIFTING A PART' : grab ? '   CARRYING' : '   TRIGGER MOVES A BUILDING  GRIP TAKES IT APART') + (self.tracked ? '' : '   ARROWS MOVE: ' + (things()[selected]?.spec?.name || 'HOUSE') + '  (TAB: NEXT  K: APART  U: LIFT TOP)')
         : grab ? 'CARRYING   RELEASE THE TRIGGER TO PUT IT DOWN' : (doorOpen ? 'THE DOOR IS OPEN   STEP IN' : 'WALK TO THE DOOR   EITHER STICK MOVES') + (lampOn ? '   LAMP ON' : '   AIM AT THE SWITCH'))
         + '   V MODE  F FACE  R RESET' + (self.tracked ? '' : '   ARROWS  O DOOR  L LAMP  Q/A E/D HANDS  T/G/B/N WALK  SPACE HOLD ON/OFF  X CLEAR  P ROBOT' + (robot ? ' (ON)' : '')), [0, 1.44, -.9]);
   });
};
