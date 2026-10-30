"use client";

import { useState } from "react";
import { lastSession } from "@/lib/client-api";
import type { FinishGameResult, StartGameResult } from "@/lib/types";
import { ModeScreen } from "./ModeScreen";
import { QuizScreen } from "./QuizScreen";
import { ResultScreen } from "./ResultScreen";
import { StartScreen } from "./StartScreen";

type Screen =
  | { name: "start" }
  | { name: "mode" }
  | { name: "quiz"; game: StartGameResult }
  | { name: "result"; result: FinishGameResult };

export function QuizApp() {
  const [screen, setScreen] = useState<Screen>({ name: "start" });
  const [nickname, setNickname] = useState("");

  switch (screen.name) {
    case "start":
      return (
        <StartScreen
          onStart={(name) => {
            setNickname(name);
            setScreen({ name: "mode" });
          }}
        />
      );
    case "mode":
      return (
        <ModeScreen
          nickname={nickname}
          onStarted={(game) => setScreen({ name: "quiz", game })}
          onBack={() => setScreen({ name: "start" })}
        />
      );
    case "quiz":
      // key resets all quiz state when a new game starts.
      return (
        <QuizScreen
          key={screen.game.sessionId}
          game={screen.game}
          onFinished={(result) => {
            lastSession.set(result.sessionId);
            setScreen({ name: "result", result });
          }}
        />
      );
    case "result":
      return (
        <ResultScreen
          result={screen.result}
          onReplay={() => setScreen({ name: "mode" })}
          onHome={() => setScreen({ name: "start" })}
        />
      );
  }
}
