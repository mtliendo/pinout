"use client";

import {
  BREADBOARD_PRESETS,
  sizeFromSliders,
  type BreadboardSize,
} from "@/lib/breadboards";

export function BreadboardPicker({
  value,
  onChange,
}: {
  value: BreadboardSize;
  onChange: (size: BreadboardSize) => void;
}) {
  const custom = sizeFromSliders(value.rows);

  return (
    <div className="bb-picker" data-testid="breadboard-picker">
      <div className="bb-presets">
        {BREADBOARD_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={value.id === preset.id ? "bb-preset on" : "bb-preset"}
            onClick={() => onChange(preset)}
          >
            <strong>{preset.label}</strong>
            <span>{preset.ties} ties · {preset.rows} rows</span>
          </button>
        ))}
      </div>
      <label className="bb-slider">
        <span>Rows · {custom.rows}</span>
        <input
          type="range"
          min={10}
          max={63}
          value={value.rows}
          onChange={(event) => onChange(sizeFromSliders(Number(event.target.value)))}
        />
      </label>
      <label className="bb-slider">
        <span>Columns · 10</span>
        <input type="range" min={10} max={10} value={10} readOnly disabled />
      </label>
    </div>
  );
}
