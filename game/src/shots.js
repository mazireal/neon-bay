// The screenshot scenes behind ?shot=start|drive|chase|mission. Each one
// plays the real rules forward from a fresh world for a fixed time, steered
// by a small autopilot (walk to the nearest parked car, steal it, drive a
// waypoint loop; or walk into the park and shoot the Vipers), so the frame
// is what a short game really looks like. The same seed gives a similar
// frame every time.
import { STEP } from './config.js';
import { stepWorld } from './world.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { LANDMARKS } from './city.js';
import { addWanted } from './police.js';

const START_SECONDS = 4;
const DRIVE_SECONDS = 30;
const CHASE_SECONDS = 28;
const MISSION_SECONDS = 10;

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

// Drive the player's car toward a point: steer at the target, throttle when
// roughly lined up, ease off when the turn is sharp.
function driveToward(state, pilot, tx, ty) {
  const car = state.player.car;
  const diff = angleDiff(Math.atan2(ty - car.y, tx - car.x), car.angle);
  const steer = Math.max(-1, Math.min(1, diff * 2.2));
  pilot.setMove(steer, Math.abs(diff) < 1.1 ? -1 : 0);
  pilot.setRun(false);
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

function nearestParkedCar(state) {
  const player = state.player;
  let best = null;
  let bestD = Infinity;
  for (const car of state.cars) {
    if (car.state !== 'parked') continue;
    const d = Math.hypot(car.x - player.x, car.y - player.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return { car: best, dist: bestD };
}

// Steal the nearest parked car, then drive a waypoint loop. `heat` adds
// wanted stars once the player is behind the wheel.
function runDriveScene(state, seconds, heat, waypoints) {
  const pilot = makePilot();
  let waypoint = 0;
  let heated = false;
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const actions = { interact: false, reload: false };
    const player = state.player;
    if (!player.inCar) {
      const { car, dist } = nearestParkedCar(state);
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
      const target = waypoints[waypoint % waypoints.length];
      driveToward(state, pilot, target.x, target.y);
      const d = Math.hypot(target.x - player.x, target.y - player.y);
      if (d < 180) waypoint += 1;
    }
    stepWorld(state, STEP, pilot.input, actions);
    if (player.wasted || player.busted) break;
  }
}

// The mission scene: jump to the third mission, walk into Palm Park, and
// open fire on the Viper crew as they spawn.
function runMissionScene(state, seconds) {
  const pilot = makePilot();
  state.missionsDone = 2;
  state.missionDelay = 0.1;
  state.player.x = 1500;
  state.player.y = 1200;
  state.camera.x = 1500;
  state.camera.y = 1200;
  const park = LANDMARKS.park;
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const actions = { interact: false, reload: false };
    const player = state.player;
    const mission = state.mission;
    const fighting = mission && mission.def.steps[mission.step] && mission.def.steps[mission.step].type === 'kill';
    if (fighting) {
      // Aim at the nearest living enemy and fire.
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
        pilot.setMove(0, 0);
      } else {
        pilot.setMouse(640, 360, false);
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
    ]);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'chase') {
    runDriveScene(state, CHASE_SECONDS, 3, [
      { x: 2100, y: 900 },
      { x: 2700, y: 900 },
      { x: 2700, y: 1500 },
      { x: 1500, y: 1500 },
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
