// Pedestrians: city folk who stroll the sidewalks, cross at corners and run
// for cover when shots ring out or a car comes at them. They make the city
// feel alive, and hitting one is a crime the wanted system remembers.
import { HORIZONTAL_ROADS, VERTICAL_ROADS, WORLD } from './config.js';

const SHIRTS = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#e67e22', '#1abc9c', '#fd79a8', '#ecf0f1', '#f39c12'];
const PANTS = ['#2c3e50', '#34495e', '#7f8c8d', '#5d4037', '#37474f'];

let nextId = 1;

export function createPedestrian(x, y, random) {
  return {
    id: nextId++,
    x, y,
    angle: random.range(0, Math.PI * 2),
    speed: random.range(45, 75),
    shirt: random.pick(SHIRTS),
    pants: random.pick(PANTS),
    // Walking state: 'walk' | 'flee' | 'down' | 'enterCar'
    state: 'walk',
    target: null,
    downTimer: 0,
    fleeTimer: 0,
    bobPhase: random.range(0, Math.PI * 2),
  };
}

function randomSidewalkPoint(random) {
  // Sidewalks run just outside the road edges.
  if (random.chance(0.5)) {
    const rx = random.pick(VERTICAL_ROADS);
    const side = random.chance(0.5) ? 78 : -78;
    return { x: rx + side, y: random.range(60, WORLD.height - 60) };
  }
  const ry = random.pick(HORIZONTAL_ROADS);
  const side = random.chance(0.5) ? 78 : -78;
  return { x: random.range(60, WORLD.width - 60), y: ry + side };
}

export function spawnPedestrians(state, count) {
  for (let i = 0; i < count; i += 1) {
    const p = randomSidewalkPoint(state.random);
    const ped = createPedestrian(p.x, p.y, state.random);
    ped.target = randomSidewalkPoint(state.random);
    state.peds.push(ped);
  }
}

/** Scare every pedestrian near (x, y): they run away from the noise. */
export function scarePedestrians(state, x, y, radius) {
  for (const ped of state.peds) {
    if (ped.state === 'down') continue;
    const d = Math.hypot(ped.x - x, ped.y - y);
    if (d < radius) {
      ped.state = 'flee';
      ped.fleeTimer = 3 + Math.random() * 2;
      const away = Math.atan2(ped.y - y, ped.x - x);
      ped.target = {
        x: ped.x + Math.cos(away) * 300,
        y: ped.y + Math.sin(away) * 300,
      };
    }
  }
}

export function stepPedestrians(state, dt) {
  const { city } = state;
  for (const ped of state.peds) {
    ped.bobPhase += dt * (ped.state === 'flee' ? 14 : 8);
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) {
        ped.state = 'walk';
        ped.target = randomSidewalkPoint(state.random);
      }
      continue;
    }
    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      if (ped.fleeTimer <= 0) {
        ped.state = 'walk';
        ped.target = randomSidewalkPoint(state.random);
      }
    }
    if (!ped.target || Math.hypot(ped.target.x - ped.x, ped.target.y - ped.y) < 24) {
      ped.target = randomSidewalkPoint(state.random);
    }
    const speed = ped.state === 'flee' ? ped.speed * 2.4 : ped.speed;
    const want = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
    let diff = want - ped.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    ped.angle += Math.max(-4 * dt, Math.min(4 * dt, diff));
    const nx = ped.x + Math.cos(ped.angle) * speed * dt;
    const ny = ped.y + Math.sin(ped.angle) * speed * dt;
    const fixed = city.collideCircle(nx, ny, 10);
    ped.x = fixed.x;
    ped.y = fixed.y;
  }
  // Keep the crowd topped up: pedestrians who wandered far away respawn near
  // the player so the streets around the action always feel lived-in.
  if (state.peds.length < 20) {
    const p = randomSidewalkPoint(state.random);
    const ped = createPedestrian(
      Math.max(40, Math.min(WORLD.width - 40, state.player.x + (p.x - state.player.x) * 0.2 + (Math.random() - 0.5) * 600)),
      Math.max(40, Math.min(WORLD.height - 40, state.player.y + (p.y - state.player.y) * 0.2 + (Math.random() - 0.5) * 600)),
      state.random,
    );
    ped.target = randomSidewalkPoint(state.random);
    state.peds.push(ped);
  }
}
