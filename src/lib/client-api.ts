// Browser-side wrappers for the game API. Only type imports from server modules are allowed here.
import type { Category, GameMode, LeaderboardBoard } from "./constants";
import type { AnswerResult, DealtQuestion, FinishGameResult, HintResult, LeaderboardResult, StartGameResult } from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError(0, "network", "서버에 연결할 수 없습니다. 네트워크를 확인해 주세요.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? "unknown", data?.message ?? "요청에 실패했습니다.");
  }
  return data as T;
}

const post = <T>(url: string, body: unknown) =>
  request<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const gameApi = {
  /** `category` is required in category mode and ignored otherwise. */
  start: (nickname: string, mode: GameMode, category?: Category) =>
    post<StartGameResult>("/api/game/start", { nickname, mode, category }),
  next: (sessionId: string) => post<DealtQuestion>("/api/game/next", { sessionId }),
  hint: (sessionId: string, questionId: string) => post<HintResult>("/api/game/hint", { sessionId, questionId }),
  answer: (body: { sessionId: string; questionId: string; selectedIndex: number | null; timeSpentMs: number }) =>
    post<AnswerResult>("/api/game/answer", body),
  finish: (sessionId: string) => post<FinishGameResult>("/api/game/finish", { sessionId }),
  leaderboard: (board: LeaderboardBoard, sessionId: string | null, signal?: AbortSignal) => {
    const params = new URLSearchParams({ board });
    if (sessionId) params.set("sessionId", sessionId);
    return request<LeaderboardResult>(`/api/leaderboard?${params}`, { signal, cache: "no-store" });
  },
};

const LAST_SESSION_KEY = "quiz.lastSessionId";

/** The most recent finished game in this browser, used to find "my" row on the leaderboard. */
export const lastSession = {
  get(): string | null {
    try {
      return localStorage.getItem(LAST_SESSION_KEY);
    } catch {
      return null;
    }
  },
  set(sessionId: string) {
    try {
      localStorage.setItem(LAST_SESSION_KEY, sessionId);
    } catch {
      // Storage unavailable: the leaderboard just won't highlight this game.
    }
  },
};
