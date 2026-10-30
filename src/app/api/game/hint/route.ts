import { handleJson } from "@/lib/api";
import { revealHint } from "@/lib/game";

export function POST(request: Request) {
  return handleJson(request, (db, body) => revealHint(db, body));
}
