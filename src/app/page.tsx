import { QuizApp } from "@/components/QuizApp";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-6 sm:py-10">
      <QuizApp />
    </main>
  );
}
