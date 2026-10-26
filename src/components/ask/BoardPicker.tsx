"use client";

import { boardFitLine, boardShortName, type BoardCard } from "@/lib/board-copy";

export function BoardPicker({
  boards,
  selected,
  onSelect,
}: {
  boards: BoardCard[];
  selected?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="board-grid" data-testid="board-picker">
      {boards.map((board) => {
        const on = selected === board.id;
        return (
          <button
            key={board.id}
            type="button"
            className={on ? "board-card on" : "board-card"}
            onClick={() => onSelect(board.id)}
          >
            <span className="board-swatch" style={{ background: String(board.colors?.pcb ?? "#2a2a2a") }} />
            <strong>{boardShortName(board)}</strong>
            <span>{board.chip ?? "board"}</span>
            <em>{boardFitLine(board)}</em>
          </button>
        );
      })}
    </div>
  );
}
