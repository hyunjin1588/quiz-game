// Server-only. The leaderboard is a query over finished sessions; there is no separate table.
import { LEADERBOARD_SIZE, MODES, modeOfBoard, type LeaderboardBoard } from "./constants";
import type { DB } from "./db";
import type { BoardRank, LeaderboardEntry, LeaderboardResult } from "./types";

/**
 * Finished sessions on a board: one mode, and in category mode one category. Games from before
 * modes existed have mode NULL and appear on no board.
 */
const ON_BOARD = `finished_at IS NOT NULL AND mode = @mode AND (@mode <> 'category' OR category = @board)`;

/**
 * Ranks every finished session on a board. Order: score high to low, then more correct answers,
 * then whoever finished first. `id` is a last resort so the order is always total.
 */
const RANKED = `
  WITH ranked AS (
    SELECT id, nickname, total_score, correct_count, finished_at,
           ROW_NUMBER() OVER (ORDER BY total_score DESC, correct_count DESC, finished_at ASC, id ASC) AS rank
    FROM sessions
    WHERE ${ON_BOARD}
  )`;

interface RankedRow {
  id: string;
  nickname: string;
  total_score: number;
  correct_count: number;
  finished_at: string;
  rank: number;
}

const toEntry = (r: RankedRow, mySessionId: string | null): LeaderboardEntry => ({
  rank: r.rank,
  nickname: r.nickname,
  totalScore: r.total_score,
  correctCount: r.correct_count,
  finishedAt: r.finished_at,
  isMine: r.id === mySessionId,
});

const boardParams = (board: LeaderboardBoard) => ({ board, mode: modeOfBoard(board) });

function countPlayers(db: DB, board: LeaderboardBoard): number {
  const { n } = db.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE ${ON_BOARD}`).get(boardParams(board)) as {
    n: number;
  };
  return n;
}

export function getLeaderboard(
  db: DB,
  board: LeaderboardBoard,
  mySessionId: string | null = null,
  limit = LEADERBOARD_SIZE,
): LeaderboardResult {
  const rows = db
    .prepare(`${RANKED} SELECT * FROM ranked WHERE rank <= @limit OR id = @me ORDER BY rank`)
    .all({ ...boardParams(board), limit, me: mySessionId }) as RankedRow[];
  const entries = rows.filter((r) => r.rank <= limit).map((r) => toEntry(r, mySessionId));
  const outside = rows.find((r) => r.rank > limit);
  return {
    board,
    totalQuestions: MODES[modeOfBoard(board)].questionCount,
    entries,
    me: outside ? toEntry(outside, mySessionId) : null,
    totalPlayers: countPlayers(db, board),
  };
}

/** The session's rank on a board, or null if it isn't on that board (unfinished, or another mode or category). */
export function rankOn(db: DB, board: LeaderboardBoard, sessionId: string): BoardRank | null {
  const row = db.prepare(`${RANKED} SELECT rank FROM ranked WHERE id = @id`).get({ ...boardParams(board), id: sessionId }) as
    | { rank: number }
    | undefined;
  return row ? { board, rank: row.rank, totalPlayers: countPlayers(db, board) } : null;
}
