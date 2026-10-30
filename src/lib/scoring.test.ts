import { describe, expect, it } from "vitest";
import {
  MAX_SCORE_PER_ANSWER,
  baseScore,
  comboBonus,
  describeBreakdown,
  maxGameScore,
  scoreAnswer,
  timeBonus,
  trailingStreak,
  type ScoreInput,
} from "./scoring";

const answer = (over: Partial<ScoreInput> = {}): ScoreInput => ({
  isCorrect: true,
  timeSpentMs: 4_000,
  difficulty: 1,
  hintUsed: false,
  previousCombo: 0,
  limitMs: 20_000,
  ...over,
});

describe("baseScore", () => {
  it("multiplies 10 by 1×, 1.5× and 2× for easy, medium and hard", () => {
    expect([1, 2, 3].map(baseScore)).toEqual([10, 15, 20]);
    expect(() => baseScore(4)).toThrow(RangeError);
  });
});

describe("timeBonus", () => {
  it("gives +3 for an answer in under 10 seconds", () => {
    expect(timeBonus(0)).toBe(3);
    expect(timeBonus(9_999)).toBe(3);
    expect(timeBonus(10_000)).toBe(0);
    expect(timeBonus(14_000, 15_000)).toBe(0);
  });

  it("is 0 at or after the time limit", () => {
    expect(timeBonus(20_000, 20_000)).toBe(0);
    expect(timeBonus(5_000, 5_000)).toBe(0);
  });
});

describe("comboBonus", () => {
  it("gives +2 on every answer at 3–4 in a row, +5 at 5–9 and +10 from 10", () => {
    expect([0, 1, 2, 3, 4, 5, 9, 10, 11, 40].map(comboBonus)).toEqual([0, 0, 0, 2, 2, 5, 5, 10, 10, 10]);
  });
});

describe("trailingStreak", () => {
  it("counts consecutive trues at the end", () => {
    expect(trailingStreak([])).toBe(0);
    expect(trailingStreak([true, true, false])).toBe(0);
    expect(trailingStreak([true, false, true, true])).toBe(2);
    expect(trailingStreak([true, true, true])).toBe(3);
  });
});

describe("scoreAnswer", () => {
  it("adds base, speed, no-hint and combo bonuses for a correct answer", () => {
    expect(scoreAnswer(answer())).toEqual({ score: 15, base: 10, timeBonus: 3, hintBonus: 2, comboBonus: 0, combo: 1 });
    expect(scoreAnswer(answer({ difficulty: 2, previousCombo: 2 }))).toMatchObject({ score: 22, comboBonus: 2, combo: 3 });
    expect(scoreAnswer(answer({ difficulty: 3, previousCombo: 9 }))).toMatchObject({ score: 35, comboBonus: 10, combo: 10 });
  });

  it("drops the speed bonus at 10 seconds and the no-hint bonus after a hint", () => {
    expect(scoreAnswer(answer({ timeSpentMs: 12_000 }))).toMatchObject({ score: 12, timeBonus: 0 });
    expect(scoreAnswer(answer({ hintUsed: true }))).toMatchObject({ score: 13, hintBonus: 0 });
  });

  it("gives 0 and resets the combo on a wrong answer", () => {
    expect(scoreAnswer(answer({ isCorrect: false, previousCombo: 5 }))).toEqual({
      score: 0,
      base: 0,
      timeBonus: 0,
      hintBonus: 0,
      comboBonus: 0,
      combo: 0,
    });
  });

  it("gives 0 and resets the combo on a timeout, even if the choice was right", () => {
    expect(scoreAnswer(answer({ timeSpentMs: 15_000, limitMs: 15_000, previousCombo: 4 }))).toMatchObject({ score: 0, combo: 0 });
  });
});

describe("score limits", () => {
  it("caps one answer at 35: hard 20 + speed 3 + no hint 2 + combo 10", () => {
    expect(MAX_SCORE_PER_ANSWER).toBe(35);
  });

  it("adds up a perfect game from the difficulties dealt", () => {
    // Combo bonuses for 10 answers: 0,0,2,2,5,5,5,5,5,10 = 39. Each answer also gets 3 + 2.
    expect(maxGameScore(Array(10).fill(1))).toBe(10 * 10 + 10 * 5 + 39);
    expect(maxGameScore([3, 3, 3])).toBe(3 * 25 + 2);
    expect(maxGameScore([])).toBe(0);
  });

  it("matches playing every answer perfectly", () => {
    const difficulties = [1, 2, 3, 2, 1, 2, 3, 2, 1, 2, 2, 3];
    let combo = 0;
    let total = 0;
    for (const difficulty of difficulties) {
      const r = scoreAnswer(answer({ difficulty, timeSpentMs: 0, previousCombo: combo }));
      combo = r.combo;
      total += r.score;
    }
    expect(total).toBe(maxGameScore(difficulties));
  });
});

describe("describeBreakdown", () => {
  it("lists the base with its multiplier and only the bonuses earned", () => {
    expect(describeBreakdown({ base: 15, timeBonus: 3, hintBonus: 2, comboBonus: 5 }, 2)).toBe(
      "기본 15 (보통 ×1.5) + 빠른 답변 3 + 힌트 미사용 2 + 콤보 5",
    );
    expect(describeBreakdown({ base: 20, timeBonus: 0, hintBonus: 0, comboBonus: 0 }, 3)).toBe("기본 20 (어려움 ×2)");
  });
});
