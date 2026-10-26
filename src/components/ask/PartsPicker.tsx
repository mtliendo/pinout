"use client";

import { useMemo, useState } from "react";
import { PICKABLE_CATEGORIES } from "@/lib/parts/catalog";

export type CatalogPart = {
  id: string;
  name: string;
  kind: string;
  category?: string;
  approx_fields?: string[];
};

const LABELS: Record<string, string> = {
  sensor: "Sensors",
  display: "Displays",
  actuator: "Actuators",
  input: "Inputs",
  passive: "Passives",
  power: "Power",
};

export function PartsPicker({
  parts,
  selected,
  onToggle,
}: {
  parts: CatalogPart[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = parts.filter((p) => {
      if (!PICKABLE_CATEGORIES.includes((p.category ?? "") as never)) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.category ?? "").includes(q)
      );
    });
    return PICKABLE_CATEGORIES.map((cat) => ({
      cat,
      items: visible.filter((p) => p.category === cat),
    })).filter((g) => g.items.length);
  }, [parts, query]);

  return (
    <div className="parts-picker" data-testid="parts-picker">
      <label className="parts-search">
        <span className="sr-only">Search parts</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the catalog"
        />
      </label>
      {grouped.map((group) => (
        <section key={group.cat} className="parts-cat">
          <h2>{LABELS[group.cat] ?? group.cat}</h2>
          <div className="pills">
            {group.items.map((part) => {
              const on = selected.includes(part.id);
              return (
                <button
                  key={part.id}
                  type="button"
                  className={on ? "pill on" : "pill"}
                  onClick={() => onToggle(part.id)}
                >
                  {part.name}
                  {part.approx_fields?.length ? (
                    <em className="approx-badge">approx</em>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
