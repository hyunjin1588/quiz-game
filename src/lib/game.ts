// Server-only game service. Every rule is enforced here; the client is never trusted with answers, hints or timing.
import { randomInt, randomUUID } from "node:crypto";
import {
  CATEGORIES,
  CHALLENGE_PER_CATEGORY,
  CHOICES_PER_QUESTION,
  LATENCY_ALLOWANCE_MS,
  MODES,
  SESSION_TTL_MS,
  boardFor,
  isCategory,
  isGameMode,
  type Category,
  type GameCategory,
  type GameMode,
  type ModeConfig,
} from "./constants";
import type { DB } from "./db";
import { rankOn } from "./leaderboard";
import { validateNickname } from "./nickname";
import { MAX_SCORE_PER_ANSWER, maxGameScore, scoreAnswer, trailingStreak } from "./scoring";
import type { AnswerResult, CategoryStat, DealtQuestion, FinishGameResult, HintResult, StartGameResult } from "./types";

export class GameError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

interface QuestionRow {
  id: string;
  category: Category;
  difficulty: number;
  question: string;
  choices: string;
  answer_index: number;
  explanation: string;
  hint: string;
}

interface SessionRow {
  id: string;
  nickname: string;
  category: GameCategory;
  /** NULL for a game from before modes existed. */
  mode: GameMode | null;
  started_at: string;
  finished_at: string | null;
  total_score: number;
  correct_count: number;
}

type ModeSession = SessionRow & { mode: GameMode };

interface DealtRow extends QuestionRow {
  position: number;
  choice_order: string;
  revealed_at: number | null;
  hint_used_at: number | null;
}

function shuffled<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const shuffledIndices = (n: number) => shuffled(Array.from({ length: n }, (_, i) => i));

function toDealt(row: DealtRow, now: number, config: ModeConfig): DealtQuestion {
  const original = JSON.parse(row.choices) as string[];
  const order = JSON.parse(row.choice_order) as number[];
  return {
    id: row.id,
    position: row.position,
    category: row.category,
    difficulty: row.difficulty,
    question: row.question,
    choices: order.map((i) => original[i]),
    remainingMs: Math.max(0, config.timeLimitMs - (now - (row.revealed_at ?? now))),
    hint: row.hint_used_at === null ? null : row.hint,
  };
}

function getSession(db: DB, sessionId: unknown): ModeSession {
  if (typeof sessionId !== "string" || !sessionId) {
    throw new GameError(400, "invalid_session", "sessionId가 필요합니다.");
  }
  const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as SessionRow | undefined;
  if (!row) throw new GameError(404, "session_not_found", "존재하지 않는 게임입니다.");
  if (row.mode === null) {
    throw new GameError(410, "session_expired", "이전 버전의 게임이라 이어서 할 수 없습니다. 새 게임을 시작해 주세요.");
  }
  return row as ModeSession;
}

/** A session that can still be played: exists, not finished, not abandoned past its TTL. */
function getPlayableSession(db: DB, sessionId: unknown, now: number): ModeSession {
  const session = getSession(db, sessionId);
  if (session.finished_at) throw new GameError(409, "session_finished", "이미 끝난 게임입니다.");
  if (now - Date.parse(session.started_at) > SESSION_TTL_MS) {
    throw new GameError(410, "session_expired", "시간이 오래 지나 만료된 게임입니다. 새 게임을 시작해 주세요.");
  }
  return session;
}

const DEALT_SQL = `
  SELECT q.*, sq.position, sq.choice_order, sq.revealed_at, sq.hint_used_at
  FROM session_questions sq JOIN questions q ON q.id = sq.question_id
  WHERE sq.session_id = ?`;

const UNANSWERED = `NOT EXISTS (
  SELECT 1 FROM answers a WHERE a.session_id = sq.session_id AND a.question_id = sq.question_id)`;

/** The lowest-position question without an answer, revealing it (starting its clock) if needed. */
function revealCurrent(db: DB, sessionId: string, now: number): DealtRow | undefined {
  const row = db.prepare(`${DEALT_SQL} AND ${UNANSWERED} ORDER BY sq.position LIMIT 1`).get(sessionId) as
    | DealtRow
    | undefined;
  if (row && row.revealed_at === null) {
    db.prepare("UPDATE session_questions SET revealed_at = ? WHERE session_id = ? AND question_id = ?").run(
      now,
      sessionId,
      row.id,
    );
    row.revealed_at = now;
  }
  return row;
}

/** Random active question ids from one category, or from all of them when `category` is "random". */
function pickQuestions(db: DB, category: GameCategory, limit: number): string[] {
  const rows = db
    .prepare(
      `SELECT id FROM questions
       WHERE status = 'active' AND (@category = 'random' OR category = @category)
       ORDER BY RANDOM() LIMIT @limit`,
    )
    .all({ category, limit }) as { id: string }[];
  if (rows.length < limit) {
    throw new GameError(503, "not_enough_questions", "문제가 부족합니다. `npm run seed`를 먼저 실행해 주세요.");
  }
  return rows.map((r) => r.id);
}

/** Challenge mode takes the same number from every category, then mixes them. */
function dealQuestions(db: DB, mode: GameMode, category: GameCategory): string[] {
  if (mode === "challenge") {
    return shuffled(CATEGORIES.flatMap((c) => pickQuestions(db, c, CHALLENGE_PER_CATEGORY)));
  }
  return pickQuestions(db, category, MODES[mode].questionCount);
}

export function startGame(
  db: DB,
  input: { nickname?: unknown; mode?: unknown; category?: unknown },
): StartGameResult {
  const check = validateNickname(input.nickname);
  if (!check.ok) throw new GameError(400, "invalid_nickname", check.message);
  const { mode } = input;
  if (!isGameMode(mode)) {
    throw new GameError(400, "invalid_mode", "mode는 challenge, category, speed 중 하나여야 합니다.");
  }
  let category: GameCategory = "random";
  if (mode === "category") {
    if (!isCategory(input.category)) throw new GameError(400, "invalid_category", "알 수 없는 카테고리입니다.");
    category = input.category;
  }
  const config = MODES[mode];

  const sessionId = randomUUID();
  const now = Date.now();
  const first = db.transaction(() => {
    const ids = dealQuestions(db, mode, category);
    db.prepare("INSERT INTO sessions (id, nickname, category, mode, started_at) VALUES (?, ?, ?, ?, ?)").run(
      sessionId,
      check.nickname,
      category,
      mode,
      new Date(now).toISOString(),
    );
    const insertDealt = db.prepare(
      "INSERT INTO session_questions (session_id, question_id, position, choice_order) VALUES (?, ?, ?, ?)",
    );
    ids.forEach((id, position) =>
      insertDealt.run(sessionId, id, position, JSON.stringify(shuffledIndices(CHOICES_PER_QUESTION))),
    );
    return revealCurrent(db, sessionId, now)!;
  })();

  return {
    sessionId,
    nickname: check.nickname,
    mode,
    category,
    timeLimitMs: config.timeLimitMs,
    totalQuestions: config.questionCount,
    question: toDealt(first, now, config),
  };
}

/**
 * Returns the question the player is on, revealing it if this is the first request for it.
 * Asking again (after a reload or a lost response) returns the same question with less time left.
 */
export function nextQuestion(db: DB, input: { sessionId?: unknown }): DealtQuestion {
  const now = Date.now();
  return db.transaction(() => {
    const session = getPlayableSession(db, input.sessionId, now);
    const row = revealCurrent(db, session.id, now);
    if (!row) throw new GameError(409, "all_answered", "모든 문제를 풀었습니다. 결과를 확인해 주세요.");
    return toDealt(row, now, MODES[session.mode]);
  })();
}

/**
 * Reveals the hint for the question the player is on. The first request records the use, which
 * forfeits that question's no-hint bonus; asking again returns the same hint.
 */
export function revealHint(db: DB, input: { sessionId?: unknown; questionId?: unknown }): HintResult {
  if (typeof input.questionId !== "string") {
    throw new GameError(400, "invalid_question", "questionId가 필요합니다.");
  }
  const now = Date.now();
  return db.transaction((): HintResult => {
    const session = getPlayableSession(db, input.sessionId, now);
    const dealt = db
      .prepare(`SELECT q.hint, sq.question_id AS id, sq.revealed_at, sq.hint_used_at, ${UNANSWERED} AS unanswered
                FROM session_questions sq JOIN questions q ON q.id = sq.question_id
                WHERE sq.session_id = ? AND sq.question_id = ?`)
      .get(session.id, input.questionId) as
      | Pick<DealtRow, "hint" | "id" | "revealed_at" | "hint_used_at"> & { unanswered: number }
      | undefined;
    if (!dealt) throw new GameError(400, "question_not_in_session", "이 게임에 포함된 문제가 아닙니다.");
    // Questions are revealed one at a time, so revealed and unanswered means it is the one on screen.
    if (dealt.revealed_at === null || !dealt.unanswered) {
      throw new GameError(409, "not_current", "지금 풀고 있는 문제의 힌트만 볼 수 있습니다.");
    }
    if (dealt.hint_used_at === null) {
      db.prepare("UPDATE session_questions SET hint_used_at = ? WHERE session_id = ? AND question_id = ?").run(
        now,
        session.id,
        dealt.id,
      );
    }
    return { hint: dealt.hint };
  })();
}

export function submitAnswer(
  db: DB,
  input: { sessionId?: unknown; questionId?: unknown; selectedIndex?: unknown; timeSpentMs?: unknown },
): AnswerResult {
  const { questionId, selectedIndex, timeSpentMs } = input;
  // null means the player ran out of time without choosing.
  if (
    selectedIndex !== null &&
    !(Number.isInteger(selectedIndex) && (selectedIndex as number) >= 0 && (selectedIndex as number) < CHOICES_PER_QUESTION)
  ) {
    throw new GameError(400, "invalid_choice", "selectedIndex는 0~3 또는 null이어야 합니다.");
  }
  if (typeof timeSpentMs !== "number" || !Number.isFinite(timeSpentMs) || timeSpentMs < 0) {
    throw new GameError(400, "invalid_time", "timeSpentMs는 0 이상의 숫자여야 합니다.");
  }
  if (typeof questionId !== "string") {
    throw new GameError(400, "invalid_question", "questionId가 필요합니다.");
  }

  const now = Date.now();
  return db.transaction((): AnswerResult => {
    const session = getPlayableSession(db, input.sessionId, now);
    const { timeLimitMs, questionCount } = MODES[session.mode];
    if (timeSpentMs > timeLimitMs) {
      throw new GameError(400, "invalid_time", `timeSpentMs는 0~${timeLimitMs} 사이여야 합니다.`);
    }

    const dealt = db.prepare(`${DEALT_SQL} AND sq.question_id = ?`).get(session.id, questionId) as DealtRow | undefined;
    if (!dealt) throw new GameError(400, "question_not_in_session", "이 게임에 포함된 문제가 아닙니다.");

    const previous = db
      .prepare(
        `SELECT a.question_id, a.is_correct, a.score FROM answers a
         JOIN session_questions sq ON sq.session_id = a.session_id AND sq.question_id = a.question_id
         WHERE a.session_id = ? ORDER BY sq.position`,
      )
      .all(session.id) as { question_id: string; is_correct: number; score: number }[];
    if (previous.some((a) => a.question_id === questionId)) {
      throw new GameError(409, "already_answered", "이미 제출한 문제입니다.");
    }
    if (previous.length >= questionCount) {
      throw new GameError(409, "too_many_answers", `이 모드는 ${questionCount}문제까지입니다.`);
    }
    if (dealt.position !== previous.length) {
      throw new GameError(409, "out_of_order", "문제를 순서대로 풀어 주세요.");
    }
    if (dealt.revealed_at === null) {
      throw new GameError(409, "not_revealed", "아직 공개되지 않은 문제입니다.");
    }

    // The client's own measurement is used unless the server saw clearly more time pass,
    // so claiming an instant answer doesn't earn the speed bonus.
    const serverElapsed = now - dealt.revealed_at;
    const time = Math.min(timeLimitMs, Math.max(Math.round(timeSpentMs), serverElapsed - LATENCY_ALLOWANCE_MS));
    const timedOut = selectedIndex === null || time >= timeLimitMs;

    const order = JSON.parse(dealt.choice_order) as number[];
    const originalSelected = selectedIndex === null ? null : order[selectedIndex as number];
    const isCorrect = !timedOut && originalSelected === dealt.answer_index;
    const hintUsed = dealt.hint_used_at !== null;
    const result = scoreAnswer({
      isCorrect,
      timeSpentMs: time,
      difficulty: dealt.difficulty,
      hintUsed,
      previousCombo: trailingStreak(previous.map((a) => a.is_correct === 1)),
      limitMs: timeLimitMs,
    });
    if (result.score < 0 || result.score > MAX_SCORE_PER_ANSWER) {
      throw new GameError(500, "invalid_score", "점수 계산에 문제가 생겼습니다.");
    }

    db.prepare(
      `INSERT INTO answers (session_id, question_id, selected_index, is_correct, time_spent_ms, score, answered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(session.id, questionId, originalSelected, isCorrect ? 1 : 0, time, result.score, new Date(now).toISOString());

    const { score, combo, ...breakdown } = result;
    return {
      isCorrect,
      timedOut,
      correctIndex: order.indexOf(dealt.answer_index),
      explanation: dealt.explanation,
      score,
      breakdown,
      hintUsed,
      combo,
      totalScore: previous.reduce((sum, a) => sum + a.score, 0) + score,
      timeSpentMs: time,
      isLast: previous.length + 1 === questionCount,
    };
  })();
}

/**
 * Finishing is idempotent: calling it again returns the same totals with a fresh rank.
 * Only a game with every question answered can finish, so abandoned games never reach the leaderboard.
 */
export function finishGame(db: DB, input: { sessionId?: unknown }): FinishGameResult {
  return db.transaction((): FinishGameResult => {
    let session = getSession(db, input.sessionId);

    const rows = db
      .prepare(
        `SELECT q.category, q.difficulty, a.is_correct, a.score FROM session_questions sq
         JOIN questions q ON q.id = sq.question_id
         LEFT JOIN answers a ON a.session_id = sq.session_id AND a.question_id = sq.question_id
         WHERE sq.session_id = ? ORDER BY sq.position`,
      )
      .all(session.id) as { category: Category; difficulty: number; is_correct: number | null; score: number | null }[];

    if (!session.finished_at) {
      const unanswered = rows.filter((r) => r.is_correct === null).length;
      if (unanswered > 0) {
        throw new GameError(409, "not_all_answered", `아직 풀지 않은 문제가 ${unanswered}개 있습니다.`);
      }
      const totalScore = rows.reduce((sum, r) => sum + (r.score ?? 0), 0);
      if (
        rows.length !== MODES[session.mode].questionCount ||
        rows.some((r) => (r.score ?? 0) > MAX_SCORE_PER_ANSWER) ||
        totalScore > maxGameScore(rows.map((r) => r.difficulty))
      ) {
        throw new GameError(422, "invalid_score", "기록을 검증하지 못해 순위에 반영할 수 없습니다.");
      }
      const correctCount = rows.filter((r) => r.is_correct === 1).length;
      const finishedAt = new Date().toISOString();
      db.prepare("UPDATE sessions SET finished_at = ?, total_score = ?, correct_count = ? WHERE id = ?").run(
        finishedAt,
        totalScore,
        correctCount,
        session.id,
      );
      session = { ...session, finished_at: finishedAt, total_score: totalScore, correct_count: correctCount };
    }

    const categoryStats: CategoryStat[] = CATEGORIES.flatMap((category) => {
      const inCategory = rows.filter((r) => r.category === category);
      if (inCategory.length === 0) return [];
      const correct = inCategory.filter((r) => r.is_correct === 1).length;
      return [{ category, correct, total: inCategory.length, accuracy: correct / inCategory.length }];
    });

    return {
      sessionId: session.id,
      nickname: session.nickname,
      mode: session.mode,
      category: session.category,
      totalScore: session.total_score,
      correctCount: session.correct_count,
      totalQuestions: rows.length,
      categoryStats,
      rank: rankOn(db, boardFor(session.mode, session.category), session.id)!,
    };
  })();
}
