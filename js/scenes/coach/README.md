# Follow the Coach

The ongoing project: one scene that grows a little every week. Each homework
branch (`hw1`, `hw2`, ...) is a snapshot of it at that week's deadline.
`js/scenes/hw1/coach.js` is kept unchanged as the version submitted for HW1;
new work goes here.

## Files

| File | What it holds |
|---|---|
| `coach.js` | The scene: coach body, targets, input, multiplayer state, text |
| `coachRoutine.js` | Pose data, beat lengths, and the pose-index calculation shared with the learning playground |
| `coachClock.js` | Synchronizes the choreography beat to the first connected headset |
| `music.js` | The WebAudio synthesizer and beat-aligned scheduler |
| `scoreRules.js` | Scoring for a round: grades, multiplier, goal, rank, round phases |
| `coachAvatarPose.js` | Full-body partner avatars inferred from head and controllers |
| `scoreRules.test.mjs` | Rule tests, plus the whole scene run with a fake renderer and clock |

```sh
node --test js/scenes/coach/scoreRules.test.mjs
```

## Learn how it works, one step at a time

Open [the Coach playground](../../../coach-playground/index.html) in a desktop
browser while the course server is running: `http://localhost:2026/coach-playground/`.
Lesson 1 lets you pause time, step through the real pose data, change the
`Math.floor(time / (2 * beat))` formula, and immediately see its effect. The
page is separate from the VR scene, so experiments there do not change the game.

The complete scene follows this order every frame:

1. Quest tracking reaches the page through WebXR; `clientState` and
   `inputEvents` provide headset and controller positions.
2. `coachClock.js` chooses a shared time, then `coachRoutine.js` chooses a pose.
3. `coach.js` places hand targets relative to the player's head and uses the
   controller positions to judge whether the player reached them.
4. The renderer draws the coach and targets; `music.js` schedules sounds;
   shared `coach` state sends mode, choreography, scores, and beat time to peers.

## Versions

| Week | Branch | Added |
|---|---|---|
| 1 | `hw1` | Mirror the coach, dance and fitness modes, beat haptics, synthesized music, choreography recording, shared combo, partner avatars |
| 2 | `hw2` | Scored rounds: START, countdown, PERFECT / GOOD / MISS, multiplier, shared scores, YOU WIN / YOU LOST with a rank; music and scoring split into modules |

## Ideas for later weeks

Ordered roughly by how much they add for the work involved.

1. **Per-player lights and partner haptics.** A lamp per player beside the
   podium, green or red after every pose, and a light tap on your controllers
   when your partner lands a pose.
2. **Two-player moves.** High-five (both players' controllers meet on the
   beat), and split poses where the coach assigns a squat to one player and a
   press to the other.
3. **Songs as data.** A song is a tempo, a chord progression and a pose chart
   with poses of different lengths (one beat, two beats, a four-beat hold).
   Adding a routine then means adding a data file, not editing the scene.
4. **Difficulty.** Easy / normal / hard change the tempo, the target size
   (`TOL`) and how early a hit must be for PERFECT.
5. **Moving targets.** Trace an arc or a circle with a hand instead of holding a
   pose, judged along the path.
6. **A better-looking coach and stage.** A GLTF character or stage set, lights
   that follow the combo, a floor that pulses with the kick drum.
7. **Workout summary.** Squat count, total hand travel and a rough activity
   score at the end of a fitness round.
8. **High scores.** Best score per routine, kept in the scene's persistent
   shared state so it survives between sessions.
