// Small helpers for Echo Garden's spatial sound. No Web Audio objects are
// created here, so the math can be tested in Node.

export const BEAT_SECONDS = .5;

// The beat number at wall-clock time nowMs. Every headset reads its own clock,
// and device clocks agree to within a few tens of milliseconds, so two headsets
// play the same link on the same beat. model.time cannot do this: it starts
// when each headset loads the scene.
export const beatNumber = (nowMs = Date.now()) => Math.floor(nowMs / 1000 / BEAT_SECONDS);

// A head matrix (column-major, like cg.js) as a Web Audio listener pose:
// position = column 3, up = column 1 (the head's y axis), and forward = minus
// column 2, because a head looks down its own -z axis.
export function listenerFromMatrix(m) {
   if (!Array.isArray(m) && !(m instanceof Float32Array) || m.length < 16) return null;
   const unit = v => {
      const n = Math.hypot(...v);
      return n > 1e-6 ? v.map(x => x / n) : null;
   };
   const forward = unit([-m[8], -m[9], -m[10]]), up = unit([m[4], m[5], m[6]]);
   const position = [m[12], m[13], m[14]];
   if (!forward || !up || !position.every(Number.isFinite)) return null;
   return { position, forward, up };
}

// Move the ears of an AudioContext to a listener pose. Newer browsers expose
// AudioParams (positionX ...); older ones only have setPosition/setOrientation.
export function placeListener(audio, pose) {
   const L = audio?.listener;
   if (!L || !pose) return;
   const [x, y, z] = pose.position, [fx, fy, fz] = pose.forward, [ux, uy, uz] = pose.up;
   if (L.positionX) {
      const t = audio.currentTime;
      L.positionX.setValueAtTime(x, t); L.positionY.setValueAtTime(y, t); L.positionZ.setValueAtTime(z, t);
      L.forwardX.setValueAtTime(fx, t); L.forwardY.setValueAtTime(fy, t); L.forwardZ.setValueAtTime(fz, t);
      L.upX.setValueAtTime(ux, t); L.upY.setValueAtTime(uy, t); L.upZ.setValueAtTime(uz, t);
   }
   else {
      L.setPosition?.(x, y, z);
      L.setOrientation?.(fx, fy, fz, ux, uy, uz);
   }
}
