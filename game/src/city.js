// Neon Bay's city: the road grid, the blocks and buildings between the
// roads, the beach, the park, the districts and the landmarks the missions
// use. Generated once from a seed; the same seed always builds the same city.
import { BEACH_X, COLORS, HORIZONTAL_ROADS, ROAD_HALF, VERTICAL_ROADS, WORLD } from './config.js';

// Landmarks the story and the missions point at. Each sits on a road so a
// car can reach it; x/y are the marker positions the HUD and minimap show.
export const LANDMARKS = {
  diner: { x: 1500, y: 860, name: 'Sunset Diner', label: 'DINER' },
  hotel: { x: 2700, y: 300, name: 'Palms Hotel', label: 'HOTEL' },
  docks: { x: 3300, y: 2100, name: 'Harbor Docks', label: 'DOCKS' },
  hospital: { x: 900, y: 1500, name: 'Bay Hospital', label: 'HOSPITAL' },
  policeStation: { x: 2100, y: 1500, name: 'Police HQ', label: 'POLICE' },
  safehouse: { x: 300, y: 2100, name: 'Safehouse', label: 'HOME' },
  marina: { x: 3300, y: 300, name: 'Neon Marina', label: 'MARINA' },
  club: { x: 2100, y: 900, name: 'Club Neon', label: 'CLUB' },
  park: { x: 1800, y: 1200, name: 'Palm Park', label: 'PARK' },
  garage: { x: 900, y: 300, name: "Ray's Garage", label: 'GARAGE' },
};

const SIGN_WORDS = ['DINER', 'HOTEL', 'CLUB', 'BAR', 'SHOP', 'CAFE', 'CINEMA', 'GYM', 'PIZZA', 'TACOS', '24H', 'MART'];

function blocks() {
  // The rectangles between the roads. The outer edge is the world border.
  const xs = [0, ...VERTICAL_ROADS, WORLD.width];
  const ys = [0, ...HORIZONTAL_ROADS, WORLD.height];
  const out = [];
  for (let i = 0; i < xs.length - 1; i += 1) {
    for (let j = 0; j < ys.length - 1; j += 1) {
      const x0 = xs[i] + (i === 0 ? 0 : ROAD_HALF);
      const x1 = xs[i + 1] - (i === xs.length - 2 ? 0 : ROAD_HALF);
      const y0 = ys[j] + (j === 0 ? 0 : ROAD_HALF);
      const y1 = ys[j + 1] - (j === ys.length - 2 ? 0 : ROAD_HALF);
      if (x1 - x0 > 120 && y1 - y0 > 120) out.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, col: i, row: j });
    }
  }
  return out;
}

export function createCity(random) {
  const buildings = [];
  const trees = [];
  const parkingSpots = [];
  const parkBlock = { x: 1560, y: 960, w: 480, h: 480 };

  for (const block of blocks()) {
    // The park block stays green: trees and paths, no buildings.
    const isPark = block.x >= parkBlock.x - 1 && block.y >= parkBlock.y - 1;
    if (isPark) {
      for (let i = 0; i < 16; i += 1) {
        trees.push({ x: block.x + random.range(30, block.w - 30), y: block.y + random.range(30, block.h - 30), r: random.range(14, 22) });
      }
      continue;
    }
    // The far-east strip is the beach: sand, palms, no buildings.
    if (block.x >= BEACH_X - ROAD_HALF) {
      for (let i = 0; i < 10; i += 1) {
        trees.push({ x: block.x + random.range(20, block.w - 20), y: block.y + random.range(20, block.h - 20), r: random.range(12, 18), palm: true });
      }
      continue;
    }
    // Some blocks are parking lots instead of buildings.
    if (random.chance(0.18)) {
      const rows = Math.floor(block.h / 90);
      const cols = Math.floor(block.w / 70);
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          parkingSpots.push({ x: block.x + 40 + c * 70, y: block.y + 45 + r * 90, angle: 0 });
        }
      }
      continue;
    }
    // Otherwise 1-3 buildings per block, with a sidewalk margin.
    const count = random.int(1, 3);
    const margin = 26;
    for (let i = 0; i < count; i += 1) {
      const w = random.range(120, Math.max(130, (block.w - margin * 2) / count - 10));
      const h = random.range(110, Math.max(120, block.h - margin * 2 - 20));
      const x = block.x + margin + i * ((block.w - margin * 2) / count) + random.range(0, 14);
      const y = block.y + margin + random.range(0, Math.max(1, block.h - margin * 2 - h));
      const color = random.pick(COLORS.buildingRoof);
      const sign = random.chance(0.45) ? random.pick(SIGN_WORDS) : null;
      buildings.push({
        x, y, w: Math.min(w, block.x + block.w - margin - x), h: Math.min(h, block.y + block.h - margin - y),
        color, sign, signColor: random.pick(COLORS.neonSigns),
        windowsX: Math.max(2, Math.floor(w / 34)), windowsY: Math.max(2, Math.floor(h / 34)),
      });
    }
    // A few street trees on the block's corners.
    if (random.chance(0.6)) {
      trees.push({ x: block.x + 12, y: block.y + 12, r: 12 });
      trees.push({ x: block.x + block.w - 12, y: block.y + block.h - 12, r: 12 });
    }
  }

  // Palm trees along the beach boulevard.
  for (let y = 120; y < WORLD.height; y += 130) {
    trees.push({ x: BEACH_X - 40 + random.range(-8, 8), y, r: 15, palm: true });
  }

  function isOnRoad(x, y) {
    for (const rx of VERTICAL_ROADS) if (Math.abs(x - rx) <= ROAD_HALF) return true;
    for (const ry of HORIZONTAL_ROADS) if (Math.abs(y - ry) <= ROAD_HALF) return true;
    return false;
  }

  function nearestRoadPoint(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const rx of VERTICAL_ROADS) {
      const d = Math.abs(x - rx);
      if (d < bestD) { bestD = d; best = { x: rx, y }; }
    }
    for (const ry of HORIZONTAL_ROADS) {
      const d = Math.abs(y - ry);
      if (d < bestD) { bestD = d; best = { x, y: ry }; }
    }
    return best;
  }

  // Push a circle out of every building it overlaps; returns the fixed point.
  function collideCircle(x, y, radius) {
    let nx = x;
    let ny = y;
    for (const b of buildings) {
      const cx = Math.max(b.x, Math.min(nx, b.x + b.w));
      const cy = Math.max(b.y, Math.min(ny, b.y + b.h));
      const dx = nx - cx;
      const dy = ny - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < radius * radius) {
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          nx = cx + (dx / d) * radius;
          ny = cy + (dy / d) * radius;
        } else {
          // Centre inside the building: push out along the smallest overlap.
          const left = nx - b.x + radius;
          const right = b.x + b.w - nx + radius;
          const top = ny - b.y + radius;
          const bottom = b.y + b.h - ny + radius;
          const m = Math.min(left, right, top, bottom);
          if (m === left) nx = b.x - radius;
          else if (m === right) nx = b.x + b.w + radius;
          else if (m === top) ny = b.y - radius;
          else ny = b.y + b.h + radius;
        }
      }
    }
    // The sea is not drivable: keep everyone west of the waterline.
    if (nx > BEACH_X + 130) nx = BEACH_X + 130;
    nx = Math.max(radius, Math.min(WORLD.width - radius, nx));
    ny = Math.max(radius, Math.min(WORLD.height - radius, ny));
    return { x: nx, y: ny };
  }

  function districtAt(x, y) {
    if (x >= 3300) return y >= 1500 ? 'Harbor Docks' : 'Palm Beach';
    if (x >= 1500 && x <= 2700 && y >= 900 && y <= 1500) return 'Downtown';
    if (y < 600) return 'Northside';
    if (y > 2100) return 'Southside';
    if (x < 900) return 'Old Town';
    return 'Midtown';
  }

  return {
    buildings, trees, parkingSpots, parkBlock,
    isOnRoad, nearestRoadPoint, collideCircle, districtAt,
  };
}
