// Shared by server and client code, so this file must not import anything server-only.

export const CATEGORIES = ["history", "science", "geography", "general"] as const;
export type Category = (typeof CATEGORIES)[number];
/** The category a session is stored with; "random" means questions from every category. */
export type GameCategory = Category | "random";

export const CATEGORY_LABELS: Record<Category, string> = {
  history: "한국사",
  science: "과학",
  geography: "지리",
  general: "일반상식",
};

/**
 * challenge: 10 questions from every category (40), mixed. category: 10 from one category.
 * speed: 20 from all categories, with less time per question.
 */
export const GAME_MODES = ["challenge", "category", "speed"] as const;
export type GameMode = (typeof GAME_MODES)[number];

export interface ModeConfig {
  label: string;
  description: string;
  questionCount: number;
  timeLimitMs: number;
}

export const MODES: Record<GameMode, ModeConfig> = {
  challenge: { label: "전체 도전", description: "네 분야에서 10문제씩, 모두 40문제", questionCount: 40, timeLimitMs: 20_000 },
  category: { label: "카테고리별", description: "고른 분야에서 10문제", questionCount: 10, timeLimitMs: 20_000 },
  speed: { label: "스피드 퀴즈", description: "모든 분야에서 20문제, 문제당 15초", questionCount: 20, timeLimitMs: 15_000 },
};

/** Questions per category in challenge mode. */
export const CHALLENGE_PER_CATEGORY = 10;
/** The longest limit of any mode. */
export const MAX_TIME_LIMIT_MS = Math.max(...Object.values(MODES).map((m) => m.timeLimitMs));

export const CHOICES_PER_QUESTION = 4;

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 10;

/** A game not finished within this window can no longer be played, so it never reaches the leaderboard. */
export const SESSION_TTL_MS = 30 * 60 * 1000;
/**
 * The server times each question from the moment it reveals it. The round trip makes that slightly
 * longer than what the player saw, so this much is forgiven before the server's clock overrides the client's.
 */
export const LATENCY_ALLOWANCE_MS = 1_000;

export const LEADERBOARD_SIZE = 50;
/** One board per mode: challenge, speed, and one per category for category mode. */
export const LEADERBOARD_BOARDS = ["challenge", "speed", ...CATEGORIES] as const;
export type LeaderboardBoard = (typeof LEADERBOARD_BOARDS)[number];
export const DEFAULT_BOARD: LeaderboardBoard = "challenge";

export function isLeaderboardBoard(value: unknown): value is LeaderboardBoard {
  return typeof value === "string" && (LEADERBOARD_BOARDS as readonly string[]).includes(value);
}

export const BOARD_LABELS: Record<LeaderboardBoard, string> = { challenge: "전체 도전", speed: "스피드 퀴즈", ...CATEGORY_LABELS };

/** "전체 도전", "스피드 퀴즈", or "카테고리별 · 한국사". */
export function gameLabel(mode: GameMode, category: GameCategory): string {
  return mode === "category" && isCategory(category) ? `${MODES.category.label} · ${CATEGORY_LABELS[category]}` : MODES[mode].label;
}

/** The board a game counts on. */
export function boardFor(mode: GameMode, category: GameCategory): LeaderboardBoard {
  return mode === "category" ? (category as Category) : mode;
}

export function modeOfBoard(board: LeaderboardBoard): GameMode {
  return isCategory(board) ? "category" : board;
}

export function isGameMode(value: unknown): value is GameMode {
  return typeof value === "string" && (GAME_MODES as readonly string[]).includes(value);
}

export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}

/** Length in code points, so a Korean syllable or an emoji counts as one character. */
export function nicknameLength(nickname: string): number {
  return [...nickname].length;
}
