import { handleJson } from "@/lib/api";
import { submitAnswer } from "@/lib/game";

export function POST(request: Request) {
  return handleJson(request, (db, body) => submitAnswer(db, body));
}
