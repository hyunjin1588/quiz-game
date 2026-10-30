// Standalone build of the quiz: runs from index.html opened directly (file://), with no server.
// Questions are bundled in, and records live in this browser's localStorage. Modes, scoring,
// nickname rules and ranking order come from the same modules the server uses.
// Built by `npm run build:html` (scripts/build-standalone.ts).
import questionsData from "@/data/questions.json";
import {
  BOARD_LABELS,
  CATEGORIES,
  CATEGORY_LABELS,
  CHALLENGE_PER_CATEGORY,
  DEFAULT_BOARD,
  LEADERBOARD_BOARDS,
  LEADERBOARD_SIZE,
  MODES,
  NICKNAME_MAX,
  NICKNAME_MIN,
  boardFor,
  gameLabel,
  isCategory,
  modeOfBoard,
  type Category,
  type GameCategory,
  type GameMode,
  type LeaderboardBoard,
} from "@/lib/constants";
import { validateNickname } from "@/lib/nickname";
import { compareRecords, rankBoard, type RankRecord } from "@/lib/ranking";
import { DIFFICULTY_LABELS, NO_HINT_BONUS, describeBreakdown, scoreAnswer } from "@/lib/scoring";
import type { QuestionSeed } from "@/lib/types";

const AUTO_ADVANCE_MS = 2_000;
const TICK_MS = 100;
const MAX_STORED_RECORDS = 1_000;
const CATEGORY_ICONS: Record<Category, string> = { history: "📜", science: "🔬", geography: "🌏", general: "💡" };
const MODE_ICONS: Record<GameMode, string> = { challenge: "🏁", category: "📚", speed: "⚡" };
const BOARD_ICONS: Record<LeaderboardBoard, string> = { challenge: MODE_ICONS.challenge, speed: MODE_ICONS.speed, ...CATEGORY_ICONS };
const CATEGORY_DESCRIPTIONS: Record<Category, string> = {
  history: "고조선부터 근대까지",
  science: "물리 · 화학 · 생명 · 지구",
  geography: "나라, 수도, 산과 바다",
  general: "문화, 예술, 생활 상식",
};
const BOARDS = LEADERBOARD_BOARDS;
const MEDALS = ["🥇", "🥈", "🥉"];

const QUESTIONS = (questionsData as QuestionSeed[]).filter((q) => q.status !== "retired");

// ---------- storage (every access guarded: private mode or blocked storage must not break the game)

const KEYS = { nickname: "quiz.nickname", records: "quiz.records", lastId: "quiz.lastRecordId" };

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the game still works, records just won't persist.
  }
}

function loadRecords(): RankRecord[] {
  try {
    const parsed = JSON.parse(load(KEYS.records) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((r) => r && typeof r.totalScore === "number") : [];
  } catch {
    return [];
  }
}

function saveRecord(record: RankRecord) {
  // Keep the best records if the list ever grows past the cap.
  const records = [...loadRecords(), record].sort(compareRecords).slice(0, MAX_STORED_RECORDS);
  save(KEYS.records, JSON.stringify(records));
  save(KEYS.lastId, record.id);
}

// ---------- helpers

const app = document.getElementById("app")!;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const seconds = (ms: number) => `문제당 ${ms / 1000}초`;

function randomInt(max: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
}

function shuffle<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newId(): string {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${randomInt(1e9)}`;
}

// ---------- state

interface Dealt {
  seed: QuestionSeed;
  choices: string[];
  correctIndex: number;
}

interface Game {
  nickname: string;
  mode: GameMode;
  category: GameCategory;
  timeLimitMs: number;
  questions: Dealt[];
  index: number;
  hintUsed: boolean;
  results: { category: Category; isCorrect: boolean }[];
  totalScore: number;
  combo: number;
}

let nickname = "";
let game: Game | null = null;
let phase: "answering" | "feedback" = "answering";
let deadline = 0;
let tickTimer: number | undefined;
let advanceTimer: number | undefined;
let currentScreen: "start" | "mode" | "quiz" | "result" | "leaderboard" = "start";

function stopTimers() {
  clearInterval(tickTimer);
  clearTimeout(advanceTimer);
}

function show(html: string, screen: typeof currentScreen) {
  stopTimers();
  currentScreen = screen;
  app.innerHTML = html;
  window.scrollTo(0, 0);
}

// ---------- start screen

function renderStart(focusInput = false) {
  show(
    `<div class="screen center">
      <div class="hero">
        <div class="hero-emoji" aria-hidden="true">🧠</div>
        <h1>상식 퀴즈</h1>
        <p class="muted">3가지 모드 · 빨리, 힌트 없이, 연속으로 맞힐수록 높은 점수</p>
      </div>
      <form class="card" id="start-form" novalidate>
        <label for="nickname" class="field-label">닉네임</label>
        <input id="nickname" class="input" autocomplete="nickname" maxlength="${NICKNAME_MAX + 10}"
          placeholder="${NICKNAME_MIN}~${NICKNAME_MAX}자" aria-describedby="nickname-help" value="${esc(load(KEYS.nickname) ?? "")}">
        <p id="nickname-help" class="help">순위표에 표시되는 이름이에요.</p>
        <button type="submit" class="btn btn-primary btn-lg">시작하기</button>
      </form>
      <button type="button" class="btn btn-ghost" data-action="leaderboard"><span aria-hidden="true">🏆&nbsp;</span>순위표 보기</button>
    </div>`,
    "start",
  );

  const form = document.getElementById("start-form") as HTMLFormElement;
  const input = document.getElementById("nickname") as HTMLInputElement;
  const help = document.getElementById("nickname-help")!;
  let touched = false;
  if (focusInput) input.focus();

  const refresh = () => {
    const check = validateNickname(input.value);
    const bad = touched && !check.ok;
    input.setAttribute("aria-invalid", String(bad));
    input.classList.toggle("input-error", bad);
    help.classList.toggle("help-error", bad);
    help.textContent = bad && !check.ok ? check.message : "순위표에 표시되는 이름이에요.";
    if (bad) help.setAttribute("role", "alert");
    else help.removeAttribute("role");
    return check;
  };

  input.addEventListener("input", refresh);
  input.addEventListener("blur", () => {
    touched = true;
    refresh();
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    touched = true;
    const check = refresh();
    if (!check.ok) {
      input.focus();
      return;
    }
    nickname = check.nickname;
    save(KEYS.nickname, nickname);
    renderModes();
  });
}

// ---------- mode screen

function renderModes() {
  const card = (attrs: string, icon: string, title: string, description: string, wide: boolean) => `
    <button type="button" class="cat-card${wide ? " cat-wide" : ""}" data-action="pick" ${attrs}>
      <span class="cat-icon" aria-hidden="true">${icon}</span>
      <span>
        <span class="cat-name">${title}</span>
        <span class="cat-desc">${description}</span>
      </span>
    </button>`;
  const { challenge, speed, category } = MODES;
  show(
    `<div class="screen">
      <header class="topbar">
        <button type="button" class="btn btn-small" data-action="start">← 닉네임 변경</button>
        <span class="muted small"><strong class="strong">${esc(nickname)}</strong>님</span>
      </header>
      <h1 class="title">게임 모드를 고르세요</h1>
      <div class="mode-list">
        ${card('data-mode="challenge"', MODE_ICONS.challenge, challenge.label, `${challenge.description} · ${seconds(challenge.timeLimitMs)}`, true)}
        ${card('data-mode="speed"', MODE_ICONS.speed, speed.label, speed.description, true)}
      </div>
      <section class="mode-section" aria-labelledby="category-mode-title">
        <h2 id="category-mode-title"><span aria-hidden="true">${MODE_ICONS.category} </span>${category.label}</h2>
        <p class="small muted">${category.description} · ${seconds(category.timeLimitMs)}</p>
        <div class="cat-grid">${CATEGORIES.map((c) =>
          card(`data-mode="category" data-category="${c}"`, CATEGORY_ICONS[c], CATEGORY_LABELS[c], CATEGORY_DESCRIPTIONS[c], false),
        ).join("")}</div>
      </section>
    </div>`,
    "mode",
  );
  (app.querySelector(".cat-card") as HTMLElement | null)?.focus();
}

// ---------- quiz

/** Same deal as the server: challenge takes 10 from each category and mixes them. */
function dealQuestions(mode: GameMode, category: GameCategory): QuestionSeed[] {
  if (mode === "challenge") {
    return shuffle(CATEGORIES.flatMap((c) => shuffle(QUESTIONS.filter((q) => q.category === c)).slice(0, CHALLENGE_PER_CATEGORY)));
  }
  const pool = category === "random" ? QUESTIONS : QUESTIONS.filter((q) => q.category === category);
  return shuffle(pool).slice(0, MODES[mode].questionCount);
}

function startGame(mode: GameMode, category: GameCategory) {
  game = {
    nickname,
    mode,
    category,
    timeLimitMs: MODES[mode].timeLimitMs,
    questions: dealQuestions(mode, category).map((seed) => {
      const order = shuffle([0, 1, 2, 3]);
      return { seed, choices: order.map((i) => seed.choices[i]), correctIndex: order.indexOf(seed.answer_index) };
    }),
    index: 0,
    hintUsed: false,
    results: [],
    totalScore: 0,
    combo: 0,
  };
  renderQuestion();
}

function renderQuestion() {
  const g = game!;
  const q = g.questions[g.index];
  const n = g.index + 1;
  const total = g.questions.length;
  phase = "answering";
  g.hintUsed = false;

  show(
    `<div class="screen">
      <header class="quiz-head">
        <p class="mode-label">${gameLabel(g.mode, g.category)}</p>
        <div class="row between small">
          <span class="semibold"><span class="sr-only">문제 </span><span class="big">${n}</span> / ${total}</span>
          <span class="semibold">점수 <span class="big score">${g.totalScore.toLocaleString()}</span></span>
        </div>
        <div class="progress" role="progressbar" aria-label="진행도" aria-valuemin="0" aria-valuemax="${total}"
          aria-valuenow="${n}" aria-valuetext="${total}문제 중 ${n}번째"><div style="width:${(n / total) * 100}%"></div></div>
        <div class="row timer-row">
          <div class="timer" aria-hidden="true"><div id="timer-bar"></div></div>
          <span class="timer-text" id="timer-text"><span aria-hidden="true">⏱ </span><span class="sr-only">남은 시간 </span><span id="timer-sec">${g.timeLimitMs / 1000}</span>초</span>
        </div>
        <p class="sr-only" aria-live="assertive" id="timer-warning"></p>
      </header>
      <section class="card question">
        <div class="chips">
          <span class="chip chip-cat">${CATEGORY_LABELS[q.seed.category]}</span>
          <span class="chip"><span class="sr-only">난이도 </span>${DIFFICULTY_LABELS[q.seed.difficulty]}</span>
        </div>
        <h2 id="question-text" tabindex="-1"><span class="sr-only">${n}번 문제. </span>${esc(q.seed.question)}</h2>
      </section>
      <div aria-live="polite" id="hint-area">
        <div class="hint-row">
          <button type="button" class="btn hint-btn" data-action="hint"><span aria-hidden="true">🔑 </span>힌트 보기</button>
          <span class="tiny">힌트를 보면 힌트 미사용 보너스 ${NO_HINT_BONUS}점이 사라져요</span>
        </div>
      </div>
      <ol class="choices" aria-label="보기">
        ${q.choices
          .map(
            (c, i) => `<li><button type="button" class="choice" data-action="choose" data-index="${i}" aria-keyshortcuts="${i + 1}">
              <span class="badge" aria-hidden="true">${i + 1}</span>
              <span class="sr-only">${i + 1}번 보기: </span>
              <span class="choice-label">${esc(c)}</span>
              <span class="tag"></span>
            </button></li>`,
          )
          .join("")}
      </ol>
      <p class="key-tip">키보드 1~4로도 고를 수 있어요</p>
      <div aria-live="polite" id="feedback"></div>
    </div>`,
    "quiz",
  );

  if (g.index > 0) (document.getElementById("question-text") as HTMLElement).focus({ preventScroll: true });
  deadline = performance.now() + g.timeLimitMs;
  tickTimer = window.setInterval(tick, TICK_MS);
  tick();
}

function showHint() {
  if (currentScreen !== "quiz" || phase !== "answering" || !game || game.hintUsed) return;
  game.hintUsed = true;
  document.getElementById("hint-area")!.innerHTML =
    `<p class="hint-box" tabindex="-1"><span aria-hidden="true">🔑 </span><strong>힌트 </strong>${esc(game.questions[game.index].seed.hint)}</p>`;
  // The button is gone, so keep keyboard focus nearby instead of losing it to the page.
  (app.querySelector(".hint-box") as HTMLElement).focus({ preventScroll: true });
}

function tick() {
  if (phase !== "answering") return;
  const left = Math.max(0, deadline - performance.now());
  updateTimer(left);
  if (left <= 0) choose(null);
}

function updateTimer(left: number) {
  const ratio = left / game!.timeLimitMs;
  const sec = Math.ceil(left / 1000);
  const bar = document.getElementById("timer-bar");
  if (!bar) return;
  bar.style.width = `${ratio * 100}%`;
  bar.className = ratio > 0.5 ? "ok" : ratio > 0.25 ? "warn" : "low";
  document.getElementById("timer-sec")!.textContent = String(sec);
  document.getElementById("timer-text")!.classList.toggle("low", ratio <= 0.25);
  const warning = document.getElementById("timer-warning")!;
  const text = sec <= 5 && sec > 0 ? "5초 남았습니다" : "";
  if (warning.textContent !== text) warning.textContent = text;
}

function choose(selected: number | null) {
  if (currentScreen !== "quiz" || phase !== "answering" || !game) return;
  phase = "feedback";
  clearInterval(tickTimer);

  const g = game;
  const q = g.questions[g.index];
  const left = selected === null ? 0 : Math.max(0, deadline - performance.now());
  updateTimer(left);
  const timeSpentMs = Math.round(g.timeLimitMs - left);
  const timedOut = selected === null || timeSpentMs >= g.timeLimitMs;
  const isCorrect = !timedOut && selected === q.correctIndex;
  const r = scoreAnswer({
    isCorrect,
    timeSpentMs,
    difficulty: q.seed.difficulty,
    hintUsed: g.hintUsed,
    previousCombo: g.combo,
    limitMs: g.timeLimitMs,
  });
  g.combo = r.combo;
  g.totalScore += r.score;
  g.results.push({ category: q.seed.category, isCorrect });
  const isLast = g.index === g.questions.length - 1;

  // Mark choices with color, icon and text so state never relies on color alone.
  app.querySelectorAll<HTMLButtonElement>(".choice").forEach((btn, i) => {
    btn.disabled = true;
    const badge = btn.querySelector(".badge")!;
    const tag = btn.querySelector(".tag")!;
    if (i === q.correctIndex) {
      btn.classList.add("is-correct");
      badge.textContent = "✓";
      tag.innerHTML = `<span class="sr-only">, </span>${i === selected ? "내 선택 · 정답" : "정답"}`;
    } else if (i === selected) {
      btn.classList.add("is-wrong");
      badge.textContent = "✗";
      tag.innerHTML = `<span class="sr-only">, </span>내 선택 · 오답`;
    } else {
      btn.classList.add("is-dim");
    }
  });
  app.querySelector(".key-tip")?.remove();
  const hintButton = app.querySelector<HTMLButtonElement>(".hint-btn");
  if (hintButton) hintButton.disabled = true;
  document.querySelector(".score")!.textContent = g.totalScore.toLocaleString();

  const tone = isCorrect ? ["ok", "✓", "정답입니다!"] : timedOut ? ["warn", "⏱", "시간 초과"] : ["bad", "✗", "오답입니다"];
  document.getElementById("feedback")!.innerHTML = `
    <div class="feedback feedback-${tone[0]}">
      <div class="row between baseline">
        <p class="fb-title"><span aria-hidden="true">${tone[1]} </span>${tone[2]}</p>
        <p class="fb-title">+${r.score}점</p>
      </div>
      ${isCorrect ? `<p class="fb-small">${describeBreakdown(r, q.seed.difficulty)}${g.hintUsed ? " · 힌트 사용" : ""}</p>` : ""}
      ${r.combo >= 2 ? `<p class="fb-combo"><span aria-hidden="true">🔥 </span>${r.combo}연속 정답!</p>` : !isCorrect ? `<p class="fb-small">콤보가 초기화되었어요.</p>` : ""}
      <p class="fb-expl"><strong>해설 </strong>${esc(q.seed.explanation)}</p>
      <button type="button" class="btn btn-dark btn-lg next" data-action="next">
        <span class="advance" aria-hidden="true"></span>${isLast ? "결과 보기 →" : "다음 문제 →"}
      </button>
    </div>`;
  (app.querySelector(".next") as HTMLElement).focus({ preventScroll: true });
  advanceTimer = window.setTimeout(next, AUTO_ADVANCE_MS);
}

function next() {
  if (currentScreen !== "quiz" || phase !== "feedback" || !game) return;
  clearTimeout(advanceTimer);
  if (game.index === game.questions.length - 1) finish();
  else {
    game.index++;
    renderQuestion();
  }
}

// ---------- result

function finish() {
  const g = game!;
  const record: RankRecord = {
    id: newId(),
    nickname: g.nickname,
    mode: g.mode,
    category: g.category,
    totalScore: g.totalScore,
    correctCount: g.results.filter((r) => r.isCorrect).length,
    finishedAt: new Date().toISOString(),
  };
  saveRecord(record);
  const board = boardFor(g.mode, g.category);
  const list = rankBoard(loadRecords(), board);
  renderResult(record, { board, rank: list.findIndex((r) => r.id === record.id) + 1, total: list.length });
}

function verdict(correct: number, total: number): string {
  const r = correct / total;
  if (r === 1) return "완벽해요! 상식 박사 🏆";
  if (r >= 0.8) return "훌륭해요! 👏";
  if (r >= 0.5) return "좋아요, 조금만 더! 💪";
  return "다음엔 더 잘할 수 있어요 🙂";
}

function renderResult(record: RankRecord, rank: { board: LeaderboardBoard; rank: number; total: number }) {
  const g = game!;
  const total = g.questions.length;
  const stats = CATEGORIES.flatMap((c) => {
    const inCat = g.results.filter((r) => r.category === c);
    if (inCat.length === 0) return [];
    const correct = inCat.filter((r) => r.isCorrect).length;
    return [{ c, correct, total: inCat.length, pct: Math.round((correct / inCat.length) * 100) }];
  });

  show(
    `<div class="screen">
      <section class="card center-text" aria-labelledby="result-title">
        <h1 id="result-title" class="small muted">${esc(record.nickname)}님의 ${gameLabel(g.mode, g.category)} 결과</h1>
        <p class="result-score">${record.totalScore.toLocaleString()}<span class="sr-only">점</span></p>
        <p class="small semibold muted" aria-hidden="true">점</p>
        <p class="result-count">${total}문제 중 <span class="accent">${record.correctCount}문제</span> 정답</p>
        <p class="muted">${verdict(record.correctCount, total)}</p>
      </section>
      <section class="card" aria-labelledby="rank-title">
        <h2 id="rank-title" class="section-title">이번 판 순위</h2>
        ${
          rank.rank > 0
            ? `<dl class="rank-box"><dt>${BOARD_LABELS[rank.board]} 순위표</dt>
          <dd><span class="rank-num">${rank.rank}위</span><span class="tiny">${rank.total}개 기록 중</span></dd></dl>`
            : // Storage is blocked (private mode, site data off), so the record never reached the list.
              '<p class="small muted">이 브라우저에 기록을 저장할 수 없어 순위를 매기지 못했어요.</p>'
        }
      </section>
      <section class="card" aria-labelledby="stats-title">
        <h2 id="stats-title" class="section-title">카테고리별 정답률</h2>
        <ul class="stats">
          ${stats
            .map(
              (s) => `<li>
                <div class="row between small"><span class="semibold"><span aria-hidden="true">${CATEGORY_ICONS[s.c]} </span>${CATEGORY_LABELS[s.c]}</span>
                <span>${s.correct}/${s.total} · <strong>${s.pct}%</strong></span></div>
                <div class="bar" aria-hidden="true"><div style="width:${s.pct}%"></div></div>
              </li>`,
            )
            .join("")}
        </ul>
      </section>
      <div class="stack">
        <button type="button" class="btn btn-primary btn-lg" data-action="replay">다시 하기</button>
        <button type="button" class="btn btn-outline btn-lg" data-action="leaderboard" data-board="${rank.board}">
          <span aria-hidden="true">🏆&nbsp;</span>순위표 보기</button>
        <button type="button" class="btn btn-ghost" data-action="start">처음으로</button>
      </div>
    </div>`,
    "result",
  );
  (app.querySelector('[data-action="replay"]') as HTMLElement).focus();
}

// ---------- leaderboard

function boardNote(board: LeaderboardBoard): string {
  if (isCategory(board)) return `${MODES.category.label} 모드 · ${MODES.category.description}`;
  return MODES[board].description;
}

// Re-rendering replaces the tab buttons, so focus always moves to the selected one.
function renderLeaderboard(board: LeaderboardBoard) {
  const list = rankBoard(loadRecords(), board);
  const lastId = load(KEYS.lastId);
  const top = list.slice(0, LEADERBOARD_SIZE);
  const myIndex = lastId ? list.findIndex((r) => r.id === lastId) : -1;
  const questionCount = MODES[modeOfBoard(board)].questionCount;

  const row = (r: RankRecord, rank: number) => {
    const mine = r.id === lastId;
    const medal = MEDALS[rank - 1];
    return `<tr${mine ? ' class="mine" aria-current="true"' : ""}>
      <td class="col-rank">${medal ? `<span aria-hidden="true" class="medal">${medal}</span><span class="sr-only">${rank}위</span>` : rank}</td>
      <td><span class="semibold strong">${esc(r.nickname)}</span>${mine ? '<span class="me-badge">나</span>' : ""}</td>
      <td class="col-score">${r.totalScore.toLocaleString()}</td>
      <td class="col-correct">${r.correctCount}<span class="muted">/${questionCount}</span></td>
    </tr>`;
  };

  const body =
    top.length === 0
      ? `<div class="card center-text empty">
          <p class="hero-emoji small-emoji" aria-hidden="true">🌱</p>
          <p class="semibold strong">아직 ${BOARD_LABELS[board]} 기록이 없어요</p>
          <p class="small muted">첫 번째 기록의 주인공이 되어 보세요!</p>
          <button type="button" class="btn btn-primary" data-action="play">게임 시작하기</button>
        </div>`
      : `<div class="card table-card">
          <table>
            <caption class="sr-only">${BOARD_LABELS[board]} 순위표, 총 ${list.length}개 기록 중 상위 ${top.length}개</caption>
            <thead><tr><th scope="col" class="col-rank">순위</th><th scope="col">닉네임</th><th scope="col" class="col-score">점수</th><th scope="col" class="col-correct">정답</th></tr></thead>
            <tbody>${top.map((r, i) => row(r, i + 1)).join("")}</tbody>
          </table>
        </div>
        <p class="tiny right">총 ${list.length.toLocaleString()}개 기록</p>
        ${
          myIndex >= LEADERBOARD_SIZE
            ? `<div class="pinned"><p class="tiny semibold">내 최근 기록</p>
                <table class="pinned-table"><caption class="sr-only">내 최근 기록, ${myIndex + 1}위</caption>
                <tbody>${row(list[myIndex], myIndex + 1)}</tbody></table></div>`
            : ""
        }`;

  show(
    `<div class="screen">
      <header class="topbar">
        <button type="button" class="btn btn-small" data-action="start">← 처음으로</button>
        <button type="button" class="btn btn-primary btn-small" data-action="play">게임하기</button>
      </header>
      <h1 class="title"><span aria-hidden="true">🏆 </span>순위표</h1>
      <p class="small muted">상위 ${LEADERBOARD_SIZE}위 · 동점이면 정답 수, 기록 시각 순</p>
      <p class="tiny muted mb">이 브라우저에 저장된 기록만 보여요.</p>
      <div role="tablist" aria-label="순위표 종류" class="tabs">
        ${BOARDS.map(
          (b) => `<button type="button" role="tab" id="tab-${b}" class="tab" aria-selected="${b === board}" aria-controls="board-panel"
            tabindex="${b === board ? 0 : -1}" data-action="tab" data-board="${b}"><span aria-hidden="true">${BOARD_ICONS[b]} </span>${BOARD_LABELS[b]}</button>`,
        ).join("")}
      </div>
      <p class="tiny muted tab-note">${boardNote(board)}</p>
      <section id="board-panel" role="tabpanel" aria-labelledby="tab-${board}">${body}</section>
    </div>`,
    "leaderboard",
  );
  const tab = document.getElementById(`tab-${board}`)!;
  tab.focus({ preventScroll: true });
  tab.scrollIntoView({ block: "nearest", inline: "nearest" });
}

// ---------- events

app.addEventListener("click", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (!el || (el as HTMLButtonElement).disabled) return;
  switch (el.dataset.action) {
    case "start":
      return renderStart(true);
    case "leaderboard":
      return renderLeaderboard((el.dataset.board as LeaderboardBoard) ?? DEFAULT_BOARD);
    case "tab":
      return renderLeaderboard(el.dataset.board as LeaderboardBoard);
    case "pick":
      return startGame(el.dataset.mode as GameMode, (el.dataset.category as Category | undefined) ?? "random");
    case "hint":
      return showHint();
    case "choose":
      return choose(Number(el.dataset.index));
    case "next":
      return next();
    case "replay":
      return renderModes();
    case "play":
      return nickname ? renderModes() : renderStart(true);
  }
});

document.addEventListener("keydown", (e) => {
  if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
  if (currentScreen === "quiz" && phase === "answering" && /^[1-4]$/.test(e.key)) {
    e.preventDefault();
    choose(Number(e.key) - 1);
    return;
  }
  // Leaderboard tabs: arrow keys, Home and End (WAI-ARIA tabs pattern).
  const tab = (e.target as HTMLElement).closest?.('[role="tab"]') as HTMLElement | null;
  if (currentScreen === "leaderboard" && tab) {
    const i = BOARDS.indexOf(tab.dataset.board as LeaderboardBoard);
    const target =
      e.key === "ArrowRight" ? BOARDS[(i + 1) % BOARDS.length]
      : e.key === "ArrowLeft" ? BOARDS[(i - 1 + BOARDS.length) % BOARDS.length]
      : e.key === "Home" ? BOARDS[0]
      : e.key === "End" ? BOARDS[BOARDS.length - 1]
      : null;
    if (target) {
      e.preventDefault();
      renderLeaderboard(target);
    }
  }
});

renderStart();
