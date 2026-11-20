// Neon Bay — tuning and world constants. One place for every number the
// rest of the game shares, so balancing is a matter of editing this file.
export const STEP = 1 / 60;
export const SAVE_KEY = 'neon-bay-save-v1';

// World: a sun-soaked coastal city, 3600 x 2600 world units.
export const WORLD = { width: 3600, height: 2600 };
export const ROAD_HALF = 60;
export const VERTICAL_ROADS = [300, 900, 1500, 2100, 2700, 3300];
export const HORIZONTAL_ROADS = [300, 900, 1500, 2100];
// East of this line the city gives way to sand, then the sea.
export const BEACH_X = 3450;

// Player on foot.
export const PLAYER = {
  radius: 13,
  walkSpeed: 170,
  runSpeed: 265,
  maxHealth: 100,
  // Health slowly returns after a calm stretch, up to full.
  regenDelay: 6,
  regenRate: 6,
  magSize: 12,
  reloadSeconds: 1.1,
  fireInterval: 0.13,
  bulletDamage: 34,
};

// Cars: arcade handling, one set of numbers per body type.
export const CAR_TYPES = {
  sedan: { length: 64, width: 30, maxSpeed: 520, accel: 340, brake: 520, turn: 2.6, health: 100, label: 'Sedan' },
  taxi: { length: 64, width: 30, maxSpeed: 500, accel: 330, brake: 520, turn: 2.6, health: 100, label: 'Taxi' },
  sports: { length: 66, width: 30, maxSpeed: 680, accel: 460, brake: 560, turn: 3.0, health: 90, label: 'Sports' },
  truck: { length: 84, width: 34, maxSpeed: 420, accel: 260, brake: 480, turn: 2.1, health: 160, label: 'Truck' },
  police: { length: 66, width: 30, maxSpeed: 640, accel: 440, brake: 580, turn: 3.0, health: 120, label: 'Police' },
  van: { length: 76, width: 32, maxSpeed: 450, accel: 280, brake: 500, turn: 2.2, health: 130, label: 'Van' },
};

export const TRAFFIC_COUNT = 14;
export const PARKED_COUNT = 18;
export const PED_COUNT = 26;
export const PICKUP_COUNT = 8;

// Wanted system: stars 0..5.
export const WANTED = {
  max: 5,
  // Seconds hidden (no police near, no new crime) to drop one star, per level.
  hideSeconds: [0, 5, 8, 12, 16, 20],
  // How far a cop has to be before the player counts as hidden.
  hideDistance: 520,
  // How long an officer must stay close on foot to bust the player.
  bustSeconds: 1.4,
  bustDistance: 30,
  // Fines.
  bustedFine: 200,
  wastedFine: 150,
};

// Camera: smooth follow with a little look-ahead.
export const CAMERA = { smoothing: 5, lookAhead: 0.35, driveZoomOut: 0.9 };

// Palette: a golden-hour coastal city.
export const COLORS = {
  ground: '#c8a06a',
  sidewalk: '#d9c49a',
  road: '#3d4450',
  roadEdge: '#2e3440',
  lane: '#f5d76e',
  beach: '#ecd9a0',
  water: '#2fa8b8',
  waterDeep: '#1d7f96',
  park: '#5da24a',
  parkDark: '#4c8a3c',
  buildingRoof: ['#e8b4b8', '#a8c8e8', '#f2d5a0', '#b8d8b0', '#d8b8e8', '#f0a890', '#9fd8d0'],
  buildingEdge: '#8a6f4d',
  neonSigns: ['#ff2e88', '#00e5ff', '#ffe600', '#7cff00', '#ff6b00'],
};
