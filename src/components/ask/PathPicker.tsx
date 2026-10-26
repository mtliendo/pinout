"use client";

import type { CuratedIdea } from "@/lib/ideas/catalog";

export function PathPicker({
  ideas,
  onCurated,
  onParts,
}: {
  ideas: CuratedIdea[];
  onCurated: () => void;
  onParts: () => void;
}) {
  return (
    <div className="path-grid" data-testid="path-picker">
      <button type="button" className="path-card on" onClick={onCurated}>
        <strong>A tested idea</strong>
        <span>
          {ideas.length
            ? `${ideas.length} curated build${ideas.length === 1 ? "" : "s"} that fit this board and breadboard.`
            : "No curated idea fits this breadboard. Pick a larger one, or choose parts."}
        </span>
      </button>
      <button type="button" className="path-card" onClick={onParts}>
        <strong>Choose parts</strong>
        <span>Pick from the catalog. Pinout assigns only safe pins.</span>
      </button>
    </div>
  );
}

export function IdeaList({
  ideas,
  selected,
  onSelect,
}: {
  ideas: CuratedIdea[];
  selected?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="idea-list" data-testid="idea-list">
      {ideas.map((idea) => (
        <button
          key={idea.id}
          type="button"
          className={selected === idea.id ? "path-card on" : "path-card"}
          onClick={() => onSelect(idea.id)}
        >
          <strong>{idea.title}</strong>
          <span>{idea.blurb}</span>
        </button>
      ))}
    </div>
  );
}
