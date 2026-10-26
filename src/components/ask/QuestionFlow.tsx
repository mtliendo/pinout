"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BoardConfirm } from "@/components/ask/BoardConfirm";
import { BoardPicker } from "@/components/ask/BoardPicker";
import { BreadboardPicker } from "@/components/ask/BreadboardPicker";
import { ComposeError } from "@/components/ask/ComposeError";
import { IdeaList, PathPicker } from "@/components/ask/PathPicker";
import { PartsPicker, type CatalogPart } from "@/components/ask/PartsPicker";
import { type BoardCard } from "@/lib/board-copy";
import { BREADBOARD_PRESETS, type BreadboardSize } from "@/lib/breadboards";
import { stripValidatorText } from "@/lib/compose-error";
import { saveGuide } from "@/lib/guide-store";
import {
  AI_CATALOG_IDEAS,
  CURATED_IDEAS,
  ideasFor,
  type CuratedIdea,
} from "@/lib/ideas/catalog";
import type { GuidePayload } from "@/lib/types";

type Catalog = {
  boards: BoardCard[];
  parts: CatalogPart[];
};

type Status =
  | "loading"
  | "board"
  | "confirm"
  | "breadboard"
  | "path"
  | "curated"
  | "parts"
  | "compose"
  | "error";

export function QuestionFlow() {
  const params = useSearchParams();
  const router = useRouter();
  const ideaParam = params.get("idea") ?? "";
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [boardId, setBoardId] = useState<string>("");
  const [breadboard, setBreadboard] = useState<BreadboardSize>(BREADBOARD_PRESETS[2]);
  const [ideaId, setIdeaId] = useState<string>("");
  const [partIds, setPartIds] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/catalog")
      .then((r) => r.json())
      .then((data: Catalog) => {
        if (!data?.boards?.length) throw new Error("Catalog unavailable");
        setCatalog(data);
        setStatus("board");
      })
      .catch((err: Error) => {
        setError(stripValidatorText(err.message));
        setStatus("error");
      });
  }, []);

  const board = catalog?.boards.find((b) => b.id === boardId);
  const filteredIdeas = useMemo(() => {
    if (!board) return [];
    return ideasFor(board, breadboard.rows, false);
  }, [board, breadboard.rows]);
  const aiIdeas = useMemo(() => {
    if (!board) return [];
    return ideasFor(board, breadboard.rows, true).filter((i) => i.source === "ai-catalog");
  }, [board, breadboard.rows]);

  const compose = async (opts: { idea: string; parts?: string[] }) => {
    if (!boardId) return;
    setStatus("compose");
    const res = await fetch("/api/compose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idea: opts.idea,
        answers: {
          board: [boardId],
          breadboard: [breadboard.id],
          parts: opts.parts ?? [],
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(stripValidatorText(data.error ?? "Could not compose a build"));
    }
    saveGuide(data as GuidePayload);
    router.push("/guide");
  };

  const selectedIdea: CuratedIdea | undefined =
    CURATED_IDEAS.find((i) => i.id === ideaId) ??
    filteredIdeas.find((i) =>
      ideaParam.toLowerCase().includes(i.title.split(",")[0].toLowerCase()),
    );

  const meta =
    status === "board"
      ? "1 · Board"
      : status === "confirm"
        ? "2 · Confirm"
        : status === "breadboard"
          ? "3 · Breadboard"
          : status === "path" || status === "curated" || status === "parts"
            ? "4 · Path"
            : "Getting the parts straight";

  return (
    <main className="ask">
      <header className="topbar">
        <Link className="wordmark" href="/">
          Pinout
        </Link>
        <p className="top-meta">{meta}</p>
      </header>
      <section className="ask-card ask-wide">
        {ideaParam && <p className="idea-echo">{ideaParam}</p>}
        {status === "loading" && <p className="ask-status">Looking at the catalog…</p>}
        {status === "compose" && (
          <p className="ask-status">Assigning safe pins and routing wires…</p>
        )}
        {status === "error" && (
          <ComposeError
            message={error}
            onRetry={() => {
              void compose({
                idea: selectedIdea?.blurb ?? ideaParam,
                parts: selectedIdea?.partIds ?? partIds,
              }).catch((err) => {
                setError(err instanceof Error ? stripValidatorText(err.message) : error);
                setStatus("error");
              });
            }}
            onOtherBoard={() => {
              setStatus("board");
              setError("");
            }}
            onOtherParts={() => {
              setStatus("parts");
              setError("");
            }}
          />
        )}

        {status === "board" && catalog && (
          <>
            <h1>Which board are you building on?</h1>
            <p className="ask-hint">Ten verified boards. Pins come from the spec, never from a guess.</p>
            <BoardPicker boards={catalog.boards} selected={boardId} onSelect={setBoardId} />
            <div className="ask-actions">
              <button type="button" className="btn-ghost" onClick={() => router.push("/")}>
                Back
              </button>
              <button
                type="button"
                className="btn-ink"
                disabled={!boardId}
                onClick={() => setStatus("confirm")}
              >
                This is the board
              </button>
            </div>
          </>
        )}

        {status === "confirm" && board && (
          <>
            <h1>Does this match what you have?</h1>
            <p className="ask-hint">
              Drag to rotate, pinch or scroll to zoom. A US quarter sits next to it for scale.
              Thickness and height marked “about” are estimates.
            </p>
            <BoardConfirm board={board} />
            <div className="ask-actions">
              <button type="button" className="btn-ghost" onClick={() => setStatus("board")}>
                Pick another
              </button>
              <button type="button" className="btn-ink" onClick={() => setStatus("breadboard")}>
                Yes, this is mine
              </button>
            </div>
          </>
        )}

        {status === "breadboard" && (
          <>
            <h1>How big is your breadboard?</h1>
            <p className="ask-hint">
              Mini, half, or full. Or drag the row slider. Pinout will refuse a circuit that does not fit.
            </p>
            <BreadboardPicker value={breadboard} onChange={setBreadboard} />
            <div className="ask-actions">
              <button type="button" className="btn-ghost" onClick={() => setStatus("confirm")}>
                Back
              </button>
              <button type="button" className="btn-ink" onClick={() => setStatus("path")}>
                Next
              </button>
            </div>
          </>
        )}

        {status === "path" && (
          <>
            <h1>How do you want to start?</h1>
            <p className="ask-hint">Curated ideas first. Each one is validated on the boards it fits.</p>
            <PathPicker
              ideas={filteredIdeas}
              onCurated={() => setStatus("curated")}
              onParts={() => setStatus("parts")}
            />
            <div className="ask-actions">
              <button type="button" className="btn-ghost" onClick={() => setStatus("breadboard")}>
                Back
              </button>
            </div>
          </>
        )}

        {status === "curated" && (
          <>
            <h1>A tested idea</h1>
            <p className="ask-hint">
              {filteredIdeas.length
                ? "These fit this board and breadboard."
                : "Nothing curated fits. Go back and pick a larger breadboard, or choose parts."}
            </p>
            <IdeaList ideas={filteredIdeas} selected={ideaId} onSelect={setIdeaId} />
            {aiIdeas.length > 0 && (
              <>
                <p className="ask-hint">A few fresh ideas from the catalog only.</p>
                <IdeaList ideas={aiIdeas} selected={ideaId} onSelect={setIdeaId} />
              </>
            )}
            <div className="ask-actions">
              <button type="button" className="btn-ghost" onClick={() => setStatus("path")}>
                Back
              </button>
              <button
                type="button"
                className="btn-ink"
                disabled={!ideaId}
                onClick={() => {
                  const idea =
                    CURATED_IDEAS.find((i) => i.id === ideaId) ??
                    AI_CATALOG_IDEAS.find((i) => i.id === ideaId);
                  if (!idea) return;
                  void compose({ idea: idea.blurb, parts: idea.partIds }).catch((err) => {
                    setError(
                      err instanceof Error
                        ? stripValidatorText(err.message)
                        : "Could not compose a build",
                    );
                    setStatus("error");
                  });
                }}
              >
                Compose the guide
              </button>
            </div>
          </>
        )}

        {status === "parts" && catalog && (
          <>
            <h1>Which of these do you already have?</h1>
            <p className="ask-hint">Catalog parts only, by category. Pinout will not invent a part. “Approx” means pin order or size is not exact.</p>
            <PartsPicker
              parts={catalog.parts}
              selected={partIds}
              onToggle={(id) =>
                setPartIds((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                )
              }
            />
            <div className="ask-actions">
              <button type="button" className="btn-ghost" onClick={() => setStatus("path")}>
                Back
              </button>
              <button
                type="button"
                className="btn-ink"
                onClick={() => {
                  void compose({
                    idea: ideaParam || "catalog parts on this board",
                    parts: partIds,
                  }).catch((err) => {
                    setError(
                      err instanceof Error
                        ? stripValidatorText(err.message)
                        : "Could not compose a build",
                    );
                    setStatus("error");
                  });
                }}
              >
                Compose the guide
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
