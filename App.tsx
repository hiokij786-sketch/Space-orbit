import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { Game, type GameEvent, type Mode, type Telemetry } from "./game/engine";
import { loadScores, saveScore, type ScoreEntry } from "./scores";
import {
  GameOverScreen,
  Hud,
  PauseScreen,
  PopLayer,
  Sigil,
  StartScreen,
} from "./ui";
import plateUrl from "./assets/title-plate.jpg";
import panelUrl from "./assets/panel.jpg";

const EMPTY: Telemetry = {
  score: 0,
  chain: 0,
  mult: 1,
  shields: 3,
  distance: 0,
  speed: 42,
  phase: 1,
  phaseActive: false,
  bestChain: 0,
  cores: 0,
  progress: 0,
  combo: 0,
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Game | null>(null);

  const [mode, setMode] = useState<Mode>("attract");
  const [tel, setTel] = useState<Telemetry>(EMPTY);
  const [pops, setPops] = useState<GameEvent[]>([]);
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [rank, setRank] = useState(-1);
  const [lastRun, setLastRun] = useState<Telemetry>(EMPTY);
  const [flash, setFlash] = useState<"hit" | "phase" | null>(null);
  const [clock, setClock] = useState("--:--:--");

  /* ---- boot the engine once ---- */
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const pushPop = (e: GameEvent) => {
      setPops((p) => [...p.slice(-11), e]);
      window.setTimeout(() => {
        setPops((p) => p.filter((x) => x.id !== e.id));
      }, 950);
    };

    const game = new Game(el, {
      onEvent: (e) => {
        pushPop(e);
        if (e.kind === "hit") {
          setFlash("hit");
          window.setTimeout(() => setFlash(null), 420);
        } else if (e.kind === "phase" || e.kind === "bonus") {
          setFlash("phase");
          window.setTimeout(() => setFlash(null), 260);
        }
      },
      onGameOver: (t) => {
        setLastRun({ ...t });
        const res = saveScore({
          score: t.score,
          distance: t.distance,
          cores: t.cores,
          bestChain: t.bestChain,
        });
        setScores(res.list);
        setRank(res.rank);
      },
      onMode: (m) => setMode(m),
    });
    gameRef.current = game;
    setScores(loadScores());

    return () => {
      game.dispose();
      gameRef.current = null;
    };
  }, []);

  /* ---- keep a light telemetry copy for React (20 Hz, not 60) ---- */
  useEffect(() => {
    const id = window.setInterval(() => {
      const g = gameRef.current;
      if (g) setTel({ ...g.telemetry });
    }, 50);
    return () => window.clearInterval(id);
  }, []);

  /* ---- mission clock ---- */
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClock(
        [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]
          .map((n) => String(n).padStart(2, "0"))
          .join(":")
      );
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  /* ---- global command keys ---- */
  const start = useCallback(() => {
    setPops([]);
    setRank(-1);
    gameRef.current?.startGame();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const g = gameRef.current;
      if (!g) return;
      if (k === "enter") {
        if (mode === "attract" || mode === "gameover") {
          e.preventDefault();
          start();
        }
      } else if (k === "r") {
        if (mode !== "attract") {
          e.preventDefault();
          start();
        }
      } else if (k === "p" || k === "escape") {
        if (mode === "playing") {
          e.preventDefault();
          g.pause();
        } else if (mode === "paused") {
          e.preventDefault();
          g.resume();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, start]);

  const resetLog = useCallback(() => {
    try {
      localStorage.removeItem("orbital-salvage.scores.v1");
    } catch {
      /* noop */
    }
    setScores([]);
    setRank(-1);
  }, []);

  const statusLabel =
    mode === "playing"
      ? "LINK ACTIVE"
      : mode === "paused"
        ? "LINK HELD"
        : mode === "gameover"
          ? "LINK LOST"
          : "LINK STANDBY";

  return (
    <MotionConfig reducedMotion="user">
    <div
      className="grain relative h-[100dvh] w-full overflow-hidden bg-vacuum"
      style={{ "--panel-tex": `url(${panelUrl})` } as React.CSSProperties}
    >
      {/* ---- the live scene ---- */}
      <div ref={mountRef} className="absolute inset-0" aria-hidden="true" />

      {/* ---- material overlays ---- */}
      <div className="vignette pointer-events-none absolute inset-0" />

      {/* ---- damage / phase flash ---- */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: flash === "hit" ? 1 : 0,
          background:
            "radial-gradient(120% 90% at 50% 50%, rgba(255,74,47,0) 32%, rgba(255,74,47,0.5) 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-200"
        style={{
          opacity: flash === "phase" ? 1 : 0,
          background:
            "radial-gradient(120% 90% at 50% 50%, rgba(53,224,216,0) 42%, rgba(53,224,216,0.34) 100%)",
        }}
      />

      {/* ---- left instrument rail ---- */}
      <div className="tick-rail pointer-events-none absolute inset-y-0 left-0 hidden w-11 border-r border-hair/45 xl:block">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-180 [writing-mode:vertical-rl]">
          <span className="legend whitespace-nowrap text-legend">
            Orbital Salvage — Recovery Run 07 — Port Array Nominal
          </span>
        </div>
      </div>

      {/* ---- top bezel ---- */}
      <header className="panel-metal pointer-events-none absolute inset-x-0 top-0 z-50 flex h-12 items-center justify-between gap-4 border-b border-hair/55 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Sigil className="h-6 w-6 shrink-0 text-amber" />
          <span className="legend whitespace-nowrap text-silk/90">Orbital Salvage</span>
          <span className="hairline hidden h-px w-16 sm:block" />
          <span className="legend legend-sm hidden whitespace-nowrap text-legend sm:block">
            Accretion Ring KX-4
          </span>
        </div>

        <div className="flex items-center gap-4 sm:gap-6">
          <div className="hidden items-center gap-2.5 md:flex">
            <span
              className={`h-1.5 w-1.5 ${
                mode === "playing"
                  ? "bg-haz"
                  : mode === "gameover"
                    ? "bg-danger"
                    : "bg-amber"
              }`}
            />
            <span className="legend legend-sm text-legend">{statusLabel}</span>
          </div>
          <div className="tnum font-mono text-[11px] tracking-[0.14em] text-silk/70">
            {clock}
            <span className="ml-1.5 text-legend">UTC</span>
          </div>
        </div>
      </header>

      {/* ---- floating score feedback ---- */}
      <PopLayer pops={pops} />

      {/* ---- HUD ---- */}
      <Hud t={tel} live={mode === "playing"} onPause={() => gameRef.current?.pause()} />

      {/* ---- states ---- */}
      <AnimatePresence mode="wait">
        {mode === "attract" && (
          <StartScreen
            key="start"
            onStart={start}
            list={scores}
            plateUrl={plateUrl}
            onResetLog={resetLog}
          />
        )}
        {mode === "paused" && (
          <PauseScreen
            key="pause"
            onResume={() => gameRef.current?.resume()}
            onRestart={start}
            onQuit={() => gameRef.current?.toAttract()}
          />
        )}
        {mode === "gameover" && (
          <GameOverScreen
            key="over"
            t={lastRun}
            list={scores}
            rank={rank}
            onRestart={start}
            onMenu={() => gameRef.current?.toAttract()}
          />
        )}
      </AnimatePresence>

      {/* ---- scroll hint on the attract screen ---- */}
      {mode === "attract" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1, duration: 0.6 }}
          className="pointer-events-none absolute bottom-6 left-1/2 z-50 hidden -translate-x-1/2 lg:block"
        >
          <div className="flex flex-col items-center gap-2">
            <span className="legend legend-sm text-legend">Drag anywhere to fly</span>
            <div className="h-8 w-px bg-gradient-to-b from-amber/70 to-transparent" />
          </div>
        </motion.div>
      )}
    </div>
    </MotionConfig>
  );
}
