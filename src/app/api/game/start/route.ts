import { handleJson } from "@/lib/api";
import { startGame } from "@/lib/game";

export function POST(request: Request) {
  return handleJson(request, (db, body) => startGame(db, body));
}
