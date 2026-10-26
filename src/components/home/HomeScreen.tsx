"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import type { GuidePayload } from "@/lib/types";

const BuildCanvas = dynamic(
  () => import("@/components/scene/BuildCanvas").then((m) => m.BuildCanvas),
  { ssr: false },
);

const SUGGESTIONS = [
  {
    label: "Motion servo that waves",
    idea: "motion-triggered servo that waves when someone walks by",
  },
  {
    label: "Button, LED and OLED",
    idea: "button that toggles an LED and shows status on an OLED",
  },
  {
    label: "PIR night light",
    idea: "PIR motion sensor that lights a red LED",
  },
];

export function HomeScreen() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [preview, setPreview] = useState<GuidePayload | null>(null);

  useEffect(() => {
    fetch("/api/builds/pir-servo-s3")
      .then((r) => r.json())
      .then((data: GuidePayload) => setPreview(data))
      .catch(() => setPreview(null));
  }, []);

  const go = (value: string) => {
    const next = value.trim();
    if (!next) return;
    router.push(`/ask?idea=${encodeURIComponent(next)}`);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    go(idea);
  };

  return (
    <main className="home">
      <header className="topbar home-top">
        <Link className="wordmark" href="/">
          Pinout
        </Link>
        <p className="top-meta">Wiring for ten boards, from a sentence</p>
      </header>
      <div className="home-grid">
        <section className="home-copy">
          <h1>Wiring, step by step.</h1>
          <p className="lede">
            Tell Pinout what to build. It asks what you already have, then walks every jumper on a verified pin map.
          </p>
          <form className="idea-box" onSubmit={onSubmit}>
            <label className="sr-only" htmlFor="idea">
              What do you want to build
            </label>
            <input
              id="idea"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="A servo that waves when someone walks by"
            />
            <button type="submit" className="btn-ink">
              Build this
            </button>
          </form>
          <div className="pills">
            {SUGGESTIONS.map((item) => (
              <button
                key={item.idea}
                type="button"
                className="pill"
                onClick={() => go(item.idea)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>
        <aside className="home-preview">
          <div className="preview-stage">
            {preview ? (
              <BuildCanvas
                payload={preview}
                stepIndex={preview.build.steps.length - 1}
                progress={1}
                preview
              />
            ) : (
              <div className="preview-fallback" />
            )}
          </div>
          <div className="preview-meta">
            <div>
              <p className="preview-title">Motion-triggered servo sweep</p>
              <p className="preview-sub">6 steps · ESP32-S3 DevKitC-1</p>
            </div>
            <button
              type="button"
              className="btn-ink"
              onClick={() => router.push("/guide?id=pir-servo-s3")}
            >
              Build this
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}
