// Shared by the start screen and the server, so the same rules apply on both sides.
import { NICKNAME_MAX, NICKNAME_MIN, nicknameLength } from "./constants";
import { containsBannedWord } from "./profanity";

export type NicknameError = "too_short" | "too_long" | "invalid_chars" | "banned";

export type NicknameCheck =
  | { ok: true; nickname: string }
  | { ok: false; code: NicknameError; message: string; nickname: string };

/** Letters (any script, including Hangul), digits, spaces, '_' and '-'. */
const ALLOWED = /^[\p{L}\p{N} _-]+$/u;

export function validateNickname(raw: unknown): NicknameCheck {
  const nickname = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  const fail = (code: NicknameError, message: string): NicknameCheck => ({ ok: false, code, message, nickname });
  const len = nicknameLength(nickname);

  if (len < NICKNAME_MIN) return fail("too_short", `닉네임은 ${NICKNAME_MIN}자 이상 입력해 주세요.`);
  if (len > NICKNAME_MAX) return fail("too_long", `닉네임은 ${NICKNAME_MAX}자 이하로 입력해 주세요.`);
  if (!ALLOWED.test(nickname)) return fail("invalid_chars", "닉네임에는 글자, 숫자, 공백, _, -만 쓸 수 있어요.");
  if (containsBannedWord(nickname)) return fail("banned", "사용할 수 없는 단어가 포함되어 있어요.");
  return { ok: true, nickname };
}
