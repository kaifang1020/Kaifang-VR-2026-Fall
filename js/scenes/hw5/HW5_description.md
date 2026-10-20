**Branch:** https://github.com/kaifang1020/Kaifang-VR-2026-Fall/tree/hw5
**Scenes:** `pocketCity` (part 1) and `armLab` (part 2), code in `js/scenes/hw5/`
**Study pages:** https://vr-project.maokaifang.com/arm/study/

**Part 1: Pocket City, teaching the AI by building**

On a model table there is a gold 3×3 lot. I build a small voxel building on it
with the controller: point at a cell, pull the trigger to stack a cube, choose
stone, clay, glass or light from the swatches. That building is the
demonstration. GROW CITY sends it to the AI, which returns four related
buildings for the four blue lots. ENTER CITY redraws the same block data at
human scale, so I can walk into the neighbourhood the AI made from my example.

The AI never writes code. It returns block data in a tiny vocabulary (integer
cells, four materials), and the scene checks every block before drawing it: out
of bounds, duplicated or floating cubes are dropped, and a building with too
few valid cubes fails. What I found: the vocabulary is small enough that the AI
almost always produces something buildable, and the interesting part is
comparing its variations with my example. It sometimes copies too closely, and
sometimes proposes shapes nobody would build; the count of dropped cubes is a
useful measure of how well it understood the rules.

**Part 2: Arm Lab, annotations on the SO101 digital double**

Starting from the SO101 scene, I built the arm from its joint table and STL
parts, drawn at twice life size on a table, and added the information a person
would want while using it to pick something up:

- A label beside every joint with its angle and its range, orange near a limit
  and red at the limit.
- A gripper label in centimetres of jaw opening instead of degrees, because
  that is what matters for grasping. Measuring the STL meshes showed the jaws
  touch at about +12°, although the servo range goes down to −10°: below that
  the model's jaws pass through each other, which a real jaw cannot do, so that
  range is flagged in red.
- A target ball I can place anywhere, with a dashed line from the gripper's
  tool centre point and the real distance in centimetres (the scene is scaled,
  so distances are converted back). Within 3 cm it turns green and says GRAB.

Joints are selected by pointing a beam at their rings and turned with either
thumbstick. The stick direction is made to match what you see: the scene
nudges the motor in forward kinematics, checks where the gripper would move,
and picks the sign so that pushing right moves the gripper to your right.

**Tests:** `node --test js/scenes/hw5/*.test.mjs` (18 tests) run both scenes
with a fake renderer whose nodes keep real matrices.

**Not yet verified in a headset:** the stick directions after the last change,
and Pocket City's street view.
