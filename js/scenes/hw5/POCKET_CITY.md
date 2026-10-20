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

On a desktop, use arrow keys to select a cell, Space to stack a cube,
Backspace to remove one, 1–4 to select a material, G to generate, and C to
clear. The highlighted cube shows the selected column and next block height.

`pocketCityRules.js` defines the bounded block format and AI prompt. It accepts
only four 3×3 buildings, at most six layers high and 24 supported cubes per
building. Unsupported, duplicate, out-of-range, and floating cubes are dropped;
if too little valid geometry remains, the request fails and the example stays.
The AI never supplies JavaScript code. `pocketCity.js` is responsible for
turning the validated block data into scene geometry.

The first prototype is single-player and uses the course server's local AI
endpoint. It needs the same server-side API key as Coach. Quest interaction and
the visual layout still need a physical headset check.
