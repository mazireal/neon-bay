// The wanted system: stars 0-5, police cars that chase and ram, officers on
// foot who try to bust the player, and the hiding timer that cools the heat
// off when no cop can see the player.
import { CAR_TYPES, WANTED } from './config.js';
import { createCar, driveCar } from './vehicles.js';

export function addWanted(state, stars, reason) {
  const before = state.wanted;
  state.wanted = Math.min(WANTED.max, state.wanted + stars);
  state.hideTimer = 0;
  if (state.wanted > before) {
    state.events.wantedUp = true;
    state.message = reason === 'carjacking' ? 'CARJACKING! The cops are coming.' : 'WANTED LEVEL UP!';
    state.messageTimer = 2.2;
  }
}

function policeTargetCount(wanted) {
  return wanted === 0 ? 0 : Math.min(4, 1 + wanted);
}

function spawnPoliceCar(state) {
  // Appear on a road near the player, just out of sight.
  const { player, random } = state;
  const angle = random.range(0, Math.PI * 2);
  const dist = random.range(700, 1000);
  const x = player.x + Math.cos(angle) * dist;
  const y = player.y + Math.sin(angle) * dist;
  const road = state.city.nearestRoadPoint(
    Math.max(60, Math.min(3540, x)),
    Math.max(60, Math.min(2540, y)),
  );
  const car = createCar(road.x, road.y, Math.atan2(player.y - road.y, player.x - road.x), 'police', '#1e3a5f');
  car.state = 'police';
  car.siren = true;
  car.cruise = 600;
  // Each unit takes a slot around the player — front, back, left, right —
  // so they surround instead of all piling onto the same spot.
  car.pursuitSlot = state.cars.filter((c) => c.state === 'police').length % 4;
  state.cars.push(car);
  return car;
}

function spawnOfficer(state, car) {
  const officer = {
    id: `officer-${state.time.toFixed(2)}-${Math.floor(Math.random() * 1000)}`,
    x: car.x,
    y: car.y,
    angle: 0,
    speed: 240,
    shirt: '#1e3a5f',
    pants: '#101820',
    state: 'chase',
    target: null,
    downTimer: 0,
    fleeTimer: 0,
    bobPhase: 0,
    officer: true,
    bustProgress: 0,
  };
  state.peds.push(officer);
  return officer;
}

function steerToward(car, tx, ty) {
  const want = Math.atan2(ty - car.y, tx - car.x);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.max(-1, Math.min(1, diff * 2.5));
}

export function stepPolice(state, dt) {
  const { player } = state;
  const policeCars = state.cars.filter((c) => c.state === 'police' && c.health > 0);
  const officers = state.peds.filter((p) => p.officer && p.state !== 'down');

  // Keep the right number of police cars on the street.
  if (state.wanted > 0) {
    const want = policeTargetCount(state.wanted);
    if (policeCars.length < want) {
      state.policeSpawnTimer = (state.policeSpawnTimer || 0) - dt;
      if (state.policeSpawnTimer <= 0) {
        spawnPoliceCar(state);
        state.policeSpawnTimer = 1.2;
      }
    }
  }

  // Police cars chase the player from their pursuit slots and try to ram;
  // near a slow player on foot an officer gets out to make the arrest. A
  // unit that gets wedged backs out and re-engages instead of pinning the
  // player forever, so a chase stays a chase.
  for (const car of policeCars) {
    const d = Math.hypot(player.x - car.x, player.y - car.y);
    const slotAngle = player.angle + (car.pursuitSlot || 0) * (Math.PI / 2);
    const tx = player.x + Math.cos(slotAngle) * 130;
    const ty = player.y + Math.sin(slotAngle) * 130;
    const steer = steerToward(car, tx, ty);
    if (car.reverseTimer > 0) {
      car.reverseTimer -= dt;
      driveCar(car, 0, 1, -steer, dt, state.city);
    } else {
      const targetD = Math.hypot(tx - car.x, ty - car.y);
      const throttle = targetD > 60 ? 1 : 0;
      driveCar(car, throttle, 0, steer, dt, state.city);
      if (Math.abs(car.speed) < 25 && d > 150) {
        car.stuckTimer += dt;
        if (car.stuckTimer > 1.2) {
          car.reverseTimer = 0.8;
          car.stuckTimer = 0;
        }
      } else {
        car.stuckTimer = 0;
      }
    }
    if (!player.inCar && d < 120 && officers.length < 2 && Math.abs(car.speed) < 120) {
      spawnOfficer(state, car);
    }
  }

  // Officers run at the player; standing close long enough means BUSTED.
  for (const officer of officers) {
    const d = Math.hypot(player.x - officer.x, player.y - officer.y);
    if (player.inCar) {
      // On foot they cannot catch a car: they give up and head back.
      officer.state = 'walk';
      continue;
    }
    officer.state = 'chase';
    const want = Math.atan2(player.y - officer.y, player.x - officer.x);
    officer.angle = want;
    const speed = officer.speed * (state.wanted >= 3 ? 1.15 : 1);
    const nx = officer.x + Math.cos(want) * speed * dt;
    const ny = officer.y + Math.sin(want) * speed * dt;
    const fixed = state.city.collideCircle(nx, ny, 10);
    officer.x = fixed.x;
    officer.y = fixed.y;
    officer.bobPhase += dt * 14;
    if (d < WANTED.bustDistance && Math.abs(player.x - officer.x) + Math.abs(player.y - officer.y) < 60) {
      officer.bustProgress += dt;
      state.bustProgress = Math.max(state.bustProgress || 0, officer.bustProgress);
      if (officer.bustProgress >= WANTED.bustSeconds) {
        state.player.busted = true;
        state.events.busted = true;
        return;
      }
    } else {
      officer.bustProgress = Math.max(0, officer.bustProgress - dt * 2);
    }
  }
  if (officers.length === 0) state.bustProgress = 0;

  // Hiding: when no police is near and no new crime happens, stars cool off.
  if (state.wanted > 0) {
    let nearest = Infinity;
    for (const car of policeCars) nearest = Math.min(nearest, Math.hypot(player.x - car.x, player.y - car.y));
    for (const officer of officers) nearest = Math.min(nearest, Math.hypot(player.x - officer.x, player.y - officer.y));
    state.nearestPolice = nearest;
    if (nearest > WANTED.hideDistance) {
      state.hideTimer += dt;
      state.hiding = true;
      if (state.hideTimer >= WANTED.hideSeconds[state.wanted]) {
        state.wanted -= 1;
        state.hideTimer = 0;
        state.message = state.wanted === 0 ? 'You lost them. Clean.' : 'Heat cooling off...';
        state.messageTimer = 2;
      }
    } else {
      state.hideTimer = 0;
      state.hiding = false;
    }
  } else {
    state.hiding = false;
    state.nearestPolice = Infinity;
  }

  // Wrecked police cars stay wrecked; clear their sirens.
  for (const car of state.cars) {
    if (car.state === 'wrecked') car.siren = false;
  }
}

export function policeChasing(state) {
  return state.cars.some((c) => c.state === 'police' && c.health > 0);
}

export function clearWanted(state) {
  state.wanted = 0;
  state.hideTimer = 0;
  state.hiding = false;
  // The cops stand down: their cars become parked traffic again.
  for (const car of state.cars) {
    if (car.state === 'police') {
      car.state = 'parked';
      car.siren = false;
      car.speed = 0;
    }
  }
  state.peds = state.peds.filter((p) => !p.officer);
}
