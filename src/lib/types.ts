import type { Category, GameCategory, GameMode, LeaderboardBoard } from "./constants";
import type { ScoreBreakdown } from "./scoring";

/** A question as stored in src/data/questions.json. */
export interface QuestionSeed {
  id: string;
  category: Category;
  difficulty: 1 | 2 | 3;
  question: string;
  choices: string[];
  answer_index: number;
  explanation: string;
  /** Shown only when the player asks for it, which gives up the no-hint bonus. */
  hint: string;
  status?: "active" | "retired";
}

/** The question currently in play, as sent to the client: shuffled choices and no answer or hint. */
export interface DealtQuestion {
  id: string;
  /** 0-based position in this game. */
  position: number;
  category: Category;
  difficulty: number;
  question: string;
  choices: string[];
  /** Time left by the server's clock. Less than the full limit when a question is re-requested. */
  remainingMs: number;
  /** The hint, if the player already asked for it (e.g. before a reload). */
  hint: string | null;
}

export interface StartGameResult {
  sessionId: string;
  nickname: string;
  mode: GameMode;
  category: GameCategory;
  timeLimitMs: number;
  totalQuestions: number;
  /** Only the first question. The rest come from /api/game/next, one at a time. */
  question: DealtQuestion;
}

export interface HintResult {
  hint: string;
}

export interface AnswerResult {
  isCorrect: boolean;
  timedOut: boolean;
  /** Index of the correct choice in the shuffled order the client received. */
  correctIndex: number;
  explanation: string;
  score: number;
  breakdown: ScoreBreakdown;
  hintUsed: boolean;
  combo: number;
  totalScore: number;
  /** Time the score was computed from, after the server applied its own clock. */
  timeSpentMs: number;
  isLast: boolean;
}

export interface CategoryStat {
  category: Category;
  correct: number;
  total: number;
  accuracy: number;
}

export interface BoardRank {
  board: LeaderboardBoard;
  rank: number;
  totalPlayers: number;
}

export interface FinishGameResult {
  sessionId: string;
  nickname: string;
  mode: GameMode;
  category: GameCategory;
  totalScore: number;
  correctCount: number;
  totalQuestions: number;
  categoryStats: CategoryStat[];
  /** Rank on the board for this game's mode (the category's board in category mode). */
  rank: BoardRank;
}

export interface LeaderboardEntry {
  rank: number;
  nickname: string;
  totalScore: number;
  correctCount: number;
  finishedAt: string;
  isMine: boolean;
}

export interface LeaderboardResult {
  board: LeaderboardBoard;
  /** Questions per game on this board, for showing "correct / total". */
  totalQuestions: number;
  entries: LeaderboardEntry[];
  /** The requested session's entry when it is ranked below the top list, otherwise null. */
  me: LeaderboardEntry | null;
  totalPlayers: number;
}
