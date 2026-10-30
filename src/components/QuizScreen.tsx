"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { gameApi } from "@/lib/client-api";
import { CATEGORY_LABELS, gameLabel } from "@/lib/constants";
import { DIFFICULTY_LABELS, NO_HINT_BONUS, describeBreakdown } from "@/lib/scoring";
import type { AnswerResult, DealtQuestion, FinishGameResult, StartGameResult } from "@/lib/types";

const AUTO_ADVANCE_MS = 2_000;
const TICK_MS = 100;

/** answering → submitting → feedback → loading (next question) → answering …, then finishing. */
type Phase = "answering" | "submitting" | "feedback" | "loading" | "finishing";

interface Props {
  game: StartGameResult;
  onFinished: (result: FinishGameResult) => void;
}

export function QuizScreen({ game, onFinished }: Props) {
  const { timeLimitMs, sessionId, totalQuestions } = game;
  const [question, setQuestion] = useState<DealtQuestion>(game.question);
  const [phase, setPhase] = useState<Phase>("answering");
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<AnswerResult | null>(null);
  const [totalScore, setTotalScore] = useState(0);
  const [remainingMs, setRemainingMs] = useState(game.question.remainingMs);
  const [error, setError] = useState<{ message: string; retry: () => void } | null>(null);
  // The hint comes back with the question when it was already used (e.g. before a reload).
  const [hint, setHint] = useState<string | null>(game.question.hint);
  const [hintStatus, setHintStatus] = useState<"idle" | "loading" | "error">("idle");

  // Refs mirror state that the timer and key handler read, so a stale closure or two fast
  // key presses can never submit twice.
  const deadlineRef = useRef(0);
  const lockedRef = useRef(false);
  const phaseRef = useRef<Phase>("answering");
  phaseRef.current = phase;
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const questionHeadingRef = useRef<HTMLHeadingElement>(null);
  const hintRef = useRef<HTMLParagraphElement>(null);

  const sendAnswer = useCallback(
    async (questionId: string, selectedIndex: number | null, timeSpentMs: number) => {
      setError(null);
      try {
        const result = await gameApi.answer({ sessionId, questionId, selectedIndex, timeSpentMs });
        setFeedback(result);
        setTotalScore(result.totalScore);
        setPhase("feedback");
      } catch (e) {
        setError({
          message: e instanceof Error ? e.message : "답안을 제출하지 못했습니다.",
          retry: () => sendAnswer(questionId, selectedIndex, timeSpentMs),
        });
      }
    },
    [sessionId],
  );

  const choose = useCallback(
    (choice: number | null) => {
      if (lockedRef.current || phaseRef.current !== "answering") return;
      lockedRef.current = true;
      const left = choice === null ? 0 : Math.max(0, deadlineRef.current - performance.now());
      setRemainingMs(left);
      setSelected(choice);
      setPhase("submitting");
      void sendAnswer(question.id, choice, Math.round(timeLimitMs - left));
    },
    [sendAnswer, question.id, timeLimitMs],
  );

  const requestHint = useCallback(async () => {
    if (phaseRef.current !== "answering") return;
    setHintStatus("loading");
    try {
      const { hint } = await gameApi.hint(sessionId, question.id);
      setHint(hint);
      setHintStatus("idle");
      // The button is replaced by the hint, so keep keyboard focus nearby instead of losing it to the page.
      requestAnimationFrame(() => hintRef.current?.focus({ preventScroll: true }));
    } catch {
      setHintStatus("error");
    }
  }, [sessionId, question.id]);

  const finish = useCallback(async () => {
    setPhase("finishing");
    setError(null);
    try {
      onFinished(await gameApi.finish(sessionId));
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : "결과를 불러오지 못했습니다.", retry: finish });
    }
  }, [onFinished, sessionId]);

  const loadNext = useCallback(async () => {
    setPhase("loading");
    setError(null);
    try {
      const q = await gameApi.next(sessionId);
      setQuestion(q);
      setHint(q.hint);
      setHintStatus("idle");
      setSelected(null);
      setFeedback(null);
      setPhase("answering");
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : "다음 문제를 불러오지 못했습니다.", retry: loadNext });
    }
  }, [sessionId]);

  const next = useCallback(() => {
    if (phaseRef.current !== "feedback") return;
    phaseRef.current = feedback?.isLast ? "finishing" : "loading";
    void (feedback?.isLast ? finish() : loadNext());
  }, [feedback, finish, loadNext]);

  // Countdown for the current question, from the time the server says is left. A timeout counts as wrong.
  useEffect(() => {
    deadlineRef.current = performance.now() + question.remainingMs;
    lockedRef.current = false;
    setRemainingMs(question.remainingMs);
    const id = setInterval(() => {
      if (lockedRef.current) return;
      const left = deadlineRef.current - performance.now();
      if (left <= 0) choose(null);
      else setRemainingMs(left);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [question, choose]);

  // Move focus to each new question (after the first) so screen readers read it.
  const firstQuestionRef = useRef(true);
  useEffect(() => {
    if (firstQuestionRef.current) {
      firstQuestionRef.current = false;
      return;
    }
    questionHeadingRef.current?.focus({ preventScroll: true });
  }, [question.id]);

  // Auto-advance after feedback; leaving the feedback phase (e.g. pressing "다음") cancels it.
  useEffect(() => {
    if (phase !== "feedback") return;
    nextButtonRef.current?.focus({ preventScroll: true });
    const id = setTimeout(next, AUTO_ADVANCE_MS);
    return () => clearTimeout(id);
  }, [phase, next]);

  // Number keys 1-4 pick a choice.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= question.choices.length) {
        e.preventDefault();
        choose(n - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [choose, question.choices.length]);

  const number = question.position + 1;
  const secondsLeft = Math.ceil(remainingMs / 1000);
  const ratio = remainingMs / timeLimitMs;
  const lowTime = ratio <= 0.25;
  const barColor = ratio > 0.5 ? "bg-indigo-600" : lowTime ? "bg-red-600" : "bg-amber-500";
  const showFeedback = feedback !== null && phase !== "answering" && phase !== "submitting";

  return (
    <div className="flex flex-1 flex-col">
      {/* Progress, score and timer */}
      <header className="mb-5">
        <p className="mb-1 text-xs font-semibold text-slate-600">{gameLabel(game.mode, game.category)}</p>
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-700">
            <span className="sr-only">문제 </span>
            <span className="text-lg text-slate-900">{number}</span> / {totalQuestions}
          </span>
          <span className="font-semibold text-slate-700">
            점수 <span className="text-lg tabular-nums text-indigo-700">{totalScore.toLocaleString()}</span>
          </span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-label="진행도"
          aria-valuemin={0}
          aria-valuemax={totalQuestions}
          aria-valuenow={number}
          aria-valuetext={`${totalQuestions}문제 중 ${number}번째`}
        >
          <div className="h-full bg-slate-600 transition-all" style={{ width: `${(number / totalQuestions) * 100}%` }} />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-200" aria-hidden>
            <div
              className={`motion-safe-only h-full rounded-full ${barColor} transition-[width] duration-100 ease-linear`}
              style={{ width: `${ratio * 100}%` }}
            />
          </div>
          <span className={`w-14 text-right text-sm font-bold tabular-nums ${lowTime ? "text-red-700" : "text-slate-700"}`}>
            <span aria-hidden>⏱ </span>
            <span className="sr-only">남은 시간 </span>
            {secondsLeft}초
          </span>
        </div>
        {/* Announce only the 5-second warning, not every tick. */}
        <p className="sr-only" aria-live="assertive">
          {phase === "answering" && secondsLeft <= 5 && secondsLeft > 0 ? "5초 남았습니다" : ""}
        </p>
      </header>

      {/* Question */}
      <section className="mb-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200" aria-busy={phase === "loading"}>
        <div className="mb-2 flex gap-2 text-xs font-semibold">
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-800">{CATEGORY_LABELS[question.category]}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
            <span className="sr-only">난이도 </span>
            {DIFFICULTY_LABELS[question.difficulty]}
          </span>
        </div>
        <h2 ref={questionHeadingRef} tabIndex={-1} className="text-xl font-bold leading-snug text-slate-900 outline-none">
          <span className="sr-only">{number}번 문제. </span>
          {question.question}
        </h2>
      </section>

      {/* Hint: asked for on demand, so it gives up only this question's no-hint bonus. */}
      <div className="mb-5" aria-live="polite">
        {hint !== null ? (
          <p ref={hintRef} tabIndex={-1} className="rounded-xl bg-amber-50 p-3 text-sm leading-relaxed text-amber-950 ring-1 ring-amber-300">
            <span aria-hidden>🔑 </span>
            <span className="font-semibold">힌트 </span>
            {hint}
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <button
              type="button"
              onClick={requestHint}
              disabled={phase !== "answering" || hintStatus === "loading"}
              className="min-h-11 shrink-0 rounded-lg bg-white px-3 text-sm font-semibold text-amber-900 ring-1 ring-amber-400 transition hover:bg-amber-50 disabled:cursor-default disabled:opacity-60"
            >
              <span aria-hidden>🔑 </span>
              {hintStatus === "loading" ? "불러오는 중…" : "힌트 보기"}
            </button>
            <span className={`text-xs ${hintStatus === "error" ? "text-red-800" : "text-slate-600"}`}>
              {hintStatus === "error"
                ? "힌트를 불러오지 못했어요. 다시 눌러 주세요."
                : `힌트를 보면 힌트 미사용 보너스 ${NO_HINT_BONUS}점이 사라져요`}
            </span>
          </div>
        )}
      </div>

      {/* Choices */}
      <ol className="grid gap-3" aria-label="보기">
        {question.choices.map((choice, i) => (
          <li key={`${question.id}-${i}`}>
            <ChoiceButton
              number={i + 1}
              label={choice}
              state={choiceState(i, phase, selected, feedback)}
              disabled={phase !== "answering"}
              onClick={() => choose(i)}
            />
          </li>
        ))}
      </ol>

      {phase === "answering" && (
        <p className="mt-3 hidden text-center text-xs text-slate-600 sm:block">키보드 1~4로도 고를 수 있어요</p>
      )}

      {/* Feedback */}
      <div aria-live="polite" className="mt-5">
        {showFeedback && (
          <FeedbackPanel
            feedback={feedback}
            difficulty={question.difficulty}
            busy={phase !== "feedback"}
            onNext={next}
            nextRef={nextButtonRef}
          />
        )}
        {phase === "submitting" && !error && <p className="text-center text-sm text-slate-600">채점 중…</p>}
      </div>

      {error && (
        <div role="alert" className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
          <span>{error.message}</span>
          <button type="button" onClick={error.retry} className="min-h-11 shrink-0 rounded-lg bg-red-700 px-3 font-semibold text-white hover:bg-red-800">
            다시 시도
          </button>
        </div>
      )}
    </div>
  );
}

type ChoiceState = "idle" | "pending" | "correct" | "wrong-picked" | "correct-picked" | "dimmed";

function choiceState(i: number, phase: Phase, selected: number | null, feedback: AnswerResult | null): ChoiceState {
  if (phase === "answering") return "idle";
  if (!feedback) return i === selected ? "pending" : "dimmed";
  if (i === feedback.correctIndex) return i === selected ? "correct-picked" : "correct";
  if (i === selected) return "wrong-picked";
  return "dimmed";
}

const CHOICE_STYLES: Record<ChoiceState, { box: string; badge: string; icon?: string; tag?: string }> = {
  idle: {
    box: "bg-white ring-1 ring-slate-300 hover:ring-indigo-500 hover:bg-indigo-50 active:scale-[0.99]",
    badge: "bg-slate-100 text-slate-700",
  },
  pending: { box: "bg-indigo-50 ring-2 ring-indigo-600", badge: "bg-indigo-600 text-white", tag: "확인 중" },
  correct: { box: "bg-green-50 ring-2 ring-green-700 text-green-950", badge: "bg-green-700 text-white", icon: "✓", tag: "정답" },
  "correct-picked": {
    box: "bg-green-50 ring-2 ring-green-700 text-green-950",
    badge: "bg-green-700 text-white",
    icon: "✓",
    tag: "내 선택 · 정답",
  },
  "wrong-picked": { box: "bg-red-50 ring-2 ring-red-700 text-red-950", badge: "bg-red-700 text-white", icon: "✗", tag: "내 선택 · 오답" },
  dimmed: { box: "bg-slate-50 ring-1 ring-slate-200 text-slate-600", badge: "bg-slate-200 text-slate-600" },
};

function ChoiceButton({
  number,
  label,
  state,
  disabled,
  onClick,
}: {
  number: number;
  label: string;
  state: ChoiceState;
  disabled: boolean;
  onClick: () => void;
}) {
  const s = CHOICE_STYLES[state];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-keyshortcuts={String(number)}
      className={`flex min-h-14 w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-base font-medium transition focus-visible:ring-4 focus-visible:ring-indigo-400 disabled:cursor-default ${s.box}`}
    >
      <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${s.badge}`} aria-hidden>
        {s.icon ?? number}
      </span>
      <span className="sr-only">{number}번 보기: </span>
      <span className="flex-1">{label}</span>
      {s.tag && (
        <span className="shrink-0 text-xs font-bold">
          <span className="sr-only">, </span>
          {s.tag}
        </span>
      )}
    </button>
  );
}

function FeedbackPanel({
  feedback,
  difficulty,
  busy,
  onNext,
  nextRef,
}: {
  feedback: AnswerResult;
  difficulty: number;
  busy: boolean;
  onNext: () => void;
  nextRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const { isCorrect, timedOut, score, breakdown, hintUsed, combo, explanation, isLast } = feedback;
  const tone = isCorrect
    ? { box: "bg-green-50 ring-green-300", title: "text-green-800", icon: "✓", text: "정답입니다!" }
    : timedOut
      ? { box: "bg-amber-50 ring-amber-300", title: "text-amber-900", icon: "⏱", text: "시간 초과" }
      : { box: "bg-red-50 ring-red-300", title: "text-red-800", icon: "✗", text: "오답입니다" };

  return (
    <div className={`rounded-2xl p-4 ring-1 ${tone.box}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className={`text-lg font-extrabold ${tone.title}`}>
          <span aria-hidden>{tone.icon} </span>
          {tone.text}
        </p>
        <p className={`text-lg font-extrabold tabular-nums ${tone.title}`}>+{score}점</p>
      </div>

      {isCorrect && (
        <p className="mt-1 text-xs text-slate-700">
          {describeBreakdown(breakdown, difficulty)}
          {hintUsed && " · 힌트 사용"}
        </p>
      )}
      {combo >= 2 ? (
        <p className="mt-1 text-sm font-bold text-orange-700">
          <span aria-hidden>🔥 </span>
          {combo}연속 정답!
        </p>
      ) : (
        !isCorrect && <p className="mt-1 text-xs text-slate-700">콤보가 초기화되었어요.</p>
      )}

      <p className="mt-3 text-sm leading-relaxed text-slate-800">
        <span className="font-semibold">해설 </span>
        {explanation}
      </p>

      <button
        ref={nextRef}
        type="button"
        onClick={onNext}
        disabled={busy}
        className="relative mt-4 h-14 w-full overflow-hidden rounded-xl bg-slate-900 text-base font-bold text-white transition hover:bg-slate-800 focus-visible:ring-4 focus-visible:ring-indigo-400 disabled:opacity-80"
      >
        {!busy && (
          <span
            aria-hidden
            className="motion-safe-only absolute inset-x-0 bottom-0 h-1 origin-left bg-indigo-400"
            style={{ animation: `autoadvance ${AUTO_ADVANCE_MS}ms linear forwards` }}
          />
        )}
        {busy ? (isLast ? "결과 계산 중…" : "불러오는 중…") : isLast ? "결과 보기 →" : "다음 문제 →"}
      </button>
    </div>
  );
}
