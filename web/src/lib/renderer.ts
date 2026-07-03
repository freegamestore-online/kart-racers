import { drawText } from "./canvas";
import { getTrackPoints, trackPosToWorld } from "./track";
import type { Kart, Item, Shell, Particle } from "../types";

const TRACK_WIDTH_RATIO = 0.13; // fraction of min(w,h)
const GRASS_COLOR_LIGHT = "#4ade80";
const GRASS_COLOR_DARK = "#166534";
const ROAD_COLOR = "#374151";
const ROAD_EDGE = "#f59e0b";
const ROAD_STRIPE = "#ffffff";
const KERB_A = "#ef4444";
const KERB_B = "#ffffff";

function getTrackWidth(canvasW: number, canvasH: number): number {
  return Math.min(canvasW, canvasH) * TRACK_WIDTH_RATIO;
}

export function drawTrack(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, isDark: boolean): void {
  const pts = getTrackPoints();
  const n = pts.length;
  const tw = getTrackWidth(canvasW, canvasH);

  // Draw grass background
  ctx.fillStyle = isDark ? GRASS_COLOR_DARK : GRASS_COLOR_LIGHT;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Draw grass checkerboard pattern
  const cellSize = 40;
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = isDark ? "#000" : "#fff";
  for (let gx = 0; gx < canvasW; gx += cellSize * 2) {
    for (let gy = 0; gy < canvasH; gy += cellSize * 2) {
      ctx.fillRect(gx, gy, cellSize, cellSize);
      ctx.fillRect(gx + cellSize, gy + cellSize, cellSize, cellSize);
    }
  }
  ctx.restore();

  // Build road polygon using offset points
  const leftPts: { x: number; y: number }[] = [];
  const rightPts: { x: number; y: number }[] = [];
  const kerbLeftPts: { x: number; y: number }[] = [];
  const kerbRightPts: { x: number; y: number }[] = [];

  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    const tx = (pts[next].x - pts[i].x) * canvasW;
    const ty = (pts[next].y - pts[i].y) * canvasH;
    const len = Math.sqrt(tx * tx + ty * ty) || 1;
    const nx = -ty / len;
    const ny = tx / len;
    const wx = pts[i].x * canvasW;
    const wy = pts[i].y * canvasH;
    leftPts.push({ x: wx + nx * tw, y: wy + ny * tw });
    rightPts.push({ x: wx - nx * tw, y: wy - ny * tw });
    kerbLeftPts.push({ x: wx + nx * (tw + 6), y: wy + ny * (tw + 6) });
    kerbRightPts.push({ x: wx - nx * (tw + 6), y: wy - ny * (tw + 6) });
  }

  // Draw kerb (red/white alternating)
  const kerbSegLen = 20;
  for (let i = 0; i < n; i++) {
    const kerbColor = Math.floor(i / kerbSegLen) % 2 === 0 ? KERB_A : KERB_B;
    const next = (i + 1) % n;
    ctx.beginPath();
    ctx.moveTo(kerbLeftPts[i].x, kerbLeftPts[i].y);
    ctx.lineTo(kerbLeftPts[next].x, kerbLeftPts[next].y);
    ctx.lineTo(leftPts[next].x, leftPts[next].y);
    ctx.lineTo(leftPts[i].x, leftPts[i].y);
    ctx.closePath();
    ctx.fillStyle = kerbColor;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(kerbRightPts[i].x, kerbRightPts[i].y);
    ctx.lineTo(kerbRightPts[next].x, kerbRightPts[next].y);
    ctx.lineTo(rightPts[next].x, rightPts[next].y);
    ctx.lineTo(rightPts[i].x, rightPts[i].y);
    ctx.closePath();
    ctx.fillStyle = kerbColor;
    ctx.fill();
  }

  // Draw road surface
  ctx.beginPath();
  ctx.moveTo(leftPts[0].x, leftPts[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(leftPts[i].x, leftPts[i].y);
  ctx.closePath();
  ctx.moveTo(rightPts[0].x, rightPts[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(rightPts[i].x, rightPts[i].y);
  ctx.closePath();
  ctx.fillStyle = ROAD_COLOR;
  ctx.fill("evenodd");

  // Road edges
  ctx.strokeStyle = ROAD_EDGE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(leftPts[0].x, leftPts[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(leftPts[i].x, leftPts[i].y);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(rightPts[0].x, rightPts[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(rightPts[i].x, rightPts[i].y);
  ctx.closePath();
  ctx.stroke();

  // Center dashes
  ctx.strokeStyle = ROAD_STRIPE;
  ctx.lineWidth = 2;
  ctx.setLineDash([20, 20]);
  ctx.beginPath();
  ctx.moveTo(pts[0].x * canvasW, pts[0].y * canvasH);
  for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x * canvasW, pts[i].y * canvasH);
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);

  // Finish line
  const fi = 0;
  const fn = (fi + 1) % n;
  const ftx = (pts[fn].x - pts[fi].x) * canvasW;
  const fty = (pts[fn].y - pts[fi].y) * canvasH;
  const flen = Math.sqrt(ftx * ftx + fty * fty) || 1;
  const fnx = -fty / flen;
  const fny = ftx / flen;
  const fx = pts[fi].x * canvasW;
  const fy = pts[fi].y * canvasH;
  // Checkerboard finish line
  const squares = 8;
  const sqW = (tw * 2) / squares;
  ctx.save();
  ctx.translate(fx, fy);
  ctx.rotate(Math.atan2(fty, ftx));
  for (let s = 0; s < squares; s++) {
    ctx.fillStyle = s % 2 === 0 ? "#fff" : "#000";
    ctx.fillRect(-tw + s * sqW, -8, sqW, 8);
    ctx.fillStyle = s % 2 === 0 ? "#000" : "#fff";
    ctx.fillRect(-tw + s * sqW, 0, sqW, 8);
  }
  ctx.restore();
}

export function drawKart(ctx: CanvasRenderingContext2D, kart: Kart, canvasW: number, canvasH: number): void {
  const pos = trackPosToWorld(kart.lapProgress + (kart.lap > 0 ? 0 : 0), kart.lane, canvasW, canvasH);
  // Use lapProgress for world position
  const wp = trackPosToWorld(kart.lapProgress, kart.lane, canvasW, canvasH);

  ctx.save();
  ctx.translate(wp.x, wp.y);
  ctx.rotate(wp.angle + Math.PI / 2 + kart.angle * 0.3);

  const size = 14;
  const isStarred = kart.boostTimer > 0 && kart.item === null;

  // Star effect
  if (kart.boostTimer > 0) {
    ctx.shadowColor = "#fbbf24";
    ctx.shadowBlur = 20;
  }
  if (kart.stunTimer > 0) {
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(Date.now() * 0.02);
  }

  // Kart body
  ctx.fillStyle = kart.color;
  ctx.beginPath();
  ctx.roundRect(-size * 0.6, -size, size * 1.2, size * 2, 4);
  ctx.fill();

  // Kart cockpit
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(0, -size * 0.1, size * 0.35, size * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  // Wheels
  ctx.fillStyle = "#1f2937";
  const wheelW = 5, wheelH = 8;
  ctx.fillRect(-size * 0.7, -size * 0.7, wheelW, wheelH);
  ctx.fillRect(size * 0.7 - wheelW, -size * 0.7, wheelW, wheelH);
  ctx.fillRect(-size * 0.7, size * 0.3, wheelW, wheelH);
  ctx.fillRect(size * 0.7 - wheelW, size * 0.3, wheelW, wheelH);

  // Drift sparks
  if (kart.driftTimer > 0.3) {
    ctx.fillStyle = kart.driftTimer > 0.8 ? "#a855f7" : "#3b82f6";
    for (let i = 0; i < 3; i++) {
      const sx = (Math.random() - 0.5) * size;
      const sy = size + Math.random() * 8;
      ctx.beginPath();
      ctx.arc(sx, sy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Star shimmer
  if (isStarred) {
    ctx.fillStyle = "#fbbf24";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("★", 0, -size - 8);
  }

  ctx.restore();

  // Name tag (player only shown differently)
  if (kart.isPlayer) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.beginPath();
    ctx.roundRect(wp.x - 18, wp.y - size - 22, 36, 14, 3);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 9px Manrope, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("YOU", wp.x, wp.y - size - 15);
    ctx.restore();
  }

  void pos; // suppress unused warning
}

export function drawItem(ctx: CanvasRenderingContext2D, item: Item, canvasW: number, canvasH: number): void {
  if (item.collected) return;
  const wp = trackPosToWorld(item.trackPos, item.lane, canvasW, canvasH);
  const t = Date.now() * 0.003;
  const bob = Math.sin(t + item.id) * 3;

  ctx.save();
  ctx.translate(wp.x, wp.y + bob);

  // Glow
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 18);
  const glowColor = item.type === "mushroom" ? "rgba(239,68,68,0.4)" :
                    item.type === "shell" ? "rgba(34,197,94,0.4)" : "rgba(251,191,36,0.4)";
  gradient.addColorStop(0, glowColor);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();

  // Icon
  ctx.font = "18px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const emoji = item.type === "mushroom" ? "🍄" : item.type === "shell" ? "🐢" : "⭐";
  ctx.fillText(emoji, 0, 0);

  ctx.restore();
}

export function drawShell(ctx: CanvasRenderingContext2D, shell: Shell, canvasW: number, canvasH: number): void {
  if (!shell.active) return;
  const wp = trackPosToWorld(shell.trackPos, shell.lane, canvasW, canvasH);
  ctx.save();
  ctx.translate(wp.x, wp.y);
  ctx.font = "16px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🐢", 0, 0);
  ctx.restore();
}

export function drawParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
  const alpha = p.life / p.maxLife;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawHUD(
  ctx: CanvasRenderingContext2D,
  kart: Kart,
  totalLaps: number,
  countdown: number,
  phase: string,
  totalKarts: number,
  canvasW: number,
  canvasH: number,
  raceTime: number,
  bestLap: number,
): void {
  // Lap counter
  const lapText = `LAP ${Math.min(kart.lap + 1, totalLaps)} / ${totalLaps}`;
  drawText(ctx, lapText, canvasW / 2, 18, {
    font: "bold 18px Manrope, sans-serif",
    color: "#fff",
    shadow: "#000",
    shadowBlur: 6,
  });

  // Position badge
  const pos = kart.rank;
  const suffix = pos === 1 ? "ST" : pos === 2 ? "ND" : pos === 3 ? "RD" : "TH";
  const badgeColor = pos === 1 ? "#fbbf24" : pos === 2 ? "#9ca3af" : pos === 3 ? "#b45309" : "#4b5563";
  ctx.save();
  ctx.fillStyle = badgeColor;
  ctx.beginPath();
  ctx.roundRect(canvasW - 72, 8, 64, 36, 8);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 22px Fraunces, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${pos}${suffix}`, canvasW - 40, 26);
  ctx.restore();

  // Item box
  if (kart.item) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(8, 8, 44, 44, 8);
    ctx.fill();
    ctx.font = "26px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const emoji = kart.item === "mushroom" ? "🍄" : kart.item === "shell" ? "🐢" : "⭐";
    ctx.fillText(emoji, 30, 30);
    ctx.restore();
  }

  // Speed bar
  const barX = 8, barY = canvasH - 60, barW = 80, barH = 14;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, 4);
  ctx.fill();
  ctx.fillStyle = kart.boostTimer > 0 ? "#fbbf24" : "#22c55e";
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW * Math.min(kart.speed, 1), barH, 4);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "9px Manrope, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("SPEED", barX + 2, barY + barH + 10);
  ctx.restore();

  // Race timer
  const mins = Math.floor(raceTime / 60);
  const secs = (raceTime % 60).toFixed(2);
  const timeStr = `${mins}:${secs.padStart(5, "0")}`;
  drawText(ctx, timeStr, canvasW / 2, canvasH - 16, {
    font: "14px Manrope, sans-serif",
    color: "rgba(255,255,255,0.8)",
  });

  // Best lap
  if (bestLap < Infinity) {
    const bl = bestLap;
    const bm = Math.floor(bl / 60);
    const bs = (bl % 60).toFixed(2);
    drawText(ctx, `Best: ${bm}:${bs.padStart(5, "0")}`, canvasW - 40, canvasH - 16, {
      font: "11px Manrope, sans-serif",
      color: "rgba(255,255,255,0.6)",
    });
  }

  // Countdown
  if (phase === "countdown" && countdown > 0) {
    const label = countdown > 3 ? "" : countdown === 3 ? "3" : countdown === 2 ? "2" : countdown === 1 ? "1" : "GO!";
    if (label) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, countdown % 1 + 0.3);
      drawText(ctx, label, canvasW / 2, canvasH / 2, {
        font: `bold ${label === "GO!" ? 72 : 96}px Fraunces, serif`,
        color: label === "GO!" ? "#22c55e" : "#fbbf24",
        shadow: "#000",
        shadowBlur: 20,
      });
      ctx.restore();
    }
  }

  // Rank list (mini)
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath();
  ctx.roundRect(8, canvasH - 130, 90, 14 * totalKarts + 8, 6);
  ctx.fill();
  ctx.restore();
}

export function drawRankList(
  ctx: CanvasRenderingContext2D,
  karts: Kart[],
  canvasH: number,
): void {
  const sorted = [...karts].sort((a, b) => a.rank - b.rank);
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  ctx.roundRect(8, canvasH - 130, 90, 14 * sorted.length + 10, 6);
  ctx.fill();
  sorted.forEach((k, i) => {
    ctx.fillStyle = k.isPlayer ? "#fbbf24" : "#fff";
    ctx.font = `${k.isPlayer ? "bold " : ""}10px Manrope, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`${k.rank}. ${k.name}`, 14, canvasH - 125 + i * 14);
  });
  ctx.restore();
}

export function drawFinishScreen(
  ctx: CanvasRenderingContext2D,
  karts: Kart[],
  playerKart: Kart,
  canvasW: number,
  canvasH: number,
  raceTime: number,
): void {
  // Overlay
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, 0, canvasW, canvasH);

  const cx = canvasW / 2;
  const cy = canvasH / 2;
  const w = Math.min(canvasW - 40, 340);
  const h = Math.min(canvasH - 80, 360);

  ctx.fillStyle = "#1f2937";
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 16);
  ctx.fill();

  ctx.strokeStyle = "#fbbf24";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Title
  const won = playerKart.rank === 1;
  drawText(ctx, won ? "🏆 WINNER!" : `${playerKart.rank}${playerKart.rank === 2 ? "ND" : playerKart.rank === 3 ? "RD" : "TH"} PLACE`, cx, cy - h / 2 + 36, {
    font: "bold 28px Fraunces, serif",
    color: won ? "#fbbf24" : "#e5e7eb",
    shadow: "#000",
    shadowBlur: 8,
  });

  // Race time
  const mins = Math.floor(raceTime / 60);
  const secs = (raceTime % 60).toFixed(2);
  drawText(ctx, `Time: ${mins}:${secs.padStart(5, "0")}`, cx, cy - h / 2 + 72, {
    font: "16px Manrope, sans-serif",
    color: "#9ca3af",
  });

  // Results table
  const sorted = [...karts].sort((a, b) => a.rank - b.rank);
  sorted.forEach((k, i) => {
    const ry = cy - h / 2 + 110 + i * 36;
    const isP = k.isPlayer;
    ctx.fillStyle = isP ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.05)";
    ctx.beginPath();
    ctx.roundRect(cx - w / 2 + 12, ry - 14, w - 24, 28, 6);
    ctx.fill();

    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
    ctx.fillStyle = isP ? "#fbbf24" : "#e5e7eb";
    ctx.font = `${isP ? "bold " : ""}14px Manrope, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`${medal}  ${k.name}`, cx - w / 2 + 20, ry);

    if (k.finishTime > 0) {
      const fm = Math.floor(k.finishTime / 60);
      const fs = (k.finishTime % 60).toFixed(2);
      ctx.textAlign = "right";
      ctx.fillText(`${fm}:${fs.padStart(5, "0")}`, cx + w / 2 - 20, ry);
    }
  });

  // Play again hint
  drawText(ctx, "Tap / Press ENTER to Race Again", cx, cy + h / 2 - 20, {
    font: "13px Manrope, sans-serif",
    color: "#6b7280",
  });

  ctx.restore();
}
