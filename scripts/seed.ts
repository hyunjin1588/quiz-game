import fs from "node:fs";
import path from "node:path";
import { openDb } from "../src/lib/db";
import { validateQuestions } from "../src/lib/question-validation";
import { seedQuestions } from "../src/lib/seed";
import type { QuestionSeed } from "../src/lib/types";

const file = path.join(process.cwd(), "src", "data", "questions.json");
const raw = JSON.parse(fs.readFileSync(file, "utf8"));

const { errors } = validateQuestions(raw);
if (errors.length > 0) {
  console.error(`questions.json에 오류가 ${errors.length}건 있어 시드를 중단합니다. npm run validate-questions로 확인하세요.`);
  process.exit(1);
}

const db = openDb();
const { upserted, retired } = seedQuestions(db, raw as QuestionSeed[]);
const { active } = db.prepare("SELECT COUNT(*) AS active FROM questions WHERE status = 'active'").get() as {
  active: number;
};
db.close();

console.log(`시드 완료: ${upserted}개 반영, ${retired}개 비활성화, 활성 문제 ${active}개 (${db.name})`);
