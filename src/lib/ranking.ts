// Leaderboard ordering as a pure function, for the standalone index.html (which has no database).
// Must match src/lib/leaderboard.ts: the same boards, and the same ORDER BY: score high to low,
// then more correct answers, then earlier finish, then id so the order is always total.
import { boardFor, type GameCategory, type GameMode, type LeaderboardBoard } from "./constants";

export interface RankRecord {
  id: string;
  nickname: string;
  /** Missing on records from before modes existed. They were scored differently, so no board shows them. */
  mode?: GameMode;
  category: GameCategory;
  totalScore: number;
  correctCount: number;
  /** ISO timestamp; compares correctly as a string. */
  finishedAt: string;
}

export function compareRecords(a: RankRecord, b: RankRecord): number {
  return (
    b.totalScore - a.totalScore ||
    b.correctCount - a.correctCount ||
    (a.finishedAt < b.finishedAt ? -1 : a.finishedAt > b.finishedAt ? 1 : 0) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** Records on a board, best first. */
export function rankBoard(records: readonly RankRecord[], board: LeaderboardBoard): RankRecord[] {
  return records.filter((r) => r.mode !== undefined && boardFor(r.mode, r.category) === board).sort(compareRecords);
}
