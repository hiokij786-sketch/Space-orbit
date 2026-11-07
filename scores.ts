export interface ScoreEntry {
  score: number;
  distance: number;
  cores: number;
  bestChain: number;
  date: string;
  tag: string;
}

const KEY = "orbital-salvage.scores.v1";
const MAX = 8;

/** Deterministic pilot tag so runs feel logged rather than anonymous. */
function makeTag(): string {
  const A = "ACDEFGHJKLMNPRSTUVWXYZ";
  const n = Math.floor(Math.random() * 900) + 100;
  return (
    A[Math.floor(Math.random() * A.length)] +
    A[Math.floor(Math.random() * A.length)] +
    "-" +
    n
  );
}

export function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is ScoreEntry =>
          !!e && typeof e.score === "number" && typeof e.distance === "number"
      )
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function saveScore(entry: {
  score: number;
  distance: number;
  cores: number;
  bestChain: number;
}): { list: ScoreEntry[]; rank: number } {
  const list = loadScores();
  const rec: ScoreEntry = {
    score: Math.round(entry.score),
    distance: Math.round(entry.distance * 10) / 10,
    cores: entry.cores,
    bestChain: entry.bestChain,
    date: new Date().toISOString().slice(0, 10).replace(/-/g, "."),
    tag: makeTag(),
  };
  list.push(rec);
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, MAX);
  const rank = trimmed.indexOf(rec);
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    /* storage unavailable — keep the run in memory only */
  }
  return { list: trimmed, rank };
}

export function bestScore(): number {
  const l = loadScores();
  return l.length ? l[0].score : 0;
}
