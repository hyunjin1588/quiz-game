import { handleJson } from "@/lib/api";
import { finishGame } from "@/lib/game";

export function POST(request: Request) {
  return handleJson(request, (db, body) => finishGame(db, body));
}
