export type GamePhase = "menu" | "countdown" | "racing" | "finished";

export interface Vec2 {
  x: number;
  y: number;
}

export interface Kart {
  id: number;
  x: number;      // track position (0..1 = one full lap)
  lane: number;   // -1..1 lateral offset
  speed: number;  // current speed (0..1 normalized)
  angle: number;  // visual lean angle
  color: string;
  name: string;
  lap: number;
  lapProgress: number; // 0..1 within current lap
  totalProgress: number; // laps + lapProgress for ranking
  finished: boolean;
  finishTime: number;
  isPlayer: boolean;
  driftTimer: number;
  boostTimer: number;
  item: ItemType | null;
  stunTimer: number;
  rank: number;
  aiTimer: number;
  aiTargetLane: number;
}

export type ItemType = "mushroom" | "shell" | "star";

export interface Item {
  id: number;
  trackPos: number; // 0..1 position on track
  lane: number;
  type: ItemType;
  collected: boolean;
}

export interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface Shell {
  id: number;
  trackPos: number;
  lane: number;
  speed: number;
  color: string;
  active: boolean;
}
