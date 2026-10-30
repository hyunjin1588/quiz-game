// Test-only helpers. Not imported by app code.
import { expect } from "vitest";
import questions from "@/data/questions.json";
import { GameError } from "./game";
import type { DealtQuestion, QuestionSeed } from "./types";

export const seedData = questions as QuestionSeed[];
const byId = new Map(seedData.map((q) => [q.id, q]));

/** The seed entry behind a dealt question, with the answer and hint the client never sees. */
export const seedOf = (q: DealtQuestion): QuestionSeed => byId.get(q.id)!;

/** Shown index of the correct choice, looked up from the seed file. */
export function correctShownIndex(q: DealtQuestion): number {
  const seed = seedOf(q);
  return q.choices.indexOf(seed.choices[seed.answer_index]);
}

export const wrongShownIndex = (q: DealtQuestion) => (correctShownIndex(q) + 1) % 4;

export function expectGameError(fn: () => unknown, status: number, code: string) {
  let thrown: unknown;
  try {
    fn();
  } catch (e) {
    thrown = e;
  }
  expect(thrown, `expected GameError ${code}`).toBeInstanceOf(GameError);
  expect({ status: (thrown as GameError).status, code: (thrown as GameError).code }).toEqual({ status, code });
}
