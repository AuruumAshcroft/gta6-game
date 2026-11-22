// Solmar City — all tuning in one place.
//
// A sun-soaked coastal city: a 7x7 road grid, a beach on the south edge, palm
// trees, low-poly buildings. Distances are metres; the renderer scales to the
// window. Change a number here and the whole game retunes.

export const STEP = 1 / 60; // fixed simulation step, in seconds

// The city grid. Roads are spaced PITCH metres apart; the beach strip and the
// sea sit south of the last road (+Z is south).
export const CITY = {
  blocks: 7,          // blocks per side
  block: 46,          // block size, metres
  road: 14,           // road width, metres
  beach: 46,          // beach strip depth on the south edge
  wall: 2.2,          // collision padding around buildings
};

// The player on foot.
export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 10,
  radius: 0.55,
  height: 1.8,
  health: 100,
  meleeRange: 2.2,
  meleeDamage: 34,
  meleeCooldown: 0.45,
  pistolDamage: 34,
  pistolCooldown: 0.28,
  pistolRange: 90,
};

// Arcade car handling.
export const CAR = {
  accel: 22,          // m/s^2 toward top speed
  brake: 34,          // m/s^2 when reversing / stopping
  reverse: 10,        // m/s^2 in reverse
  maxSpeed: 38,       // m/s forward (~137 km/h)
  maxReverse: 12,
  steer: 1.9,         // steering responsiveness
  grip: 6,            // how fast speed settles toward its target
  radius: 2.4,        // collision radius
};

export const TRAFFIC = {
  cars: 14,
  peds: 22,
  carSpeed: 9,
  pedSpeed: 1.6,
};

// The wanted system.
export const POLICE = {
  maxActive: 4,             // cruisers on the street at most
  chaseSpeed: 40,           // m/s, slightly faster than the player's car
  ramDamage: 8,
  ramCooldown: 1.2,         // seconds between rams
  spawnDistance: 55,        // cruisers appear at least this far away
  despawnDistance: 130,
  decayQuietSeconds: 18,    // no crime this long before stars start to fall
  decayStepSeconds: 9,      // one star per this many quiet seconds
};

// Rico's three jobs, in order. Rewards are dollars.
export const MISSIONS = [
  {
    id: 'getaway',
    title: 'M1 — Getaway Driver',
    brief: 'Rico needs a driver. Steal any car, then reach the marina pickup.',
    objective: 'Steal a car and drive to the marina marker',
    reward: 500,
  },
  {
    id: 'pickup',
    title: 'M2 — The Pickup',
    brief: 'A package waits at the north garage. Grab it on foot, deliver it to the beach bar. The cops are watching — expect heat.',
    objective: 'Pick up the package, then deliver it to the beach bar',
    reward: 800,
  },
  {
    id: 'lose-heat',
    title: 'M3 — Lose the Heat',
    brief: 'The ambush is on. Get to 3 stars, then shake every cop and reach the hideout.',
    objective: 'Reach 3 stars, then lose the cops and reach the hideout',
    reward: 1200,
  },
];

export const PALETTE = {
  sky: 0x8ec9ee,
  sun: 0xfff2d0,
  sand: 0xe8d29a,
  sea: 0x2e7f9e,
  grass: 0x7fae5a,
  asphalt: 0x3a3f46,
  sidewalk: 0x9aa0a8,
  line: 0xf5d76e,
  building: [0xe8b48a, 0xd9a06f, 0xc98f6a, 0xb7c4c9, 0xe0cfa8, 0xa8b8a0],
  glass: 0x2c3e50,
  hud: '#f5f7fa',
  accent: '#ffb400',
  police: '#1c4fd6',
  danger: '#e5484d',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const SAVE_KEY = 'solmar-city.save.v1';
export const BEST_KEY = 'solmar-city.best.v1';
