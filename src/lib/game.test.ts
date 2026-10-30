import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CATEGORIES } from "./constants";
import { openDb, type DB } from "./db";
import { finishGame, nextQuestion, revealHint, startGame, submitAnswer } from "./game";
import { scoreAnswer } from "./scoring";
import { seedQuestions } from "./seed";
import { correctShownIndex, expectGameError, seedData, seedOf, wrongShownIndex } from "./test-helpers";
import type { DealtQuestion, StartGameResult } from "./types";

let db: DB;

beforeEach(() => {
  db = openDb(":memory:");
  seedQuestions(db, seedData);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Answers every question in order. plan[i]: "c" correct, "w" wrong, "t" timeout, "h" correct after a hint. */
function play(game: StartGameResult, plan: string[], timeSpentMs = 4_000) {
  let q: DealtQuestion = game.question;
  return plan.map((p, i) => {
    if (i > 0) q = nextQuestion(db, { sessionId: game.sessionId });
    if (p === "h") revealHint(db, { sessionId: game.sessionId, questionId: q.id });
    const selectedIndex = p === "t" ? null : p === "w" ? wrongShownIndex(q) : correctShownIndex(q);
    return { q, r: submitAnswer(db, { sessionId: game.sessionId, questionId: q.id, selectedIndex, timeSpentMs }) };
  });
}

const dealtIds = (sessionId: string) =>
  (db.prepare("SELECT question_id FROM session_questions WHERE session_id = ? ORDER BY position").all(sessionId) as { question_id: string }[]).map(
    (r) => r.question_id,
  );

describe("startGame", () => {
  it("deals 10 distinct questions in category mode but reveals only the first, without its answer or hint", () => {
    const game = startGame(db, { nickname: "테스터", mode: "category", category: "science" });
    expect(game).toMatchObject({ mode: "category", category: "science", totalQuestions: 10, timeLimitMs: 20_000 });
    expect(game.question).toMatchObject({ position: 0, category: "science", remainingMs: 20_000, hint: null });
    const json = JSON.stringify(game);
    expect(json).not.toMatch(/answer|explanation|correct/i);
    expect(json).not.toContain(seedOf(game.question).hint);

    expect(new Set(dealtIds(game.sessionId)).size).toBe(10);
    const revealed = db.prepare("SELECT COUNT(*) AS n FROM session_questions WHERE session_id = ? AND revealed_at IS NOT NULL").get(game.sessionId) as { n: number };
    expect(revealed.n).toBe(1);
  });

  it("deals 40 questions in challenge mode, 10 from each category", () => {
    const game = startGame(db, { nickname: "도전자", mode: "challenge" });
    expect(game).toMatchObject({ mode: "challenge", category: "random", totalQuestions: 40, timeLimitMs: 20_000 });
    const ids = dealtIds(game.sessionId);
    expect(new Set(ids).size).toBe(40);
    const perCategory = CATEGORIES.map((c) => ids.filter((id) => seedData.find((q) => q.id === id)!.category === c).length);
    expect(perCategory).toEqual([10, 10, 10, 10]);
  });

  it("deals 20 questions with 15 seconds each in speed mode", () => {
    const game = startGame(db, { nickname: "번개", mode: "speed", category: "history" });
    expect(game).toMatchObject({ mode: "speed", category: "random", totalQuestions: 20, timeLimitMs: 15_000 });
    expect(game.question.remainingMs).toBe(15_000);
    expect(new Set(dealtIds(game.sessionId)).size).toBe(20);
  });

  it("validates the nickname, mode and category", () => {
    expectGameError(() => startGame(db, { nickname: "a", mode: "speed" }), 400, "invalid_nickname");
    expectGameError(() => startGame(db, { nickname: "시발놈", mode: "speed" }), 400, "invalid_nickname");
    expectGameError(() => startGame(db, { nickname: "정상", mode: "random" }), 400, "invalid_mode");
    expectGameError(() => startGame(db, { nickname: "정상", category: "history" }), 400, "invalid_mode");
    expectGameError(() => startGame(db, { nickname: "정상", mode: "category", category: "sports" }), 400, "invalid_category");
    expectGameError(() => startGame(db, { nickname: "정상", mode: "category" }), 400, "invalid_category");
    expect(startGame(db, { nickname: "  두자  ", mode: "speed" }).nickname).toBe("두자");
  });
});

describe("nextQuestion", () => {
  it("returns the current question again until it is answered, then moves on", () => {
    const game = startGame(db, { nickname: "다음", mode: "category", category: "history" });
    expect(nextQuestion(db, { sessionId: game.sessionId }).id).toBe(game.question.id);
    submitAnswer(db, { sessionId: game.sessionId, questionId: game.question.id, selectedIndex: 0, timeSpentMs: 1_000 });
    expect(nextQuestion(db, { sessionId: game.sessionId }).position).toBe(1);
  });

  it("refuses a game from before modes existed", () => {
    db.prepare("INSERT INTO sessions (id, nickname, category, started_at) VALUES ('old', '옛날', 'random', ?)").run(new Date().toISOString());
    expectGameError(() => nextQuestion(db, { sessionId: "old" }), 410, "session_expired");
  });
});

describe("revealHint", () => {
  it("returns the hint, keeps returning it, and costs only that question's no-hint bonus", () => {
    const game = startGame(db, { nickname: "힌트", mode: "category", category: "general" });
    const sessionId = game.sessionId;
    const { hint } = revealHint(db, { sessionId, questionId: game.question.id });
    expect(hint).toBe(seedOf(game.question).hint);
    expect(revealHint(db, { sessionId, questionId: game.question.id }).hint).toBe(hint);
    // After a reload the question comes back with the hint already shown.
    expect(nextQuestion(db, { sessionId }).hint).toBe(hint);

    const [first, second] = play(game, ["c", "c"]);
    expect(first.r).toMatchObject({ hintUsed: true, breakdown: { hintBonus: 0 } });
    expect(second.r).toMatchObject({ hintUsed: false, breakdown: { hintBonus: 2 } });
    expect(second.q.hint).toBeNull();
  });

  it("only gives the hint for the question on screen", () => {
    const game = startGame(db, { nickname: "힌트검증", mode: "category", category: "general" });
    const sessionId = game.sessionId;
    const ids = dealtIds(sessionId);
    expectGameError(() => revealHint(db, { sessionId, questionId: ids[1] }), 409, "not_current");
    submitAnswer(db, { sessionId, questionId: ids[0], selectedIndex: 0, timeSpentMs: 1_000 });
    expectGameError(() => revealHint(db, { sessionId, questionId: ids[0] }), 409, "not_current");
    expectGameError(() => revealHint(db, { sessionId, questionId: "history-01" }), 400, "question_not_in_session");
    expectGameError(() => revealHint(db, { sessionId: "nope", questionId: ids[0] }), 404, "session_not_found");
  });
});

describe("submitAnswer / finishGame", () => {
  it("plays a full game, scoring on the server against the shuffled order", () => {
    const game = startGame(db, { nickname: "플레이어", mode: "category", category: "history" });
    // 3 correct (combo bonus on the 3rd), 1 wrong, 1 timeout, 1 with a hint, 4 correct.
    const plan = ["c", "c", "c", "w", "t", "h", "c", "c", "c", "c"];
    const results = play(game, plan);
    let total = 0;
    let combo = 0;
    results.forEach(({ q, r }, i) => {
      expect(r.correctIndex).toBe(correctShownIndex(q));
      const expected = scoreAnswer({
        isCorrect: plan[i] === "c" || plan[i] === "h",
        timeSpentMs: 4_000,
        difficulty: seedOf(q).difficulty,
        hintUsed: plan[i] === "h",
        previousCombo: combo,
        limitMs: 20_000,
      });
      combo = expected.combo;
      total += expected.score;
      expect(r.score).toBe(expected.score);
      expect(r.totalScore).toBe(total);
      expect(r.isLast).toBe(i === 9);
    });
    expect(results[2].r).toMatchObject({ combo: 3, breakdown: { comboBonus: 2, timeBonus: 3, hintBonus: 2 } });
    expect(results[3].r).toMatchObject({ isCorrect: false, combo: 0, score: 0 });
    expect(results[4].r).toMatchObject({ timedOut: true, combo: 0, score: 0 });
    expect(results[9].r).toMatchObject({ combo: 5, breakdown: { comboBonus: 5 } });

    const result = finishGame(db, { sessionId: game.sessionId });
    expect(result).toMatchObject({ mode: "category", category: "history", totalScore: total, correctCount: 8, totalQuestions: 10 });
    expect(result.rank).toEqual({ board: "history", rank: 1, totalPlayers: 1 });
    expect(result.categoryStats).toEqual([{ category: "history", correct: 8, total: 10, accuracy: 0.8 }]);
    expect(finishGame(db, { sessionId: game.sessionId }).totalScore).toBe(total);
  });

  it("ranks a challenge game on the challenge board, with stats for every category", () => {
    const game = startGame(db, { nickname: "완주", mode: "challenge" });
    play(game, Array(40).fill("c"));
    const result = finishGame(db, { sessionId: game.sessionId });
    expect(result).toMatchObject({ correctCount: 40, totalQuestions: 40, rank: { board: "challenge", rank: 1 } });
    expect(result.categoryStats.map((s) => s.total)).toEqual([10, 10, 10, 10]);
  });

  it("rejects duplicate, out-of-order, foreign, unrevealed and post-finish submissions", () => {
    const game = startGame(db, { nickname: "검증", mode: "category", category: "history" });
    const sessionId = game.sessionId;
    const ids = dealtIds(sessionId);
    const answer = (i: number, extra: object = {}) =>
      submitAnswer(db, { sessionId, questionId: ids[i], selectedIndex: 0, timeSpentMs: 1_000, ...extra });

    expectGameError(() => answer(1), 409, "out_of_order");
    expectGameError(() => answer(0, { timeSpentMs: 20_001 }), 400, "invalid_time");
    expectGameError(() => answer(0, { timeSpentMs: -1 }), 400, "invalid_time");
    answer(0);
    expectGameError(() => answer(0), 409, "already_answered");
    expectGameError(() => answer(1), 409, "not_revealed");
    expectGameError(() => answer(1, { selectedIndex: 4 }), 400, "invalid_choice");
    expectGameError(() => answer(1, { sessionId: "nope" }), 404, "session_not_found");
    const other = startGame(db, { nickname: "남의판", mode: "category", category: "science" });
    expectGameError(() => answer(1, { questionId: other.question.id }), 400, "question_not_in_session");

    expectGameError(() => finishGame(db, { sessionId }), 409, "not_all_answered");
    for (let i = 1; i < 10; i++) {
      nextQuestion(db, { sessionId });
      answer(i);
    }
    expectGameError(() => nextQuestion(db, { sessionId }), 409, "all_answered");
    finishGame(db, { sessionId });
    expectGameError(() => answer(0), 409, "session_finished");
  });

  it("holds speed mode to its 15-second limit", () => {
    const game = startGame(db, { nickname: "스피드", mode: "speed" });
    const base = { sessionId: game.sessionId, questionId: game.question.id, selectedIndex: 0 };
    expectGameError(() => submitAnswer(db, { ...base, timeSpentMs: 15_001 }), 400, "invalid_time");
    expect(submitAnswer(db, { ...base, timeSpentMs: 15_000 })).toMatchObject({ timedOut: true, score: 0 });
  });
});

describe("server-side timing", () => {
  const T0 = new Date("2026-01-01T00:00:00Z").getTime();

  function startAt(nickname: string, mode: "category" | "speed" = "category") {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    return startGame(db, { nickname, mode, category: "general" });
  }

  const answerCorrect = (game: StartGameResult, timeSpentMs: number) =>
    submitAnswer(db, { sessionId: game.sessionId, questionId: game.question.id, selectedIndex: correctShownIndex(game.question), timeSpentMs });

  it("ignores a claimed instant answer when the server saw time pass", () => {
    const game = startAt("치터");
    vi.setSystemTime(T0 + 12_000);
    // 12 s on the server minus the 1 s latency allowance = 11 s: too slow for the speed bonus.
    expect(answerCorrect(game, 0)).toMatchObject({ isCorrect: true, timeSpentMs: 11_000, breakdown: { timeBonus: 0 } });
  });

  it("trusts the client when its time is within the latency allowance", () => {
    const game = startAt("정직");
    vi.setSystemTime(T0 + 9_900);
    expect(answerCorrect(game, 9_500)).toMatchObject({ timeSpentMs: 9_500, breakdown: { timeBonus: 3 } });
  });

  it("counts an answer as a timeout when it arrives after the limit, whatever the client claims", () => {
    const game = startAt("늦음", "speed");
    vi.setSystemTime(T0 + 17_000);
    expect(answerCorrect(game, 1_000)).toMatchObject({ isCorrect: false, timedOut: true, score: 0 });
  });

  it("expires an abandoned game so it can't be finished later", () => {
    const game = startAt("이탈");
    vi.setSystemTime(T0 + 31 * 60_000);
    expectGameError(() => nextQuestion(db, { sessionId: game.sessionId }), 410, "session_expired");
    expectGameError(() => revealHint(db, { sessionId: game.sessionId, questionId: game.question.id }), 410, "session_expired");
    expectGameError(() => finishGame(db, { sessionId: game.sessionId }), 409, "not_all_answered");
  });
});
