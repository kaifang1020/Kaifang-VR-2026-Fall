/*
 * MINIATURE — Assignment 7. A 1/12 model of myself and a small house on a 60 x 24
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
import { ControllerBeam, joyStickState } from '../../render/core/controllerInput.js';
import { coachAvatarPose } from '../coach/coachAvatarPose.js';
import { rayBoxDistance } from '../hw5/pocketCityRules.js';
import { makeBody, drawBody } from './avatarBody.js';
import { makeHouse, drawHouse } from './house.js';
import { INCH, SCALE, TABLE, HOUSE, validMatrix, floorPoint, miniatureMatrix, placeMiniature, placeWorld,
         desktopPose, tableCamera, clampHouse, nearDoor, houseBounds, walkOrigin } from './miniatureModel.js';

let cleanup = () => {};
export const deinit = () => cleanup();

export const init = async model => {
   // ---- The world: small in mode 1, twelve times bigger in mode 2 ----
   const world = model.add();
   world.add('cube').move(0, -.004, -.4).scale(3, .004, 3).color(.5,.52,.5).dull();          // classroom floor
   const T = TABLE;
   world.add('cube').move(T.at[0], T.height - .5 * INCH, T.at[2])
        .scale(T.width / 2, .5 * INCH, T.depth / 2).color(.6,.45,.3).dull();                  // table top, 60 x 24 in
   for (const sx of [-1, 1]) for (const sz of [-1, 1])
      world.add('cube').move(T.at[0] + sx * (T.width / 2 - INCH), (T.height - INCH) / 2, T.at[2] + sz * (T.depth / 2 - INCH))
           .scale(.6 * INCH, (T.height - INCH) / 2, .6 * INCH).color(.4,.3,.2).dull();      // four legs
   const house = makeHouse(world);

   // ---- The miniature: my body under one shrinking node ----
   const stage = model.add();
   const body = makeBody(stage, [1,.6,.3]);
   const ring = model.add('tubeY').color(.9,.8,.4).opacity(.5);                              // marks my origin on the floor

   // ---- HUD and controllers, in real coordinates in both modes ----
   const beams = {left: new ControllerBeam(model, 'left'), right: new ControllerBeam(model, 'right')};
   const modeAt = [-.55, 1.15, -.7];
   const modeButton = model.add('cube').move(modeAt).scale(.17, .05, .02).color(.45,.72,.77).dull();
   const label = (id, at, size, color) => {
      let node, last;
      return str => {
         if (str === last) return;
         last = str;
         const name = 'miniature_' + id;
         clay.defineTextMesh(name, str);
         if (!node) node = model.add(name).color(color).dull().view(0);    // my own view only, not the table camera's
         const width = str ? .019 * (str.length - 1) + .015 : 0;
         node.identity().move(at[0] - width * size / 2, at[1], at[2]).scale(size);
      };
   };
   const showTitle = label('title', [0, 1.55, -.9], .9, [.95,.9,.7]);
   const showHelp = label('help', [0, 1.44, -.9], .55, [.7,.8,.85]);
   const showMode = label('mode', [modeAt[0], modeAt[1] - .08, modeAt[2]], .6, [.92,.96,1]);

   let origin = null, faceMe = false, check = false, lift = {left: 0, right: 0};
   let split = true, camAngle = .6;
   let mode = 'table', houseAt = [...HOUSE.at], doorAngle = 0, doorForced = false, lampOn = false, grab = null;
   let lastSelf = null, lastFrame = Date.now();

   // The renderer asks this every frame; a view matrix means "draw a second camera on the right".
   window.splitView = () => split && mode === 'table' && !window.isXR?.() ? tableCamera(camAngle) : null;

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
   const switchMode = () => { mode = mode === 'table' ? 'inside' : 'table'; grab = null; houseAt[1] = TABLE.height; };
   // In mode 2 the switch is a real-size box at its global position; in mode 1 it is too small to aim at.
   const switchHit = r => {
      if (mode !== 'inside') return false;
      const at = house.lampSwitch.getGlobalMatrix().slice(12, 15);
      return rayBoxDistance(r, at, [.5, .7, .5].map(v => v * INCH / SCALE)) !== null;
   };
   const onPress = hand => {
      const r = ray(hand);
      if (!r) return;
      if (rayBoxDistance(r, modeAt, [.19, .07, .05]) !== null) { switchMode(); return; }
      if (mode === 'table') {
         const b = houseBounds(houseAt), hand3 = lastSelf?.[hand]?.slice(12, 15);
         if (hand3 && rayBoxDistance(r, b.centre, b.half) !== null) grab = {hand, offset: cg.subtract(houseAt, hand3)};
      } else if (switchHit(r)) lampOn = !lampOn;
   };
   const onRelease = hand => { if (grab?.hand === hand) { grab = null; houseAt[1] = TABLE.height; } };

   const step = (dx, dz) => {                        // arrows: mode 1 slides the house an inch, mode 2 walks a foot
      const head = lastSelf?.head;
      if (!head) return;
      const f = cg.normalize([-head[8], 0, -head[10]]), r = [-f[2], 0, f[0]];   // camera forward and right, on the floor
      const move = cg.add(cg.scale(f, dz), cg.scale(r, dx));
      if (mode === 'table') houseAt = clampHouse(cg.add(houseAt, cg.scale(move, INCH)));
      else if (origin) origin = cg.subtract(origin, cg.scale(move, 12 * INCH));          // moving the origin back walks me forward
   };
   const onKey = event => {
      const key = event.key.toLowerCase();
      if (key === 'v') switchMode();
      else if (key === 'f') faceMe = !faceMe;
      else if (key === 'm') check = !check;
      else if (key === 'r') origin = null;
      else if (key === 's') split = !split;
      else if (key === '[') camAngle -= .15;
      else if (key === ']') camAngle += .15;
      else if (key === 'o') doorForced = !doorForced;
      else if (key === 'l') lampOn = !lampOn;
      else if (key === 'q') lift.left = Math.min(.9, lift.left + .1);
      else if (key === 'a') lift.left = Math.max(-.3, lift.left - .1);
      else if (key === 'e') lift.right = Math.min(.9, lift.right + .1);
      else if (key === 'd') lift.right = Math.max(-.3, lift.right - .1);
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
   };

   showTitle('MINIATURE');
   model.animate(() => {
      for (const beam of Object.values(beams)) beam.update();
      const now = Date.now(), dt = Math.min(.05, (now - lastFrame) / 1000);
      lastFrame = now;
      const self = selfPose();
      lastSelf = self;
      const pose = self && coachAvatarPose(self.head, self.left, self.right);
      if (!self) { drawBody(body, null); ring.identity().scale(0); showHelp('NO HEAD POSITION YET'); return; }
      if (!origin) origin = floorPoint(self.head);
      // Either stick walks: whichever is pushed further this frame (one controller may be off).
      const sticks = [joyStickState.left, joyStickState.right].filter(Boolean);
      const stick = sticks.reduce((a, b) => Math.hypot(b.x, b.y) > Math.hypot(a.x, a.y) ? b : a, {x: 0, y: 0});
      if (mode === 'inside' && Math.hypot(stick.x, stick.y) > .15) origin = walkOrigin(origin, self.head, stick, dt);

      // Where my head is on the table, in table coordinates: the same point in both modes.
      const headOnTable = cg.mTransform(miniatureMatrix(origin, {faceMe}), self.head.slice(12, 15));

      // The house: carried by a hand, or resting where it was put.
      if (grab && self[grab.hand]) {
         const raw = cg.add(self[grab.hand].slice(12, 15), grab.offset);
         houseAt = clampHouse(raw);
         houseAt[1] = Math.max(TABLE.height, raw[1]);
      }
      const doorOpen = doorForced || (mode === 'inside' && nearDoor(headOnTable, houseAt));
      doorAngle += ((doorOpen ? 1.5 : 0) - doorAngle) * Math.min(1, 6 * dt);
      drawHouse(house, {at: houseAt, doorAngle, lampOn});

      if (mode === 'table') {
         world.identity();
         drawBody(body, pose);
         placeMiniature(stage, origin, check ? {scale: 1, spot: origin, faceMe: false} : {faceMe});
         ring.identity().move(origin[0], .003, origin[2]).scale(.25, .003, .25);
      } else {
         placeWorld(world, origin, {faceMe});            // the world grows around the spot: I am the miniature
         drawBody(body, null);
         ring.identity().scale(0);
      }
      const aimed = ['left', 'right'].some(hand => rayBoxDistance(ray(hand), modeAt, [.19, .07, .05]) !== null);
      modeButton.color(aimed ? [1, .96, .58] : [.45, .72, .77]);
      showMode(mode === 'table' ? 'ENTER MINIATURE' : 'BACK TO TABLE');
      showHelp((mode === 'table'
         ? (grab ? 'CARRYING THE HOUSE' : check ? 'CHECK: FULL SIZE ON ME' : 'TABLE VIEW   TRIGGER ON THE HOUSE TO MOVE IT')
         : (doorOpen ? 'THE DOOR IS OPEN   STEP IN' : 'WALK TO THE DOOR   EITHER STICK MOVES') + (lampOn ? '   LAMP ON' : '   AIM AT THE SWITCH'))
         + '   V MODE  F FACE  R RESET' + (self.tracked ? '' : '   ARROWS  O DOOR  L LAMP  Q/A E/D HANDS'));
   });
};
