import { describe, expect, it } from "vitest";
import { validateNickname } from "./nickname";
import { containsBannedWord } from "./profanity";

const code = (raw: unknown) => {
  const r = validateNickname(raw);
  return r.ok ? "ok" : r.code;
};

describe("validateNickname", () => {
  it("accepts 2-10 characters, counting a Hangul syllable as one", () => {
    expect(code("철수")).toBe("ok");
    expect(code("열글자닉네임입니다")).toBe("ok");
    expect(code("abcdefghij")).toBe("ok");
    expect(code("quiz_king-1")).toBe("too_long");
  });

  it("trims and collapses spaces before measuring", () => {
    expect(validateNickname("  김   철수  ")).toMatchObject({ ok: true, nickname: "김 철수" });
    expect(code("   가   ")).toBe("too_short");
  });

  it("rejects too short, too long and non-string input", () => {
    expect(code("가")).toBe("too_short");
    expect(code("")).toBe("too_short");
    expect(code(null)).toBe("too_short");
    expect(code(12345)).toBe("too_short");
    expect(code("열한글자닉네임입니다요")).toBe("too_long");
  });

  it("rejects symbols, emoji and invisible characters", () => {
    expect(code("철수!")).toBe("invalid_chars");
    expect(code("철수😀")).toBe("invalid_chars");
    expect(code("철​수")).toBe("invalid_chars");
    expect(code("<b>철수</b>")).toBe("invalid_chars");
  });

  it("rejects banned and reserved words", () => {
    expect(code("시발")).toBe("banned");
    expect(code("ㅅㅂ")).toBe("banned");
    expect(code("FUCKyou")).toBe("banned");
    expect(code("운영자")).toBe("banned");
    expect(code("admin1")).toBe("banned");
  });
});

describe("containsBannedWord", () => {
  it("sees through spacing, digits, Latin filler and leet spelling", () => {
    expect(containsBannedWord("시 발")).toBe(true);
    expect(containsBannedWord("시1발")).toBe(true);
    expect(containsBannedWord("시x발")).toBe(true);
    expect(containsBannedWord("sh1t")).toBe(true);
    expect(containsBannedWord("f_u_c_k")).toBe(true);
    expect(containsBannedWord("Ｆｕｃｋ")).toBe(true); // full-width
  });

  it("allows ordinary nicknames", () => {
    for (const ok of ["고양이", "시바견", "퀴즈왕", "지리박사", "science", "김철수99", "bassist"]) {
      expect(containsBannedWord(ok), ok).toBe(false);
    }
  });
});
