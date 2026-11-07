import { motion } from "framer-motion";
import type { GameEvent, Telemetry } from "./game/engine";
import type { ScoreEntry } from "./scores";

const EASE = [0.2, 0.8, 0.2, 1] as const;

/* ------------------------------------------------------------------ */
/*  Mark — drawn, not generated                                        */
/* ------------------------------------------------------------------ */
export function Sigil({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" fill="none">
      <path
        d="M24 2.6 L42.6 13.3 V34.7 L24 45.4 L5.4 34.7 V13.3 Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <ellipse
        cx="24"
        cy="24"
        rx="17.4"
        ry="7.2"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.75"
        transform="rotate(-24 24 24)"
      />
      <path d="M24 13.2 L30.6 31.4 L24 27.2 L17.4 31.4 Z" fill="currentColor" />
      <circle cx="24" cy="24" r="2.6" fill="currentColor" opacity="0.45" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  HUD                                                                */
/* ------------------------------------------------------------------ */
function Cell({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`panel-metal px-3.5 py-2.5 sm:px-5 sm:py-4 ${className}`}
    >
      <div className="legend legend-sm mb-2.5 text-legend">{label}</div>
      {children}
    </div>
  );
}

function Bar({ value, tint }: { value: number; tint: "amber" | "haz" | "danger" }) {
  const color =
    tint === "amber" ? "#FFB43A" : tint === "haz" ? "#35E0D8" : "#FF4A2F";
  return (
    <div className="relative h-2 w-full overflow-hidden bg-[#0c1016] ring-1 ring-hair/70">
      <div
        className="absolute inset-y-0 left-0 transition-[width] duration-150 ease-out"
        style={{
          width: `${Math.max(0, Math.min(1, value)) * 100}%`,
          background: `linear-gradient(90deg, ${color}33, ${color})`,
          boxShadow: `0 0 12px ${color}88`,
        }}
      />
      <div className="absolute inset-0 [background-image:repeating-linear-gradient(90deg,transparent_0,transparent_11px,rgba(5,7,14,0.55)_11px,rgba(5,7,14,0.55)_12px)]" />
    </div>
  );
}

export function Hud({
  t,
  onPause,
  live,
}: {
  t: Telemetry;
  onPause: () => void;
  live: boolean;
}) {
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 transition-opacity duration-300 ${
        live ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="grid grid-cols-2 gap-px bg-hair/55 lg:grid-cols-4">
        <Cell label="Salvage Score">
          <div className="flex items-end gap-3">
            <div className="tnum glow-amber font-mono text-[clamp(1.9rem,5.4vw,3.15rem)] font-semibold leading-none text-amberlt">
              {String(Math.floor(t.score)).padStart(6, "0")}
            </div>
            <div className="legend legend-sm mb-1 text-amberdk">pts</div>
          </div>
        </Cell>

        <Cell label="Chain Multiplier">
          <div className="flex items-center gap-3">
            <div
              className={`tnum font-mono text-[clamp(1.5rem,3.6vw,2.15rem)] font-semibold leading-none ${
                t.mult > 1 ? "text-haz" : "text-silk/70"
              }`}
            >
              ×{t.mult}
            </div>
            <div className="min-w-0 flex-1">
              <div className="tnum mb-1.5 font-mono text-[10px] text-legend">
                {String(t.chain).padStart(2, "0")} LINKED
              </div>
              <Bar value={t.combo} tint="haz" />
            </div>
          </div>
        </Cell>

        <Cell label="Hull Integrity">
          <div className="flex items-center gap-2 pt-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`h-3 flex-1 border transition-all duration-200 ${
                  i < t.shields
                    ? "border-amber/80 bg-amber shadow-[0_0_14px_rgba(255,180,58,0.55)]"
                    : "border-hair/80 bg-transparent"
                }`}
              />
            ))}
            <div className="tnum ml-2 font-mono text-[11px] text-legend">
              {t.shields}/3
            </div>
          </div>
        </Cell>

        <Cell label="Distance Logged">
          <div className="tnum font-mono text-[clamp(1.5rem,3.6vw,2.15rem)] font-semibold leading-none text-silk">
            {t.distance.toFixed(1)}
            <span className="ml-1.5 text-[11px] tracking-[0.22em] text-legend">KM</span>
          </div>
        </Cell>

        <Cell label="Velocity">
          <div className="mb-2.5 flex items-baseline justify-between">
            <span className="tnum font-mono text-[15px] text-silk">
              {String(Math.round(t.speed * 3.4)).padStart(4, "0")}
            </span>
            <span className="legend legend-sm text-legend">m/s</span>
          </div>
          <Bar value={0.12 + t.progress * 0.88} tint="amber" />
        </Cell>

        <Cell label="Phase Drive">
          <div className="mb-2.5 flex items-baseline justify-between">
            <span
              className={`tnum font-mono text-[15px] ${
                t.phaseActive ? "text-haz" : t.phase >= 1 ? "text-haz/90" : "text-silk/70"
              }`}
            >
              {t.phaseActive ? "BURST" : t.phase >= 1 ? "READY" : "CHARGING"}
            </span>
            <span className="legend legend-sm text-legend">
              {t.phaseActive ? "ACTIVE" : `${Math.round(t.phase * 100)}%`}
            </span>
          </div>
          <Bar value={t.phase} tint="haz" />
        </Cell>

        <Cell label="Cores Banked" className="hidden lg:block">
          <div className="flex items-baseline gap-2">
            <div className="tnum font-mono text-[clamp(1.5rem,3.6vw,2.15rem)] font-semibold leading-none text-amberlt">
              {String(t.cores).padStart(3, "0")}
            </div>
            <div className="legend legend-sm text-legend">units</div>
          </div>
        </Cell>

        <Cell label="Threat Level" className="hidden lg:block">
          <div className="flex items-center gap-3">
            <div
              className={`h-2.5 w-2.5 ${
                t.progress > 0.66 ? "bg-danger pulse-soft" : "bg-amber/70"
              }`}
            />
            <div className="tnum font-mono text-[13px] tracking-[0.12em] text-silk/85">
              {t.progress > 0.66
                ? "CRITICAL — FLARE SWEEP"
                : t.progress > 0.33
                  ? "ELEVATED — DENSE FIELD"
                  : "NOMINAL — RECOVERY LANE"}
            </div>
          </div>
        </Cell>
      </div>

      <button
        type="button"
        onClick={onPause}
        className={`absolute right-3 -top-[52px] flex h-10 items-center gap-2 border border-hair/80 bg-panel/85 px-4 legend text-silk backdrop-blur-[2px] transition-colors hover:border-amber/70 hover:text-amberlt focus-visible:outline-2 focus-visible:outline-haz ${
          live ? "pointer-events-auto" : "pointer-events-none"
        }`}
      >
        <span className="flex gap-[3px]">
          <span className="block h-3 w-[3px] bg-current" />
          <span className="block h-3 w-[3px] bg-current" />
        </span>
        Pause
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Floating score feedback                                            */
/* ------------------------------------------------------------------ */
export function PopLayer({ pops }: { pops: GameEvent[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {pops.map((p) => {
        const tone =
          p.kind === "hit"
            ? "#FF4A2F"
            : p.kind === "phase" || p.kind === "bonus"
              ? "#35E0D8"
              : "#FFD27A";
        return (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 8, scale: 0.82 }}
            animate={{ opacity: 1, y: -34, scale: 1 }}
            exit={{ opacity: 0, y: -58, scale: 0.94 }}
            transition={{ duration: 0.85, ease: EASE }}
            className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-mono text-[13px] font-semibold tracking-[0.16em]"
            style={{ left: `${p.sx}%`, top: `${p.sy}%`, color: tone, textShadow: `0 0 18px ${tone}88` }}
          >
            {p.text}
          </motion.div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Flight log (local high scores)                                     */
/* ------------------------------------------------------------------ */
export function FlightLog({
  list,
  highlight = -1,
  compact = false,
}: {
  list: ScoreEntry[];
  highlight?: number;
  compact?: boolean;
}) {
  return (
    <div className="border border-hair/70 bg-panel/72 backdrop-blur-[3px]">
      <div className="flex items-center justify-between border-b border-hair/70 px-4 py-3">
        <span className="legend text-silk/80">Flight Log — Local</span>
        <span className="legend legend-sm text-amberdk">Top 8</span>
      </div>

      {list.length === 0 ? (
        <div className="px-4 py-8">
          <div className="legend text-legend">No runs logged</div>
          <p className="mt-3 max-w-[30ch] font-mono text-[11px] leading-[1.8] text-legend/85">
            The hangar is quiet. Break the field open and your call sign gets
            stamped into the plate.
          </p>
        </div>
      ) : (
        <ol className="divide-y divide-hair/40">
          {list.map((e, i) => {
            const hot = i === highlight;
            return (
              <motion.li
                key={`${e.date}-${e.score}-${i}`}
                initial={hot ? { opacity: 0, x: -14, backgroundColor: "rgba(255,180,58,0.22)" } : false}
                animate={{ opacity: 1, x: 0, backgroundColor: "rgba(255,180,58,0)" }}
                transition={{ duration: 0.55, ease: EASE, delay: hot ? 0.12 : 0 }}
                className={`flex items-center gap-3 px-4 ${compact ? "py-2" : "py-3"}`}
              >
                <span
                  className={`tnum w-6 font-mono text-[11px] ${
                    i === 0 ? "text-amber" : "text-legend"
                  }`}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className={`font-mono text-[11px] tracking-[0.14em] ${
                    hot ? "text-amberlt" : "text-silk/75"
                  }`}
                >
                  {e.tag}
                </span>
                <span className="tnum ml-auto font-mono text-[13px] font-semibold text-silk">
                  {String(e.score).padStart(6, "0")}
                </span>
                <span className="tnum w-16 text-right font-mono text-[10px] text-legend">
                  {e.distance.toFixed(1)} km
                </span>
              </motion.li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared framing                                                     */
/* ------------------------------------------------------------------ */
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.075, delayChildren: 0.06 } },
};
const riseIn = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.52, ease: EASE } },
};

function Controls() {
  const rows: [string, React.ReactNode][] = [
    ["Steer skiff", <><kbd>←</kbd><kbd>→</kbd><span className="legend legend-sm px-1 text-legend">or</span><kbd>A</kbd><kbd>D</kbd></>],
    ["Climb / dive", <><kbd>W</kbd><kbd>S</kbd></>],
    ["Phase burst", <kbd className="px-3">SPACE</kbd>],
    ["Pause", <><kbd>P</kbd><kbd>ESC</kbd></>],
    ["Instant restart", <kbd>R</kbd>],
  ];
  return (
    <dl className="mt-9 grid max-w-[560px] grid-cols-1 gap-x-12 sm:grid-cols-2">
      {rows.map(([label, keys]) => (
        <div
          key={label}
          className="flex items-center justify-between gap-4 border-b border-hair/40 py-3"
        >
          <dt className="legend text-legend">{label}</dt>
          <dd className="flex items-center gap-1.5">{keys}</dd>
        </div>
      ))}
      <div className="flex items-center justify-between gap-4 border-b border-hair/40 py-3 sm:col-span-2">
        <dt className="legend text-haz/85">Touch</dt>
        <dd className="font-mono text-[11px] tracking-[0.12em] text-silk/80">
          DRAG ANYWHERE TO STEER — TAP TO PHASE
        </dd>
      </div>
    </dl>
  );
}

/* ------------------------------------------------------------------ */
/*  Start screen                                                       */
/* ------------------------------------------------------------------ */
export function StartScreen({
  onStart,
  list,
  plateUrl,
  onResetLog,
}: {
  onStart: () => void;
  list: ScoreEntry[];
  plateUrl: string;
  onResetLog: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.28, ease: EASE } }}
      transition={{ duration: 0.4 }}
      className="absolute inset-0 z-40 overflow-y-auto overscroll-contain"
    >
      <div className="min-h-full w-full bg-[linear-gradient(102deg,rgba(5,7,14,0.96)_0%,rgba(5,7,14,0.9)_34%,rgba(5,7,14,0.42)_66%,rgba(5,7,14,0.78)_100%)]">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="mx-auto grid min-h-[100dvh] w-full max-w-[1520px] grid-cols-1 items-center gap-y-12 px-5 pb-24 pt-24 lg:grid-cols-[1.12fr_0.88fr] lg:gap-x-16 lg:pb-16 lg:pl-14 lg:pr-10 lg:pt-24"
        >
          {/* ---- left: the lockup ---- */}
          <div>
            <motion.div variants={riseIn} className="mb-6 flex items-center gap-3">
              <Sigil className="h-7 w-7 text-amber" />
              <span className="legend text-haz">Recovery Run 07</span>
              <span className="hairline hidden h-px flex-1 sm:block" />
              <span className="legend legend-sm text-legend">Accretion Ring KX-4</span>
            </motion.div>

            <motion.h1
              variants={riseIn}
              className="-ml-[0.06em] font-display text-[clamp(3.25rem,9.5vw,9rem)] font-bold uppercase leading-[0.82] tracking-[-0.025em]"
            >
              <span className="block text-silk">Orbital</span>
              <span className="glow-amber block text-amber">Salvage</span>
            </motion.h1>

            <motion.div variants={riseIn} className="hairline my-8 h-px w-[min(560px,82vw)]" />

            <motion.p
              variants={riseIn}
              className="max-w-[48ch] font-mono text-[13.5px] leading-[1.85] text-silk/85 sm:text-[15px]"
            >
              The star is collapsing and the ring is coming apart. Fly the skiff
              through the debris field, phase the flare walls, and bank every
              isotope core you can carry. Three hull breaches and the run is over.
            </motion.p>

            <motion.div variants={riseIn} className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4">
              <button type="button" className="switch" onClick={onStart}>
                Engage
                <span aria-hidden="true">▸</span>
              </button>
              <div className="flex items-center gap-3">
                <span className="legend legend-sm text-legend">or press</span>
                <kbd>ENTER</kbd>
              </div>
            </motion.div>

            <motion.div variants={riseIn}>
              <Controls />
            </motion.div>
          </div>

          {/* ---- right: plate + log ---- */}
          <motion.div variants={riseIn} className="w-full">
            <div className="relative aspect-[3/2] w-full overflow-hidden border border-hair/70">
              <img
                src={plateUrl}
                alt="Salvage skiff banking toward the accretion ring"
                className="h-full w-full object-cover object-[58%_52%] saturate-[0.82] contrast-[1.06]"
                onError={(e) => {
                  const el = e.currentTarget;
                  el.style.display = "none";
                  if (el.parentElement)
                    el.parentElement.style.background =
                      "radial-gradient(120% 90% at 22% 78%, rgba(255,180,58,0.35), transparent 58%), radial-gradient(90% 80% at 78% 18%, rgba(53,224,216,0.18), transparent 60%), #060911";
                }}
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(5,7,14,0.1)_0%,rgba(5,7,14,0.82)_100%)]" />
              <div className="pointer-events-none absolute inset-0 bg-amber/12 mix-blend-overlay" />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-4">
                <div>
                  <div className="legend text-amberlt">Plate 07</div>
                  <div className="mt-1.5 font-mono text-[11px] leading-[1.7] text-silk/75">
                    Skiff <span className="text-amberlt">KESTREL</span> mid-burn,
                    2.4 km off the ring
                  </div>
                </div>
                <div className="sweep-line h-8 w-px bg-amber/60" />
              </div>
            </div>

            <div className="mt-6">
              <FlightLog list={list} />
            </div>

            {list.length > 0 && (
              <button
                type="button"
                onClick={onResetLog}
                className="legend legend-sm mt-4 text-legend underline decoration-hair underline-offset-4 transition-colors hover:text-danger"
              >
                Purge flight log
              </button>
            )}
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pause — a full-width instrument band, not a floating card          */
/* ------------------------------------------------------------------ */
export function PauseScreen({
  onResume,
  onRestart,
  onQuit,
}: {
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      transition={{ duration: 0.22 }}
      className="absolute inset-0 z-40 flex items-center bg-vacuum/58 backdrop-blur-[3px]"
    >
      <motion.div
        initial={{ y: 26, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.34, ease: EASE }}
        className="w-full border-y border-hair/80 bg-panel/92 py-10 shadow-[0_-24px_80px_-20px_rgba(5,7,14,0.9)]"
      >
        <div className="mx-auto flex max-w-[1200px] flex-col gap-9 px-6 lg:flex-row lg:items-center lg:justify-between lg:px-10">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <span className="h-2.5 w-2.5 bg-amber pulse-soft" />
              <span className="legend text-amber">Hold — system paused</span>
            </div>
            <h2 className="font-display text-[clamp(1.9rem,5vw,3.6rem)] font-bold uppercase leading-[0.9] tracking-[-0.02em] text-silk">
              Telemetry
              <span className="text-legend"> held</span>
            </h2>
            <p className="mt-4 max-w-[42ch] font-mono text-[12px] leading-[1.85] text-silk/70">
              The ring keeps turning while you sit idle. Resume when ready —
              your chain multiplier is frozen, not lost.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <button type="button" className="switch" onClick={onResume}>
              Resume
            </button>
            <button type="button" className="switch switch-ghost" onClick={onRestart}>
              Restart run
            </button>
            <button
              type="button"
              onClick={onQuit}
              className="legend legend-sm text-legend underline decoration-hair underline-offset-4 transition-colors hover:text-danger"
            >
              Stand down
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Game over                                                          */
/* ------------------------------------------------------------------ */
export function GameOverScreen({
  t,
  list,
  rank,
  onRestart,
  onMenu,
}: {
  t: Telemetry;
  list: ScoreEntry[];
  rank: number;
  onRestart: () => void;
  onMenu: () => void;
}) {
  const stats: [string, string][] = [
    ["Final score", String(Math.floor(t.score)).padStart(6, "0")],
    ["Distance", `${t.distance.toFixed(1)} KM`],
    ["Cores banked", String(t.cores).padStart(3, "0")],
    ["Best chain", `${String(t.bestChain).padStart(2, "0")} LINK`],
    ["Peak multiplier", `×${Math.min(8, 1 + Math.floor(t.bestChain / 3))}`],
    ["Final velocity", `${String(Math.round(t.speed * 3.4)).padStart(4, "0")} m/s`],
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.24 } }}
      transition={{ duration: 0.35 }}
      className="absolute inset-0 z-40 overflow-y-auto overscroll-contain"
    >
      <div className="min-h-full w-full bg-[linear-gradient(102deg,rgba(5,7,14,0.95)_0%,rgba(5,7,14,0.86)_40%,rgba(20,8,4,0.5)_72%,rgba(5,7,14,0.82)_100%)]">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="mx-auto grid min-h-[100dvh] w-full max-w-[1520px] grid-cols-1 items-center gap-y-12 px-5 pb-24 pt-24 lg:grid-cols-[1.12fr_0.88fr] lg:gap-x-16 lg:pb-16 lg:pl-14 lg:pr-10 lg:pt-24"
        >
          <div>
            <motion.div variants={riseIn} className="mb-6 flex items-center gap-3">
              <span className="h-2.5 w-2.5 bg-danger" />
              <span className="legend text-danger">Hull breach — run terminated</span>
              <span className="hairline hidden h-px flex-1 sm:block" />
            </motion.div>

            <motion.h2
              variants={riseIn}
              className="-ml-[0.06em] font-display text-[clamp(2.5rem,7vw,6.5rem)] font-bold uppercase leading-[0.84] tracking-[-0.025em]"
            >
              <span className="block text-silk">Run</span>
              <span className="block text-danger">Terminated</span>
            </motion.h2>

            <motion.div variants={riseIn} className="hairline my-8 h-px w-[min(560px,82vw)]" />

            <motion.div variants={riseIn} className="grid max-w-[620px] grid-cols-2 gap-px bg-hair/45 sm:grid-cols-3">
              {stats.map(([k, v], i) => (
                <div key={k} className="bg-panel/85 px-4 py-4">
                  <div className="legend legend-sm mb-2.5">{k}</div>
                  <div
                    className={`tnum font-mono text-[clamp(1.05rem,2.6vw,1.55rem)] font-semibold leading-none ${
                      i === 0 ? "glow-amber text-amberlt" : "text-silk"
                    }`}
                  >
                    {v}
                  </div>
                </div>
              ))}
            </motion.div>

            <motion.div variants={riseIn} className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4">
              <button type="button" className="switch" onClick={onRestart}>
                Run it again
                <span aria-hidden="true">▸</span>
              </button>
              <button type="button" className="switch switch-ghost" onClick={onMenu}>
                Flight log
              </button>
              <div className="flex items-center gap-3">
                <span className="legend legend-sm text-legend">or press</span>
                <kbd>R</kbd>
              </div>
            </motion.div>
          </div>

          <motion.div variants={riseIn} className="w-full">
            {rank === 0 && (
              <div className="mb-5 border-l-2 border-amber bg-amber/10 px-5 py-4">
                <div className="legend text-amberlt">New flight record</div>
                <p className="mt-2 font-mono text-[12px] leading-[1.8] text-silk/85">
                  Top of the log. The plate is stamped and the hangar lights are
                  on your skiff.
                </p>
              </div>
            )}
            {rank > 0 && rank < 8 && (
              <div className="mb-5 border-l-2 border-haz bg-haz/8 px-5 py-4">
                <div className="legend text-haz">Logged at position {String(rank + 1).padStart(2, "0")}</div>
                <p className="mt-2 font-mono text-[12px] leading-[1.8] text-silk/85">
                  Run recorded in the local flight log. Beat your own line to
                  climb.
                </p>
              </div>
            )}
            <FlightLog list={list} highlight={rank >= 0 ? rank : -1} />
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}
