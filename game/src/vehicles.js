// Cars: arcade driving physics, parked cars, traffic that follows the road
// grid, and the police cars the wanted system spawns. One factory makes every
// car; the driver (player, traffic AI or police AI) only supplies throttle,
// brake and steering each step.
import { CAR_TYPES, HORIZONTAL_ROADS, ROAD_HALF, VERTICAL_ROADS, WORLD } from './config.js';

const CAR_COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#e67e22', '#ecf0f1', '#1abc9c', '#fd79a8', '#95a5a6'];
const TAXI_COLOR = '#f7d117';

let nextId = 1;

export function createCar(x, y, angle, type, color) {
  const spec = CAR_TYPES[type];
  return {
    id: nextId++,
    type, color: color ?? CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
    x, y, angle,
    speed: 0,
    vx: 0, vy: 0,
    health: spec.health, maxHealth: spec.health,
    state: 'parked', // parked | traffic | player | police | wrecked
    driver: null, // a pedestrian id, or 'player', or null
    // Traffic AI.
    target: null,
    cruise: 200,
    stuckTimer: 0,
    reverseTimer: 0,
    // Skid marks and smoke.
    skidTimer: 0,
    smokeTimer: 0,
    siren: false,
  };
}

function specOf(car) {
  return CAR_TYPES[car.type];
}

/** Arcade driving: throttle/brake/steer in [-1, 1]; dt in seconds. */
export function driveCar(car, throttle, brake, steer, dt, city) {
  const spec = specOf(car);
  if (car.state === 'wrecked') {
    car.speed *= Math.max(0, 1 - 3 * dt);
  } else {
    if (throttle > 0) car.speed += spec.accel * throttle * dt;
    if (brake > 0) {
      if (car.speed > 5) car.speed -= spec.brake * brake * dt;
      else car.speed = Math.max(-140, car.speed - spec.accel * 0.6 * brake * dt);
    }
    // Rolling resistance and drag.
    car.speed -= car.speed * 0.35 * dt;
    if (Math.abs(car.speed) < 2 && throttle === 0 && brake === 0) car.speed = 0;
    car.speed = Math.max(-150, Math.min(spec.maxSpeed, car.speed));
    const grip = Math.min(1, Math.abs(car.speed) / 120);
    car.angle += steer * spec.turn * grip * dt * (car.speed >= 0 ? 1 : -1);
  }
  // Velocity chases the heading: the lag is the drift.
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const wantVx = fx * car.speed;
  const wantVy = fy * car.speed;
  const blend = 1 - Math.exp(-6 * dt);
  car.vx += (wantVx - car.vx) * blend;
  car.vy += (wantVy - car.vy) * blend;
  const nx = car.x + car.vx * dt;
  const ny = car.y + car.vy * dt;
  const fixed = city.collideCircle(nx, ny, spec.length * 0.42);
  const hitWall = fixed.x !== nx || fixed.y !== ny;
  if (hitWall) {
    // A hard hit costs speed and health; a scrape just slows the car.
    const impact = Math.abs(car.speed);
    car.speed *= 0.35;
    car.vx *= 0.3;
    car.vy *= 0.3;
    if (impact > 220) car.health -= (impact - 220) * 0.12;
  }
  car.x = fixed.x;
  car.y = fixed.y;
  if (car.health <= 0 && car.state !== 'wrecked') car.state = 'wrecked';
  return hitWall;
}

/** Circle-circle push between two cars; returns true when they collided. */
export function collideCars(a, b) {
  const ra = CAR_TYPES[a.type].length * 0.42;
  const rb = CAR_TYPES[b.type].length * 0.42;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const min = ra + rb;
  if (d >= min || d === 0) return false;
  const push = (min - d) / 2;
  const nx = dx / d;
  const ny = dy / d;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  const rel = Math.abs(a.speed - b.speed);
  a.speed *= 0.6;
  b.speed *= 0.6;
  if (rel > 180) {
    a.health -= (rel - 180) * 0.1;
    b.health -= (rel - 180) * 0.1;
  }
  return true;
}

function randomRoadPoint(random) {
  if (random.chance(0.5)) {
    return { x: random.pick(VERTICAL_ROADS), y: random.range(80, WORLD.height - 80) };
  }
  return { x: random.range(80, WORLD.width - 80), y: random.pick(HORIZONTAL_ROADS) };
}

function nearestIntersection(x, y) {
  let bx = VERTICAL_ROADS[0];
  let by = HORIZONTAL_ROADS[0];
  for (const rx of VERTICAL_ROADS) if (Math.abs(rx - x) < Math.abs(bx - x)) bx = rx;
  for (const ry of HORIZONTAL_ROADS) if (Math.abs(ry - y) < Math.abs(by - y)) by = ry;
  return { x: bx, y: by };
}

/** Pick the next intersection along the grid from the car's current one. */
function nextIntersectionTarget(car, random) {
  const here = nearestIntersection(car.x, car.y);
  const vi = VERTICAL_ROADS.indexOf(here.x);
  const hi = HORIZONTAL_ROADS.indexOf(here.y);
  const options = [];
  if (vi > 0) options.push({ x: VERTICAL_ROADS[vi - 1], y: here.y });
  if (vi < VERTICAL_ROADS.length - 1) options.push({ x: VERTICAL_ROADS[vi + 1], y: here.y });
  if (hi > 0) options.push({ x: here.x, y: HORIZONTAL_ROADS[hi - 1] });
  if (hi < HORIZONTAL_ROADS.length - 1) options.push({ x: here.x, y: HORIZONTAL_ROADS[hi + 1] });
  if (options.length === 0) return { x: here.x, y: here.y };
  return random.pick(options);
}

function steerToward(car, tx, ty) {
  const want = Math.atan2(ty - car.y, tx - car.x);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.max(-1, Math.min(1, diff * 2.2));
}

/** One traffic step: follow the road grid, slow for cars ahead, turn at intersections. */
export function stepTrafficCar(car, dt, city, random, cars) {
  if (car.state !== 'traffic') return;
  if (!car.target || Math.hypot(car.target.x - car.x, car.target.y - car.y) < 70) {
    car.target = nextIntersectionTarget(car, random);
  }
  // Look ahead: brake when another car is close in front.
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let blocked = false;
  for (const other of cars) {
    if (other === car || other.state === 'wrecked') continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * fx + dy * fy;
    const side = Math.abs(dx * -fy + dy * fx);
    if (ahead > 0 && ahead < 130 && side < 36) { blocked = true; break; }
  }
  // Backing out of a jam: reverse briefly, then take another route, so a
  // pile-up at an intersection clears instead of sitting there forever.
  if (car.reverseTimer > 0) {
    car.reverseTimer -= dt;
    const steer = steerToward(car, car.target.x, car.target.y);
    driveCar(car, 0, 1, -steer, dt, city);
    if (car.reverseTimer <= 0) car.target = nextIntersectionTarget(car, random);
    return;
  }
  const steer = steerToward(car, car.target.x, car.target.y);
  const wantSpeed = blocked ? 0 : car.cruise;
  const throttle = car.speed < wantSpeed ? 1 : 0;
  const brake = car.speed > wantSpeed + 20 ? 1 : 0;
  driveCar(car, throttle, brake, steer, dt, city);
  // A car that cannot move for a while — jammed, not just waiting — backs out.
  if (Math.abs(car.speed) < 12) {
    car.stuckTimer += dt;
    if (car.stuckTimer > 2.5) {
      car.reverseTimer = 0.9;
      car.stuckTimer = 0;
    }
  } else {
    car.stuckTimer = 0;
  }
}

/** Seed the city with parked cars (in lots and along roads) and traffic. */
export function spawnInitialCars(state) {
  const { city, random } = state;
  const types = ['sedan', 'sedan', 'taxi', 'sports', 'truck', 'van'];
  // Parked cars: some in parking lots, the rest along road edges.
  let placed = 0;
  for (const spot of city.parkingSpots) {
    if (placed >= 10) break;
    if (!random.chance(0.5)) continue;
    const type = random.pick(types);
    const car = createCar(spot.x, spot.y, random.chance(0.5) ? 0 : Math.PI, type);
    if (type === 'taxi') car.color = TAXI_COLOR;
    state.cars.push(car);
    placed += 1;
  }
  while (placed < 18) {
    const vertical = random.chance(0.5);
    let x;
    let y;
    let angle;
    if (vertical) {
      x = random.pick(VERTICAL_ROADS) + (random.chance(0.5) ? ROAD_HALF - 18 : -(ROAD_HALF - 18));
      y = random.range(120, WORLD.height - 120);
      angle = random.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
    } else {
      x = random.range(120, WORLD.width - 120);
      y = random.pick(HORIZONTAL_ROADS) + (random.chance(0.5) ? ROAD_HALF - 18 : -(ROAD_HALF - 18));
      angle = random.chance(0.5) ? 0 : Math.PI;
    }
    const type = random.pick(types);
    const car = createCar(x, y, angle, type);
    if (type === 'taxi') car.color = TAXI_COLOR;
    state.cars.push(car);
    placed += 1;
  }
  // Traffic on the roads.
  for (let i = 0; i < 14; i += 1) {
    const p = randomRoadPoint(random);
    const vertical = VERTICAL_ROADS.includes(p.x);
    const type = random.pick(types);
    const car = createCar(p.x, p.y, vertical ? (random.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (random.chance(0.5) ? 0 : Math.PI), type);
    if (type === 'taxi') car.color = TAXI_COLOR;
    car.state = 'traffic';
    car.cruise = random.range(170, 240);
    state.cars.push(car);
  }
}

/** Keep traffic near the player: recycle cars that drifted far away. */
export function recycleTraffic(state) {
  const { player, random } = state;
  const px = player.x;
  const py = player.y;
  for (const car of state.cars) {
    if (car.state !== 'traffic') continue;
    if (Math.hypot(car.x - px, car.y - py) > 1600) {
      const p = randomRoadPoint(random);
      // Only respawn near-ish the player, on a road.
      car.x = p.x;
      car.y = p.y;
      car.target = null;
      car.speed = 0;
    }
  }
}

export function nearestCar(state, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of state.cars) {
    if (car.state === 'wrecked') continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}
