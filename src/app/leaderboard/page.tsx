import type { Metadata } from "next";
import { LeaderboardView } from "@/components/LeaderboardView";
import { DEFAULT_BOARD, isLeaderboardBoard } from "@/lib/constants";

export const metadata: Metadata = { title: "순위표 · 상식 퀴즈" };

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ board?: string | string[] }> }) {
  const { board: param } = await searchParams;
  const board = typeof param === "string" && isLeaderboardBoard(param) ? param : DEFAULT_BOARD;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-6 sm:py-10">
      <LeaderboardView initialBoard={board} />
    </main>
  );
}
