// Music for Haptic Fishing, synthesized live with WebAudio: no audio files.
//
// A lazy lakeside afternoon: plucked kalimba-like notes on a major pentatonic
// scale over I-vi-IV-V, a soft bass, a shaker, and a bed of water and birds.
// The music follows the fishing: it steps back when a fish is testing the bait,
// so the player can count the taps, goes almost silent on the bite, and turns
// tense while reeling in. Each player hears their own game, so nothing here is
// shared over the network.

// How loud each layer should be in each moment of play (0..1). Pure, so tested.
export function mixFor({phase = 'ready', state = 'idle', tension = 0, surging = false, remaining = 120} = {}) {
   const calm = {pluck:1, bass:.7, shaker:.45, ambience:.6, fight:0};
   if (phase === 'ready') return {pluck:.55, bass:.35, shaker:0, ambience:.7, fight:0};
   if (phase !== 'playing') return {pluck:0, bass:0, shaker:0, ambience:.5, fight:0};
   switch (state) {
   case 'nibbling': return {pluck:.12, bass:.08, shaker:0, ambience:.45, fight:0};   // let the player count the taps
   case 'bite'    : return {pluck:0, bass:0, shaker:0, ambience:.25, fight:0};       // nothing but the strike cue
   case 'fight'   : {
      const k = Math.max(0,Math.min(1,tension));
      return {pluck:.35, bass:0, shaker:.6+.4*k, ambience:.2, fight:surging ? 1 : .55+.45*k};
   }
   default        : return remaining < 20 ? {...calm, shaker:.8} : calm;
   }
}

// Beats per minute: a little faster in the last 20 seconds and during a fight.
export const tempoFor = ({phase = 'ready', state = 'idle', remaining = 120} = {}) =>
   phase === 'playing' && state === 'fight' ? 92 : phase === 'playing' && remaining < 20 ? 88 : 76;

const CHORDS = [[60,64,67],[57,60,64],[53,57,60],[55,59,62]];        // C  Am  F  G, one bar each
const SCALE  = [60,62,64,67,69,72,74,76];                            // C major pentatonic, two octaves
// An eight-step (one bar of eighth notes) melody per chord; -1 is a rest.
const MELODY = [[4,-1,3,2,-1,4,5,-1],[3,-1,2,0,-1,2,3,-1],[2,-1,3,4,-1,5,4,2],[4,3,-1,1,-1,2,-1,-1]];

export function createFishingMusic() {
   let ctx = null, master = null, layers = null, noise = null, step = 0, nextTime = 0;
   let nextBird = 0, water = null, mix = mixFor(), bpm = 76, surging = false;
   let failed = false;

   const on = () => {
      if (failed) return false;
      try {
         if (!ctx) {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
            master = ctx.createGain(); master.gain.value = .28; master.connect(ctx.destination);
            layers = {};
            for (const name of ['pluck','bass','shaker','ambience','fight']) {
               layers[name] = ctx.createGain(); layers[name].gain.value = 0; layers[name].connect(master);
            }
            noise = ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);
            const d = noise.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = 2*Math.random()-1;
            // Water: looping noise through a low-pass filter, gently swelling.
            water = ctx.createBufferSource(); water.buffer = noise; water.loop = true;
            const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
            const swell = ctx.createGain(); swell.gain.value = .18;
            const lfo = ctx.createOscillator(), depth = ctx.createGain();
            lfo.frequency.value = .13; depth.gain.value = .08;
            lfo.connect(depth).connect(swell.gain);
            water.connect(lp).connect(swell).connect(layers.ambience);
            water.start(); lfo.start();
         }
         if (ctx.state === 'suspended') ctx.resume();           // browsers need a click or trigger first
      } catch (e) { failed = true; ctx = null; }
      return !!ctx && ctx.state === 'running';
   };

   const hz = m => 440*Math.pow(2,(m-69)/12);
   const env = (out,when,attack,dur,vol) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0,when);
      g.gain.linearRampToValueAtTime(vol,when+attack);
      g.gain.exponentialRampToValueAtTime(.0005,when+dur);
      g.connect(out);
      return g;
   };
   const osc = (type,freq,out,when,dur) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
      o.connect(out); o.start(when); o.stop(when+dur+.05);
      return o;
   };
   // Kalimba-like pluck: a sine with a quiet, quickly fading overtone.
   const pluck = (m,when,vol = .5,out = layers.pluck) => {
      osc('sine',hz(m),env(out,when,.004,1.1,vol),when,1.1);
      osc('sine',hz(m)*4.1,env(out,when,.002,.18,vol*.25),when,.18);
   };
   const bassNote = (m,when,dur) => {
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
      f.connect(env(layers.bass,when,.02,dur,.5));
      osc('triangle',hz(m),f,when,dur);
   };
   const hiss = (when,dur,vol,freq,out) => {
      const n = ctx.createBufferSource(), f = ctx.createBiquadFilter();
      n.buffer = noise; f.type = 'highpass'; f.frequency.value = freq;
      n.connect(f).connect(env(out,when,.003,dur,vol));
      n.start(when,Math.random()*1.5); n.stop(when+dur+.05);
   };
   const bird = when => {
      for (let i = 0; i < 2 + (Math.random() < .5); i++) {
         const t = when + i*.11, o = ctx.createOscillator();
         o.frequency.setValueAtTime(2300+400*Math.random(),t);
         o.frequency.exponentialRampToValueAtTime(3600+500*Math.random(),t+.07);
         o.connect(env(layers.ambience,t,.01,.09,.05)); o.start(t); o.stop(t+.12);
      }
   };

   // One eighth-note step of the loop: 8 steps a bar, 4 bars.
   const playStep = (n,when,beat) => {
      const s = n % 8, bar = Math.floor(n/8) % 4, chord = CHORDS[bar];
      const note = MELODY[bar][s];
      if (note >= 0) pluck(SCALE[note]+12,when,.32);
      if (s === 0) chord.forEach((m,i) => pluck(m,when+.02*i,.18));   // a soft strum on the downbeat
      if (s === 0) bassNote(chord[0]-24,when,beat*1.8);
      if (s === 4) bassNote(chord[0]-17,when,beat*1.5);
      if (s % 2 === 1) hiss(when,.05,.06,6000,layers.shaker);
      // Fight layer: a pulsing low note on every eighth, a semitone up while the fish surges.
      const root = chord[0]-24 + (surging ? 2 : 0);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = surging ? 1400 : 700;
      f.connect(env(layers.fight,when,.005,beat*.45,.35));
      osc('sawtooth',hz(root + (s % 4 === 3 ? 7 : 0)),f,when,beat*.45);
   };

   return {
      on,
      // Call every frame with the current game. Schedules the next 0.2 s of notes.
      update(game) {
         if (!on()) return;
         const target = mixFor(game);
         const quick = game.state === 'bite' || game.state === 'nibbling';   // duck fast, recover slowly
         for (const name in layers)
            layers[name].gain.setTargetAtTime(target[name],ctx.currentTime,quick ? .06 : .4);
         mix = target; bpm = tempoFor(game); surging = !!game.surging;
         const beat = 60/bpm, eighth = beat/2;
         if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + .05;
         while (nextTime < ctx.currentTime + .2) { playStep(step++,nextTime,beat); nextTime += eighth; }
         if (ctx.currentTime > nextBird) {
            if (mix.ambience > .4 && mix.pluck > .5) bird(ctx.currentTime + .05);
            nextBird = ctx.currentTime + 4 + 6*Math.random();
         }
      },
      // Short one-off phrases, by name.
      cue(name, big = false) {
         if (!on()) return;
         const t = ctx.currentTime + .02;
         if (name === 'catch') [0,2,4,5].concat(big ? [7,6,7] : []).forEach((k,i) => pluck(SCALE[k]+12,t+.09*i,.45,master));
         if (name === 'flop')                                     // a sad trombone slide
            for (let i = 0; i < 3; i++) {
               const w = t + .28*i, o = ctx.createOscillator(); o.type = 'sawtooth';
               o.frequency.setValueAtTime(hz(55-i),w); o.frequency.linearRampToValueAtTime(hz(54-i),w+.26);
               const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
               o.connect(f).connect(env(master,w,.02,.27,.18)); o.start(w); o.stop(w+.3);
            }
         if (name === 'win')  [0,2,4,5,7].forEach((k,i) => { pluck(SCALE[k]+12,t+.12*i,.5,master); if (i === 4) CHORDS[0].forEach(m => pluck(m+12,t+.5,.3,master)); });
         if (name === 'lose') [4,3,2,0].forEach((k,i) => pluck(SCALE[k],t+.22*i,.45,master));
      },
      dispose() {
         if (ctx) ctx.close().catch(() => {});
         ctx = null;
      },
   };
}
