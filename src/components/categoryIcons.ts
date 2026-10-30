import type { Category, GameMode, LeaderboardBoard } from "@/lib/constants";

export const CATEGORY_ICONS: Record<Category, string> = {
  history: "📜",
  science: "🔬",
  geography: "🌏",
  general: "💡",
};

export const MODE_ICONS: Record<GameMode, string> = { challenge: "🏁", category: "📚", speed: "⚡" };

export const BOARD_ICONS: Record<LeaderboardBoard, string> = {
  challenge: MODE_ICONS.challenge,
  speed: MODE_ICONS.speed,
  ...CATEGORY_ICONS,
};
