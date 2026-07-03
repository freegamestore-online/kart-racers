import type { Kart, Item, Shell, Particle, ItemType } from "../types";
import { advanceTrackPos, crossedFinish, getTrackCurvature } from "./track";

export const TOTAL_LAPS = 3;
export const MAX_SPEED = 280; // world units/sec
export const ACCEL = 180;
export const BRAKE = 260;
export const FRICTION = 90;
export const TURN_SPEED = 2.2;
export const DRIFT_THRESHOLD = 0.7;
export const BOOST_SPEED = 420;
export const ITEM_POSITIONS: { trackPos: number; lane: number }[] = [
  { trackPos: 0.12, lane: 0 },
  { trackPos: 0.25, lane: 0.5 },
  { trackPos: 0.38, lane: -0.5 },
  { trackPos: 0.52, lane: 0 },
  { trackPos: 0.65, lane: 0.5 },
  { trackPos: 0.78, lane: -0.5 },
  { trackPos: 0.88, lane: 0 },
];

export const KART_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899"];
export const KART_NAMES = ["YOU", "Koopa", "Toad", "Peach", "Bowser", "Wario"];

let _nextId = 0;
export function nextId(): number { return _nextId++; }

export function createKarts(count: number): Kart[] {
  const karts: Kart[] = [];
  for (let i = 0; i < count; i++) {
    // Stagger starting positions slightly
    const startOffset = i * 0.015;
    karts.push({
      id: nextId(),
      x: 0,
      lane: (i % 2 === 0 ? -0.35 : 0.35),
      speed: 0,
      angle: 0,
      color: KART_COLORS[i % KART_COLORS.length],
      name: KART_NAMES[i % KART_NAMES.length],
      lap: 0,
      lapProgress: 1 - startOffset, // near finish line (will cross to start lap 1)
      totalProgress: -startOffset,
      finished: false,
      finishTime: 0,
      isPlayer: i === 0,
      driftTimer: 0,
      boostTimer: 0,
      item: null,
      stunTimer: 0,
      rank: i + 1,
      aiTimer: 0,
      aiTargetLane: (i % 2 === 0 ? -0.35 : 0.35),
    });
  }
  return karts;
}

export function createItems(): Item[] {
  return ITEM_POSITIONS.map((pos, i) => ({
    id: nextId(),
    trackPos: pos.trackPos,
    lane: pos.lane,
    type: randomItemType(),
    collected: false,
  }));
}

function randomItemType(): ItemType {
  const r = Math.random();
  if (r < 0.4) return "mushroom";
  if (r < 0.75) return "shell";
  return "star";
}

export function updatePlayer(
  kart: Kart,
  dt: number,
  keys: Set<string>,
  touchLeft: boolean,
  touchRight: boolean,
  touchAccel: boolean,
  touchBrake: boolean,
  canvasW: number,
  canvasH: number,
): void {
  if (kart.stunTimer > 0) {
    kart.stunTimer -= dt;
    kart.speed = Math.max(0, kart.speed - BRAKE * dt);
    return;
  }

  const up = keys.has("ArrowUp") || keys.has("w") || keys.has("W") || touchAccel;
  const down = keys.has("ArrowDown") || keys.has("s") || keys.has("S") || touchBrake;
  const left = keys.has("ArrowLeft") || keys.has("a") || keys.has("A") || touchLeft;
  const right = keys.has("ArrowRight") || keys.has("d") || keys.has("D") || touchRight;

  const topSpeed = kart.boostTimer > 0 ? BOOST_SPEED : MAX_SPEED;

  if (up) {
    kart.speed = Math.min(topSpeed, kart.speed + ACCEL * dt);
  } else if (down) {
    kart.speed = Math.max(0, kart.speed - BRAKE * dt);
  } else {
    kart.speed = Math.max(0, kart.speed - FRICTION * dt);
  }

  // Steering — faster turn at lower speeds
  const turnFactor = 0.4 + 0.6 * (kart.speed / MAX_SPEED);
  const turnAmt = TURN_SPEED * turnFactor * dt;

  if (left) {
    kart.lane = Math.max(-0.85, kart.lane - turnAmt);
    kart.angle = Math.max(-1, kart.angle - dt * 4);
    if (up && kart.speed > MAX_SPEED * DRIFT_THRESHOLD) kart.driftTimer += dt;
    else kart.driftTimer = 0;
  } else if (right) {
    kart.lane = Math.min(0.85, kart.lane + turnAmt);
    kart.angle = Math.min(1, kart.angle + dt * 4);
    if (up && kart.speed > MAX_SPEED * DRIFT_THRESHOLD) kart.driftTimer += dt;
    else kart.driftTimer = 0;
  } else {
    kart.angle *= (1 - dt * 6);
    kart.driftTimer = 0;
  }

  // Drift boost
  if (kart.driftTimer > 1.2 && !left && !right) {
    kart.boostTimer = 0.6;
    kart.driftTimer = 0;
  }

  if (kart.boostTimer > 0) kart.boostTimer -= dt;

  advanceKart(kart, dt, canvasW, canvasH);
}

export function updateAI(kart: Kart, dt: number, playerKart: Kart, canvasW: number, canvasH: number): void {
  if (kart.stunTimer > 0) {
    kart.stunTimer -= dt;
    kart.speed = Math.max(0, kart.speed - BRAKE * dt);
    return;
  }

  kart.aiTimer -= dt;

  // AI target lane changes based on curvature + rubber banding
  if (kart.aiTimer <= 0) {
    kart.aiTimer = 0.3 + Math.random() * 0.4;
    const curv = getTrackCurvature(kart.lapProgress);
    kart.aiTargetLane = Math.max(-0.7, Math.min(0.7, curv * 8 + (Math.random() - 0.5) * 0.3));
  }

  // Rubber band: slow down if ahead of player, speed up if behind
  const gap = kart.totalProgress - playerKart.totalProgress;
  let speedMult = 1.0;
  if (gap > 0.3) speedMult = 0.82;
  else if (gap > 0.15) speedMult = 0.91;
  else if (gap < -0.3) speedMult = 1.12;
  else if (gap < -0.15) speedMult = 1.06;

  // Difficulty variance per kart
  const diffMult = 0.88 + (kart.id % 4) * 0.04;
  const targetSpeed = MAX_SPEED * speedMult * diffMult;

  if (kart.speed < targetSpeed) {
    kart.speed = Math.min(targetSpeed, kart.speed + ACCEL * dt * 1.2);
  } else {
    kart.speed = Math.max(targetSpeed * 0.8, kart.speed - FRICTION * dt);
  }

  // Steer toward target lane
  const laneErr = kart.aiTargetLane - kart.lane;
  kart.lane += laneErr * dt * 3;
  kart.lane = Math.max(-0.85, Math.min(0.85, kart.lane));
  kart.angle = laneErr * 0.5;

  if (kart.boostTimer > 0) {
    kart.speed = Math.min(BOOST_SPEED, kart.speed + 60 * dt);
    kart.boostTimer -= dt;
  }

  // AI uses items automatically
  if (kart.item === "mushroom") {
    kart.boostTimer = 1.0;
    kart.item = null;
  } else if (kart.item === "star") {
    kart.boostTimer = 3.0;
    kart.item = null;
  }

  advanceKart(kart, dt, canvasW, canvasH);
}

function advanceKart(kart: Kart, dt: number, canvasW: number, canvasH: number): void {
  const oldProgress = kart.lapProgress;
  const dist = kart.speed * dt;
  kart.lapProgress = advanceTrackPos(kart.lapProgress, dist, canvasW, canvasH);

  if (crossedFinish(oldProgress, kart.lapProgress)) {
    kart.lap += 1;
    if (kart.lap >= TOTAL_LAPS && !kart.finished) {
      kart.finished = true;
    }
  }

  kart.totalProgress = kart.lap + kart.lapProgress;
}

export function checkItemCollection(kart: Kart, items: Item[]): void {
  if (kart.item !== null) return;
  for (const item of items) {
    if (item.collected) continue;
    const laneDiff = Math.abs(item.lane - kart.lane);
    const trackDiff = Math.abs(item.trackPos - kart.lapProgress);
    const wrappedDiff = Math.min(trackDiff, 1 - trackDiff);
    if (wrappedDiff < 0.015 && laneDiff < 0.4) {
      item.collected = true;
      kart.item = item.type;
      // Respawn after delay (handled in main loop)
      setTimeout(() => {
        item.collected = false;
        item.type = randomItemType();
      }, 8000);
      break;
    }
  }
}

export function usePlayerItem(
  kart: Kart,
  shells: Shell[],
): void {
  if (!kart.item) return;
  if (kart.item === "mushroom") {
    kart.boostTimer = 1.5;
    kart.item = null;
  } else if (kart.item === "star") {
    kart.boostTimer = 4.0;
    kart.item = null;
  } else if (kart.item === "shell") {
    shells.push({
      id: nextId(),
      trackPos: kart.lapProgress,
      lane: kart.lane,
      speed: kart.speed + 200,
      color: "#22c55e",
      active: true,
    });
    kart.item = null;
  }
}

export function updateShells(shells: Shell[], karts: Kart[], dt: number, canvasW: number, canvasH: number): Particle[] {
  const newParticles: Particle[] = [];
  for (const shell of shells) {
    if (!shell.active) continue;
    shell.trackPos = advanceTrackPos(shell.trackPos, shell.speed * dt, canvasW, canvasH);
    // Check collision with karts
    for (const kart of karts) {
      if (kart.stunTimer > 0) continue;
      const laneDiff = Math.abs(shell.lane - kart.lane);
      const trackDiff = Math.abs(shell.trackPos - kart.lapProgress);
      const wrappedDiff = Math.min(trackDiff, 1 - trackDiff);
      if (wrappedDiff < 0.02 && laneDiff < 0.4) {
        kart.stunTimer = 2.0;
        kart.speed *= 0.2;
        shell.active = false;
        // Spawn particles
        for (let i = 0; i < 8; i++) {
          newParticles.push({
            id: nextId(),
            x: 0, y: 0, // will be set by caller
            vx: (Math.random() - 0.5) * 80,
            vy: (Math.random() - 0.5) * 80,
            life: 0.6,
            maxLife: 0.6,
            color: "#22c55e",
            size: 5,
          });
        }
        break;
      }
    }
  }
  return newParticles;
}

export function updateRankings(karts: Kart[]): void {
  const sorted = [...karts].sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    return b.totalProgress - a.totalProgress;
  });
  sorted.forEach((k, i) => { k.rank = i + 1; });
}

export function spawnStarParticles(x: number, y: number, count: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    particles.push({
      id: nextId(),
      x, y,
      vx: Math.cos(angle) * 60,
      vy: Math.sin(angle) * 60,
      life: 0.8,
      maxLife: 0.8,
      color: ["#fbbf24", "#f59e0b", "#ef4444", "#ec4899"][i % 4],
      size: 6,
    });
  }
  return particles;
}

export function updateParticles(particles: Particle[], dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}
