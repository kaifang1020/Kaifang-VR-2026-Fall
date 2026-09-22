/*
 * SIGNAL ROOM — two-handed haptic signal calibration.
 *
 * LEFT: sweep the blue scanner with the controller beam. Haptics become more
 * frequent near the invisible signal. Hold the trigger on it to lock it.
 * RIGHT: hold the trigger on the orange ring and move around its circumference.
 * A faster pulse means the frequency is closer. Hold both hands steady when
 * the core lights up; calibration completes automatically. There are 3 rounds.
 *
 * No headset? The controller beams have a desktop fallback, but the intended
 * interaction needs two tracked controllers with haptics.
 */

import { ControllerBeam } from '../../render/core/controllerInput.js';

export const init = async model => {
   const Y = 1.45, Z = -1.1;
   const SCAN_X = -.42, DIAL_X = .42;
   const SCAN_HALF = .28, DIAL_HALF = .28;
   const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
   const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
   const rounds = [
      { signal: [-.48, .35], frequency: .27, frequencyDrift: 0,    scanRadius: .23, tuneError: .085, hold: .35, drift: 0 },
      { signal: [ .55,-.42], frequency: .71, frequencyDrift: .025, scanRadius: .16, tuneError: .055, hold: .60, drift: 0 },
      { signal: [-.12,-.58], frequency: .46, frequencyDrift: .050, scanRadius: .12, tuneError: .038, hold: .85, drift: .07 },
   ];
   const signalAt = t => {
      const r = rounds[round];
      return [r.signal[0] + r.drift * Math.sin(.7*t),
              r.signal[1] + r.drift * Math.cos(.5*t)];
   };
   // An unstable transmission slowly drifts off-frequency in later rounds.
   const frequencyAt = t => rounds[round].frequency +
      rounds[round].frequencyDrift * Math.sin(.65*t);
   const onRing = h => h && Math.hypot(h[0], h[1]) > .30 &&
                              Math.hypot(h[0], h[1]) < .88;
   // 0 = right, .25 = top, .5 = left, .75 = bottom; matches the pointer.
   const ringValue = h => (Math.atan2(h[1], h[0]) + 2*Math.PI) %
                          (2*Math.PI) / (2*Math.PI);

   // Short sounds from this repository, played only after a controller gesture.
   // The game still works if audio is blocked or unavailable.
   const sounds = {
      lock: new Audio('media/sound/SFXs/demoPuzzle/SFX_Puzzle_Move_Mono_01.wav'),
      success: new Audio('media/sound/SFXs/demoBalls/SFX_Ball_Create_Mono_01.wav'),
   };
   sounds.lock.volume = .32;
   sounds.success.volume = .55;
   const play = name => {
      const sound = sounds[name];
      try {
         sound.currentTime = 0;
         const result = sound.play();
         if (result && result.catch) result.catch(() => {});
      }
      catch (e) { /* No audio device or playback permission. */ }
   };
   let audioContext = null;
   const enableTones = () => {
      try {
         const Context = window.AudioContext || window.webkitAudioContext;
         if (Context && !audioContext) audioContext = new Context();
         if (audioContext && audioContext.state === 'suspended')
            audioContext.resume().catch(() => {});
      }
      catch (e) { /* Audio is optional. */ }
   };
   const tick = (pitch, volume = .012) => {
      if (!audioContext || audioContext.state !== 'running') return;
      const now = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = pitch;
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(.0001, now + .045);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + .05);
   };

   // The visible cabinet and its two square beam targets.
   model.add('cube').move(0, Y, Z - .10).scale(.84,.43,.08).color(.035,.055,.075).dull();
   const scan = model.add('square').move(SCAN_X,Y,Z).scale(SCAN_HALF,SCAN_HALF,1)
                     .color(.025,.16,.23).dull();
   const dial = model.add('square').move(DIAL_X,Y,Z).scale(DIAL_HALF,DIAL_HALF,1)
                     .color(.20,.10,.035).dull();
   model.add('torusZ').move(DIAL_X,Y,Z+.012).scale(.19,.19,.012).color(.35,.23,.10).dull();

   // Scanner crosshairs and a small probe that tracks the left beam hit.
   model.add('cube').move(SCAN_X,Y,Z+.012).scale(.004,.25,.002).color(.07,.25,.30);
   model.add('cube').move(SCAN_X,Y,Z+.012).scale(.25,.004,.002).color(.07,.25,.30);
   const probe = model.add('sphere').color(.1,.8,1);
   const lockMark = model.add('torusZ').color(.1,1,.7);

   // One dial and one pointer: both move together when the user tunes it.
   const rotor = model.add();
   rotor.add('torusZ').scale(.14,.14,.018).color(.5,.27,.08).dull();
   rotor.add('sphere').scale(.045,.045,.014).color(.32,.22,.10).dull();
   const pointer = rotor.add('cube').move(.115,0,.025).scale(.06,.011,.006)
                        .color(1,.65,.2);

   // A narrow row of status lights: green = completed round, amber = current.
   const lights = [];
   for (let i = 0; i < rounds.length; i++)
      lights.push(model.add('sphere').move(-.12+i*.12,Y-.34,Z+.025).scale(.024));
   const scanLamp = model.add('sphere').move(SCAN_X,Y+.34,Z+.025).scale(.025);
   const tuneLamp = model.add('sphere').move(DIAL_X,Y+.34,Z+.025).scale(.025);
   const core = model.add('sphere').move(0,Y,Z+.10).scale(.042).color(.2,.35,.5);

   const beams = {
      left: new ControllerBeam(model, 'left'),
      right: new ControllerBeam(model, 'right'),
   };

   let round = 0;
   let frequency = .5;
   let leftHeld = false, locked = false, rightHeld = false;
   let leftMissTime = 0, stableTime = 0;
   let leftHit = null, rightHit = null;
   let nextLeftPulse = 0, nextRightPulse = 0;
   let flashUntil = 0;
   let completed = false;

   // Avoid calling the haptic API when no controller or actuator is available.
   const pulse = (hand, strength, duration = 24) => {
      if (typeof window.vibrate === 'function') {
         try { window.vibrate(hand, strength, duration); }
         catch (e) { /* Some controllers do not support haptics. */ }
      }
   };

   const hit = (hand, target) => {
      beams[hand].update();
      return beams[hand].hitRect(target.getGlobalMatrix());
   };

   const startNextRound = () => {
      round++;
      leftHeld = false;
      locked = false;
      rightHeld = false;
      leftMissTime = 0;
      stableTime = 0;
      frequency = .5;
      flashUntil = model.time + .85;
      if (round >= rounds.length) completed = true;
   };

   inputEvents.onPress = hand => {
      if (completed || model.time < flashUntil) return;
      enableTones();
      if (hand === 'left') {
         leftHeld = true;
         const h = hit('left', scan);
         locked = !!h && distance(h, signalAt(model.time)) < rounds[round].scanRadius;
         if (locked) play('lock');
         pulse('left', locked ? 1 : .3, locked ? 90 : 35);
      }
      if (hand === 'right') {
         const h = hit('right', dial);
         rightHeld = !!onRing(h);
         if (rightHeld) pulse('right', .45, 40);
      }
   };

   inputEvents.onDrag = hand => {
      if (completed) return;
      if (hand === 'right' && rightHeld) {
         const h = hit('right', dial);
         if (onRing(h)) frequency = ringValue(h);
      }
   };

   inputEvents.onRelease = hand => {
      if (hand === 'left') {
         leftHeld = false;
         locked = false;
         stableTime = 0;
      }
      if (hand === 'right') {
         rightHeld = false;
         stableTime = 0;
      }
   };

   model.animate(() => {
      const t = model.time;
      const dt = Math.min(model.deltaTime || 0, .1);
      leftHit = hit('left', scan);
      rightHit = hit('right', dial);

      if (leftHeld && locked && !completed) {
         const holdRadius = rounds[round].scanRadius * 1.4 + .02;
         if (leftHit && distance(leftHit, signalAt(t)) < holdRadius)
            leftMissTime = 0;
         else if ((leftMissTime += dt) > .18) {
            locked = false;
            stableTime = 0;
            pulse('left', .25, 80);
         }
      }

      // Scanner haptics encode distance to the hidden point; no visible target.
      if (leftHit && !completed && !locked && t >= flashUntil) {
         const error = distance(leftHit, signalAt(t));
         const closeness = 1 - clamp(error / 1.5, 0, 1);
         const interval = .52 - .43 * closeness;
         if (t >= nextLeftPulse) {
            pulse('left', .15 + .65 * closeness);
            tick(160 + 210*closeness, .007);
            nextLeftPulse = t + interval;
         }
      }
      else nextLeftPulse = t;

      // Right-hand pulses accelerate as the circular dial nears its setting.
      if (rightHeld && locked && !completed) {
         const error = Math.abs(frequency - frequencyAt(t));
         const closeness = 1 - clamp(error / .5, 0, 1);
         if (t >= nextRightPulse) {
            pulse('right', .2 + .7 * closeness);
            tick(340 + 360*closeness, .011);
            nextRightPulse = t + .48 - .38 * closeness;
         }
      }
      else nextRightPulse = t;

      // Both hands must stay in place; success does not depend on guessing when
      // to release the right trigger. Later rounds require more precision/time.
      if (!completed && locked && leftHeld && rightHeld && onRing(rightHit) &&
          Math.abs(frequency - frequencyAt(t)) < rounds[round].tuneError &&
          leftHit && distance(leftHit, signalAt(t)) < rounds[round].scanRadius * 1.4 + .02) {
         stableTime += dt;
         if (stableTime >= rounds[round].hold) {
            play('success');
            pulse('right', 1, 120);
            pulse('left', 1, 120);
            startNextRound();
         }
      }
      else stableTime = 0;

      const active = !completed && t > flashUntil;
      scan.color(locked ? [.06,.50,.35] : leftHit ? [.04,.27,.35] : [.025,.16,.23]);
      dial.color(rightHeld ? [.40,.24,.06] : rightHit ? [.29,.16,.045] : [.20,.10,.035]);
      scanLamp.color(locked ? [0,1,.55] : leftHit ? [.1,.6,.75] : [.04,.15,.2]);
      const tuneCloseness = completed ? 0 :
         1 - clamp(Math.abs(frequency-frequencyAt(t))/.5,0,1);
      tuneLamp.color(stableTime > 0 ? [1,1,.65] : rightHeld && locked ?
                     [.35+.65*tuneCloseness,.20+.6*tuneCloseness,.04] : [.32,.16,.04]);

      probe.identity().move(leftHit ? SCAN_X + SCAN_HALF*leftHit[0] : SCAN_X,
                            leftHit ? Y + SCAN_HALF*leftHit[1] : Y, Z+.025)
           .scale(leftHit && active ? .012 : 0);
      lockMark.identity().move(SCAN_X,Y,Z+.028)
              .scale(locked && active ? .08 + .008*Math.sin(8*t) : 0);
      rotor.identity().move(DIAL_X,Y,Z+.025).turnZ(2*Math.PI*frequency);
      pointer.color(rightHeld && locked ? [1,1,.45] : [1,.65,.2]);

      core.color(completed ? [0,1,.55] : t < flashUntil ? [1,1,1] :
                 locked ? [.1,.85,.55] : [.2,.35,.5]);
      core.identity().move(0,Y,Z+.10)
          .scale(completed ? .09 + .008*Math.sin(3*t) :
                 .042 + .035*clamp(stableTime / (completed ? 1 : rounds[round].hold), 0, 1));
      for (let i = 0; i < lights.length; i++)
         lights[i].color(i < round ? [0,1,.5] : i === round && !completed ? [1,.52,.08] : [.12,.16,.2]);
   });
};
