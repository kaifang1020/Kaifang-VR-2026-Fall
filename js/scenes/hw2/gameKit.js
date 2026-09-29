import * as cg from '../../render/core/cg.js';
import { ControllerBeam, controllerMatrix } from '../../render/core/controllerInput.js';

export const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
export const buzz = (hand, strength = .5, duration = 60) => {
   try { window.vibrate?.(hand,strength,duration); } catch (_) { /* Desktop or unsupported controller. */ }
};

export function createKit(model, prefix) {
   const beams = {left:new ControllerBeam(model,'left'), right:new ControllerBeam(model,'right')};
   const keys = new Set();
   let keyAction = () => {}, audio = null, disposed = false;
   const down = e => {
      if (e.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
      const key = e.key.toLowerCase();
      if (![' ','r','w','a','s','d','i','j','k','l','1','2','3','b','e'].includes(key)) return;
      e.preventDefault(); keys.add(key);
      if (!e.repeat) keyAction(key);
   };
   const up = e => keys.delete(e.key.toLowerCase());
   const blur = () => keys.clear();
   window.addEventListener('keydown',down);
   window.addEventListener('keyup',up);
   window.addEventListener('blur',blur);
   const ray = hand => {
      beams[hand].update();
      const bm = beams[hand].beamMatrix();
      if (!bm || !Array.from(bm).every(Number.isFinite)) return null;
      const inv = cg.mInverse(worldCoords);
      const o = cg.mTransform(inv,bm.slice(12,15));
      const p = cg.mTransform(inv,cg.subtract(bm.slice(12,15),bm.slice(8,11)));
      return {o, d:cg.normalize(cg.subtract(p,o))};
   };
   const plane = (hand,z) => {
      const r = ray(hand);
      if (!r || Math.abs(r.d[2]) < .0001) return null;
      const t = (z-r.o[2])/r.d[2];
      return t > 0 ? cg.add(r.o,cg.scale(r.d,t)) : null;
   };
   const pointsAt = (hand,p,radius) => {
      const r = ray(hand);
      if (!r) return false;
      const v = cg.subtract(p,r.o), t = cg.dot(v,r.d);
      return t > 0 && cg.norm(cg.subtract(v,cg.scale(r.d,t))) < radius;
   };
   const label = (id,p,size = 1,color = [.85,.93,1]) => {
      const name = prefix+'_'+id;
      let last, node;
      return text => {
         if (text === last) return;
         last = text;
         clay.defineTextMesh(name,text);
         if (!node) node = model.add(name).color(color).dull();
         const width = .019*Math.max(0,text.length-1)+.015;
         node.identity().move(p[0]-width*size/2,p[1],p[2]).scale(size);
      };
   };
   const tone = (hz = 600, length = .12) => {
      if (disposed) return;
      try {
         const Context = window.AudioContext || window.webkitAudioContext;
         if (!Context) return;
         audio ||= new Context();
         if (audio.state === 'suspended') audio.resume().catch(()=>{});
         const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
         o.type = 'triangle'; o.frequency.value = hz;
         g.gain.setValueAtTime(.045,t); g.gain.exponentialRampToValueAtTime(.001,t+length);
         o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t+length+.01);
         o.onended = () => { o.disconnect(); g.disconnect(); };
      } catch (_) { /* Audio is optional. */ }
   };
   // True while this hand's controller is tracked in an XR session: the same
   // matrix the red controller beam is drawn from. Empty on the desktop.
   const tracked = hand => controllerMatrix[hand]?.length === 16 && controllerMatrix[hand].every(Number.isFinite);
   return {keys,ray,tracked,plane,pointsAt,label,tone,
      onKey: fn => keyAction = fn,
      update: () => { for (const b of Object.values(beams)) b.update(); },
      dispose: () => {
         disposed = true; window.removeEventListener('keydown',down);
         window.removeEventListener('keyup',up); window.removeEventListener('blur',blur);
         keys.clear(); if (audio) audio.close().catch(()=>{});
      }
   };
}
