import { GameShell, GameTopbar } from "@freegamestore/games";
import { useRef, useState, useCallback, useEffect } from "react";
import { useControls } from "./hooks/useControls";
import { useGameLoop } from "./hooks/useGameLoop";
import { useHighScore } from "./hooks/useHighScore";
import { drawTrack, drawKart, drawItem, drawShell, drawParticle, drawHUD, drawRankList, drawFinishScreen } from "./lib/renderer";
import {
  createKarts, createItems, updatePlayer, updateAI, checkItemCollection,
  usePlayerItem, updateShells, updateRankings, updateParticles, spawnStarParticles,
  TOTAL_LAPS, nextId,
} from "./lib/gameLogic";
import { trackPosToWorld } from "./lib/track";
import type { GamePhase, Kart, Item, Shell, Particle } from "./types";

const NUM_KARTS = 5;
const COUNTDOWN_DURATION = 4; // 3,2,1,GO

interface GameState {
  phase: GamePhase;
  karts: Kart[];
  items: Item[];
  shells: Shell[];
  particles: Particle[];
  countdown: number;
  raceTime: number;
  bestLap: number;
  lapStartTime: number;
  score: number;
}

function createInitialState(): GameState {
  return {
    phase: "menu",
    karts: createKarts(NUM_KARTS),
    items: createItems(),
    shells: [],
    particles: [],
    countdown: COUNTDOWN_DURATION,
    raceTime: 0,
    bestLap: Infinity,
    lapStartTime: 0,
    score: 0,
  };
}

// Touch control zones
interface TouchZones {
  left: boolean;
  right: boolean;
  accel: boolean;
  brake: boolean;
  item: boolean;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(createInitialState());
  const controls = useControls();
  const touchZones = useRef<TouchZones>({ left: false, right: false, accel: false, brake: false, item: false });
  const [phase, setPhase] = useState<GamePhase>("menu");
  const [score, setScore] = useState(0);
  const [highScore, updateHighScore] = useHighScore("kartracers_highscore");
  const isDark = useRef(window.matchMedia("(prefers-color-scheme: dark)").matches);
  const itemUsedRef = useRef(false);
  const enterPressedRef = useRef(false);

  // Detect dark mode
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => { isDark.current = e.matches; };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const startRace = useCallback(() => {
    stateRef.current = {
      ...createInitialState(),
      phase: "countdown",
    };
    stateRef.current.phase = "countdown";
    setPhase("countdown");
    setScore(0);
  }, []);

  const handleKeyItem = useCallback(() => {
    const s = stateRef.current;
    if (s.phase !== "racing") return;
    const player = s.karts.find(k => k.isPlayer);
    if (!player) return;
    if (!itemUsedRef.current) {
      itemUsedRef.current = true;
      usePlayerItem(player, s.shells);
      setTimeout(() => { itemUsedRef.current = false; }, 200);
    }
  }, []);

  // Keyboard item use
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "z" || e.key === "Z") handleKeyItem();
      if ((e.key === "Enter" || e.key === " ") && stateRef.current.phase === "finished") {
        if (!enterPressedRef.current) {
          enterPressedRef.current = true;
          startRace();
          setTimeout(() => { enterPressedRef.current = false; }, 300);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleKeyItem, startRace]);

  const gameLoop = useCallback((dt: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const s = stateRef.current;
    const W = canvas.width;
    const H = canvas.height;

    // --- UPDATE ---
    if (s.phase === "countdown") {
      s.countdown -= dt;
      if (s.countdown <= 0) {
        s.phase = "racing";
        s.lapStartTime = 0;
        setPhase("racing");
      }
    }

    if (s.phase === "racing") {
      s.raceTime += dt;

      const player = s.karts.find(k => k.isPlayer)!;
      const prevLap = player.lap;

      // Player input
      updatePlayer(
        player, dt,
        controls.keys,
        touchZones.current.left,
        touchZones.current.right,
        touchZones.current.accel,
        touchZones.current.brake,
        W, H,
      );

      // Lap timing
      if (player.lap > prevLap) {
        const lapTime = s.raceTime - s.lapStartTime;
        s.lapStartTime = s.raceTime;
        if (lapTime < s.bestLap) s.bestLap = lapTime;
      }

      // AI karts
      for (const kart of s.karts) {
        if (!kart.isPlayer) updateAI(kart, dt, player, W, H);
      }

      // Item collection
      for (const kart of s.karts) {
        checkItemCollection(kart, s.items);
      }

      // Shells
      const shellParticles = updateShells(s.shells, s.karts, dt, W, H);
      // Position particles at shell positions (approximate)
      for (const p of shellParticles) {
        p.x = W / 2 + (Math.random() - 0.5) * 60;
        p.y = H / 2 + (Math.random() - 0.5) * 60;
        s.particles.push(p);
      }

      // Star boost particles for player
      if (player.boostTimer > 0 && Math.random() < 0.3) {
        const wp = trackPosToWorld(player.lapProgress, player.lane, W, H);
        const ps = spawnStarParticles(wp.x, wp.y, 4);
        s.particles.push(...ps);
      }

      // Rankings
      updateRankings(s.karts);

      // Score = position bonus
      const newScore = Math.max(0, (NUM_KARTS - player.rank + 1) * 100 + Math.floor(s.raceTime * 0.1));
      s.score = newScore;

      // Check finish
      const allFinished = s.karts.every(k => k.finished || k.lap >= TOTAL_LAPS);
      if (player.finished || player.lap >= TOTAL_LAPS) {
        if (!player.finished) {
          player.finished = true;
          player.finishTime = s.raceTime;
        }
        // Give AI karts finish times
        for (const k of s.karts) {
          if (!k.isPlayer && !k.finished) {
            k.finished = true;
            k.finishTime = s.raceTime + (Math.random() * 10 + 2);
          }
        }
        const finalScore = Math.max(0, (NUM_KARTS - player.rank + 1) * 1000 + Math.floor(1000 / s.raceTime * 100));
        updateHighScore(finalScore);
        setScore(finalScore);
        s.phase = "finished";
        setPhase("finished");
      }
      void allFinished;
    }

    // Particles
    updateParticles(s.particles, dt);

    // --- RENDER ---
    ctx.clearRect(0, 0, W, H);

    // Track
    drawTrack(ctx, W, H, isDark.current);

    // Items
    for (const item of s.items) drawItem(ctx, item, W, H);

    // Shells
    for (const shell of s.shells) drawShell(ctx, shell, W, H);

    // Karts (draw player last so it's on top)
    const sortedKarts = [...s.karts].sort((a, b) => {
      if (a.isPlayer) return 1;
      if (b.isPlayer) return -1;
      return 0;
    });
    for (const kart of sortedKarts) drawKart(ctx, kart, W, H);

    // Particles
    for (const p of s.particles) drawParticle(ctx, p);

    // HUD
    if (s.phase === "racing" || s.phase === "countdown") {
      const player = s.karts.find(k => k.isPlayer)!;
      drawHUD(ctx, player, TOTAL_LAPS, s.countdown, s.phase, NUM_KARTS, W, H, s.raceTime, s.bestLap);
      drawRankList(ctx, s.karts, H);
    }

    // Finish screen
    if (s.phase === "finished") {
      const player = s.karts.find(k => k.isPlayer)!;
      drawTrack(ctx, W, H, isDark.current);
      for (const kart of s.karts) drawKart(ctx, kart, W, H);
      drawFinishScreen(ctx, s.karts, player, W, H, s.raceTime);
    }
  }, [controls, updateHighScore]);

  useGameLoop(gameLoop, phase === "menu");

  // Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);
    return () => ro.disconnect();
  }, []);

  // Touch handlers for virtual controls
  const handleTouchStart = useCallback((zone: keyof TouchZones) => (e: React.TouchEvent) => {
    e.preventDefault();
    touchZones.current[zone] = true;
    if (zone === "item") handleKeyItem();
  }, [handleKeyItem]);

  const handleTouchEnd = useCallback((zone: keyof TouchZones) => (e: React.TouchEvent) => {
    e.preventDefault();
    touchZones.current[zone] = false;
  }, []);

  // Prevent context menu on long press
  const preventContextMenu = useCallback((e: React.MouseEvent) => e.preventDefault(), []);

  void nextId; // suppress unused

  return (
    <GameShell topbar={<GameTopbar title="Kart Racers" score={score} highScore={highScore} />}>
      <div className="relative w-full h-full overflow-hidden" style={{ background: "var(--surface)" }}>
        {/* Game Canvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ touchAction: "none" }}
          onContextMenu={preventContextMenu}
        />

        {/* Menu Screen */}
        {phase === "menu" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6"
            style={{ background: "rgba(0,0,0,0.82)" }}>
            <div className="text-center">
              <div className="text-6xl mb-2">🏎️</div>
              <h1 className="text-5xl font-bold text-white mb-1" style={{ fontFamily: "Fraunces, serif" }}>
                Kart Racers
              </h1>
              <p className="text-gray-400 text-sm">3 Laps · 5 Opponents · Power-ups</p>
            </div>

            <div className="bg-gray-800 rounded-2xl p-4 text-sm text-gray-300 max-w-xs w-full mx-4">
              <div className="font-bold text-white mb-2 text-center">Controls</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>🎮 <span className="text-white">Arrow Keys / WASD</span></div>
                <div>🚀 <span className="text-white">Move &amp; Steer</span></div>
                <div>⚡ <span className="text-white">Space / Z</span></div>
                <div>🎁 <span className="text-white">Use Item</span></div>
                <div>🏄 <span className="text-white">Hold turn + speed</span></div>
                <div>✨ <span className="text-white">Drift Boost</span></div>
              </div>
            </div>

            {highScore > 0 && (
              <p className="text-yellow-400 text-sm">🏆 Best Score: {highScore.toLocaleString()}</p>
            )}

            <button
              onClick={startRace}
              className="px-10 py-4 rounded-2xl text-xl font-bold text-white transition-transform active:scale-95"
              style={{ background: "var(--accent)", fontFamily: "Fraunces, serif", minWidth: 200, minHeight: 56 }}
            >
              START RACE 🏁
            </button>
          </div>
        )}

        {/* Touch Controls Overlay (shown during racing/countdown) */}
        {(phase === "racing" || phase === "countdown") && (
          <div className="absolute inset-0 pointer-events-none select-none">
            {/* Left side: steer left + brake */}
            <div className="absolute bottom-0 left-0 flex flex-col gap-2 p-3 pointer-events-auto">
              <button
                className="w-16 h-16 rounded-2xl text-2xl font-bold flex items-center justify-center active:scale-95 transition-transform"
                style={{ background: "rgba(0,0,0,0.55)", color: "#fff", border: "2px solid rgba(255,255,255,0.2)", touchAction: "none" }}
                onTouchStart={handleTouchStart("left")}
                onTouchEnd={handleTouchEnd("left")}
                onMouseDown={() => { touchZones.current.left = true; }}
                onMouseUp={() => { touchZones.current.left = false; }}
              >◀</button>
              <button
                className="w-16 h-16 rounded-2xl text-2xl font-bold flex items-center justify-center active:scale-95 transition-transform"
                style={{ background: "rgba(0,0,0,0.55)", color: "#fff", border: "2px solid rgba(255,255,255,0.2)", touchAction: "none" }}
                onTouchStart={handleTouchStart("brake")}
                onTouchEnd={handleTouchEnd("brake")}
                onMouseDown={() => { touchZones.current.brake = true; }}
                onMouseUp={() => { touchZones.current.brake = false; }}
              >🛑</button>
            </div>

            {/* Right side: steer right + accelerate + item */}
            <div className="absolute bottom-0 right-0 flex flex-col gap-2 p-3 pointer-events-auto">
              <button
                className="w-16 h-16 rounded-2xl text-2xl font-bold flex items-center justify-center active:scale-95 transition-transform"
                style={{ background: "rgba(251,191,36,0.7)", color: "#fff", border: "2px solid rgba(255,255,255,0.3)", touchAction: "none" }}
                onTouchStart={handleTouchStart("item")}
                onTouchEnd={handleTouchEnd("item")}
                onMouseDown={() => handleKeyItem()}
              >🎁</button>
              <button
                className="w-16 h-16 rounded-2xl text-2xl font-bold flex items-center justify-center active:scale-95 transition-transform"
                style={{ background: "rgba(34,197,94,0.7)", color: "#fff", border: "2px solid rgba(255,255,255,0.3)", touchAction: "none" }}
                onTouchStart={handleTouchStart("accel")}
                onTouchEnd={handleTouchEnd("accel")}
                onMouseDown={() => { touchZones.current.accel = true; }}
                onMouseUp={() => { touchZones.current.accel = false; }}
              >▶</button>
              <button
                className="w-16 h-16 rounded-2xl text-2xl font-bold flex items-center justify-center active:scale-95 transition-transform"
                style={{ background: "rgba(0,0,0,0.55)", color: "#fff", border: "2px solid rgba(255,255,255,0.2)", touchAction: "none" }}
                onTouchStart={handleTouchStart("right")}
                onTouchEnd={handleTouchEnd("right")}
                onMouseDown={() => { touchZones.current.right = true; }}
                onMouseUp={() => { touchZones.current.right = false; }}
              >▶</button>
            </div>
          </div>
        )}

        {/* Tap to play again on finish */}
        {phase === "finished" && (
          <button
            className="absolute bottom-6 left-1/2 -translate-x-1/2 px-8 py-4 rounded-2xl text-lg font-bold text-white transition-transform active:scale-95"
            style={{ background: "var(--accent)", fontFamily: "Fraunces, serif", minHeight: 56, zIndex: 10 }}
            onClick={startRace}
          >
            🏁 Race Again
          </button>
        )}
      </div>
    </GameShell>
  );
}
