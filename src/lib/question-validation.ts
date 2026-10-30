import { CATEGORIES, CHOICES_PER_QUESTION, type Category } from "./constants";

export const MIN_PER_CATEGORY = 20;
/** Target share of each difficulty, and how far (in percentage points) a category may drift from it. */
export const DIFFICULTY_TARGET: Record<1 | 2 | 3, number> = { 1: 0.3, 2: 0.5, 3: 0.2 };
export const DIFFICULTY_TOLERANCE = 0.05;

type DifficultyCounts = Record<1 | 2 | 3, number>;

export interface ValidationReport {
  errors: string[];
  counts: Record<Category, { total: number; byDifficulty: DifficultyCounts }>;
}

const normalize = (s: string) => s.replace(/[\s\p{P}\p{S}]/gu, "").toLowerCase();

/** Checks raw JSON of unknown shape and reports every problem instead of stopping at the first. */
export function validateQuestions(raw: unknown): ValidationReport {
  const errors: string[] = [];
  const counts = Object.fromEntries(
    CATEGORIES.map((c) => [c, { total: 0, byDifficulty: { 1: 0, 2: 0, 3: 0 } }]),
  ) as ValidationReport["counts"];

  if (!Array.isArray(raw)) {
    return { errors: ["최상위 값이 배열이 아닙니다."], counts };
  }

  const ids = new Map<string, number>();
  const texts = new Map<string, string>();

  raw.forEach((q, i) => {
    const where = `#${i}${q && typeof q.id === "string" ? ` (${q.id})` : ""}`;
    const err = (msg: string) => errors.push(`${where}: ${msg}`);
    if (!q || typeof q !== "object") return err("객체가 아닙니다.");

    if (typeof q.id !== "string" || !q.id.trim()) err("id가 비어 있습니다.");
    else if (ids.has(q.id)) err(`id가 #${ids.get(q.id)}와 중복됩니다.`);
    else ids.set(q.id, i);

    const categoryOk = (CATEGORIES as readonly string[]).includes(q.category);
    if (!categoryOk) err(`알 수 없는 카테고리 "${q.category}"`);

    const difficultyOk = q.difficulty === 1 || q.difficulty === 2 || q.difficulty === 3;
    if (!difficultyOk) err(`difficulty는 1~3이어야 합니다 (현재 ${q.difficulty}).`);

    if (typeof q.question !== "string" || !q.question.trim()) err("문제 문장이 비어 있습니다.");
    else {
      const key = normalize(q.question);
      if (texts.has(key)) err(`문제가 ${texts.get(key)}와 중복됩니다.`);
      else texts.set(key, typeof q.id === "string" ? q.id : where);
    }

    if (!Array.isArray(q.choices) || q.choices.length !== CHOICES_PER_QUESTION) {
      err(`보기는 정확히 ${CHOICES_PER_QUESTION}개여야 합니다.`);
    } else if (q.choices.some((c: unknown) => typeof c !== "string" || !c.trim())) {
      err("빈 보기가 있습니다.");
    } else if (new Set(q.choices.map(normalize)).size !== q.choices.length) {
      err("보기 중에 중복이 있습니다.");
    }

    if (!Number.isInteger(q.answer_index) || q.answer_index < 0 || q.answer_index >= CHOICES_PER_QUESTION) {
      err(`answer_index는 0~${CHOICES_PER_QUESTION - 1}이어야 합니다 (현재 ${q.answer_index}).`);
    }

    if (typeof q.explanation !== "string" || !q.explanation.trim()) err("해설이 비어 있습니다.");
    else if (/[\r\n]/.test(q.explanation)) err("해설은 한 줄이어야 합니다.");

    if (typeof q.hint !== "string" || !q.hint.trim()) err("힌트가 비어 있습니다.");
    else if (/[\r\n]/.test(q.hint)) err("힌트는 한 줄이어야 합니다.");
    else if (Array.isArray(q.choices) && typeof q.choices[q.answer_index] === "string") {
      // One-character answers ("7", "용") are too likely to appear by accident to check.
      const answer = normalize(q.choices[q.answer_index]);
      if (answer.length >= 2 && normalize(q.hint).includes(answer)) err("힌트에 정답이 그대로 들어 있습니다.");
    }

    if (q.status !== undefined && q.status !== "active" && q.status !== "retired") {
      err(`status는 active 또는 retired여야 합니다 (현재 ${q.status}).`);
    }

    if (categoryOk && difficultyOk && q.status !== "retired") {
      const bucket = counts[q.category as Category];
      bucket.total++;
      bucket.byDifficulty[q.difficulty as 1 | 2 | 3]++;
    }
  });

  for (const category of CATEGORIES) {
    const { total, byDifficulty } = counts[category];
    if (total < MIN_PER_CATEGORY) {
      errors.push(`[${category}] 활성 문제가 ${total}개입니다. 최소 ${MIN_PER_CATEGORY}개가 필요합니다.`);
      continue;
    }
    for (const d of [1, 2, 3] as const) {
      const share = byDifficulty[d] / total;
      if (Math.abs(share - DIFFICULTY_TARGET[d]) > DIFFICULTY_TOLERANCE + 1e-9) {
        errors.push(
          `[${category}] 난이도 ${d} 비율이 ${(share * 100).toFixed(0)}%입니다 (목표 ${DIFFICULTY_TARGET[d] * 100}% ±${DIFFICULTY_TOLERANCE * 100}%p).`,
        );
      }
    }
  }

  return { errors, counts };
}
