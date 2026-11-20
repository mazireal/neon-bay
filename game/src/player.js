// The player: Kai Mercer, on foot or behind the wheel. On foot he walks and
// runs, aims with the mouse and shoots; near a car he can steal it and drive.
// Health, cash, ammo and the car he is in all live here.
import { PLAYER } from './config.js';
import { nearestCar } from './vehicles.js';

export function createPlayer(x, y) {
  return {
    x, y,
    angle: -Math.PI / 2,
    aimAngle: -Math.PI / 2,
    health: PLAYER.maxHealth,
    cash: 40,
    // Driving state.
    inCar: false,
    car: null,
    // Shooting state.
    ammo: PLAYER.magSize,
    reloading: 0,
    fireCooldown: 0,
    lastHurtAt: -99,
    // Movement state (for animation and sound).
    moving: false,
    running: false,
    // Busted / wasted.
    busted: false,
    wasted: false,
  };
}

/** One step on foot: WASD movement, mouse aim, shooting, entering cars. */
export function stepPlayerOnFoot(state, dt, input, api) {
  const player = state.player;
  const moveX = input.moveX();
  const moveY = input.moveY();
  const running = input.run();
  const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
  player.moving = moveX !== 0 || moveY !== 0;
  player.running = running && player.moving;
  if (player.moving) {
    const len = Math.hypot(moveX, moveY) || 1;
    const nx = player.x + (moveX / len) * speed * dt;
    const ny = player.y + (moveY / len) * speed * dt;
    const fixed = state.city.collideCircle(nx, ny, PLAYER.radius);
    player.x = fixed.x;
    player.y = fixed.y;
    player.angle = Math.atan2(moveY, moveX);
  }
  // Aim follows the mouse (world coordinates through the camera).
  const mouse = input.mouse();
  const world = state.camera.screenToWorld(mouse.x, mouse.y);
  player.aimAngle = Math.atan2(world.y - player.y, world.x - player.x);

  // Shooting: hold the mouse button; R reloads.
  if (player.fireCooldown > 0) player.fireCooldown -= dt;
  if (player.reloading > 0) {
    player.reloading -= dt;
    if (player.reloading <= 0) {
      player.ammo = PLAYER.magSize;
      api.events.reloaded = true;
    }
  } else if (mouse.down && player.fireCooldown <= 0 && player.ammo > 0) {
    api.fireBullet(player.x, player.y, player.aimAngle, 'player');
    player.ammo -= 1;
    player.fireCooldown = PLAYER.fireInterval;
    api.events.shot = true;
    api.events.noise = { x: player.x, y: player.y, radius: 700 };
  } else if (mouse.down && player.ammo === 0 && player.reloading <= 0) {
    player.reloading = PLAYER.reloadSeconds;
  }
  if (api.actions.reload && player.ammo < PLAYER.magSize && player.reloading <= 0) {
    player.reloading = PLAYER.reloadSeconds;
  }
  // Health comes back slowly after a calm stretch.
  if (state.time - player.lastHurtAt > PLAYER.regenDelay && player.health < PLAYER.maxHealth && player.health > 0) {
    player.health = Math.min(PLAYER.maxHealth, player.health + PLAYER.regenRate * dt);
  }
}

/** Try to steal the nearest car; returns the car taken, or null. */
export function tryEnterCar(state, api) {
  const player = state.player;
  const car = nearestCar(state, player.x, player.y, 78);
  if (!car) return null;
  const occupied = car.state === 'traffic' || car.state === 'police';
  if (car.state === 'traffic') {
    // The driver bails and flees on foot.
    const driver = state.peds.find((p) => p.id === car.driver);
    if (driver) {
      driver.state = 'flee';
      driver.fleeTimer = 4;
      driver.x = car.x + Math.cos(car.angle + Math.PI / 2) * 30;
      driver.y = car.y + Math.sin(car.angle + Math.PI / 2) * 30;
      driver.target = { x: driver.x + 300, y: driver.y + 200 };
    }
    api.addWanted(1, 'carjacking');
    api.events.carjack = true;
  }
  car.state = 'player';
  car.driver = 'player';
  player.inCar = true;
  player.car = car;
  player.x = car.x;
  player.y = car.y;
  api.events.enterCar = true;
  return car;
}

/** Step out of the car beside it. */
export function exitCar(state) {
  const player = state.player;
  const car = player.car;
  if (!car) return;
  car.state = 'parked';
  car.driver = null;
  car.speed = 0;
  player.inCar = false;
  player.car = null;
  player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
  player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
  const fixed = state.city.collideCircle(player.x, player.y, PLAYER.radius);
  player.x = fixed.x;
  player.y = fixed.y;
}

export function hurtPlayer(state, amount, api) {
  const player = state.player;
  if (player.health <= 0) return;
  player.health -= amount;
  player.lastHurtAt = state.time;
  api.events.hurt = true;
  if (player.health <= 0) {
    player.health = 0;
    player.wasted = true;
    api.events.wasted = true;
  }
}
