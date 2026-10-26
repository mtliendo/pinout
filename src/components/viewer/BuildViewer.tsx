"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { PartGlyph } from "@/components/icons/PartGlyph";
import { Magnifier } from "@/components/scene/Magnifier";
import { readGuide } from "@/lib/guide-store";
import type { GuidePayload } from "@/lib/types";

const BuildCanvas = dynamic(
  () => import("@/components/scene/BuildCanvas").then((m) => m.BuildCanvas),
  { ssr: false },
);

export function BuildViewer() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id");
  const storedRaw = useSyncExternalStore(
    () => () => undefined,
    () => (!id ? sessionStorage.getItem("pinout:guide") : null),
    () => null,
  );
  const stored = storedRaw ? readGuide() : null;
  const [fetched, setFetched] = useState<GuidePayload | null>(null);
  const [fetchError, setFetchError] = useState("");
  const [stepIndex, setStepIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const motionRef = useRef<HTMLElement | null>(null);
  const [voice, setVoice] = useState(false);
  const [copied, setCopied] = useState("");
  const [spot, setSpot] = useState<{ x: number; y: number } | null>(null);
  const [stageBox, setStageBox] = useState({ w: 1, h: 1 });
  const payload = fetched ?? stored;
  const error = fetchError || (!id && !stored ? "No guide in this session." : "");

  useEffect(() => {
    if (!id) return;
    fetch(`/api/builds/${id}`)
      .then((r) => r.json())
      .then((data: GuidePayload & { error?: string }) => {
        if (data.error || !data.build) throw new Error(data.error ?? "Missing build");
        setFetched(data);
      })
      .catch((err: Error) => setFetchError(err.message));
  }, [id]);

  const step = payload?.build.steps[stepIndex];
  const total = payload?.build.steps.length ?? 0;
  const done = Boolean(payload && stepIndex >= total);
  const last = payload?.build.steps[total - 1];

  useLayoutEffect(() => {
    const write = (value: number) => {
      setProgress(value);
      const node = motionRef.current;
      if (node) node.dataset.progress = value.toFixed(3);
      const w = window as Window & {
        __pinoutProgress?: number;
        __pinoutHistory?: number[];
      };
      w.__pinoutProgress = value;
      w.__pinoutHistory = [...(w.__pinoutHistory ?? []), value].slice(-40);
    };
    write(0);
    let frame = 0;
    const start = performance.now();
    const duration = 850;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      write(1 - Math.pow(1 - t, 3));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const interval = window.setInterval(() => tick(performance.now()), 32);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(interval);
    };
  }, [stepIndex]);

  useEffect(() => {
    if (!voice || !step || typeof window === "undefined") return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(`${step.heading}. ${step.body}`);
    utter.rate = 1;
    window.speechSynthesis.speak(utter);
    return () => window.speechSynthesis.cancel();
  }, [voice, step]);

  const needed = useMemo(() => {
    if (!payload || !step) return [];
    return (step.parts_needed ?? []).map((id) => {
      const part = payload.build.parts.find((p) => p.id === id);
      const jumper = /jumper/i.test(id) || /jumper/i.test(part?.component ?? "");
      const qty = jumper
        ? Math.max(1, step.connections_added?.length ?? 1)
        : 1;
      return {
        id,
        qty,
        name: part
          ? (payload.components[part.component]?.name ?? part.component)
          : id,
        component: part?.component ?? id,
      };
    });
  }, [payload, step]);

  if (error) {
    return (
      <main className="ask">
        <p className="ask-status">{error}</p>
        <Link className="btn-ink" href="/">
          Home
        </Link>
      </main>
    );
  }
  if (!payload) {
    return (
      <main className="ask">
        <p className="ask-status">Opening the bench…</p>
      </main>
    );
  }

  const next = () => {
    setProgress(0);
    if (stepIndex + 1 < total) setStepIndex((i) => i + 1);
    else setStepIndex(total);
  };
  const back = () => {
    setProgress(0);
    if (done) setStepIndex(total - 1);
    else setStepIndex((i) => Math.max(0, i - 1));
  };

  const copy = async (filename: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(filename);
    window.setTimeout(() => setCopied(""), 1500);
  };

  return (
    <main
      className="bench"
      ref={(el) => {
        motionRef.current = el;
      }}
      data-testid="motion"
      data-progress={progress.toFixed(3)}
      data-step={stepIndex}
    >
      <header className="topbar bench-top">
        <Link className="wordmark" href="/">
          Pinout
        </Link>
        <nav className="progress-nav" aria-label="Build progress">
          <span>Parts</span>
          <span className="is-active">
            Build {Math.min(stepIndex + 1, total)}/{total}
          </span>
          <span className={done ? "is-active" : undefined}>Done</span>
        </nav>
        <button
          type="button"
          className={voice ? "voice on" : "voice"}
          onClick={() => setVoice((v) => !v)}
        >
          Voice {voice ? "on" : "off"}
        </button>
      </header>

      {!done && step && (
        <aside className="rail">
          <p className="step-num">{step.n}</p>
          <ul className="rail-parts">
            {needed.map((part) => (
              <li key={part.id}>
                <span className="glyph-box">
                  <PartGlyph id={part.component} />
                  <em>{part.qty}x</em>
                </span>
              </li>
            ))}
          </ul>
        </aside>
      )}

      <section
        className="stage"
        ref={(el) => {
          if (!el) return;
          const w = el.clientWidth;
          const h = el.clientHeight;
          if (w !== stageBox.w || h !== stageBox.h) setStageBox({ w, h });
        }}
      >
        <BuildCanvas
          payload={payload}
          stepIndex={Math.min(stepIndex, total - 1)}
          progress={done ? 1 : progress}
          onCalloutScreen={setSpot}
        />
        {!done && step && (step.connections_added?.length || step.n <= 2) && (
          <Magnifier
            payload={payload}
            stepIndex={stepIndex}
            progress={progress}
          />
        )}
        {spot && !done && step && (
          <svg
            className="leader"
            viewBox={`0 0 ${stageBox.w} ${stageBox.h}`}
            aria-hidden
          >
            <line
              x1={stageBox.w * 0.94 - 88}
              y1={stageBox.h * 0.14 + 88}
              x2={spot.x}
              y2={spot.y}
              stroke="#161410"
              strokeWidth="1.25"
            />
          </svg>
        )}
        {voice && step && !done && (
          <p className="voice-pill">
            Step {step.n}. {step.heading}
          </p>
        )}
      </section>

      <aside className="card">
        {done ? (
          <div className="complete">
            <div className="check" aria-hidden>
              <svg viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="20" />
                <path d="M14 24l7 7 13-14" />
              </svg>
            </div>
            <h2>You built {payload.build.title}.</h2>
            <p>Every step done. Flash the sketch and see it move.</p>
            <dl className="stats">
              <div>
                <dt>Steps</dt>
                <dd>{total}</dd>
              </div>
              <div>
                <dt>Wires</dt>
                <dd>{payload.build.connections.length}</dd>
              </div>
              <div>
                <dt>Board</dt>
                <dd>{payload.components[payload.build.board]?.name.split("(")[0]}</dd>
              </div>
            </dl>
            {last?.code && (
              <div className="code-block">
                {Object.entries(last.code).map(([name, text]) => (
                  <div key={name} className="code-file">
                    <div className="code-head">
                      <span>{name}</span>
                      <button type="button" onClick={() => copy(name, text)}>
                        {copied === name ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <pre>
                      <code>{text}</code>
                    </pre>
                  </div>
                ))}
              </div>
            )}
            <button type="button" className="btn-ink" onClick={() => router.push("/")}>
              Build something else
            </button>
          </div>
        ) : (
          step && (
            <>
              <p className="step-kicker">
                Step {step.n} of {total}
              </p>
              <h2>{step.heading}</h2>
              <p className="step-body">{step.body}</p>
              {needed.length > 0 && (
                <div className="you-need">
                  <p>You need</p>
                  <ul>
                    {needed.map((part) => (
                      <li key={part.id}>
                        <PartGlyph id={part.component} />
                        <span>
                          {part.name}
                          {payload.components[part.component] &&
                          "approx" in
                            ((payload.components[part.component].body ??
                              {}) as object)
                            ? ""
                            : ""}
                        </span>
                        <strong>{part.qty}x</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {step.safety?.length > 0 && (
                <ul className="safety">
                  {step.safety.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
              <p className="check-line">{step.check}</p>
              <button type="button" className="btn-ink" onClick={next}>
                {stepIndex + 1 === total ? "Finish the build" : "Done, next step"}
              </button>
              <button type="button" className="btn-ghost" onClick={back} disabled={stepIndex === 0}>
                Back
              </button>
            </>
          )
        )}
      </aside>
    </main>
  );
}
