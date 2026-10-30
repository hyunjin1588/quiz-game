"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NICKNAME_MAX, NICKNAME_MIN } from "@/lib/constants";
import { validateNickname } from "@/lib/nickname";

const STORAGE_KEY = "quiz.nickname";

function loadNickname(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveNickname(nickname: string) {
  try {
    localStorage.setItem(STORAGE_KEY, nickname);
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the game still works.
  }
}

export function StartScreen({ onStart }: { onStart: (nickname: string) => void }) {
  const [nickname, setNickname] = useState("");
  const [touched, setTouched] = useState(false);

  // Read after mount so server and client render the same initial HTML.
  useEffect(() => setNickname(loadNickname()), []);

  const check = validateNickname(nickname);
  const showError = touched && !check.ok;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!check.ok) return;
    saveNickname(check.nickname);
    onStart(check.nickname);
  }

  return (
    <div className="flex flex-1 flex-col justify-center">
      <div className="mb-10 text-center">
        <div className="mb-4 text-6xl" aria-hidden>
          🧠
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">상식 퀴즈</h1>
        <p className="mt-2 text-slate-700">3가지 모드 · 빨리, 힌트 없이, 연속으로 맞힐수록 높은 점수</p>
      </div>

      <form onSubmit={submit} noValidate className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <label htmlFor="nickname" className="block text-sm font-semibold text-slate-800">
          닉네임
        </label>
        <input
          id="nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          onBlur={() => setTouched(true)}
          autoComplete="nickname"
          maxLength={NICKNAME_MAX + 10}
          placeholder={`${NICKNAME_MIN}~${NICKNAME_MAX}자`}
          aria-invalid={showError}
          aria-describedby="nickname-help"
          className={`mt-2 block h-14 w-full rounded-xl border px-4 text-lg outline-none transition placeholder:text-slate-500 focus:ring-4 ${
            showError
              ? "border-red-600 focus:ring-red-200"
              : "border-slate-400 focus:border-indigo-600 focus:ring-indigo-200"
          }`}
        />
        <p id="nickname-help" role={showError ? "alert" : undefined} className={`mt-2 text-sm ${showError ? "text-red-700" : "text-slate-600"}`}>
          {showError && !check.ok ? check.message : "순위표에 표시되는 이름이에요."}
        </p>
        <button
          type="submit"
          className="mt-6 h-14 w-full rounded-xl bg-indigo-600 text-lg font-bold text-white transition hover:bg-indigo-700 focus-visible:ring-4 focus-visible:ring-indigo-300 active:scale-[0.99]"
        >
          시작하기
        </button>
      </form>

      <Link
        href="/leaderboard"
        className="mt-4 flex h-12 items-center justify-center rounded-xl text-base font-semibold text-indigo-800 hover:bg-indigo-50"
      >
        <span aria-hidden>🏆&nbsp;</span>순위표 보기
      </Link>
    </div>
  );
}
