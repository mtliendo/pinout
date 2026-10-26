"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { saveGuide } from "@/lib/guide-store";
import type { GuidePayload } from "@/lib/types";

type Option = { id: string; label: string; catalogId?: string };
type Question = {
  id: string;
  prompt: string;
  multi: boolean;
  options: Option[];
};

export function QuestionFlow() {
  const params = useSearchParams();
  const router = useRouter();
  const idea = params.get("idea") ?? "";
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [status, setStatus] = useState<"loading" | "ask" | "compose" | "error">(
    "loading",
  );
  const [error, setError] = useState("");

  useEffect(() => {
    if (!idea) {
      router.replace("/");
      return;
    }
    fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea }),
    })
      .then((r) => r.json())
      .then((data: { questions?: Question[]; error?: string }) => {
        if (!data.questions?.length) throw new Error(data.error ?? "No questions");
        setQuestions(data.questions.slice(0, 5));
        setStatus("ask");
      })
      .catch((err: Error) => {
        setError(err.message);
        setStatus("error");
      });
  }, [idea, router]);

  const question = questions[index];
  const selected = answers[question?.id] ?? [];
  const remaining = useMemo(
    () => Math.max(0, questions.length - index),
    [questions.length, index],
  );

  const toggle = (id: string) => {
    if (!question) return;
    setAnswers((prev) => {
      const current = prev[question.id] ?? [];
      if (question.multi) {
        const next = current.includes(id)
          ? current.filter((x) => x !== id)
          : [...current, id];
        return { ...prev, [question.id]: next };
      }
      return { ...prev, [question.id]: [id] };
    });
  };

  const compose = async (finalAnswers: Record<string, string[]>) => {
    setStatus("compose");
    const res = await fetch("/api/compose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea, answers: finalAnswers }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not compose a build");
    saveGuide(data as GuidePayload);
    router.push("/guide");
  };

  const next = async () => {
    if (!question) return;
    if (index < questions.length - 1) {
      setIndex((i) => i + 1);
      return;
    }
    try {
      await compose(answers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Compose failed");
      setStatus("error");
    }
  };

  return (
    <main className="ask">
      <header className="topbar">
        <Link className="wordmark" href="/">
          Pinout
        </Link>
        <p className="top-meta">
          {status === "ask"
            ? `Question ${index + 1} of ${questions.length}`
            : "Getting the parts straight"}
        </p>
      </header>
      <section className="ask-card">
        <p className="idea-echo">{idea}</p>
        {status === "loading" && <p className="ask-status">Looking at the catalog…</p>}
        {status === "compose" && (
          <p className="ask-status">Assigning safe pins and routing wires…</p>
        )}
        {status === "error" && (
          <div>
            <p className="ask-status">{error}</p>
            <Link className="btn-ink" href="/">
              Start over
            </Link>
          </div>
        )}
        {status === "ask" && question && (
          <>
            <h1>{question.prompt}</h1>
            <p className="ask-hint">
              {question.multi
                ? "Pick every part you already have."
                : "Pick one."}{" "}
              {remaining} left after this.
            </p>
            <div className="pills">
              {question.options.map((option) => {
                const key = option.catalogId || option.id;
                const on = selected.includes(option.id) || selected.includes(key);
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={on ? "pill on" : "pill"}
                    onClick={() => toggle(key)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <div className="ask-actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => (index === 0 ? router.push("/") : setIndex((i) => i - 1))}
              >
                Back
              </button>
              <button type="button" className="btn-ink" onClick={next}>
                {index === questions.length - 1 ? "Compose the guide" : "Next"}
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
