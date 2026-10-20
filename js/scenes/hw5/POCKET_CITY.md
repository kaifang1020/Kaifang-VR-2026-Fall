# Pocket City — Assignment 5 prototype

The player builds one 3×3 voxel building on the gold lot. The AI receives that
building as a list of cubes and returns four related buildings for the blue
lots. The scene renders the returned cubes as actual 3D geometry. The point of
the experiment is to compare the demonstrated structure with its variations,
including cases where the AI copies too closely or makes an implausible form.

In Quest, open `pocketCity`. Point a controller beam at a cell in the gold lot
and pull the trigger to add one cube. Point at the STONE, CLAY, GLASS, or LIGHT
swatches to change material; ERASE removes the top cube in a column. After
placing at least four cubes, point at GROW CITY and press the trigger. Another
example can be built afterward; generating again replaces the old AI district.
The thin colored tile shows the cell each controller is pointing at. Buttons
brighten when aimed at. Placing a block displays its cell and the updated block
count; aiming outside the gold lot displays an explicit no-target message. The
controller gives a short vibration on a press when supported.

In table mode, push the **right thumbstick up** to enlarge the build surface,
or down to return toward its original size (1.0–2.3×). The gold example lot
stays anchored while the grid and cubes grow; the action buttons stay in place.
The SCALE readout shows the current setting. Controller picking uses the same
zoom transform as the drawing, so the highlighted cell and trigger hit match.
On desktop, `+`/`-` adjust scale and `0` resets it. GROW CITY is purple and
ENTER CITY is green, apart from the four material swatches.

Zoom makes small cells easier to aim at, but a tall stack can still hide a cell
directly behind it. A future overhead or grid-cursor selection mode could
make every cell reachable without moving the player's head.

While the AI request runs, GROW CITY pulses, a marker travels under it, and
the status shows elapsed seconds. This is an activity indicator, not a percent:
the AI endpoint does not report partial progress. The button turns green when
the city is ready and red if the request fails or the example is too small.

After generation, press ENTER CITY (or V on desktop). The table disappears
and the same block data is drawn again at human scale around a central open
space. Each cube is 0.55 m wide instead of 0.09 m. Look around the district;
point at BACK TO TABLE and trigger (or press V/Escape) to return and keep
editing. ENTER CITY stays unavailable until AI has made the neighboring
buildings. This first scale-switching framework does not yet include virtual
walking, collision, or teleportation. A Quest wearer can physically move
within their safe play area.

On a desktop, use arrow keys to select a cell, Space to stack a cube,
Backspace to remove one, 1–4 to select a material, G to generate, and C to
clear. The highlighted tile shows the selected column and next block height.

`pocketCityRules.js` defines the bounded block format and AI prompt. It accepts
only four 3×3 buildings, at most six layers high and 24 supported cubes per
building. Unsupported, duplicate, out-of-range, and floating cubes are dropped;
if too little valid geometry remains, the request fails and the example stays.
The AI never supplies JavaScript code. `pocketCity.js` is responsible for
turning the validated block data into scene geometry.

The first prototype is single-player and uses the course server's local AI
endpoint. It needs the same server-side API key as Coach. The current
interaction changes have automated ray-picking and generation-state tests;
they still need a physical Quest check.
