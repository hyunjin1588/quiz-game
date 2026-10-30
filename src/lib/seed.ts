import type { DB } from "./db";
import type { QuestionSeed } from "./types";

export interface SeedResult {
  upserted: number;
  retired: number;
}

/**
 * Upserts every question and retires the ones no longer in the list. Questions are never
 * deleted, because past answers reference them.
 */
export function seedQuestions(db: DB, questions: QuestionSeed[]): SeedResult {
  const upsert = db.prepare(`
    INSERT INTO questions (id, category, difficulty, question, choices, answer_index, explanation, hint, status)
    VALUES (@id, @category, @difficulty, @question, @choices, @answer_index, @explanation, @hint, @status)
    ON CONFLICT (id) DO UPDATE SET
      category = excluded.category, difficulty = excluded.difficulty, question = excluded.question,
      choices = excluded.choices, answer_index = excluded.answer_index,
      explanation = excluded.explanation, hint = excluded.hint, status = excluded.status
  `);

  return db.transaction(() => {
    for (const q of questions) {
      upsert.run({ ...q, choices: JSON.stringify(q.choices), status: q.status ?? "active" });
    }
    const ids = JSON.stringify(questions.map((q) => q.id));
    const { changes } = db
      .prepare(`UPDATE questions SET status = 'retired'
                WHERE status = 'active' AND id NOT IN (SELECT value FROM json_each(?))`)
      .run(ids);
    return { upserted: questions.length, retired: changes };
  })();
}
