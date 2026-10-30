import { MAX_TIME_LIMIT_MS } from "./constants";

export const BASE_SCORE = 10;
/** Base score multiplier by difficulty (1 easy, 2 medium, 3 hard). */
export const DIFFICULTY_MULTIPLIER: Record<number, number> = { 1: 1, 2: 1.5, 3: 2 };
/** Answering correctly in less than this earns the speed bonus. */
export const FAST_ANSWER_MS = 10_000;
export const FAST_BONUS = 3;
export const NO_HINT_BONUS = 2;
/** [streak reached, bonus], highest first: every correct answer at 10+ in a row earns +10, at 5–9 +5, at 3–4 +2. */
export const COMBO_TIERS: readonly (readonly [number, number])[] = [
  [10, 10],
  [5, 5],
  [3, 2],
];
export const MAX_COMBO_BONUS = COMBO_TIERS[0][1];
export const MAX_BASE_SCORE = baseScore(3);
export const MAX_SCORE_PER_ANSWER = MAX_BASE_SCORE + FAST_BONUS + NO_HINT_BONUS + MAX_COMBO_BONUS;

export function isTimedOut(timeSpentMs: number, limitMs: number): boolean {
  return timeSpentMs >= limitMs;
}

/** 10 points times the difficulty multiplier: 10, 15 or 20. */
export function baseScore(difficulty: number): number {
  const multiplier = DIFFICULTY_MULTIPLIER[difficulty];
  if (multiplier === undefined) throw new RangeError(`unknown difficulty ${difficulty}`);
  return Math.round(BASE_SCORE * multiplier);
}

/** +3 for an answer in under 10 seconds. */
export function timeBonus(timeSpentMs: number, limitMs = MAX_TIME_LIMIT_MS): number {
  return !isTimedOut(timeSpentMs, limitMs) && timeSpentMs < FAST_ANSWER_MS ? FAST_BONUS : 0;
}

/** Bonus for the `combo`-th correct answer in a row. */
export function comboBonus(combo: number): number {
  return COMBO_TIERS.find(([streak]) => combo >= streak)?.[1] ?? 0;
}

/** Highest total a game can reach with these question difficulties: every answer correct, fast and without hints. */
export function maxGameScore(difficulties: readonly number[]): number {
  return difficulties.reduce((total, d, i) => total + baseScore(d) + FAST_BONUS + NO_HINT_BONUS + comboBonus(i + 1), 0);
}

/** Number of consecutive correct answers at the end of the list. */
export function trailingStreak(results: readonly boolean[]): number {
  let streak = 0;
  for (let i = results.length - 1; i >= 0 && results[i]; i--) streak++;
  return streak;
}

export interface ScoreInput {
  isCorrect: boolean;
  timeSpentMs: number;
  difficulty: number;
  hintUsed: boolean;
  /** Consecutive correct answers before this one. */
  previousCombo: number;
  limitMs: number;
}

export interface ScoreBreakdown {
  base: number;
  timeBonus: number;
  hintBonus: number;
  comboBonus: number;
}

export interface ScoreResult extends ScoreBreakdown {
  score: number;
  /** Consecutive correct answers including this one, or 0 after a miss. */
  combo: number;
}

/** A wrong answer or a timeout scores 0 and resets the combo. Bonuses only come with a correct answer. */
export function scoreAnswer({ isCorrect, timeSpentMs, difficulty, hintUsed, previousCombo, limitMs }: ScoreInput): ScoreResult {
  if (!isCorrect || isTimedOut(timeSpentMs, limitMs)) {
    return { score: 0, base: 0, timeBonus: 0, hintBonus: 0, comboBonus: 0, combo: 0 };
  }
  const combo = previousCombo + 1;
  const parts: ScoreBreakdown = {
    base: baseScore(difficulty),
    timeBonus: timeBonus(timeSpentMs, limitMs),
    hintBonus: hintUsed ? 0 : NO_HINT_BONUS,
    comboBonus: comboBonus(combo),
  };
  return { score: parts.base + parts.timeBonus + parts.hintBonus + parts.comboBonus, ...parts, combo };
}

export const DIFFICULTY_LABELS: Record<number, string> = { 1: "쉬움", 2: "보통", 3: "어려움" };

/** "기본 15 (보통 ×1.5) + 빠른 답변 3 + 힌트 미사용 2 + 콤보 5", listing only the bonuses earned. */
export function describeBreakdown(b: ScoreBreakdown, difficulty: number): string {
  const parts = [`기본 ${b.base} (${DIFFICULTY_LABELS[difficulty]} ×${DIFFICULTY_MULTIPLIER[difficulty]})`];
  if (b.timeBonus > 0) parts.push(`빠른 답변 ${b.timeBonus}`);
  if (b.hintBonus > 0) parts.push(`힌트 미사용 ${b.hintBonus}`);
  if (b.comboBonus > 0) parts.push(`콤보 ${b.comboBonus}`);
  return parts.join(" + ");
}
