// Combat: bullets, the Viper gang members who shoot back during missions,
// car explosions, and the particles that sell every hit.
import { PLAYER } from './config.js';

export function fireBullet(state, x, y, angle, owner) {
  state.bullets.push({
    x: x + Math.cos(angle) * 18,
    y: y + Math.sin(angle) * 18,
    vx: Math.cos(angle) * 950,
    vy: Math.sin(angle) * 950,
    life: 0.9,
    owner, // 'player' | 'enemy'
    damage: owner === 'player' ? PLAYER.bulletDamage : 12,
  });
}

export function spawnParticles(state, x, y, color, count, speed) {
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.3 + Math.random() * 0.7);
    state.particles.push({
      x, y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: 0.4 + Math.random() * 0.5,
      maxLife: 0.9,
      size: 2 + Math.random() * 4,
      color,
    });
  }
}

export function explodeCar(state, car) {
  if (car.state === 'wrecked' && car.exploded) return;
  car.exploded = true;
  spawnParticles(state, car.x, car.y, '#ff7b00', 40, 260);
  spawnParticles(state, car.x, car.y, '#ffdd55', 24, 180);
  spawnParticles(state, car.x, car.y, '#444444', 20, 90);
  state.events.explosion = { x: car.x, y: car.y };
  state.shake = Math.max(state.shake, 14);
  // The blast hurts anyone close.
  const d = Math.hypot(state.player.x - car.x, state.player.y - car.y);
  if (d < 130 && state.player.health > 0) {
    state.player.health = Math.max(0, state.player.health - 35);
    state.player.lastHurtAt = state.time;
    if (state.player.health === 0) {
      state.player.wasted = true;
      state.events.wasted = true;
    }
  }
}

export function spawnEnemies(state, x, y, count) {
  const made = [];
  for (let i = 0; i < count; i += 1) {
    const enemy = {
      id: `viper-${state.time.toFixed(2)}-${i}`,
      x: x + (Math.random() - 0.5) * 220,
      y: y + (Math.random() - 0.5) * 220,
      angle: 0,
      health: 100,
      speed: 130,
      shirt: '#7b2d8b',
      pants: '#222222',
      state: 'hunt',
      fireCooldown: 0.5 + Math.random(),
      bobPhase: Math.random() * 6,
      enemy: true,
    };
    state.enemies.push(enemy);
    made.push(enemy);
  }
  return made;
}

export function stepBullets(state, dt) {
  const { player } = state;
  for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
    const b = state.bullets[i];
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    let dead = b.life <= 0;
    // Buildings stop bullets.
    if (!dead) {
      for (const bd of state.city.buildings) {
        if (b.x >= bd.x && b.x <= bd.x + bd.w && b.y >= bd.y && b.y <= bd.y + bd.h) {
          spawnParticles(state, b.x, b.y, '#dddddd', 4, 120);
          dead = true;
          break;
        }
      }
    }
    // Player bullets hit enemies, officers, pedestrians and cars.
    if (!dead && b.owner === 'player') {
      for (const e of state.enemies) {
        if (e.health > 0 && Math.hypot(e.x - b.x, e.y - b.y) < 16) {
          e.health -= b.damage;
          spawnParticles(state, b.x, b.y, '#ff4444', 6, 140);
          if (e.health <= 0) {
            state.events.enemyDown = true;
            spawnParticles(state, e.x, e.y, '#ff4444', 16, 200);
          }
          dead = true;
          break;
        }
      }
      if (!dead) {
        for (const ped of state.peds) {
          if (ped.state === 'down') continue;
          if (Math.hypot(ped.x - b.x, ped.y - b.y) < 14) {
            ped.state = 'down';
            ped.downTimer = 6;
            spawnParticles(state, b.x, b.y, '#ff4444', 8, 160);
            if (ped.officer) state.events.copDown = true;
            else state.events.pedDown = true;
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (const car of state.cars) {
          if (car.state === 'wrecked') continue;
          const dx = b.x - car.x;
          const dy = b.y - car.y;
          const localX = dx * Math.cos(-car.angle) - dy * Math.sin(-car.angle);
          const localY = dx * Math.sin(-car.angle) + dy * Math.cos(-car.angle);
          if (Math.abs(localX) < 34 && Math.abs(localY) < 18) {
            car.health -= b.damage * 0.5;
            spawnParticles(state, b.x, b.y, '#ffcc00', 5, 150);
            if (car.health <= 0 && car.state !== 'wrecked') {
              car.state = 'wrecked';
              explodeCar(state, car);
            }
            dead = true;
            break;
          }
        }
      }
    }
    // Enemy bullets hit the player.
    if (!dead && b.owner === 'enemy' && player.health > 0) {
      const target = player.inCar && player.car ? player.car : null;
      if (target) {
        const dx = b.x - target.x;
        const dy = b.y - target.y;
        const localX = dx * Math.cos(-target.angle) - dy * Math.sin(-target.angle);
        const localY = dx * Math.sin(-target.angle) + dy * Math.cos(-target.angle);
        if (Math.abs(localX) < 36 && Math.abs(localY) < 20) {
          target.health -= b.damage * 0.4;
          spawnParticles(state, b.x, b.y, '#ffcc00', 4, 140);
          if (target.health <= 0 && target.state !== 'wrecked') {
            target.state = 'wrecked';
            explodeCar(state, target);
          }
          dead = true;
        }
      } else if (Math.hypot(player.x - b.x, player.y - b.y) < 14) {
        player.health -= b.damage;
        player.lastHurtAt = state.time;
        state.events.hurt = true;
        spawnParticles(state, b.x, b.y, '#ff4444', 6, 150);
        if (player.health <= 0) {
          player.health = 0;
          player.wasted = true;
          state.events.wasted = true;
        }
        dead = true;
      }
    }
    if (dead) state.bullets.splice(i, 1);
  }
}

/** Viper gang members: close in on the player and shoot, inaccurately. */
export function stepEnemies(state, dt) {
  const { player } = state;
  for (const e of state.enemies) {
    if (e.health <= 0) continue;
    const d = Math.hypot(player.x - e.x, player.y - e.y);
    const want = Math.atan2(player.y - e.y, player.x - e.x);
    e.angle = want;
    e.bobPhase += dt * 10;
    // Keep a shooting distance: advance when far, strafe when close.
    if (d > 260) {
      const nx = e.x + Math.cos(want) * e.speed * dt;
      const ny = e.y + Math.sin(want) * e.speed * dt;
      const fixed = state.city.collideCircle(nx, ny, 11);
      e.x = fixed.x;
      e.y = fixed.y;
    } else if (d > 130) {
      const nx = e.x + Math.cos(want) * e.speed * 0.5 * dt;
      const ny = e.y + Math.sin(want) * e.speed * 0.5 * dt;
      const fixed = state.city.collideCircle(nx, ny, 11);
      e.x = fixed.x;
      e.y = fixed.y;
    }
    e.fireCooldown -= dt;
    if (e.fireCooldown <= 0 && d < 420 && player.health > 0) {
      const spread = (Math.random() - 0.5) * 0.35;
      fireBullet(state, e.x, e.y, want + spread, 'enemy');
      state.events.enemyShot = true;
      e.fireCooldown = 0.7 + Math.random() * 0.7;
    }
  }
  // Clear the dead after a moment so the renderer can show the fall.
  state.enemies = state.enemies.filter((e) => e.health > 0 || (e.deadTimer = (e.deadTimer || 0) + dt) < 1.2);
}

export function stepParticles(state, dt) {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const p = state.particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - 2.2 * dt;
    p.vy *= 1 - 2.2 * dt;
    if (p.life <= 0) state.particles.splice(i, 1);
  }
  if (state.shake > 0) state.shake = Math.max(0, state.shake - 40 * dt);
}
