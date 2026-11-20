// The world: everything the game simulates, owned in one place. It builds the
// city, the player, traffic, pedestrians, pickups and the mission chain, and
// steps them in a fixed order each tick: player, cars, pedestrians, police,
// combat, missions, particles, camera. Events of the tick are collected on
// state.events for the loop to turn into sound and screens.
import { CAMERA, CAR_TYPES, PED_COUNT, PLAYER, WORLD } from './config.js';
import { createRandom } from './random.js';
import { LANDMARKS, createCity } from './city.js';
import { createPlayer, exitCar, stepPlayerOnFoot, tryEnterCar } from './player.js';
import { collideCars, driveCar, recycleTraffic, spawnInitialCars, stepTrafficCar } from './vehicles.js';
import { scarePedestrians, spawnPedestrians, stepPedestrians } from './pedestrians.js';
import { addWanted, clearWanted, policeChasing, stepPolice } from './police.js';
import { explodeCar, fireBullet, spawnParticles, stepBullets, stepEnemies, stepParticles } from './combat.js';
import { missionMarker, objectiveText, stepMissions } from './missions.js';
import { saveGame } from './save.js';

export const EVENT_NONE = 0;

function makeCamera() {
  const camera = {
    x: WORLD.width / 2,
    y: WORLD.height / 2,
    zoom: 1,
    viewWidth: 1280,
    viewHeight: 720,
    screenToWorld(sx, sy) {
      return {
        x: camera.x + (sx - camera.viewWidth / 2) / camera.zoom,
        y: camera.y + (sy - camera.viewHeight / 2) / camera.zoom,
      };
    },
  };
  return camera;
}

export function createWorld(seed, saveData) {
  const random = createRandom(seed);
  const city = createCity(random);
  const player = createPlayer(LANDMARKS.diner.x, LANDMARKS.diner.y + 120);
  if (saveData) {
    player.cash = saveData.cash;
  }
  const state = {
    seed,
    random,
    city,
    player,
    camera: makeCamera(),
    cars: [],
    peds: [],
    bullets: [],
    particles: [],
    skids: [],
    enemies: [],
    pickups: [],
    tokensCollected: saveData ? [...saveData.tokens] : [],
    wanted: 0,
    hideTimer: 0,
    hiding: false,
    nearestPolice: Infinity,
    bustProgress: 0,
    policeSpawnTimer: 0,
    mission: null,
    missionDelay: 0,
    missionsDone: saveData ? saveData.missionsDone : 0,
    missionCompleteBanner: null,
    missionFailReason: null,
    bestCash: saveData ? saveData.bestCash : 40,
    time: 0,
    saveTimer: 30,
    message: '',
    messageTimer: 0,
    shake: 0,
    events: {},
    stats: { carsStolen: 0, shotsFired: 0, missionsDone: 0 },
  };

  spawnInitialCars(state);
  spawnPedestrians(state, PED_COUNT);
  spawnPickups(state);
  // The first job starts a moment after the game begins.
  state.missionDelay = 1.2;
  state.camera.x = player.x;
  state.camera.y = player.y;
  return state;
}

function spawnPickups(state) {
  const { random } = state;
  // Health and ammo near the hospital and the diner; cash scattered around.
  const spots = [
    { kind: 'health', x: LANDMARKS.hospital.x, y: LANDMARKS.hospital.y - 90 },
    { kind: 'health', x: LANDMARKS.diner.x + 120, y: LANDMARKS.diner.y },
    { kind: 'ammo', x: LANDMARKS.garage.x, y: LANDMARKS.garage.y + 90 },
    { kind: 'ammo', x: LANDMARKS.club.x - 120, y: LANDMARKS.club.y },
    { kind: 'cash', x: LANDMARKS.marina.x - 90, y: LANDMARKS.marina.y + 90 },
    { kind: 'cash', x: LANDMARKS.park.x + 60, y: LANDMARKS.park.y - 60 },
    { kind: 'cash', x: 1500, y: 2100 },
    { kind: 'cash', x: 2700, y: 1500 },
  ];
  for (const spot of spots) state.pickups.push({ ...spot, taken: false, bob: random.range(0, 6) });
  // Ten neon tokens hidden around the city for free-roam collectors.
  const tokenSpots = [
    [300, 300], [900, 900], [1500, 300], [2100, 2100], [2700, 900],
    [3300, 1500], [300, 1500], [900, 2100], [2100, 300], [3450, 1200],
  ];
  tokenSpots.forEach(([x, y], i) => {
    state.pickups.push({ kind: 'token', x, y, tokenIndex: i, taken: state.tokensCollected.includes(i), bob: random.range(0, 6) });
  });
}

function stepPickups(state, dt) {
  const player = state.player;
  for (const pickup of state.pickups) {
    if (pickup.taken) continue;
    pickup.bob += dt * 3;
    const d = Math.hypot(player.x - pickup.x, player.y - pickup.y);
    if (d < 34) {
      pickup.taken = true;
      if (pickup.kind === 'health') {
        player.health = Math.min(PLAYER.maxHealth, player.health + 50);
        state.message = 'Health +50';
      } else if (pickup.kind === 'ammo') {
        player.ammo = PLAYER.magSize;
        state.message = 'Ammo refilled';
      } else if (pickup.kind === 'cash') {
        const amount = 50 + Math.floor(Math.random() * 100);
        player.cash += amount;
        state.message = `+$${amount} found`;
      } else if (pickup.kind === 'token') {
        state.tokensCollected.push(pickup.tokenIndex);
        player.cash += 100;
        state.message = `Neon token ${state.tokensCollected.length}/10  •  +$100`;
        state.events.save = true;
      }
      state.messageTimer = 2;
      state.events.pickup = true;
      spawnParticles(state, pickup.x, pickup.y, '#7cff00', 12, 140);
    }
  }
}

function stepCarCollisions(state, dt) {
  const cars = state.cars;
  // Car vs car.
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      if (collideCars(cars[i], cars[j])) {
        const fast = Math.max(Math.abs(cars[i].speed), Math.abs(cars[j].speed));
        if (fast > 200) {
          state.events.crash = true;
          state.shake = Math.max(state.shake, 6);
        }
      }
    }
  }
  // Cars vs pedestrians: a moving car knocks a pedestrian down.
  for (const car of cars) {
    if (Math.abs(car.speed) < 60 || car.state === 'wrecked') continue;
    for (const ped of state.peds) {
      if (ped.state === 'down') continue;
      const d = Math.hypot(ped.x - car.x, ped.y - car.y);
      if (d < 26) {
        ped.state = 'down';
        ped.downTimer = 5;
        spawnParticles(state, ped.x, ped.y, '#ff4444', 8, 160);
        scarePedestrians(state, ped.x, ped.y, 300);
        if (car.state === 'player') {
          addWanted(state, 1, 'hit pedestrian');
          state.events.crash = true;
        }
      }
    }
  }
  // Traffic and police cars hitting the player on foot.
  const player = state.player;
  if (!player.inCar && player.health > 0) {
    for (const car of cars) {
      if (car.state === 'wrecked' || car.state === 'parked') continue;
      const d = Math.hypot(player.x - car.x, player.y - car.y);
      if (d < 26 && Math.abs(car.speed) > 80) {
        player.health = Math.max(0, player.health - 15);
        player.lastHurtAt = state.time;
        state.events.hurt = true;
        state.shake = Math.max(state.shake, 8);
        // Knock the player clear of the car.
        const away = Math.atan2(player.y - car.y, player.x - car.x);
        player.x += Math.cos(away) * 40;
        player.y += Math.sin(away) * 40;
        if (player.health === 0) {
          player.wasted = true;
          state.events.wasted = true;
        }
        break;
      }
    }
  }
  // Wrecked cars explode once.
  for (const car of cars) {
    if (car.health <= 0 && car.state !== 'wrecked') {
      car.state = 'wrecked';
      explodeCar(state, car);
    }
  }
}

function stepSkids(state, dt) {
  for (let i = state.skids.length - 1; i >= 0; i -= 1) {
    state.skids[i].life -= dt;
    if (state.skids[i].life <= 0) state.skids.splice(i, 1);
  }
  if (state.skids.length > 220) state.skids.splice(0, state.skids.length - 220);
}

function stepCamera(state, dt) {
  const player = state.player;
  const camera = state.camera;
  const targetZoom = player.inCar ? CAMERA.driveZoomOut : 1;
  camera.zoom += (targetZoom - camera.zoom) * Math.min(1, 2 * dt);
  let lookX = 0;
  let lookY = 0;
  if (player.inCar && player.car) {
    lookX = player.car.vx * CAMERA.lookAhead;
    lookY = player.car.vy * CAMERA.lookAhead;
  }
  const tx = player.x + lookX;
  const ty = player.y + lookY;
  const blend = 1 - Math.exp(-CAMERA.smoothing * dt);
  camera.x += (tx - camera.x) * blend;
  camera.y += (ty - camera.y) * blend;
  const halfW = camera.viewWidth / 2 / camera.zoom;
  const halfH = camera.viewHeight / 2 / camera.zoom;
  camera.x = Math.max(halfW - 200, Math.min(WORLD.width - halfW + 200, camera.x));
  camera.y = Math.max(halfH - 200, Math.min(WORLD.height - halfH + 200, camera.y));
}

/**
 * One fixed step of the whole simulation. `input` is the input device,
 * `actions` the one-shot flags taken this frame. Returns nothing; the tick's
 * events land on state.events.
 */
export function stepWorld(state, dt, input, actions) {
  state.events = {};
  state.time += dt;
  const player = state.player;

  const api = {
    events: state.events,
    actions,
    fireBullet: (x, y, angle, owner) => fireBullet(state, x, y, angle, owner),
    addWanted: (stars, reason) => addWanted(state, stars, reason),
  };

  // Enter / exit cars.
  if (actions.interact) {
    if (player.inCar) {
      exitCar(state);
    } else {
      const car = tryEnterCar(state, api);
      if (car) state.stats.carsStolen += 1;
    }
  }

  if (player.inCar && player.car) {
    const car = player.car;
    if (car.state === 'wrecked') {
      // A wrecked car throws the player out.
      exitCar(state);
      state.message = 'Your car is wrecked!';
      state.messageTimer = 2;
    } else {
      const throttle = input.moveY() < 0 ? 1 : 0;
      const brake = input.moveY() > 0 ? 1 : 0;
      const steer = input.moveX();
      const hitWall = driveCar(car, throttle, brake, steer, dt, state.city);
      if (hitWall && Math.abs(car.speed) > 150) {
        state.events.crash = true;
        state.shake = Math.max(state.shake, 7);
        scarePedestrians(state, car.x, car.y, 260);
      }
      player.x = car.x;
      player.y = car.y;
      player.angle = car.angle;
      // Skid marks when turning hard at speed.
      if (Math.abs(car.speed) > 300 && Math.abs(steer) > 0.6) {
        car.skidTimer -= dt;
        if (car.skidTimer <= 0) {
          car.skidTimer = 0.06;
          state.skids.push({ x: car.x - Math.cos(car.angle) * 24, y: car.y - Math.sin(car.angle) * 24, angle: car.angle, life: 4 });
        }
      }
      // Smoke when the car is nearly dead.
      if (car.health < 35) {
        car.smokeTimer -= dt;
        if (car.smokeTimer <= 0) {
          car.smokeTimer = 0.12;
          state.particles.push({ x: car.x + Math.cos(car.angle) * 28, y: car.y + Math.sin(car.angle) * 28, vx: 0, vy: -30, life: 0.8, maxLife: 0.8, size: 6, color: '#555555' });
        }
      }
    }
  } else {
    stepPlayerOnFoot(state, dt, input, api);
  }

  // Traffic, pedestrians, police, combat, missions.
  for (const car of state.cars) stepTrafficCar(car, dt, state.city, state.random, state.cars);
  stepPedestrians(state, dt);
  stepPolice(state, dt);
  stepBullets(state, dt);
  stepEnemies(state, dt);
  stepCarCollisions(state, dt);
  stepMissions(state, dt);
  stepPickups(state, dt);
  stepParticles(state, dt);
  stepSkids(state, dt);
  recycleTraffic(state);

  // Gunfire and explosions scare the street and draw the law.
  if (state.events.shot) {
    scarePedestrians(state, player.x, player.y, 500);
    if (state.wanted === 0) addWanted(state, 1, 'shots fired');
    state.stats.shotsFired += 1;
  }
  if (state.events.copDown) addWanted(state, 2, 'officer down');
  if (state.events.pedDown) addWanted(state, 1, 'pedestrian down');
  if (state.events.noise) scarePedestrians(state, state.events.noise.x, state.events.noise.y, state.events.noise.radius);

  if (state.messageTimer > 0) {
    state.messageTimer -= dt;
    if (state.messageTimer <= 0) state.message = '';
  }
  if (state.missionCompleteBanner) {
    state.missionCompleteBanner.timer -= dt;
    if (state.missionCompleteBanner.timer <= 0) state.missionCompleteBanner = null;
  }

  // Autosave every 30 seconds of play, and whenever a mission completes.
  state.saveTimer -= dt;
  if (state.saveTimer <= 0) {
    state.saveTimer = 30;
    saveGame(state);
  } else if (state.events.save) {
    saveGame(state);
  }

  stepCamera(state, dt);
}

/** Respawn after BUSTED or WASTED: a fine, a cleared record, a fresh start. */
export function respawnAfterArrest(state, busted) {
  const player = state.player;
  const fine = busted ? 200 : 150;
  player.cash = Math.max(0, player.cash - fine);
  player.health = PLAYER.maxHealth;
  player.busted = false;
  player.wasted = false;
  player.inCar = false;
  player.car = null;
  player.ammo = PLAYER.magSize;
  const spot = busted ? LANDMARKS.policeStation : LANDMARKS.hospital;
  player.x = spot.x;
  player.y = spot.y + 100;
  state.camera.x = player.x;
  state.camera.y = player.y;
  clearWanted(state);
  state.enemies = [];
  state.bullets = [];
  state.message = busted ? `BUSTED — $${fine} fine` : `WASTED — $${fine} hospital bill`;
  state.messageTimer = 3;
  state.events.save = true;
}

export { missionMarker, objectiveText, policeChasing };
