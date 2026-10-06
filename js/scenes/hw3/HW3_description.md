**Branch:** https://github.com/kaifang1020/Kaifang-VR-2026-Fall/tree/hw3
**Scene:** `echoGarden` (code in `js/scenes/hw3/`, see `README.md` there)
**Study guide:** https://vr-project.maokaifang.com/echo-garden/study/

**Echo Garden** is a shared instrument for two people. Each player plants glowing
notes on a panel with the controller beam. A note's height sets its pitch, and
pulling it out of the panel toward you adds an echo. Each player has their own
colour and timbre. When two notes come close, a strand links them and the
link joins a looping melody that both players hear in space, from where the
notes are. A link between the two players' notes is a *duet*, so the garden
sounds best when you compose together: one person plants, the other moves a
note next to it, and the melody changes.

**How to try it:** start the course server, open it on two headsets (or two
browsers), and choose `echoGarden`. Tap the trigger on the panel to plant a
note. Hold the trigger on a note to drag it, and push or pull your hand to
change its depth. Double-tap a note to remove it, or tap CLEAR to empty the
garden. On a desktop, keys 1 and 2 plant notes and R clears.

**Message passing (required).** The garden is one shared object created with
`server.init`. Every change is a message (`plant`, `move`, `remove`, `clear`)
sent with `server.send` and applied on every client in `server.sync`, following
`construct.js`. All clients apply the same messages with the same rules, so
they keep identical gardens. Note ids include the player's id, so two players
clicking at once never collide. Links and the beat are computed locally from
the shared state and the clock, so they agree without extra messages.

**Spatial audio and the beam technique (optional, both used).** Notes are
synthesized with Web Audio. Each note plays through its own HRTF panner at its
3D position, and the listener follows the head. The beam picks the nearest
note the way `beamSphere.js` does. Unlike `beamSphere.js`, the note is chosen
once at the press and kept until the release, so a fast swing cannot drop it.

**What I learned while debugging.** Two browser tabs drifted apart. I traced
this to the framework. A second batch of messages that arrives before the next
frame overwrites the first, and the master's 3-second full-state broadcast could
erase a newer note. `gardenNet.js` fixes both: the inbox appends instead of
replacing, and the periodic broadcast is turned off. I also changed the server
to send each client its own id, because two browsers joining at once could get
the same one. Tests run the real `client.js` in two simulated tabs to check this
(`node --test js/scenes/hw3/*.test.mjs`).

**Not yet verified in a headset:** that sounds stay fixed in space when you turn
your head, and that two headsets play the beat in step.
