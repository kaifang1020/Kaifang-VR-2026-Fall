# Echo Garden (HW3)

Two people compose one spatial instrument. Each player plants notes on a shared
panel with a controller beam. A note's **height** sets its pitch, its **depth**
(how far it is pulled out of the panel) sets its echo, and each player has their
own **colour and timbre**. Notes that come close are linked, and the links play
as a looping melody, heard from where the notes are. A link between the two
players' notes is a *duet*, so the garden sounds best when both compose together.

Interactive study guide (seven levels, runs this code in the browser):
https://vr-project.maokaifang.com/echo-garden/study/

## Running it

1. Start the course server: `sh start18.sh` (from the repository root). It
   prints the address for the headset, e.g. `http://10.17.90.115:2026`.
   Restart it after pulling this branch, because `server/main.js` changed.
2. Both participants open that address and choose **echoGarden** from the
   scene menu. The score line shows `YOU #id`; the two players must have
   different ids.
3. Sound starts after the first trigger press or key press (browsers block
   audio until the user does something). Headphones make the spatial sound
   much clearer.

## Controls

| In the headset | |
|---|---|
| Point at the panel, tap the trigger | plant a note |
| Point at a note, hold the trigger, move the beam | move it; the note plays when its pitch changes |
| While holding, push the hand forward or pull it back | pull the note out of the panel or push it back (more echo when far) |
| Point at a note, double-tap the trigger | remove it |
| Point at `CLEAR`, tap | empty the garden |

On a desktop: `1` and `2` plant preview notes of the two colours, `R` clears.

## How it works

**Shared state and message passing.** The whole garden is one object,
`window.echoGarden = {seeds: {id: {pos, owner, color}}}`, created with
`server.init`. Nobody edits it directly. Every change is a message
(`plant`, `move`, `remove`, `clear`) sent with `server.send` and delivered
with `server.sync`, as in the course's `construct.js`. Every headset applies
the same messages with the same pure function, `applyGardenMessage` in
`echoGardenRules.js`, so all copies stay identical. Messages carry absolute
values (a move says where the note *is*), so applying one twice does no harm.
Note ids combine the owner, the time and a counter, so two players clicking at
the same moment cannot create the same id (in `construct.js` they can).

**Derived, not sent.** Links (`gardenLinks`) and the beat are computed on each
headset from the shared garden and the wall clock (`beatNumber`, every 0.5 s),
so both headsets draw the same strands and play the same link on the same beat
without any extra messages.

**Reliable sync (`gardenNet.js`).** Testing with two browser tabs showed the
gardens drifting apart. Two causes were found in the course framework, with a
test that runs the real `server/client.js` in two simulated tabs:

1. An incoming batch of messages is stored with a plain assignment, so a second
   batch that arrives before the receiver's next frame replaces the first. A
   hidden tab runs no frames and kept only the last batch. Fix: each inbox gets
   a setter that appends instead of replacing.
2. The master client broadcast its whole garden every 3 s, and a slightly old
   copy could erase a note it had not received yet. Fix: `server.syncInterval(-3)`
   (still saved to storage, no longer broadcast); `dispose()` restores it.

A late joiner asks the players already in the scene for a snapshot, and a
0.5 s timer keeps `sync` running when a browser pauses a hidden tab.

**Framework changes.** Two small fixes outside this folder:
`server/main.js` sends each browser its own client id, and `server/client.js`
waits for it, instead of guessing it from the last entry of the client list
(two browsers joining together could get the same id). `server.sync` also
accepts an optional interval argument.

**Pointing and grabbing (the beam technique).** As in `beamSphere.js`, a note
is "under the beam" when its projection onto the beam is within 8.5 cm, and
notes behind the controller are ignored. Unlike `beamSphere.js`, the note is
chosen once, at the press, and remembered until the release, so a fast swing
cannot drop it and sweeping the beam does not pick up other notes. Moves are
sent at most every 0.05 s.

**Spatial audio.** Notes are synthesized with Web Audio, with no sound files:
a sine (player A) or triangle (player B) oscillator, a short envelope, and two
quieter echoes for notes far back in the panel. Each note gets its own HRTF
`PannerNode` at its position, with an inverse distance model. The listener
follows the head every frame (`gardenAudio.js`), so a note stays where you see
it when you turn. Pitches come from a pentatonic scale, so any combination of
notes sounds consonant.

## Files

| File | |
|---|---|
| `echoGarden.js` | the WebXR scene: input, drawing, sound |
| `echoGardenRules.js` | pure rules: messages, clamping, links, pitch |
| `gardenNet.js` | reliable message passing on top of `server.send/sync` |
| `gardenAudio.js` | listener pose from the head matrix, the shared beat |
| `*.test.mjs` | tests, including two simulated tabs running the real `client.js` |

Run the tests: `node --test js/scenes/hw3/*.test.mjs`

## Not yet tested in a headset

Developed without a headset. Two things need checking on a Quest: that a note's
sound stays fixed in space when you turn your head, and that two headsets play
the beat in step (this relies on the devices' clocks agreeing to within a few
tens of milliseconds).
