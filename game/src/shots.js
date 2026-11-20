// The screenshot scenes behind ?shot=start|drive|chase|mission. Each one
// plays the real rules forward from a fresh world for a fixed time, steered
// by a small autopilot (walk to the nearest parked car, steal it, drive a
// waypoint loop; or walk into the park and shoot the Vipers), so the frame
// is what a short game really looks like. The same seed gives a similar
// frame every time.
import { HORIZONTAL_ROADS, STEP, VERTICAL_ROADS } from './config.js';
import { stepWorld } from './world.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { LANDMARKS } from './city.js';
import { addWanted } from './police.js';

const START_SECONDS = 4;
const DRIVE_SECONDS = 30;
const CHASE_SECONDS = 22;
const MISSION_SECONDS = 3;

// A scripted stand-in for the keyboard and mouse: the autopilot sets the
// axes and the pointer each tick, the world reads them like real input.
function makePilot() {
  let mx = 0;
  let my = 0;
  let running = false;
  let mX = 640;
  let mY = 360;
  let mDown = false;
  return {
    setMove(x, y) { mx = x; my = y; },
    setRun(value) { running = value; },
    setMouse(x, y, down) { mX = x; mY = y; mDown = down; },
    stop() { mx = 0; my = 0; running = false; mDown = false; },
    input: {
      moveX: () => mx,
      moveY: () => my,
      run: () => running,
      handbrake: () => false,
      mouse: () => ({ x: mX, y: mY, down: mDown }),
    },
  };
}

function angleDiff(want, have) {
  let diff = want - have;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

// Drive the player's car toward a point. The car only turns once it is
// rolling, so a stopped car facing away from the road backs up first —
// reversing moves it toward the target while the nose swings around —
// instead of charging forward off the road. Fast into a sharp turn, it
// brakes first so the arc stays on the road.
function driveToward(state, pilot, tx, ty) {
  const car = state.player.car;
  const diff = angleDiff(Math.atan2(ty - car.y, tx - car.x), car.angle);
  const steer = Math.max(-1, Math.min(1, diff * 2.2));
  if (Math.abs(diff) > 1.5 && Math.abs(car.speed) < 80) {
    // Back up: steering is flipped in reverse, so the negated steer swings
    // the nose toward the target.
    pilot.setMove(-steer, 1);
  } else if (Math.abs(diff) > 0.6 && Math.abs(car.speed) > 220) {
    pilot.setMove(steer, 1);
  } else {
    pilot.setMove(steer, Math.abs(diff) < 1.1 ? -1 : -0.45);
  }
  pilot.setRun(false);
}

// Route along the road grid, intersection to intersection, like the traffic
// does: first to the nearest intersection, then one grid step at a time
// toward the target intersection, so the car never cuts across blocks.
function nearestIntersection(x, y) {
  let bx = VERTICAL_ROADS[0];
  let by = HORIZONTAL_ROADS[0];
  for (const rx of VERTICAL_ROADS) if (Math.abs(rx - x) < Math.abs(bx - x)) bx = rx;
  for (const ry of HORIZONTAL_ROADS) if (Math.abs(ry - y) < Math.abs(by - y)) by = ry;
  return { x: bx, y: by };
}

function buildRoute(x, y, tx, ty) {
  const route = [];
  const start = nearestIntersection(x, y);
  route.push(start);
  let cx = start.x;
  let cy = start.y;
  while (cx !== tx) {
    const vi = VERTICAL_ROADS.indexOf(cx);
    cx = VERTICAL_ROADS[vi + (tx > cx ? 1 : -1)];
    route.push({ x: cx, y: cy });
  }
  while (cy !== ty) {
    const hi = HORIZONTAL_ROADS.indexOf(cy);
    cy = HORIZONTAL_ROADS[hi + (ty > cy ? 1 : -1)];
    route.push({ x: cx, y: cy });
  }
  return route;
}

// Walk toward a point at a run.
function walkToward(state, pilot, tx, ty) {
  const player = state.player;
  const dx = tx - player.x;
  const dy = ty - player.y;
  const len = Math.hypot(dx, dy) || 1;
  pilot.setMove(dx / len, dy / len);
  pilot.setRun(true);
}

function nearestParkedCar(state, tx, ty) {
  const player = state.player;
  let best = null;
  let bestD = Infinity;
  let aligned = null;
  let alignedD = Infinity;
  for (const car of state.cars) {
    if (car.state !== 'parked') continue;
    const d = Math.hypot(car.x - player.x, car.y - player.y);
    if (d < bestD) { bestD = d; best = car; }
    // Prefer a car already pointing toward the drive, so the scene opens
    // with driving, not a U-turn in a tight spot.
    if (tx !== undefined) {
      const want = Math.atan2(ty - car.y, tx - car.x);
      const facing = Math.cos(want - car.angle);
      if (facing > 0.2 && d < 1200 && d < alignedD) { alignedD = d; aligned = car; }
    }
  }
  const car = aligned || best;
  return { car, dist: car === aligned ? alignedD : bestD };
}

// Steal the nearest parked car, then drive a waypoint loop along the road
// grid. `heat` adds wanted stars once the player is behind the wheel. A car
// boxed in by traffic reverses out, and the scene settles on a frame where
// the car is moving fast, so the shot shows driving, not a traffic jam.
function runDriveScene(state, seconds, heat, waypoints) {
  const pilot = makePilot();
  let waypoint = 0;
  let heated = false;
  let route = null;
  let routeIndex = 0;
  let stuckTimer = 0;
  let reverseTimer = 0;
  let stuckCount = 0;

  function driveStep() {
    const player = state.player;
    const car = player.car;
    if (reverseTimer > 0) {
      reverseTimer -= STEP;
      pilot.setMove(0.6, 1);
      return;
    }
    const target = waypoints[waypoint % waypoints.length];
    if (!route || routeIndex >= route.length) {
      route = buildRoute(car.x, car.y, target.x, target.y);
      routeIndex = 0;
    }
    const hop = route[routeIndex];
    driveToward(state, pilot, hop.x, hop.y);
    if (Math.hypot(hop.x - car.x, hop.y - car.y) < 45) routeIndex += 1;
    if (Math.hypot(target.x - player.x, target.y - player.y) < 180) {
      waypoint += 1;
      route = null;
      stuckCount = 0;
    }
    // Boxed in? Reverse out and try again; twice on the same leg means the
    // road is jammed, so skip to the next waypoint instead.
    if (Math.abs(car.speed) < 15) {
      stuckTimer += STEP;
      if (stuckTimer > 2.5) {
        stuckTimer = 0;
        reverseTimer = 1;
        stuckCount += 1;
        if (stuckCount >= 2) {
          stuckCount = 0;
          waypoint += 1;
          route = null;
        }
      }
    } else {
      stuckTimer = 0;
    }
  }

  // One step of the scene: steal a car if on foot, otherwise drive the loop.
  // The cover drive stays clean — the autopilot's accidents would otherwise
  // bring the police into what is meant to be a calm city drive — while the
  // chase scene holds three stars, so the frame shows the pursuit.
  function sceneStep() {
    const actions = { interact: false, reload: false };
    const player = state.player;
    const wasInCar = player.inCar;
    if (!player.inCar) {
      const first = waypoints[0];
      const { car, dist } = nearestParkedCar(state, first.x, first.y);
      if (car && dist < 70) {
        actions.interact = true;
        pilot.stop();
      } else if (car) {
        walkToward(state, pilot, car.x, car.y);
      }
    } else {
      if (heat > 0 && !heated) {
        addWanted(state, heat, 'shot at a cop');
        heated = true;
      }
      driveStep();
    }
    stepWorld(state, STEP, pilot.input, actions);
    // A freshly stolen car starts a fresh route from where it sits.
    if (!wasInCar && player.inCar) route = null;
    if (heat === 0) {
      state.wanted = 0;
      state.bustProgress = 0;
      state.cars = state.cars.filter((c) => c.state !== 'police');
      state.peds = state.peds.filter((p) => !p.officer);
    } else if (heated) {
      // Hold the chase at exactly three stars: the autopilot's driving
      // would otherwise push it up or let it cool off mid-scene.
      state.wanted = heat;
    }
    return player.wasted || player.busted;
  }

  const steps = Math.floor(seconds / STEP);
  const trace = [];
  state.shotTrace = trace;
  for (let i = 0; i < steps; i += 1) {
    const done = sceneStep();
    if (i % 30 === 0) {
      const car = state.player.car;
      trace.push({
        t: +(state.time).toFixed(1),
        x: Math.round(state.player.x),
        y: Math.round(state.player.y),
        inCar: state.player.inCar,
        speed: car ? Math.round(car.speed) : 0,
        angle: car ? Math.round((car.angle * 180) / Math.PI) : 0,
        wp: waypoint,
        hop: route && route[routeIndex] ? `${route[routeIndex].x},${route[routeIndex].y}` : '-',
      });
    }
    if (done) return;
  }
  // Settle: keep going until the player is driving fast — if the car
  // wrecked, the autopilot steals another one and gets moving again. A chase
  // frame also needs a police car in sight, not just speed.
  for (let i = 0; i < 20 / STEP; i += 1) {
    const player = state.player;
    const fast = player.inCar && player.car && Math.abs(player.car.speed) > 250;
    if (fast && heat === 0) break;
    if (heat > 0 && player.inCar && player.car && Math.abs(player.car.speed) > 120) {
      const near = state.cars.some(
        (c) => c.state === 'police' && c.health > 0 && Math.hypot(c.x - player.x, c.y - player.y) < 450,
      );
      if (near) break;
    }
    if (sceneStep()) return;
  }
}

// The mission scene: jump to the third mission, walk into Palm Park, and
// open fire on the Viper crew as they spawn, strafing so the frame catches
// a firefight in motion. The mission intro card is kept out of the frame —
// the objective pill already says what the job is.
function runMissionScene(state, seconds) {
  const pilot = makePilot();
  state.missionsDone = 2;
  state.missionDelay = 0.1;
  state.player.x = 1500;
  state.player.y = 1200;
  state.camera.x = 1500;
  state.camera.y = 1200;
  const park = LANDMARKS.park;
  let strafeDir = 1;
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const actions = { interact: false, reload: false };
    const player = state.player;
    const mission = state.mission;
    if (mission) mission.cardTimer = 0;
    const fighting = mission && mission.def.steps[mission.step] && mission.def.steps[mission.step].type === 'kill';
    if (fighting) {
      // Aim at the nearest living enemy and fire, strafing sideways.
      let target = null;
      let bestD = Infinity;
      for (const enemy of state.enemies) {
        if (enemy.health <= 0) continue;
        const d = Math.hypot(enemy.x - player.x, enemy.y - player.y);
        if (d < bestD) { bestD = d; target = enemy; }
      }
      if (target) {
        const cam = state.camera;
        const sx = (target.x - cam.x) * cam.zoom + cam.viewWidth / 2;
        const sy = (target.y - cam.y) * cam.zoom + cam.viewHeight / 2;
        pilot.setMouse(sx, sy, true);
        if (i % 72 === 0) strafeDir *= -1;
        const dx = target.x - player.x;
        const dy = target.y - player.y;
        const len = Math.hypot(dx, dy) || 1;
        pilot.setMove((-dy / len) * strafeDir, (dx / len) * strafeDir);
        pilot.setRun(true);
      } else {
        pilot.setMouse(640, 360, false);
        pilot.setMove(0, 0);
      }
      if (player.ammo === 0) actions.reload = true;
    } else {
      walkToward(state, pilot, park.x, park.y);
      pilot.setMouse(640, 360, false);
    }
    stepWorld(state, STEP, pilot.input, actions);
    if (player.wasted || player.busted) break;
  }
}

/**
 * Stage the named scene on a fresh state and return the screen to draw.
 * Unknown names stage the title scene.
 */
export function stageShot(name, state) {
  const pilot = makePilot();
  if (name === 'drive') {
    runDriveScene(state, DRIVE_SECONDS, 0, [
      { x: 2100, y: 900 },
      { x: 2700, y: 900 },
      { x: 2700, y: 1500 },
      { x: 2100, y: 1500 },
      { x: 1500, y: 1500 },
      { x: 1500, y: 2100 },
      { x: 900, y: 2100 },
      { x: 900, y: 900 },
    ]);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'chase') {
    runDriveScene(state, CHASE_SECONDS, 3, [
      { x: 2100, y: 900 },
      { x: 2700, y: 900 },
      { x: 2700, y: 1500 },
      { x: 2700, y: 2100 },
      { x: 1500, y: 2100 },
      { x: 1500, y: 900 },
    ]);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'mission') {
    runMissionScene(state, MISSION_SECONDS);
    return { screen: SCREEN_PLAY };
  }
  // Title: let the city live for a few seconds behind the logo.
  const steps = Math.floor(START_SECONDS / STEP);
  for (let i = 0; i < steps; i += 1) {
    stepWorld(state, STEP, pilot.input, { interact: false, reload: false });
  }
  return { screen: SCREEN_TITLE };
}
