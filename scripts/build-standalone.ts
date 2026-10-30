// Builds index.html at the project root: a single self-contained file that runs the quiz when
// opened directly in a browser (double-click, file://). Re-run after changing questions or game code.
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { validateQuestions } from "../src/lib/question-validation";

const root = process.cwd();
const src = (...p: string[]) => path.join(root, "src", ...p);

async function main() {
  const { errors } = validateQuestions(JSON.parse(fs.readFileSync(src("data", "questions.json"), "utf8")));
  if (errors.length > 0) {
    console.error(`questions.json에 오류가 ${errors.length}건 있어 빌드를 중단합니다. npm run validate-questions로 확인하세요.`);
    process.exit(1);
  }

  const result = await build({
    entryPoints: [src("standalone", "main.ts")],
    bundle: true,
    minify: true,
    format: "iife",
    target: "es2020",
    charset: "utf8",
    legalComments: "none",
    write: false,
    tsconfig: path.join(root, "tsconfig.json"),
  });

  // A literal "</script" inside the bundle would end the inline script early.
  const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const css = fs.readFileSync(src("standalone", "style.css"), "utf8");
  const html = fs
    .readFileSync(src("standalone", "template.html"), "utf8")
    .split("/*__CSS__*/").join(css)
    .split("/*__JS__*/").join(js);

  const out = path.join(root, "index.html");
  fs.writeFileSync(out, html);
  console.log(`index.html 생성 완료 (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB): ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
