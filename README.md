# 상식 퀴즈 게임

한국사 · 과학 · 지리 · 일반상식 4지선다 퀴즈 웹앱입니다. 세 가지 모드가 있고, 어려운 문제일수록, 빨리, 힌트 없이, 연속으로 맞힐수록 점수가 올라갑니다. 끝까지 푼 기록은 모드별 순위표에 올라갑니다.

| 모드 | 문제 | 제한 시간 |
| --- | --- | --- |
| 전체 도전 | 네 카테고리에서 10문제씩, 모두 40문제(섞어서 출제) | 문제당 20초 |
| 카테고리별 | 고른 카테고리에서 10문제 | 문제당 20초 |
| 스피드 퀴즈 | 모든 카테고리에서 20문제 | 문제당 15초 |

- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- SQLite (`better-sqlite3`), 서버에서만 접근
- 테스트: Vitest

## 가장 쉬운 실행: index.html 더블 클릭

`Study-03` 폴더의 **`index.html`을 더블 클릭**하면 브라우저에서 바로 게임이 열립니다. 설치도, 서버도, 인터넷 연결도 필요 없습니다.

- 문제 80개와 게임 로직이 이 파일 하나에 모두 들어 있습니다.
- 순위표는 **이 브라우저에 저장된 기록**만 보여 줍니다(localStorage). 다른 PC나 다른 브라우저와는 공유되지 않습니다. 시크릿 창에서는 창을 닫으면 기록이 사라집니다.
- 점수 규칙, 닉네임 규칙, 순위 정렬은 서버 버전과 같습니다. 단, 서버가 없으므로 아래 "공정성"의 서버 검증은 적용되지 않습니다.

문제나 게임 코드를 고친 뒤에는 `npm run build:html`로 `index.html`을 다시 만드세요. 원본은 `src/standalone/`(화면 코드, 스타일, 템플릿)과 `src/data/questions.json`이고, `index.html`을 직접 고치면 다음 빌드 때 덮어써집니다.

## 서버 버전 실행 (공유 순위표)

여러 사람이 같은 순위표를 쓰려면 Next.js 서버 버전을 실행합니다. Node.js 20 이상이 필요합니다(개발 환경은 Node 24).

```bash
npm install                  # 1. 설치
npm run validate-questions   # 2. 문제 데이터 검증
npm run seed                 # 3. DB 생성·시드 (data/quiz.db)
npm run dev                  # 4. 개발 서버 → http://localhost:3000
```

프로덕션 실행: `npm run build && npm start`

> PowerShell에서 "npm.ps1 파일을 로드할 수 없습니다" 오류가 나면 `npm.cmd run dev`처럼 실행하거나, `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`를 한 번 실행하세요.

> npm 11부터는 패키지 설치 스크립트를 명시적으로 허용해야 합니다. 허용 목록은 `package.json`의 `allowScripts`에 이미 들어 있습니다(`better-sqlite3`, `esbuild`). `better-sqlite3`를 불러올 수 없다는 오류가 나면 `npm rebuild better-sqlite3`를 실행하세요.

DB 위치는 기본 `data/quiz.db`이며 환경 변수 `QUIZ_DB_PATH`로 바꿀 수 있습니다. 처음부터 다시 시작하려면 `data/quiz.db*` 파일을 지우고 `npm run seed`를 실행하세요. 이전 단계에서 만든 DB는 서버가 열 때 자동으로 새 스키마로 바뀝니다.

## 테스트

```bash
npm test                                   # 전체 (단위 + API 통합)
npx vitest run src/lib/scoring.test.ts     # 파일 하나만
npx vitest run -t "comboBonus"             # 이름으로 골라서
npm run lint                               # TypeScript 타입 검사
```

| 파일 | 내용 |
| --- | --- |
| `src/lib/scoring.test.ts` | 점수 계산: 난이도 배수, 빠른 답변·힌트 미사용·콤보 보너스, 오답·시간 초과, 최대 점수 |
| `src/lib/leaderboard.test.ts` | 순위 정렬과 동점 규칙, 미완료 세션 제외, 모드별·카테고리별 순위표, 이전 버전 기록 제외, 50위 밖 내 기록 |
| `src/lib/nickname.test.ts` | 닉네임 길이·문자 검증, 금칙어(띄어쓰기·숫자·leet 우회 포함) |
| `src/lib/game.test.ts` | 게임 서비스: 모드별 출제, 힌트, 중복·순서 위반 제출 거부, 서버 기준 시간 측정(스피드 15초 포함), 만료 |
| `src/app/api/api.test.ts` | API 통합: start → hint/next/answer → finish → leaderboard |
| `src/lib/ranking.test.ts` | `index.html` 버전의 순위 정렬(서버와 같은 동점 규칙) |

테스트는 메모리 DB(`:memory:`)를 쓰므로 `data/quiz.db`에 영향을 주지 않습니다.

## 점수 규칙

정답을 맞히면 아래 점수를 더해 받습니다.

| 항목 | 점수 |
| --- | --- |
| 기본 점수 | 10점 × 난이도 배수: 쉬움 1배(10점), 보통 1.5배(15점), 어려움 2배(20점) |
| 빠른 답변 보너스 | 10초 미만에 맞히면 +3점 |
| 힌트 미사용 보너스 | 그 문제에서 힌트를 보지 않았으면 +2점 |
| 콤보 보너스 | 연속 정답 중 매 정답마다: 3~4연속 +2점, 5~9연속 +5점, 10연속 이상 +10점 |
| 오답·시간 초과 | 0점, 콤보 초기화 |

한 문제 최대 35점(어려움 20 + 3 + 2 + 10)입니다.

**힌트**: 문제마다 "힌트 보기"를 누를 수 있습니다. 힌트를 보면 그 문제의 힌트 미사용 보너스(+2점)만 사라지고, 다른 점수는 그대로입니다. 힌트를 보는 동안에도 제한 시간은 흐릅니다.

**순위**: 순위표는 전체 도전, 스피드 퀴즈, 카테고리 4개(카테고리별 모드)로 모두 6개입니다. 모드마다 문제 수가 달라 기록을 섞지 않습니다. 총점이 높은 순, 같으면 정답 수가 많은 순, 그것도 같으면 먼저 기록한 순입니다. 모든 문제를 풀고 종료한 게임만 반영됩니다. 모드가 생기기 전(100점 기준 점수제)의 기록은 DB에 남아 있지만 어느 순위표에도 나오지 않습니다.

**공정성**: 정답과 힌트는 미리 클라이언트로 보내지 않고, 문제는 한 번에 하나씩 공개합니다. 서버는 문제를 공개한 시각부터 응답 시간을 직접 잽니다. 클라이언트가 보고한 시간이 서버가 잰 시간보다 1초 넘게 짧으면 서버 시간을 쓰고, 제한 시간(20초, 스피드는 15초)이 지나서 도착한 답은 시간 초과로 처리합니다. 힌트를 봤는지도 서버가 기록합니다. 시작 후 30분이 지난 게임은 더 진행할 수 없습니다.

## 문제 추가

1. `src/data/questions.json`에 항목을 추가합니다.

   ```json
   {
     "id": "science-21",
     "category": "science",
     "difficulty": 2,
     "question": "소금의 주성분인 화합물은?",
     "choices": ["염화 나트륨", "탄산칼슘", "황산구리", "수산화 나트륨"],
     "answer_index": 0,
     "explanation": "소금의 주성분은 나트륨과 염소가 결합한 염화 나트륨(NaCl)이다.",
     "hint": "바닷물을 증발시키면 얻을 수 있는 물질이다."
   }
   ```

   - `id`는 바꾸지 마세요. 시드는 id로 덮어쓰기 때문에 id가 바뀌면 다른 문제가 됩니다.
   - 보기 순서는 상관없습니다. 게임마다 서버가 섞습니다.
   - 정답이 하나로 명확하고, 시간이 지나도 바뀌지 않는 사실만 넣으세요.
   - `hint`는 정답을 그대로 말하지 않으면서 떠올리는 데 도움이 되는 한 문장으로 씁니다. 해설과 같은 사실 확인 기준을 적용합니다.
   - 문제를 빼려면 지우거나 `"status": "retired"`를 붙이세요. DB에서는 지우지 않고 비활성화합니다(지난 답안 기록을 보존하기 위해서입니다).
2. `npm run validate-questions`로 검증합니다. 확인 항목은 다음과 같습니다.
   - 보기가 정확히 4개이고 비어 있거나 중복되지 않을 것
   - `answer_index`가 0~3이고 `difficulty`가 1~3일 것
   - id와 문제 문장이 중복되지 않을 것(공백·문장부호 무시)
   - 해설과 힌트가 한 줄로 있고, 힌트에 정답(두 글자 이상)이 그대로 들어 있지 않을 것
   - 카테고리별 활성 문제가 20개 이상이고, 난이도 비율이 쉬움 30% / 보통 50% / 어려움 20%(±5%p)일 것
3. `npm run seed`로 DB에 반영합니다. 검증에 실패하면 시드도 중단됩니다.
4. `npm run build:html`로 `index.html`에도 반영합니다.

## 닉네임 규칙

2~10자이며 글자, 숫자, 공백, `_`, `-`만 쓸 수 있습니다. 금칙어와 사칭 방지 단어(운영자, admin 등)는 쓸 수 없습니다. 목록은 `src/data/banned-words.json`에 있고, 띄어쓰기·숫자·기호를 끼워 넣거나 `sh1t`처럼 바꿔 쓴 경우도 걸러냅니다.

## API

| 엔드포인트 | 요청 | 응답 |
| --- | --- | --- |
| `POST /api/game/start` | `{ nickname, mode, category }` (`mode`는 `challenge`·`category`·`speed`, `category`는 카테고리별 모드에서만: `history`·`science`·`geography`·`general`) | 세션 id, 제한 시간, 문제 수와 **첫 문제**. 서버는 중복 없이 문제를 뽑아 두고 하나씩 공개합니다. 보기는 섞여 있고 정답과 힌트는 없습니다. |
| `POST /api/game/next` | `{ sessionId }` | 지금 풀 문제와 남은 시간. 답하기 전에 다시 요청하면 같은 문제를 줍니다(이미 본 힌트 포함). |
| `POST /api/game/hint` | `{ sessionId, questionId }` | `{ hint }`. 지금 풀고 있는 문제만 됩니다. 그 문제의 힌트 미사용 보너스가 사라집니다. |
| `POST /api/game/answer` | `{ sessionId, questionId, selectedIndex, timeSpentMs }` (시간 초과면 `selectedIndex: null`, `timeSpentMs`는 0~제한 시간) | 정답 여부, 정답 인덱스, 해설, 획득 점수와 내역(기본·빠른 답변·힌트 미사용·콤보), 콤보, 누적 점수 |
| `POST /api/game/finish` | `{ sessionId }` | 총점, 정답 수, 카테고리별 정답률, 이 모드 순위표의 순위 |
| `GET /api/leaderboard?board=challenge\|speed\|history\|science\|geography\|general&sessionId=` | — | 상위 50위와 그 순위표의 문제 수. `board`를 빼면 `challenge`. `sessionId`를 주면 해당 기록을 `isMine`으로 표시하고, 50위 밖이면 `me`로 따로 돌려줍니다. |

오류는 `{ error, message }` 형태입니다. 상태 코드는 다음과 같습니다.

- 400: 입력 오류
- 404: 없는 세션
- 409: 중복 제출, 순서 위반, 문제 수 초과, 지금 풀고 있지 않은 문제의 힌트 요청, 이미 끝난 게임, 미완료 상태의 종료 요청
- 410: 만료된 게임, 모드가 생기기 전에 시작한 게임
- 422: 점수 검증 실패
- 503: 문제 부족
