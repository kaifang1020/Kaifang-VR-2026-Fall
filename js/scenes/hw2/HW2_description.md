# HW2 — Kaifang Mao

- **Branch:** https://github.com/kaifang1020/Kaifang-VR-2026-Fall/tree/hw2
- **Changes since HW1:** https://github.com/kaifang1020/Kaifang-VR-2026-Fall/compare/hw1...hw2

The game for this assignment is **`fishing`** (first in the scene menu after
`coach`). Its files are in `js/scenes/hw2/`.

---

## Haptic Fishing

Catch 800 points of fish in two minutes, with three fishing lines. You fish by
feel: every fish announces itself through the controller before it bites, and
you have to read that signal to know whether to strike.

### How to play

1. **Start:** pull the front trigger.
2. **Cast:** the rod is in your hand and follows the controller. Pull your hand
   back and throw it toward the pond. The line flies the way your hand moved,
   farther the faster you throw.
3. **Wait and feel.** A fish tests the bait with taps you feel in the
   controller:

   | You feel | It is | Points |
   |---|---|---|
   | 1 tap | Minnow | +100 |
   | 2 taps | Bass | +200 |
   | 3 fast taps | Golden koi | +400 |
   | a long dull rumble | Old boot | −50 — leave it |

   Striking during the taps scares the fish away.
4. **Strike:** the bite is one hard jolt. Pull the trigger at once.
5. **Reel:** keep holding the trigger. Line tension is felt as pulses that get
   faster and stronger, and seen in the bend of the rod, the colour of the
   line and a TENSION bar. When the fish surges, let go, or the line snaps.

**You win** by reaching 800 points. **You lose** if time runs out, if all
three lines snap, or, with several players, if someone else reaches 800 first.

Desktop: Space to start, cast and strike; hold W to reel; R to restart.

### Text in the game

- **Instructions:** a numbered "How to fish" panel, and a chart of the tap
  patterns with each fish's points.
- **Status:** a prompt for every moment of play (e.g. "Something is there -
  hold still!", "STRIKE! Pull the trigger now!", "It is pulling - LET GO!"),
  plus the weight and points of each catch.
- **Score:** score / goal, fish caught, lines left and time left, always shown.
  With several players, a leaderboard and a name and score above every rod.
- **Result:** YOU WIN or YOU LOST with the reason, e.g. "YOU LOST - PLAYER 1
  reached 800 first (400/800, place 2 of 2)".

### Features from class

- **Haptics carry the gameplay.** Identifying the fish, noticing the bite and
  managing line tension are all done through vibration. Different fish have
  different tap counts and rhythms; the boot is a rumble instead of taps.
- **Hierarchical shapes.** The rod is a hierarchy: handle, a reel whose crank
  turns while you reel, and three jointed segments that each bend with the
  load. Each fish is a body with a tail joint that wags, faster when it
  thrashes.
- **Controller beams.** The rod is aligned with the controller's beam, and
  the cast and the strike are read from how the rod moves.
- **GLTF models.** The sunflowers on the bank are loaded from
  `media/gltf/sunflower`.

### Multiplayer

Everyone who opens the scene fishes side by side along the dock and sees the
others' rods, lines, bobbers, names and live scores. Whoever presses START
begins a shared match for everyone after a 3‑second countdown, and the first to
800 wins. Fish, bites and haptics are computed on each player's own headset;
only a small snapshot per player (rod, bobber, state, score) is broadcast, 15
times a second, and smoothed on the receiving side. Each player writes only
their own element of the shared state, so nobody overwrites anybody.

### Music

A lakeside tune synthesized live with WebAudio (no audio files): pentatonic
plucks, soft bass, a shaker, water and birds. It follows your own game: it
steps back while a fish tests the bait so you can count the taps, goes almost
silent on the bite, turns tense and faster while you reel in, and has short
phrases for a catch, a boot or a snapped line, a win and a loss.

### Testing

I played the single-player game on a Quest. Multiplayer was checked with two
browser tabs on the real server, not yet with two headsets. The rules, the
multiplayer rules and the scene wiring are covered by automated tests:

```sh
node --test js/scenes/hw2/fishing.test.mjs
```

---

## Also on this branch

- **`puppetRescue` and `tinyPotionLab`** — two earlier single-player game
  ideas for this assignment, in `js/scenes/hw2/`. Both have instructions,
  score, status and win/loss text.
- **`coach`** — my HW1 scene, which I plan to keep extending every week. It
  now lives in `js/scenes/coach/` and adds scored rounds: a countdown,
  PERFECT / GOOD / MISS grades, a combo multiplier and YOU WIN / YOU LOST with
  a rank. The HW1 version is unchanged as `coachHW1`.
- **`start18.sh`** — the local server script now restarts the server
  automatically if it crashes.
