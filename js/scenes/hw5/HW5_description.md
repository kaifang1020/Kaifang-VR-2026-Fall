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
few valid cubes fails. The vocabulary is small enough that the AI almost always
produces something buildable; the interesting part is comparing its variations
with my example. It sometimes copies too closely, and sometimes proposes shapes
nobody would build. The count of dropped cubes is a useful measure of how well
it understood the rules.

This version is a rough first draft. What I plan to do next:

- Give the AI more context than the block list: the layout of the lots, which
  side faces the player, what the street between them is for.
- Let it iterate on its own output: generate, then ask it to critique the four
  buildings against the example and revise them, for a few rounds, with the
  scene validating every round. This borrows the idea of recursive
  self-improvement; I don't know yet whether a few rounds of self-critique
  actually make the buildings better or just different, which is exactly what
  I'd like to measure.
- Polish the materials, lighting and the street view, and add a way to move
  around the district.

**Part 2: Arm Lab, annotations on the SO101 digital double**

Starting from the SO101 scene, I built the arm from its joint table and STL
parts, drawn at twice life size on a table, and added:

- A label beside every joint with its angle and its range, orange near a limit
  and red at the limit.
- A gripper label in centimetres of jaw opening instead of degrees, because
  that is what matters for grasping.
- A target ball I can place anywhere, with a dashed line from the gripper's
  tool centre point and the real distance in centimetres (the scene is scaled,
  so distances are converted back). Within 3 cm it turns green and says GRAB.
- Controller input: joints are selected by pointing a beam at their rings and
  turned with either thumbstick.

Two problems I ran into:

- The gripper seemed to rotate "too far": at small angles the moving jaw passes
  through the fixed jaw, as if the model had no walls. Measuring the STL meshes
  showed the jaws actually touch at about +12°, while the URDF lets the servo go
  down to −10°. On the real robot that extra range is just squeezing force; in
  the digital double there is no collision, so the jaws visibly interpenetrate.
  I now flag that range in red as JAWS OVERLAP and show the opening in cm only
  above the contact angle. It made me realise that URDF limits describe what
  the motor may be commanded, not what the parts can physically do.
- The thumbstick felt reversed: pushing right turned the base so the gripper
  swung left. Each motor's positive direction is whatever its frame in the URDF
  says (the base frame is mounted upside down). The fix: nudge the motor in
  forward kinematics, see where the gripper would move, and pick the sign so
  the stick and the gripper agree.

**Tests:** `node --test js/scenes/hw5/*.test.mjs` (18 tests) run both scenes
with a fake renderer whose nodes keep real matrices.
