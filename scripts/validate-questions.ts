import fs from "node:fs";
import path from "node:path";
import { CATEGORIES } from "../src/lib/constants";
import { validateQuestions } from "../src/lib/question-validation";

const file = path.join(process.cwd(), "src", "data", "questions.json");
const { errors, counts } = validateQuestions(JSON.parse(fs.readFileSync(file, "utf8")));

console.log("카테고리별 활성 문제 수 (쉬움/보통/어려움):");
for (const c of CATEGORIES) {
  const { total, byDifficulty: d } = counts[c];
  console.log(`  ${c.padEnd(10)} ${String(total).padStart(3)}  (${d[1]}/${d[2]}/${d[3]})`);
}

if (errors.length > 0) {
  console.error(`\n검증 실패: 오류 ${errors.length}건`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("\n검증 통과");
