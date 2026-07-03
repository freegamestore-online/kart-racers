// Track definition: a closed loop defined by control points
// Track position is 0..1 (normalized around the full circuit)
// freegamestore.online — kart-racers

export interface TrackPoint {
  x: number;
  y: number;
}

// Control points for a figure-8-ish oval track (normalized 0..1 space)
const RAW_POINTS: TrackPoint[] = [
  { x: 0.5,  y: 0.15 },
  { x: 0.75, y: 0.15 },
  { x: 0.88, y: 0.25 },
  { x: 0.92, y: 0.4  },
  { x: 0.88, y: 0.55 },
  { x: 0.75, y: 0.62 },
  { x: 0.6,  y: 0.62 },
  { x: 0.55, y: 0.7  },
  { x: 0.55, y: 0.8  },
  { x: 0.65, y: 0.87 },
  { x: 0.65, y: 0.93 },
  { x: 0.5,  y: 0.95 },
  { x: 0.35, y: 0.93 },
  { x: 0.35, y: 0.87 },
  { x: 0.45, y: 0.8  },
  { x: 0.45, y: 0.7  },
  { x: 0.4,  y: 0.62 },
  { x: 0.25, y: 0.62 },
  { x: 0.12, y: 0.55 },
  { x: 0.08, y: 0.4  },
  { x: 0.12, y: 0.25 },
  { x: 0.25, y: 0.15 },
];

// Catmull-Rom spline interpolation
function catmullRom(p0: TrackPoint, p1: TrackPoint, p2: TrackPoint, p3: TrackPoint, t: number): TrackPoint {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

// Build a high-resolution polyline from the control points
const NUM_CURVE_STEPS = 600;
let _cachedPoints: TrackPoint[] | null = null;

export function getTrackPoints(): TrackPoint[] {
  if (_cachedPoints) return _cachedPoints;
  const pts = RAW_POINTS;
  const n = pts.length;
  const result: TrackPoint[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const stepsPerSpan = Math.floor(NUM_CURVE_STEPS / n);
    for (let j = 0; j < stepsPerSpan; j++) {
      result.push(catmullRom(p0, p1, p2, p3, j / stepsPerSpan));
    }
  }
  _cachedPoints = result;
  return result;
}

// Get track world position for normalized track position (0..1)
export function trackPosToWorld(t: number, lane: number, canvasW: number, canvasH: number): { x: number; y: number; angle: number } {
  const pts = getTrackPoints();
  const n = pts.length;
  const idx = ((t * n) | 0) % n;
  const next = (idx + 1) % n;
  const frac = (t * n) % 1;

  const cx = pts[idx].x * canvasW + (pts[next].x - pts[idx].x) * canvasW * frac;
  const cy = pts[idx].y * canvasH + (pts[next].y - pts[idx].y) * canvasH * frac;

  // tangent for perpendicular lane offset
  const tx = (pts[next].x - pts[idx].x) * canvasW;
  const ty = (pts[next].y - pts[idx].y) * canvasH;
  const len = Math.sqrt(tx * tx + ty * ty) || 1;
  const nx = -ty / len;
  const ny = tx / len;

  const trackWidth = Math.min(canvasW, canvasH) * 0.13;
  const angle = Math.atan2(ty, tx);

  return {
    x: cx + nx * lane * trackWidth,
    y: cy + ny * lane * trackWidth,
    angle,
  };
}

// Arc lengths for parameterization
let _arcLengths: number[] | null = null;
let _totalLength = 0;

export function getArcLengths(): { lengths: number[]; total: number } {
  if (_arcLengths) return { lengths: _arcLengths, total: _totalLength };
  const pts = getTrackPoints();
  const n = pts.length;
  _arcLengths = new Array(n);
  _totalLength = 0;
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    const dx = pts[next].x - pts[i].x;
    const dy = pts[next].y - pts[i].y;
    const d = Math.sqrt(dx * dx + dy * dy);
    _arcLengths[i] = d;
    _totalLength += d;
  }
  return { lengths: _arcLengths, total: _totalLength };
}

// Advance track position by a world distance
export function advanceTrackPos(t: number, worldDist: number, canvasW: number, canvasH: number): number {
  const { lengths } = getArcLengths();
  const n = lengths.length;
  const scale = Math.min(canvasW, canvasH); // lengths are in normalized units
  let remaining = worldDist / scale;
  let idx = ((t * n) | 0) % n;
  const frac = (t * n) % 1;

  // consume current span remainder
  const spanLen = lengths[idx] || 0.001;
  const rem = spanLen * (1 - frac);
  if (remaining <= rem) {
    return ((idx + frac + remaining / spanLen) / n + 1) % 1;
  }
  remaining -= rem;
  idx = (idx + 1) % n;

  while (remaining > 0) {
    const sl = lengths[idx] || 0.001;
    if (remaining <= sl) {
      return ((idx + remaining / sl) / n + 1) % 1;
    }
    remaining -= sl;
    idx = (idx + 1) % n;
  }
  return (idx / n + 1) % 1;
}

// Get curvature at track position (for AI steering)
export function getTrackCurvature(t: number): number {
  const pts = getTrackPoints();
  const n = pts.length;
  const i = ((t * n) | 0) % n;
  const prev = (i - 1 + n) % n;
  const next = (i + 1) % n;
  const ax = pts[i].x - pts[prev].x;
  const ay = pts[i].y - pts[prev].y;
  const bx = pts[next].x - pts[i].x;
  const by = pts[next].y - pts[i].y;
  // cross product z gives curvature sign
  return ax * by - ay * bx;
}

// Check if track position just crossed the finish line (t wraps from ~1 to ~0)
export function crossedFinish(oldT: number, newT: number): boolean {
  return oldT > 0.9 && newT < 0.1;
}
