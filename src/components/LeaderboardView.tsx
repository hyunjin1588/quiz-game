"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { gameApi, lastSession } from "@/lib/client-api";
import {
  BOARD_LABELS,
  DEFAULT_BOARD,
  LEADERBOARD_BOARDS,
  LEADERBOARD_SIZE,
  MODES,
  isCategory,
  type LeaderboardBoard,
} from "@/lib/constants";
import type { LeaderboardEntry, LeaderboardResult } from "@/lib/types";
import { BOARD_ICONS } from "./categoryIcons";

const BOARDS = LEADERBOARD_BOARDS;

function boardNote(board: LeaderboardBoard): string {
  if (isCategory(board)) return `${MODES.category.label} 모드 · ${MODES.category.description}`;
  return MODES[board].description;
}
const MEDALS = ["🥇", "🥈", "🥉"];

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: LeaderboardResult };

export function LeaderboardView({ initialBoard }: { initialBoard: LeaderboardBoard }) {
  const [board, setBoard] = useState<LeaderboardBoard>(initialBoard);
  const [state, setState] = useState<State>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const tabRefs = useRef<Partial<Record<LeaderboardBoard, HTMLButtonElement | null>>>({});

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    gameApi
      .leaderboard(board, lastSession.get(), controller.signal)
      .then((data) => setState({ status: "ready", data }))
      .catch((e) => {
        if (controller.signal.aborted) return;
        setState({ status: "error", message: e instanceof Error ? e.message : "순위표를 불러오지 못했습니다." });
      });
    return () => controller.abort();
  }, [board, reloadKey]);

  const selectBoard = useCallback((next: LeaderboardBoard, focus = false) => {
    setBoard(next);
    window.history.replaceState(null, "", next === DEFAULT_BOARD ? "/leaderboard" : `/leaderboard?board=${next}`);
    if (focus) tabRefs.current[next]?.focus();
  }, []);

  // Arrow keys move between tabs (WAI-ARIA tabs pattern, automatic activation).
  function onTabKey(e: React.KeyboardEvent) {
    const i = BOARDS.indexOf(board);
    const target =
      e.key === "ArrowRight" ? BOARDS[(i + 1) % BOARDS.length]
      : e.key === "ArrowLeft" ? BOARDS[(i - 1 + BOARDS.length) % BOARDS.length]
      : e.key === "Home" ? BOARDS[0]
      : e.key === "End" ? BOARDS[BOARDS.length - 1]
      : null;
    if (target) {
      e.preventDefault();
      selectBoard(target, true);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="mb-4 flex items-center justify-between">
        <Link href="/" className="flex min-h-11 items-center rounded-lg px-2 text-sm text-slate-700 hover:bg-slate-200 hover:text-slate-900">
          ← 처음으로
        </Link>
        <Link href="/" className="flex min-h-11 items-center rounded-lg bg-indigo-600 px-4 text-sm font-bold text-white hover:bg-indigo-700">
          게임하기
        </Link>
      </header>

      <h1 className="mb-1 text-2xl font-extrabold text-slate-900">
        <span aria-hidden>🏆 </span>순위표
      </h1>
      <p className="mb-4 text-sm text-slate-700">
        상위 {LEADERBOARD_SIZE}위 · 동점이면 정답 수, 기록 시각 순
      </p>

      <div role="tablist" aria-label="순위표 종류" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1" onKeyDown={onTabKey}>
        {BOARDS.map((b) => {
          const selected = b === board;
          return (
            <button
              key={b}
              ref={(el) => {
                tabRefs.current[b] = el;
              }}
              id={`tab-${b}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="board-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => selectBoard(b)}
              className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold transition ${
                selected ? "bg-slate-900 text-white" : "bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-100"
              }`}
            >
              <span aria-hidden>{BOARD_ICONS[b]} </span>
              {BOARD_LABELS[b]}
            </button>
          );
        })}
      </div>
      <p className="-mt-2 mb-3 text-xs text-slate-600">{boardNote(board)}</p>

      <section
        id="board-panel"
        role="tabpanel"
        aria-labelledby={`tab-${board}`}
        aria-busy={state.status === "loading"}
        className="flex-1"
      >
        {state.status === "loading" && <LoadingRows />}
        {state.status === "error" && (
          <div role="alert" className="rounded-2xl bg-red-50 p-5 text-center ring-1 ring-red-200">
            <p className="font-semibold text-red-800">{state.message}</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="mt-3 min-h-11 rounded-lg bg-red-700 px-4 font-semibold text-white hover:bg-red-800"
            >
              다시 시도
            </button>
          </div>
        )}
        {state.status === "ready" && <Board data={state.data} />}
      </section>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <p className="sr-only">순위표를 불러오는 중입니다.</p>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 border-b border-slate-100 px-4 py-4 last:border-0 motion-safe-only" aria-hidden>
          <div className="h-4 w-6 rounded bg-slate-200" />
          <div className="h-4 flex-1 rounded bg-slate-200" />
          <div className="h-4 w-12 rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

function Board({ data }: { data: LeaderboardResult }) {
  if (data.entries.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <p className="text-4xl" aria-hidden>
          🌱
        </p>
        <p className="mt-3 font-bold text-slate-900">아직 {BOARD_LABELS[data.board]} 기록이 없어요</p>
        <p className="mt-1 text-sm text-slate-700">첫 번째 기록의 주인공이 되어 보세요!</p>
        <Link href="/" className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-indigo-600 px-5 font-bold text-white hover:bg-indigo-700">
          게임 시작하기
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <caption className="sr-only">
            {BOARD_LABELS[data.board]} 순위표, 총 {data.totalPlayers}명 중 상위 {data.entries.length}명
          </caption>
          <thead className="bg-slate-50 text-xs text-slate-700">
            <tr>
              <th scope="col" className="w-14 py-2 pl-4 text-left font-semibold">순위</th>
              <th scope="col" className="py-2 text-left font-semibold">닉네임</th>
              <th scope="col" className="py-2 text-right font-semibold">점수</th>
              <th scope="col" className="w-16 py-2 pr-4 text-right font-semibold">정답</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((e) => (
              <Row key={`${e.rank}-${e.nickname}`} entry={e} totalQuestions={data.totalQuestions} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-right text-xs text-slate-600">총 {data.totalPlayers.toLocaleString()}명 참여</p>

      {data.me && (
        <div className="sticky bottom-0 -mx-4 mt-4 bg-slate-100/95 px-4 pb-4 pt-2 backdrop-blur">
          <p className="mb-1 text-xs font-semibold text-slate-700">내 최근 기록</p>
          <table className="w-full rounded-2xl bg-indigo-50 text-sm ring-2 ring-indigo-500">
            <caption className="sr-only">내 최근 기록, {data.me.rank}위</caption>
            <tbody>
              <Row entry={data.me} totalQuestions={data.totalQuestions} />
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Row({ entry, totalQuestions }: { entry: LeaderboardEntry; totalQuestions: number }) {
  const medal = MEDALS[entry.rank - 1];
  return (
    <tr className={`border-b border-slate-100 last:border-0 ${entry.isMine ? "bg-indigo-50" : ""}`} aria-current={entry.isMine ? "true" : undefined}>
      <td className="py-3 pl-4 font-bold tabular-nums text-slate-900">
        {medal ? (
          <>
            <span aria-hidden className="text-lg">{medal}</span>
            <span className="sr-only">{entry.rank}위</span>
          </>
        ) : (
          `${entry.rank}`
        )}
      </td>
      <td className="py-3 pr-2">
        <span className="font-semibold text-slate-900">{entry.nickname}</span>
        {entry.isMine && (
          <span className="ml-1.5 rounded-full bg-indigo-700 px-1.5 py-0.5 text-[11px] font-bold text-white">나</span>
        )}
      </td>
      <td className="py-3 text-right font-bold tabular-nums text-indigo-800">{entry.totalScore.toLocaleString()}</td>
      <td className="py-3 pr-4 text-right tabular-nums text-slate-700">
        {entry.correctCount}
        <span className="text-slate-600">/{totalQuestions}</span>
      </td>
    </tr>
  );
}
