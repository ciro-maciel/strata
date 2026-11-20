// One world unit stands for 32 map units of the 1996-era engine this one
// studies, so its constants convert by dividing by 32. Voxels are half a unit
// (16 map units), the size of that engine's lightmap texels.

export const UNIT = 32;
export const VOX = 0.5;

export const PHYS = {
  gravity: 800 / UNIT,
  maxSpeed: 320 / UNIT,
  walkSpeed: 200 / UNIT,
  accelerate: 10,
  airAccelerate: 10,
  airWishCap: 30 / UNIT, // the cap that makes air strafing possible
  friction: 4,
  stopSpeed: 100 / UNIT,
  jumpSpeed: 270 / UNIT,
  stepSize: 18 / UNIT,
};

export const PLAYER = {
  half: 16 / UNIT, // half width of the box
  height: 56 / UNIT,
  eye: 46 / UNIT,
  useRange: 2.2,
};

// Monsters think ten times a second, as they did then; bodies move every frame.
export const THINK = 0.1;

export const MAX_AMMO = { shells: 100, nails: 200, rockets: 50 };
