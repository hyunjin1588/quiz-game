"use client";

import { useState } from "react";
import { gameApi } from "@/lib/client-api";
import { CATEGORIES, CATEGORY_LABELS, MODES, type Category, type GameMode } from "@/lib/constants";
import type { StartGameResult } from "@/lib/types";
import { CATEGORY_ICONS, MODE_ICONS } from "./categoryIcons";

const CATEGORY_DESCRIPTIONS: Record<Category, string> = {
  history: "고조선부터 근대까지",
  science: "물리 · 화학 · 생명 · 지구",
  geography: "나라, 수도, 산과 바다",
  general: "문화, 예술, 생활 상식",
};

const seconds = (ms: number) => `문제당 ${ms / 1000}초`;

interface Props {
  nickname: string;
  onStarted: (game: StartGameResult) => void;
  onBack: () => void;
}

/** A game is identified by its mode, or by its category in category mode. */
type Choice = Exclude<GameMode, "category"> | Category;

export function ModeScreen({ nickname, onStarted, onBack }: Props) {
  const [loading, setLoading] = useState<Choice | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(choice: Choice) {
    if (loading) return;
    setLoading(choice);
    setError(null);
    try {
      const game =
        choice === "challenge" || choice === "speed"
          ? await gameApi.start(nickname, choice)
          : await gameApi.start(nickname, "category", choice);
      onStarted(game);
    } catch (e) {
      setError(e instanceof Error ? e.message : "게임을 시작하지 못했습니다.");
      setLoading(null);
    }
  }

  const card = (choice: Choice, icon: string, title: string, description: string, wide: boolean) => (
    <button
      key={choice}
      type="button"
      onClick={() => choose(choice)}
      disabled={loading !== null}
      aria-busy={loading === choice}
      className={`flex rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:ring-indigo-400 focus-visible:ring-4 focus-visible:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 ${
        wide ? "min-h-20 flex-row items-center gap-4" : "min-h-28 flex-col items-start justify-between gap-2"
      }`}
    >
      <span className="text-3xl" aria-hidden>
        {icon}
      </span>
      <span className={wide ? "flex-1" : ""}>
        <span className="block text-lg font-bold text-slate-900">
          {title}
          {loading === choice && <span className="ml-2 text-sm font-normal text-indigo-700">준비 중…</span>}
        </span>
        <span className="block text-sm text-slate-600">{description}</span>
      </span>
    </button>
  );

  const { challenge, speed, category } = MODES;

  return (
    <div className="flex flex-1 flex-col">
      <header className="mb-6 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="min-h-11 rounded-lg px-2 text-sm text-slate-700 hover:bg-slate-200 hover:text-slate-900"
        >
          ← 닉네임 변경
        </button>
        <span className="text-sm text-slate-700">
          <span className="font-semibold text-slate-900">{nickname}</span>님
        </span>
      </header>

      <h1 className="mb-6 text-2xl font-extrabold text-slate-900">게임 모드를 고르세요</h1>

      <div className="grid gap-3">
        {card("challenge", MODE_ICONS.challenge, challenge.label, `${challenge.description} · ${seconds(challenge.timeLimitMs)}`, true)}
        {card("speed", MODE_ICONS.speed, speed.label, speed.description, true)}
      </div>

      <section className="mt-6" aria-labelledby="category-mode-title">
        <h2 id="category-mode-title" className="text-lg font-bold text-slate-900">
          <span aria-hidden>{MODE_ICONS.category} </span>
          {category.label}
        </h2>
        <p className="mb-3 text-sm text-slate-700">
          {category.description} · {seconds(category.timeLimitMs)}
        </p>
        <div className="grid grid-cols-2 gap-3">
          {CATEGORIES.map((c) => card(c, CATEGORY_ICONS[c], CATEGORY_LABELS[c], CATEGORY_DESCRIPTIONS[c], false))}
        </div>
      </section>

      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
          {error}
        </p>
      )}
    </div>
  );
}
