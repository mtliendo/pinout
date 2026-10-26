import { Suspense } from "react";
import { QuestionFlow } from "@/components/ask/QuestionFlow";

export default function AskPage() {
  return (
    <Suspense fallback={<main className="ask"><p className="ask-status">Opening questions…</p></main>}>
      <QuestionFlow />
    </Suspense>
  );
}
