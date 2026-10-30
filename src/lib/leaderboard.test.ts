import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type DB } from "./db";
import { getLeaderboard, rankOn } from "./leaderboard";

let db: DB;

beforeEach(() => {
  db = openDb(":memory:");
});

function addSession(
  id: string,
  mode: string | null,
  category: string,
  score: number,
  correct: number,
  finishedAt: string | null = "2026-01-01T00:00:00.000Z",
) {
  db.prepare(
    `INSERT INTO sessions (id, nickname, mode, category, started_at, finished_at, total_score, correct_count)
     VALUES (?, ?, ?, ?, '2026-01-01T00:00:00.000Z', ?, ?, ?)`,
  ).run(id, id, mode, category, finishedAt, score, correct);
}

const order = (board: Parameters<typeof getLeaderboard>[1]) => getLeaderboard(db, board).entries.map((e) => e.nickname);

describe("leaderboard ordering", () => {
  it("sorts by score, then correct count, then earlier finish", () => {
    addSession("late", "category", "history", 100, 5, "2026-01-01T00:00:09.000Z");
    addSession("early", "category", "history", 100, 5, "2026-01-01T00:00:01.000Z");
    addSession("more-correct", "category", "history", 100, 6, "2026-01-01T00:00:05.000Z");
    addSession("top", "category", "history", 150, 4);
    addSession("low", "category", "history", 20, 9);
    expect(order("history")).toEqual(["top", "more-correct", "early", "late", "low"]);
    expect(getLeaderboard(db, "history").entries.map((e) => e.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  it("only includes finished sessions", () => {
    addSession("done", "speed", "random", 100, 1);
    addSession("abandoned", "speed", "random", 9999, 20, null);
    expect(order("speed")).toEqual(["done"]);
    expect(getLeaderboard(db, "speed").totalPlayers).toBe(1);
  });

  it("keeps each mode, and each category in category mode, on its own board", () => {
    addSession("chal", "challenge", "random", 900, 30);
    addSession("spd", "speed", "random", 500, 15);
    addSession("geo", "category", "geography", 200, 8);
    addSession("sci", "category", "science", 250, 9);
    expect(order("challenge")).toEqual(["chal"]);
    expect(order("speed")).toEqual(["spd"]);
    expect(order("geography")).toEqual(["geo"]);
    expect(order("science")).toEqual(["sci"]);
    expect(order("history")).toEqual([]);
  });

  it("leaves out games from before modes existed", () => {
    addSession("old-random", null, "random", 2_600, 10);
    addSession("old-history", null, "history", 2_000, 10);
    addSession("new", "category", "history", 100, 5);
    expect(order("history")).toEqual(["new"]);
    expect(order("challenge")).toEqual([]);
    expect(order("speed")).toEqual([]);
  });

  it("reports how many questions a game on the board has", () => {
    expect([getLeaderboard(db, "challenge"), getLeaderboard(db, "speed"), getLeaderboard(db, "general")].map((b) => b.totalQuestions)).toEqual([
      40, 20, 10,
    ]);
  });
});

describe("top list and my entry", () => {
  beforeEach(() => {
    for (let i = 1; i <= 60; i++) addSession(`p${i}`, "category", "general", 1000 - i, 5);
  });

  it("returns the top 50 and marks my entry when it is inside", () => {
    const board = getLeaderboard(db, "general", "p3");
    expect(board.entries).toHaveLength(50);
    expect(board.entries.find((e) => e.isMine)?.rank).toBe(3);
    expect(board.me).toBeNull();
    expect(board.totalPlayers).toBe(60);
  });

  it("returns my entry separately when it is below the top 50", () => {
    const board = getLeaderboard(db, "general", "p57");
    expect(board.entries).toHaveLength(50);
    expect(board.entries.some((e) => e.isMine)).toBe(false);
    expect(board.me).toMatchObject({ rank: 57, nickname: "p57", isMine: true });
  });

  it("ignores an unknown or off-board session id", () => {
    expect(getLeaderboard(db, "general", "nobody").me).toBeNull();
    expect(getLeaderboard(db, "history", "p57").me).toBeNull();
    expect(rankOn(db, "history", "p57")).toBeNull();
    expect(rankOn(db, "general", "p57")).toEqual({ board: "general", rank: 57, totalPlayers: 60 });
  });
});
