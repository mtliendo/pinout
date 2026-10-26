"use client";

export function ComposeError({
  message,
  onRetry,
  onOtherBoard,
  onOtherParts,
}: {
  message: string;
  onRetry: () => void;
  onOtherBoard: () => void;
  onOtherParts: () => void;
}) {
  return (
    <div className="compose-error" data-testid="compose-error">
      <p className="ask-status">{message}</p>
      <div className="ask-actions">
        <button type="button" className="btn-ink" onClick={onRetry}>
          Try again
        </button>
        <button type="button" className="btn-ghost" onClick={onOtherBoard}>
          Another board
        </button>
        <button type="button" className="btn-ghost" onClick={onOtherParts}>
          Other parts
        </button>
      </div>
    </div>
  );
}
