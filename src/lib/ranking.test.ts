import { describe, expect, it } from "vitest";
import { rankBoard, type RankRecord } from "./ranking";

const rec = (
  id: string,
  mode: RankRecord["mode"],
  category: RankRecord["category"],
  totalScore: number,
  correctCount: number,
  finishedAt = "2026-01-01T00:00:00.000Z",
): RankRecord => ({ id, nickname: id, mode, category, totalScore, correctCount, finishedAt });

describe("rankBoard (standalone leaderboard)", () => {
  it("uses the same tie rules as the server: score, correct count, earlier finish", () => {
    const records = [
      rec("late", "category", "history", 100, 5, "2026-01-01T00:00:09.000Z"),
      rec("early", "category", "history", 100, 5, "2026-01-01T00:00:01.000Z"),
      rec("more-correct", "category", "history", 100, 6, "2026-01-01T00:00:05.000Z"),
      rec("top", "category", "history", 150, 4),
      rec("low", "category", "history", 20, 9),
    ];
    expect(rankBoard(records, "history").map((r) => r.id)).toEqual(["top", "more-correct", "early", "late", "low"]);
  });

  it("keeps each mode, and each category in category mode, on its own board", () => {
    const records = [
      rec("chal", "challenge", "random", 900, 30),
      rec("spd", "speed", "random", 500, 15),
      rec("geo", "category", "geography", 200, 8),
      rec("sci", "category", "science", 250, 9),
    ];
    expect(rankBoard(records, "challenge").map((r) => r.id)).toEqual(["chal"]);
    expect(rankBoard(records, "speed").map((r) => r.id)).toEqual(["spd"]);
    expect(rankBoard(records, "geography").map((r) => r.id)).toEqual(["geo"]);
    expect(rankBoard(records, "history")).toEqual([]);
  });

  it("leaves out records from before modes existed", () => {
    const records = [rec("old", undefined, "history", 2_000, 10), rec("new", "category", "history", 100, 5)];
    expect(rankBoard(records, "history").map((r) => r.id)).toEqual(["new"]);
  });

  it("does not mutate its input", () => {
    const records = [rec("b", "speed", "random", 1, 1), rec("a", "speed", "random", 2, 2)];
    rankBoard(records, "speed");
    expect(records.map((r) => r.id)).toEqual(["b", "a"]);
  });
});
