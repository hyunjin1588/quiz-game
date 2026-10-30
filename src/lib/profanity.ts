// Nickname word filter. The word lists live in src/data/banned-words.json.
// This module is safe to import from client code, so the start screen can check before calling the API.
import lists from "@/data/banned-words.json";

/** Common look-alike substitutions used to dodge filters ("sh1t", "f@ck"). */
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s", "!": "i" };

/**
 * Variants of the text to match against. Each one closes a different loophole:
 * - letters only, after leet substitution ("f.u.c.k", "sh1t")
 * - letters only, with digits dropped instead ("시1발")
 * - Hangul only, which also drops inserted Latin letters ("시x발")
 */
export function filterVariants(text: string): string[] {
  const base = text.normalize("NFKC").toLowerCase();
  const leet = [...base].map((c) => LEET[c] ?? c).join("").replace(/[^\p{L}]/gu, "");
  const dropped = base.replace(/[^\p{L}]/gu, "");
  const hangul = base.replace(/[^\p{Script=Hangul}]/gu, "");
  return [...new Set([leet, dropped, hangul].filter(Boolean))];
}

const normalizeWord = (w: string) => w.normalize("NFKC").toLowerCase().replace(/[^\p{L}]/gu, "");
const BANNED = [...lists.profanity, ...lists.reserved].map(normalizeWord).filter(Boolean);

export function containsBannedWord(text: string): boolean {
  const variants = filterVariants(text);
  return BANNED.some((word) => variants.some((v) => v.includes(word)));
}
