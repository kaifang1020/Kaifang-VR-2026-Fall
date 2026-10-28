/*
 * MINIATURE — the player's own body, 17 cm tall, standing on a table in front of them.
 * The tracked head and hands drive coachAvatarPose at full size; the figure hangs
 * under one node whose matrix shrinks it and carries it to the table (miniatureModel.js).
 * Keys: F turn the miniature to face me / away, M check mode (full size, drawn on
 * top of me), R reset the floor origin to where I stand now.
 * Desktop without a headset: the camera is the head; Q/A and E/D raise and lower
 * the left and right hand. S splits the screen: left is my own view, right is a
 * camera on the table looking at the miniature; arrow keys orbit that camera.
 */
import * as cg from '../../render/core/cg.js';
import { coachAvatarPose } from '../coach/coachAvatarPose.js';
import { makeBody, drawBody } from './avatarBody.js';
import { SPOT, validMatrix, floorPoint, placeMiniature, desktopPose, tableCamera } from './miniatureModel.js';

let cleanup = () => {};
export const deinit = () => cleanup();

export const init = async model => {
   // A small round table whose top is at SPOT height.
   model.add('tubeY').move(SPOT[0], SPOT[1] - .015, SPOT[2]).scale(.28, .015, .28).color(.55,.42,.3).dull();
   model.add('tubeY').move(SPOT[0], SPOT[1] / 2 - .02, SPOT[2]).scale(.04, SPOT[1] / 2 - .02, .04).color(.35,.28,.2).dull();
   // A ring on the real floor marks the origin: the miniature stands on the table where I stand on this ring.
   const ring = model.add('tubeY').color(.9,.8,.4).opacity(.5);
   const stage = model.add();                                // the one node that does the shrinking
   const body = makeBody(stage, [1,.6,.3]);

   const label = (id, at, size, color) => {
      let node, last;
      return str => {
         if (str === last) return;
         last = str;
         const name = 'miniature_' + id;
         clay.defineTextMesh(name, str);
         if (!node) node = model.add(name).color(color).dull().view(0);   // my own view only, not the table camera's
         const width = str ? .019 * (str.length - 1) + .015 : 0;
         node.identity().move(at[0] - width * size / 2, at[1], at[2]).scale(size);
      };
   };
   const showTitle = label('title', [0, 1.55, -.9], .9, [.95,.9,.7]);
   const showHelp = label('help', [0, 1.42, -.9], .6, [.7,.8,.85]);
   showTitle('MINIATURE');

   let origin = null, faceMe = true, check = false, lift = {left: 0, right: 0};
   let split = true, camAngle = .6;
   // The renderer asks this every frame; a view matrix means "draw a second camera on the right".
   // Not inside an immersive session: a headset already has two views of its own.
   window.splitView = () => split && !window.isXR?.() ? tableCamera(camAngle) : null;

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

   const onKey = event => {
      const key = event.key.toLowerCase();
      if (key === 'f') faceMe = !faceMe;
      else if (key === 'm') check = !check;
      else if (key === 'r') origin = null;
      else if (key === 's') split = !split;
      else if (key === 'arrowleft') camAngle -= .15;
      else if (key === 'arrowright') camAngle += .15;
      else if (key === 'q') lift.left = Math.min(.9, lift.left + .1);
      else if (key === 'a') lift.left = Math.max(-.3, lift.left - .1);
      else if (key === 'e') lift.right = Math.min(.9, lift.right + .1);
      else if (key === 'd') lift.right = Math.max(-.3, lift.right - .1);
      else return;
      event.preventDefault();
   };
   addEventListener('keydown', onKey);
   cleanup = () => { removeEventListener('keydown', onKey); window.splitView = null; };

   model.animate(() => {
      const self = selfPose();
      const pose = self && coachAvatarPose(self.head, self.left, self.right);
      if (!drawBody(body, pose)) { ring.identity().scale(0); showHelp('NO HEAD POSITION YET'); return; }
      if (!origin) origin = floorPoint(self.head);
      ring.identity().move(origin[0], .003, origin[2]).scale(.25, .003, .25);
      placeMiniature(stage, origin, check ? {scale: 1, spot: origin, faceMe: false} : {faceMe});
      showHelp((check ? 'CHECK: FULL SIZE ON ME' : faceMe ? 'FACING ME' : 'FACING AWAY')
         + '   F FACE  M CHECK  R RESET' + (self.tracked ? '' : '   S SPLIT  ARROWS ORBIT  Q/A E/D HANDS'));
   });
};
