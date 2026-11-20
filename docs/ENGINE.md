# How the engine works

Strata studies the engine design of the 1996-era 3D shooters, whose
best-known example had its source code released under the GPL in 1999 and
has been studied by its community ever since. This file describes that
design, then what Strata kept, what it changed and why.

Strata copies no code, art, sound, level, name or character from any game.
Everything here was written for this project. Numbers from the old engine
(speeds, damage rules) are facts and are used as such, converted to world
units: one world unit is 32 map units.

## 1. What the 1996-era engine did

### Real 3D, built from brushes

Levels were drawn as **brushes**: convex solid blocks. Any room could sit
above another, floors could slope, and the map compiler turned the brushes
into a **binary space partition** tree of convex empty spaces ("leaves").

### Visibility: PVS

For every leaf, the compiler precomputed which other leaves could possibly
be seen from it: the **potentially visible set**. At run time the renderer
drew only the leaves in the current leaf's set, which is how a software
renderer kept large 3D levels fast.

### Lightmaps

A light compiler cast rays from every light entity to a grid of sample
points on every surface, one sample every 16 map units, and stored the
result as small **lightmaps**. At run time each surface was drawn with its
texture multiplied by its lightmap ("surface caching"). Light fell off
linearly to zero at a radius set per light, and a sample a light could not
see got nothing from it, which is what made shadows. Values went above
"full" brightness ("overbright"), and the palette had 64 light levels, so
gradients came in visible bands. Models were not lightmapped: each one took
a single light value from the lightmap under its feet.

### Liquids and sky

Water, slime and lava were drawn with a **turbulence** warp: each texture
coordinate was offset by a sine of the other coordinate and the time. The
sky was two layers, a solid back one and a front one with holes, projected
onto a flattened dome around the viewer and scrolled at different speeds.

### Movement

The player is a box 32 by 32 by 56 map units. Each frame:

- On the ground: **friction** (4) slows the player, with a floor speed of
  100 so stopping is quick, then **acceleration** (10) pushes toward the
  wish direction up to the maximum speed (320).
- In the air: the same acceleration, but the speed allowed toward the wish
  direction is capped at **30**. The cap limits the speed *along* the wish
  direction, not the speed itself, so wishing almost sideways while turning
  keeps adding speed: **air strafing**, and jumping again on landing to skip
  ground friction is **bunny hopping**. Both were accidents that became the
  heart of the game's movement.
- Gravity is 800 per second squared, a jump starts at 270 (about 45 units
  high), and steps up to **18** units are climbed by trying the move again
  from higher up.

### Damage and knockback

Every hit pushes its target away from the source by **8 map units per
second per point of damage**. An explosion damages everything it can see
by its damage minus half the distance; the one who fired takes half. Fire a
rocket at your feet while jumping and the push throws you far higher than
a jump: the **rocket jump**. Armor absorbs a fixed share of each hit (30%,
60% or 80% by type) until it runs out.

### Monsters and entities

Entities were scripted in a small language (QuakeC): each has `think`
functions called at set times, usually ten times a second for monsters.
Monsters chased with a step toward the goal, trying other directions when
blocked, never stepping off ledges. They woke when they saw the player or
heard gunfire, fought each other when hurt by another kind, and broke apart
into gibs past a damage threshold. Models were meshes with per-frame vertex
animation.

## 2. What Strata does

| 1996-era engine | Strata | Why |
|---|---|---|
| Brushes and a BSP tree | A voxel grid of half-unit cells, carved and filled by a short program (`src/levels.js`) | A level is code anyone can read; the same grid drives drawing, collision, sight and light |
| Sloped floors | Stairs of half-unit steps | Voxels have no slopes; the steps sit under the 18-unit step limit |
| PVS and a software renderer | Greedy-meshed voxel faces, one mesh per texture, drawn by the GPU (`src/mesh.js`) | A GPU draws the whole level faster than a PVS would save |
| Lightmaps every 16 units | A light **volume** with one sample every 16 units (one per voxel), baked with the same linear falloff and shadow rays (`src/lighting.js`), read by the world shader | Same look, and it also lights models where they stand |
| Overbright, 64-level banding | Light stored at half and doubled in the shader, quantized to 32 steps | Kept |
| Models lit from the floor | Models lit by the volume at their position | Kept, more precise |
| Dynamic lights from rockets and muzzle flashes | Six dynamic lights in the world shader | Kept |
| Turbulent liquids, two-layer sky | Kept, as two small shaders | Kept |
| Movement: friction, acceleration, air cap, gravity, jump, step | Kept with the same numbers (`src/physics.js`), tested | It is the feel of the genre |
| Air strafing and bunny hopping | Kept, and a test proves the speed gain | It is the feel of the genre |
| Knockback, splash, self-damage, rocket jumps | Kept with the same rules | It is the feel of the genre |
| Armor share by type | Two armors, 30% and 60% | Two are enough for one level |
| QuakeC think functions at 10 Hz | JavaScript state machines thinking at 10 Hz, moving every frame (`src/monsters.js`) | Same rhythm, smooth motion |
| Vertex-animated meshes | Box models with jointed limbs animated in code (`src/models.js`) | No model files to make or license |
| Particles | Kept: one point cloud for blood, smoke, sparks, explosions | Kept |
| PAK files with art and sound | No asset files: textures, models and sounds are generated in code | Nothing to license, the repository stays tiny |

## 3. Units

| | Map units | Strata (world units) |
|---|---|---|
| Player box | 32 × 32 × 56 | 1 × 1 × 1.75 |
| Highest step | 18 | 0.56 |
| Ground speed | 320 per second | 10 |
| Gravity | 800 per second² | 25 |
| Jump speed | 270 per second | 8.44 |
| Lightmap sample, voxel | 16 | 0.5 |
| Rocket speed | 1000 per second | 31 |

## 4. Where to look in the code

| File | What it does |
|---|---|
| `src/levels.js` | The level as a program, and the entity list |
| `src/voxels.js` | The grid, materials, box tests and the 3D ray march |
| `src/physics.js` | Collision, steps, movement rules, knockback, doors and plats |
| `src/lighting.js` | Light baking and the light at a point |
| `src/mesh.js` | Greedy meshing and the world, liquid and sky shaders |
| `src/monsters.js` | Monster types and their decisions |
| `src/models.js` | Monster, item and weapon models |
| `src/particles.js` | Particles |
| `src/main.js` | Player, weapons, projectiles, damage, screens, input |

`voxels.js`, `physics.js`, `lighting.js` and `levels.js` do not import
three.js, so `node --test test/*.test.js` runs them without a browser.
