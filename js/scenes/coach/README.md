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
| `coachAI.js` | Builds the two AI choreography prompts and checks returned poses |
| `coachPromptUI.js` | Browser input panel for text-directed AI routines |
| `coachPromptBoard.js` | In-world panel that shows the submitted prompt and generation status in VR |
| `coachKeyboard.js` | In-world keyboard for writing the AI prompt inside VR with a controller beam |
| `scoreRules.test.mjs` | Rule tests, plus the whole scene run with a fake renderer and clock |

```sh
node --test js/scenes/coach/scoreRules.test.mjs
node --test js/scenes/coach/coachAI.test.mjs
node --test js/scenes/coach/coachPromptUI.test.mjs
node --test js/scenes/coach/coachKeyboard.test.mjs
node --test js/util/aiquery.test.mjs
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

## AI choreography reply

Point at the coach and hold a trigger to record up to four poses, then release
(at least two poses are required). Your phrase begins playing immediately. The
recording player makes one request through the course's `aiquery.js` helper and
the server's `/api/aiquery` route. The AI returns a title and four poses, using
the same body-relative hand coordinates as the recorded poses. The browser
validates and bounds the response before adding it to the shared `coach.mode`.
Both players then see the same loop: your phrase followed by the four-pose AI
reply. Purple coach/stage lighting marks the reply. START scores the combined
routine. DANCE or FITNESS resets to the built-in routine. A new recording
replaces the old one; a late reply from an older request is discarded.

The server needs `OPENAI_API_KEY` in a root `.env` file or its environment. The
key stays on the server and must not be put into browser code. If the request
fails, the recorded phrase still plays and the scene shows `AI UNAVAILABLE`.
The `.env` file is git-ignored. For example, run the course server from the
repository root after creating a local `.env` with `OPENAI_API_KEY=...`.

The second AI path starts in the ordinary browser view of `coach`. Expand the
`AI CHOREOGRAPHY` panel, type a movement idea, and click `GENERATE 8 MOVES`.
The AI generates a complete eight-pose loop; the prompt and the generated
routine are independent of the recorded-gesture duet. Only the final validated
routine is shared, so a computer can submit a prompt while a headset is already
in the same Coach scene. The prompt and its generation status are also shared
and shown on a 3D board beside the coach, including non-English text. The input
panel is ordinary HTML and disappears in immersive VR, so the scene also has an
in-world keyboard: point at `TYPE A PROMPT` beside the coach and pull the
trigger. Point at keys to type, or pick one of four ready-made ideas, then
point at `GO`. The keyboard calls the same generation code as the HTML panel.

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
