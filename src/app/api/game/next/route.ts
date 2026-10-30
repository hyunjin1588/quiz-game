import { handleJson } from "@/lib/api";
import { nextQuestion } from "@/lib/game";

export function POST(request: Request) {
  return handleJson(request, (db, body) => nextQuestion(db, body));
}
