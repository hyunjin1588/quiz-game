"use client";

import Link from "next/link";
import { BOARD_LABELS, CATEGORY_LABELS, gameLabel } from "@/lib/constants";
import type { FinishGameResult } from "@/lib/types";
import { CATEGORY_ICONS } from "./categoryIcons";

interface Props {
  result: FinishGameResult;
  onReplay: () => void;
  onHome: () => void;
}

function verdict(correct: number, total: number): string {
  const r = correct / total;
  if (r === 1) return "완벽해요! 상식 박사 🏆";
  if (r >= 0.8) return "훌륭해요! 👏";
  if (r >= 0.5) return "좋아요, 조금만 더! 💪";
  return "다음엔 더 잘할 수 있어요 🙂";
}

export function ResultScreen({ result, onReplay, onHome }: Props) {
  const { nickname, mode, category, totalScore, correctCount, totalQuestions, categoryStats, rank } = result;

  return (
    <div className="flex flex-1 flex-col">
      <section className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200" aria-labelledby="result-title">
        <h1 id="result-title" className="text-sm font-medium text-slate-700">
          {nickname}님의 {gameLabel(mode, category)} 결과
        </h1>
        <p className="mt-3 text-5xl font-extrabold tabular-nums text-indigo-700">
          {totalScore.toLocaleString()}
          <span className="sr-only">점</span>
        </p>
        <p className="text-sm font-semibold text-slate-600" aria-hidden>
          점
        </p>
        <p className="mt-4 text-lg font-bold text-slate-900">
          {totalQuestions}문제 중 <span className="text-indigo-700">{correctCount}문제</span> 정답
        </p>
        <p className="mt-1 text-slate-700">{verdict(correctCount, totalQuestions)}</p>
      </section>

      <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200" aria-labelledby="rank-title">
        <h2 id="rank-title" className="mb-3 text-base font-bold text-slate-900">
          이번 판 순위
        </h2>
        <dl className="rounded-xl bg-indigo-50 p-3 text-center">
          <dt className="text-xs font-semibold text-indigo-900">{BOARD_LABELS[rank.board]} 순위표</dt>
          <dd className="mt-1">
            <span className="text-2xl font-extrabold tabular-nums text-indigo-800">{rank.rank}위</span>
            <span className="block text-xs text-slate-700">{rank.totalPlayers}명 중</span>
          </dd>
        </dl>
      </section>

      <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200" aria-labelledby="stats-title">
        <h2 id="stats-title" className="mb-4 text-base font-bold text-slate-900">
          카테고리별 정답률
        </h2>
        <ul className="grid gap-4">
          {categoryStats.map((s) => {
            const pct = Math.round(s.accuracy * 100);
            return (
              <li key={s.category}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-semibold text-slate-800">
                    <span aria-hidden>{CATEGORY_ICONS[s.category]} </span>
                    {CATEGORY_LABELS[s.category]}
                  </span>
                  <span className="tabular-nums text-slate-700">
                    {s.correct}/{s.total} · <span className="font-bold text-slate-900">{pct}%</span>
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-200" aria-hidden>
                  <div className="h-full rounded-full bg-indigo-600" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="mt-6 grid gap-3">
        <button
          type="button"
          onClick={onReplay}
          autoFocus
          className="h-14 w-full rounded-xl bg-indigo-600 text-lg font-bold text-white transition hover:bg-indigo-700 focus-visible:ring-4 focus-visible:ring-indigo-300"
        >
          다시 하기
        </button>
        <Link
          href={`/leaderboard?board=${rank.board}`}
          className="flex h-14 w-full items-center justify-center rounded-xl bg-white text-base font-bold text-indigo-800 ring-1 ring-indigo-300 transition hover:bg-indigo-50"
        >
          <span aria-hidden>🏆&nbsp;</span>순위표 보기
        </Link>
        <button
          type="button"
          onClick={onHome}
          className="h-12 w-full rounded-xl text-base font-semibold text-slate-700 transition hover:bg-slate-200"
        >
          처음으로
        </button>
      </div>
    </div>
  );
}
