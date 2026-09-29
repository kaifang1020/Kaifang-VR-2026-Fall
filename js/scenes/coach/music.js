// Music for Follow the Coach, synthesized live with WebAudio: no audio files.
//
// Notes are scheduled against the shared coach clock's beat, so the music, the
// coach's motion and the controllers' beat ticks all line up, and every player
// hears the same beat in their own headset. Dance is a four-beat groove in
// A minor; fitness is a driving pattern in E minor.

export function createMusic() {
   const SONG = {
      dance: { roots: [57,53,48,55], minor: [1,0,0,0] },           // Am F C G
      fit  : { roots: [52,48,50,52], minor: [1,0,0,1] },           // Em C D Em
   };
   let actx = null, master = null, noiseBuf = null, nextStep = -1, songMode = '';
   let reset = () => { nextStep = -1; songMode = ''; };
   let audioOn = () => {
      try {
         if (! actx) {
            actx = new (window.AudioContext || window.webkitAudioContext)();
            master = actx.createGain();
            master.gain.value = .22;
            master.connect(actx.destination);
            noiseBuf = actx.createBuffer(1, actx.sampleRate / 2, actx.sampleRate);
            let d = noiseBuf.getChannelData(0);
            for (let i = 0 ; i < d.length ; i++) d[i] = 2 * Math.random() - 1;
         }
         if (actx.state == 'suspended') actx.resume();            // browsers need one click / trigger first
      } catch (e) { actx = null; }
      return actx && actx.state == 'running';
   }
   addEventListener('pointerdown', audioOn);

   let hz = midi => 440 * Math.pow(2, (midi - 69) / 12);
   let env = (when, dur, vol) => {
      let g = actx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(vol, when + .005);
      g.gain.exponentialRampToValueAtTime(.001, when + dur);
      g.connect(master);
      return g;
   }
   let tone = (type, midi, when, dur, vol, cutoff) => {
      let o = actx.createOscillator(), f = actx.createBiquadFilter();
      o.type = type;
      o.frequency.value = hz(midi);
      f.type = 'lowpass';
      f.frequency.value = cutoff ?? 4000;
      o.connect(f).connect(env(when, dur, vol));
      o.start(when);
      o.stop(when + dur + .05);
   }
   let kick = (when, vol) => {
      let o = actx.createOscillator();
      o.frequency.setValueAtTime(150, when);
      o.frequency.exponentialRampToValueAtTime(42, when + .12);
      o.connect(env(when, .22, vol));
      o.start(when);
      o.stop(when + .3);
   }
   let noise = (when, dur, vol, type, freq) => {
      let n = actx.createBufferSource(), f = actx.createBiquadFilter();
      n.buffer = noiseBuf;
      f.type = type;
      f.frequency.value = freq;
      n.connect(f).connect(env(when, dur, vol));
      n.start(when);
      n.stop(when + dur + .05);
   }

   // 16 steps per bar (4 per beat), and the chord progression cycles every 4 bars
   let playStep = (m, n, when, hype) => {
      let s = n % 16, bar = Math.floor(n / 16) % 4, song = SONG[m];
      let root = song.roots[bar], third = song.minor[bar] ? 3 : 4;
      if (m == 'dance') {
         if (s % 4 == 0) kick(when, .9);
         if (s % 8 == 4) noise(when, .12, .35, 'bandpass', 1800);                // clap
         if (s % 2 == 1) noise(when, .03, .10, 'highpass', 8000);                // closed hat
         if (s % 4 == 2) { noise(when, .09, .16, 'highpass', 7000);              // offbeat open hat + bass
                           tone('sawtooth', root - 24, when, .16, .5, 500); }
         if (s % 2 == 0) {                                                       // arpeggio, brighter with a longer combo
            let notes = [root, root + third, root + 7, root + 12];
            tone('square', notes[[0,2,1,2,3,2,1,2][s / 2]] + 12, when, .13, .10, 1200 + 3000 * hype);
         }
      }
      else {
         if (s % 4 == 0 || s == 10) kick(when, 1);
         if (s % 8 == 4) noise(when, .16, .45, 'bandpass', 1200);                // snare
         if (s % 2 == 0) noise(when, .03, .08, 'highpass', 9000);
         tone('sawtooth', root - 24, when, .1, s % 4 == 0 ? .45 : .28, 380 + 500 * hype);   // sixteenth-note bass
         if (s == 0 || s == 6 || s == 12)                                        // power chord
            for (let iv of [0, 7, 12])
               tone('sawtooth', root - 12 + iv, when, .3, .12, 1500);
      }
   }
   let ding = ok => {                                                            // I hit it / everyone hit it
      if (! audioOn()) return;
      let t = actx.currentTime + .01;
      if (ok == 1) tone('triangle', 88, t, .18, .25);
      else for (let i = 0 ; i < 3 ; i++) tone('triangle', [81,85,88][i] , t + .07 * i, .4, .22);
   }

   // Schedule the next 0.15 seconds of notes onto WebAudio's timeline.
   // hype: 0..1, brightens the sound. quiet: duck the music (while choreographing).
   let schedule = ({mode, beat, clock, hype = 0, quiet = false}) => {
      if (! audioOn()) return;
      let step = beat / 4, stepNow = clock / step;
      if (songMode != mode || nextStep < stepNow - 8) {
         songMode = mode;
         nextStep = Math.ceil(stepNow);
      }
      master.gain.value = quiet ? .08 : .22;
      while (nextStep * step < clock + .15) {
         playStep(mode, nextStep, actx.currentTime + Math.max(0, nextStep * step - clock), hype);
         nextStep++;
      }
   }
   // Short one-off sounds, by name.
   let cue = name => {
      if (! audioOn()) return;
      let t = actx.currentTime + .01;
      if (name == 'tick')   tone('square', 76, t, .08, .2, 2500);
      if (name == 'go')     for (let m of [76,83]) tone('square', m, t, .35, .18, 3000);
      if (name == 'miss')   tone('sawtooth', 45, t, .2, .25, 600);
      if (name == 'win')    [72,76,79,84].forEach((m,i) => tone('triangle', m, t + .12 * i, .5, .25));
      if (name == 'lose')   [64,60,57].forEach((m,i) => tone('triangle', m, t + .18 * i, .5, .25));
   }
   let dispose = () => {
      removeEventListener('pointerdown', audioOn);
      if (actx) actx.close().catch(() => {});
      actx = null;
   }
   return { audioOn, schedule, ding, cue, reset, dispose };
}
