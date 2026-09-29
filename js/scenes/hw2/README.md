# HW2: Haptic Fishing, Puppet Rescue & Tiny Potion Lab

Two standalone single-player scenes. Refresh the course app and select
`puppetRescue` or `tinyPotionLab` from its scene menu. In Quest, enter VR,
point a controller beam at **START**, and press the trigger.

## Haptic Fishing

Catch 800 points of fish in two minutes. You have three lines.

- **Start:** pull either front (index-finger) trigger.
- **Cast:** the rod follows your controller. Pull your hand back, then throw it
  forward toward the pond; no button is needed. The line flies out the way your
  hand moved, and farther the faster you throw. It has to land in the pond.
- **Read the taps:** each fish announces itself through the controller before
  it bites. One tap is a minnow (+100), two a bass (+200), three fast taps a
  golden koi (+400). One long dull rumble is an old boot (-50): leave it alone.
- **Strike:** the bite is a hard jolt. Pull the front trigger at once (a quick
  upward flick of the rod also works), then keep holding it to reel in.
  Striking during the taps scares the fish away; waiting too long lets it go.
- **Reel:** hold either front trigger. Tension is felt as pulses that get faster and
  stronger, and seen in the bend of the rod, the colour of the line and the
  TENSION bar. When the fish surges (continuous strong buzz), let go. A line
  held at full tension for a third of a second snaps.
- Desktop: **Space** start / cast / strike, hold **W** to reel, **R** restart.
- Text: title, live score / fish / lines / time, a prompt for every state,
  numbered instructions, a chart of the tap patterns, the weight and points of
  each catch, and YOU WIN / YOU LOST with the reason.

**Several players.** Everyone who opens the fishing scene fishes side by side
along the dock (each player is shown 0.9 m from the next) and sees the others'
rods, lines, bobbers, names and live scores, plus a leaderboard above the title.
Whoever presses START begins a match for everyone after a 3 second countdown
(alone, it starts at once). The first player to 800 wins; the others see who
beat them and their place. A player who arrives within 20 seconds of the start
can still join with the time that is left. Fish, bites and haptics are computed
on each player's own headset; only a small snapshot (rod, bobber, state,
score) is broadcast, 15 times a second, and smoothed on the other side.
`pondSync.js` holds the rules for who is at the pond and when a match runs.

Implementation: the rod is a hierarchy (handle, reel with a turning crank, three
jointed segments that each bend with the load). The bobber is a pendulum on the
rod, a projectile in the air and a float on the water. Fish are small
hierarchies with a wagging tail joint. Sunflowers on the bank are GLTF models.
All rules live in `fishingRules.js`; the scene turns their one-shot events into
haptics, sound and text.

## Puppet Rescue

- Collect 10 stars in 60 seconds. Each star gives 100 points.
- Left controller: aim at the blue handle, hold the trigger, and move the beam.
- Right controller: do the same with the gold handle.
- A hand follows its handle with a short spring-like delay. Touch each star
  with the matching colored puppet hand. Red mines cost a life; you have three.
- The head and feet have fixed supporting strings. Only the two hand strings
  are player-controlled; no additional players are needed.
- Desktop: **Space** starts, **WASD** moves the left handle, **IJKL** moves the
  right handle, and **R** restarts. W/I go up; S/K go down.
- After a win/loss, aim at **PLAY AGAIN** and press the trigger.

Implementation: controller beam → intersection with the stage plane → handle
position → spring-following hand → two-bone IK for the elbow. A swept distance
test between consecutive hand positions detects stars and mines. The body is
supported in place; this is not a full rigid-body or rope simulation.

## Tiny Potion Lab: Wild Brew

Serve three flight-potion orders in 150 seconds. There is no fixed ingredient
sequence: choose a mixture that meets the customer's lift target, stays at or
below 75 heat, and reaches at least 80 mixing. Three lost batches end the game.

- **Blue / LIFT:** +25 lift, +16 heat. **Red / COOL:** -30 heat, -10 lift.
- **Green / VALUE:** +25 quality (+75 sale points), +8 heat, more bubbles.
- New ingredients reduce mixing. Adding extra value means mixing again while
  the reaction continues to heat up.
- **Grab:** aim at a floating crystal, hold the trigger, move over the ring,
  and release. Missing returns the crystal without a penalty.
- **Stir:** with an empty hand, aim near the ring, hold the trigger, and trace
  circles around it. Holding still does nothing. You can stir with one hand
  while adding ingredients or popping bubbles with the other.
- **Pop:** point at a red bubble and tap the trigger before it escapes (7 sec).
  Popping lowers heat by 5. Bubbles become redder just before escaping.
- **Serve:** aim at SERVE and tap the trigger. It turns green when the order is
  satisfied. Bank the batch now, or add green crystals for a higher sale value.
- Heat reaching 100 or a bubble escaping destroys the batch and costs one life.
  Delivered orders and earned points remain intact.
- Every sale gives 100 base points + 3 per quality point + surplus lift points.
- Desktop: **Space** start, **1/2/3** add ingredients, hold **S** to stir,
  **B** pop the oldest bubble, **E** serve, **R** restart.

Implementation: controller rays select crystals and intersect a shared plane.
Stirring measures changes of angle around the cauldron, with a dead zone at the
center and rejection of large pointer jumps. Temperature, mixing, lift, quality,
and timed bubbles are managed in `PotionGame`. Bubbles appear from heat/quality;
they are gameplay objects, not just decoration. No fluid simulation is used.
Brief Web Audio tones and optional controller vibration provide feedback.

## Files and checks

- `fishing.js`, `fishingRules.js`, `pondSync.js`, `fishing.test.mjs`: the fishing scene, its rules, its multiplayer rules and their tests.
- `puppetRescue.js` / `tinyPotionLab.js`: scenes, animation, controller input.
- `gameKit.js`: beam math, cached line-font labels, keyboard controls, sounds.
- `gameRules.js`: timer, lives, reaction/ordering rules, scoring, and rescue targets.
- `games.test.mjs`: rule tests plus scene callback tests with mocked rendering
  and controllers, using the real geometry math.

Run from the project root:

```sh
node --test js/scenes/hw2/games.test.mjs js/scenes/hw2/fishing.test.mjs
```

All three games include instructions, live score/status, explicit win/loss
text, and restart controls. Browser desktop rendering and keyboard play were
checked. Quest controller aiming, comfort/readability, and haptics still need
an actual headset playtest; for fishing, the constants to tune there are
`THROW_SPEED`, `CAST_GAIN`, `CAST_ANGLE` and `STRIKE_SPEED` at the top of `fishing.js`. Only fishing synchronizes
multiplayer state; it was checked with two browser tabs on the real server,
not yet with two headsets. Only fishing loads GLTF assets
(`media/gltf/sunflower`, already in the course repo).
