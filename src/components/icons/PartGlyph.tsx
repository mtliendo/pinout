type Props = { id: string; className?: string };

export function PartGlyph({ id, className }: Props) {
  const kind = glyphKind(id);
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === "board" && (
        <>
          <rect x="8" y="14" width="32" height="20" rx="1.5" />
          <rect x="14" y="18" width="14" height="10" />
          <path d="M10 16v16M38 16v16" />
        </>
      )}
      {kind === "breadboard" && (
        <>
          <rect x="6" y="12" width="36" height="24" rx="1" />
          <path d="M10 16h28M10 20h28M10 24h28M10 28h28M10 32h28" />
        </>
      )}
      {kind === "pir" && (
        <>
          <rect x="12" y="22" width="24" height="12" />
          <circle cx="24" cy="20" r="9" />
          <path d="M16 34v4M24 34v4M32 34v4" />
        </>
      )}
      {kind === "servo" && (
        <>
          <rect x="14" y="16" width="20" height="16" rx="1" />
          <circle cx="24" cy="22" r="4" />
          <path d="M24 18v-6M18 12h12" />
          <path d="M16 32v6M24 32v6M32 32v6" />
        </>
      )}
      {kind === "led" && (
        <>
          <path d="M16 22a8 8 0 0 1 16 0v6H16z" />
          <path d="M20 28v12M28 28v8" />
          <path d="M14 14l4 4M34 14l-4 4" />
        </>
      )}
      {kind === "resistor" && (
        <>
          <path d="M6 24h8l3-6 6 12 6-12 3 6h10" />
        </>
      )}
      {kind === "button" && (
        <>
          <rect x="12" y="16" width="24" height="16" rx="2" />
          <circle cx="24" cy="24" r="5" />
        </>
      )}
      {kind === "oled" && (
        <>
          <rect x="8" y="12" width="32" height="24" rx="1" />
          <rect x="12" y="16" width="24" height="14" />
          <path d="M16 40v-4M24 40v-4M32 40v-4" />
        </>
      )}
      {kind === "jumper" && <path d="M10 30c8-16 20-16 28 0" />}
    </svg>
  );
}

function glyphKind(id: string): string {
  if (id.includes("breadboard") || id === "bb") return "breadboard";
  if (id.includes("devkit") || id.includes("xiao") || id === "mcu") return "board";
  if (id.includes("pir")) return "pir";
  if (id.includes("servo")) return "servo";
  if (id.includes("oled")) return "oled";
  if (id.includes("led")) return "led";
  if (id.includes("resistor") || id === "r1") return "resistor";
  if (id.includes("button") || id === "btn") return "button";
  return "jumper";
}
