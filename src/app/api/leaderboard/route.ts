import type { NextRequest } from "next/server";
import { respond } from "@/lib/api";
import { DEFAULT_BOARD, LEADERBOARD_BOARDS, isLeaderboardBoard } from "@/lib/constants";
import { GameError } from "@/lib/game";
import { getLeaderboard } from "@/lib/leaderboard";

/** GET /api/leaderboard?board=challenge|speed|history|science|geography|general[&sessionId=...] */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const board = params.get("board") ?? DEFAULT_BOARD;
  const sessionId = params.get("sessionId");
  return respond((db) => {
    if (!isLeaderboardBoard(board)) {
      throw new GameError(400, "invalid_board", `board는 ${LEADERBOARD_BOARDS.join(", ")} 중 하나여야 합니다.`);
    }
    return getLeaderboard(db, board, sessionId || null);
  });
}
