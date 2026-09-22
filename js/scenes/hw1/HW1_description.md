# HW1 — Kaifang Mao

- **Branch:** https://github.com/kaifang1020/Kaifang-VR-2026-Fall/tree/hw1
- **Changes only:** https://github.com/kaifang1020/Kaifang-VR-2026-Fall/compare/main...hw1

Scenes for this assignment live in `js/scenes/hw1/`. Personal experiments are
kept separate in `js/scenes/playground/` so they are easy to skip.

---

## Main scene — `coach`

`js/scenes/hw1/coach.js`

A half-scale coach stands on a podium and changes pose every two beats. You face
it and mirror it: raise the hand on your left when it raises the hand on yours.
Two target spheres float in front of you (red = left, blue = right), and you
score by putting a controller inside each one. A fitness mode adds squats,
detected from headset height.

The scene leans on all four capabilities from class:

**Haptics as a channel, not a garnish.** Both controllers tick on every beat,
harder on the beat that changes pose, so you can hold the rhythm without
looking. One beat before a change, only the hand that has to travel far buzzes —
a "get ready" cue. As a hand closes on its target the pulse rate rises like a
Geiger counter, with a distinct click on arrival.

**Controller beams.** Point at the note or dumbbell icon and pull the trigger to
switch mode for everyone. Point at the coach and hold the trigger to enter
choreography mode: the coach's arms follow your hands live, a pose is captured
every two beats, and after four poses it loops your routine for the other player
to mirror.

**Multiplayer press / drag / release.** The beat comes from the system clock, so
every client sees the same pose without syncing animation. Shared state is split
per element, so each player broadcasts only their own score and nobody
overwrites anyone. Eight combo beads light when everyone hits the same beat;
filling all eight sets off fireworks.

**Animated object hierarchies.** The coach is built entirely from primitives,
with both arms and legs solved by two-link IK (`cg.ik2`) from hand and foot
targets, plus layered bob, sway and jump.

There is no animation data and no audio file. Poses are interpolated at runtime,
and both soundtracks are synthesized live with WebAudio — oscillators for kick
and bass, filtered noise for the drums — scheduled against the same clock that
drives motion and haptics, so all three stay locked together. The arpeggio opens
up as your combo grows.

With no headset connected, a pair of ghost hands demonstrates the routine so the
scene can still be previewed on desktop.

---

## Second scene — `marionette`

`js/scenes/hw1/marionette.js`

A puppet hangs from five strings — head, both hands, both feet — each ending in
a grab handle above the stage. Point a beam at a handle to highlight it, hold
the trigger to drag it, release to let that limb fall slack.

String tension drives colour and haptics together: the tighter a string, the
redder it turns and the harder that controller buzzes, and pulling too far snaps
it out of your grip with a sharp jolt. When a foot lands on the stage, whoever
is holding it feels the thump. Built for two players, one on each side of the
puppet.

---

## Third scene — `signalRoom`

`js/scenes/hw1/signalRoom.js`

A two-handed calibration puzzle where haptics, not graphics, tell you where the
targets are. Sweep the left beam across the scanner panel and the pulses quicken
as you near an invisible signal; hold the trigger to lock it. With the right
hand, trace the orange ring until the pulse rate tells you the frequency
matches. Hold both steady while the core lights and the round completes.

Three rounds, each tighter than the last — by the third the transmission also
drifts slowly off-frequency, so you have to keep correcting.

---

## Also included

`js/scenes/playground/`

- **`tentacle`** — a personal experiment. An IK-driven creature that reads how
  fast your hand approaches as trust or fear: move slowly and it reaches for
  you, move sharply and it recoils and reddens. It will also chase a controller
  beam like a cat after a laser pointer.
- **`myFirst`** and **`myWorld`** — the in-class warm-ups on animated object
  hierarchies.

## Non-scene commits

Two small commits are separated out so they are easy to skip:

- `start18.sh` / `start-local.js` pin the local server to Node 18, because the
  bundled express version crashes on Node 26.
- One line in `js/immersive-pre.js` disables the desktop webcam init, which pops
  a permission prompt these scenes never use.
