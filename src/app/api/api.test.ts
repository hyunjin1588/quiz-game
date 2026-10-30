// Integration test: drives the real route handlers with Request objects against an in-memory DB.
import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { seedQuestions } from "@/lib/seed";
import { correctShownIndex, seedData } from "@/lib/test-helpers";
import type { AnswerResult, DealtQuestion, FinishGameResult, HintResult, LeaderboardResult, StartGameResult } from "@/lib/types";
import { POST as answer } from "./game/answer/route";
import { POST as finish } from "./game/finish/route";
import { POST as hint } from "./game/hint/route";
import { POST as next } from "./game/next/route";
import { POST as start } from "./game/start/route";
import { GET as leaderboard } from "./leaderboard/route";

beforeAll(() => {
  process.env.QUIZ_DB_PATH = ":memory:";
  seedQuestions(getDb(), seedData);
});

const post = (url: string, body: unknown) =>
  new Request(`http://test${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const get = (url: string) => new NextRequest(`http://test${url}`);

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  const body = await r.json();
  expect(r.status, JSON.stringify(body)).toBe(status);
  return body as T;
}

/** Plays a full game over the API. `correct` decides how many answers are right; the first one uses a hint. */
async function playGame(nickname: string, mode: string, category: string | undefined, correct: number) {
  const game = await json<StartGameResult>(start(post("/api/game/start", { nickname, mode, category })));
  let q: DealtQuestion = game.question;
  for (let i = 0; i < game.totalQuestions; i++) {
    if (i > 0) q = await json<DealtQuestion>(next(post("/api/game/next", { sessionId: game.sessionId })));
    expect(q.position).toBe(i);
    if (i === 0) await json<HintResult>(hint(post("/api/game/hint", { sessionId: game.sessionId, questionId: q.id })));
    const right = correctShownIndex(q);
    const r = await json<AnswerResult>(
      answer(post("/api/game/answer", { sessionId: game.sessionId, questionId: q.id, selectedIndex: i < correct ? right : (right + 1) % 4, timeSpentMs: 2_000 })),
    );
    expect(r.correctIndex).toBe(right);
  }
  return { game, result: await json<FinishGameResult>(finish(post("/api/game/finish", { sessionId: game.sessionId }))) };
}

describe("start → hint/next/answer → finish → leaderboard", () => {
  it("records a finished category game on that category's board", async () => {
    const { game, result } = await playGame("통합테스트", "category", "history", 10);
    expect(result).toMatchObject({ nickname: "통합테스트", mode: "category", correctCount: 10, totalQuestions: 10 });
    expect(result.rank).toEqual({ board: "history", rank: 1, totalPlayers: 1 });

    const history = await json<LeaderboardResult>(leaderboard(get(`/api/leaderboard?board=history&sessionId=${game.sessionId}`)));
    expect(history.entries[0]).toMatchObject({ rank: 1, nickname: "통합테스트", totalScore: result.totalScore, correctCount: 10, isMine: true });
    expect(history.totalQuestions).toBe(10);
    const science = await json<LeaderboardResult>(leaderboard(get("/api/leaderboard?board=science")));
    expect(science).toMatchObject({ entries: [], totalPlayers: 0, me: null });
  });

  it("ranks a speed game on the speed board only", async () => {
    const { result } = await playGame("스피드", "speed", undefined, 5);
    expect(result).toMatchObject({ totalQuestions: 20, correctCount: 5, rank: { board: "speed", rank: 1, totalPlayers: 1 } });
    const history = await json<LeaderboardResult>(leaderboard(get("/api/leaderboard?board=history")));
    expect(history.entries.map((e) => e.nickname)).not.toContain("스피드");
    const challenge = await json<LeaderboardResult>(leaderboard(get("/api/leaderboard")));
    expect(challenge).toMatchObject({ board: "challenge", totalQuestions: 40, entries: [] });
  });

  it("keeps an unfinished game off the leaderboard", async () => {
    const game = await json<StartGameResult>(start(post("/api/game/start", { nickname: "중도이탈", mode: "category", category: "science" })));
    await json(answer(post("/api/game/answer", { sessionId: game.sessionId, questionId: game.question.id, selectedIndex: 0, timeSpentMs: 1_000 })));
    await json(finish(post("/api/game/finish", { sessionId: game.sessionId })), 409);
    const science = await json<LeaderboardResult>(leaderboard(get("/api/leaderboard?board=science")));
    expect(science.entries.map((e) => e.nickname)).not.toContain("중도이탈");
  });

  it("validates input and never leaks answers", async () => {
    await json(start(post("/api/game/start", { nickname: "씨발", mode: "speed" })), 400);
    await json(start(post("/api/game/start", { nickname: "모드없음", category: "history" })), 400);
    await json(leaderboard(get("/api/leaderboard?board=all")), 400);
    const res = await start(post("/api/game/start", { nickname: "누출검사", mode: "speed" }));
    const body = await res.text();
    expect(body).not.toMatch(/answer|explanation|correct/i);
    expect(JSON.parse(body).question.hint).toBeNull();
  });
});
