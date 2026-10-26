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
      {kind === "relay" && (
        <>
          <rect x="8" y="14" width="32" height="22" rx="1" />
          <rect x="12" y="18" width="14" height="14" rx="1" />
          <path d="M30 18h6v14h-6" />
          <path d="M16 22h6M16 28h6" />
        </>
      )}
      {kind === "shifter" && (
        <>
          <rect x="10" y="12" width="28" height="24" rx="1" />
          <path d="M16 18h16M16 24h16M16 30h16" />
          <path d="M14 18v12M34 18v12" />
        </>
      )}
      {kind === "power" && (
        <>
          <rect x="12" y="14" width="24" height="20" rx="2" />
          <path d="M20 14v-4h8v4" />
          <circle cx="24" cy="24" r="5" />
          <path d="M24 21v6M21 24h6" />
        </>
      )}
      {kind === "sonar" && (
        <>
          <rect x="8" y="16" width="32" height="16" rx="1" />
          <circle cx="18" cy="24" r="5" />
          <circle cx="30" cy="24" r="5" />
        </>
      )}
      {kind === "rfid" && (
        <>
          <rect x="10" y="12" width="28" height="24" rx="1" />
          <rect x="14" y="16" width="20" height="12" />
          <path d="M18 36h12" />
        </>
      )}
      {kind === "display" && (
        <>
          <rect x="8" y="14" width="32" height="16" rx="1" />
          <path d="M12 18h6v8h-6zM20 18h6v8h-6zM28 18h6v8h-6z" />
          <path d="M16 36h16" />
        </>
      )}
      {kind === "lcd" && (
        <>
          <rect x="6" y="14" width="36" height="20" rx="1" />
          <rect x="10" y="18" width="28" height="12" />
        </>
      )}
      {kind === "cap" && (
        <>
          <path d="M10 24h10M28 24h10" />
          <path d="M20 14v20M28 14v20" />
          <path d="M30 16h4" />
        </>
      )}
      {kind === "buffer" && (
        <>
          <path d="M12 12v24l24-12z" />
          <path d="M8 16h4M8 32h4M36 24h4" />
        </>
      )}
      {kind === "neo" && (
        <>
          <rect x="6" y="18" width="36" height="12" rx="2" />
          <circle cx="14" cy="24" r="3" />
          <circle cx="24" cy="24" r="3" />
          <circle cx="34" cy="24" r="3" />
        </>
      )}
      {kind === "joystick" && (
        <>
          <rect x="10" y="22" width="28" height="14" rx="2" />
          <circle cx="24" cy="18" r="7" />
          <circle cx="24" cy="18" r="2" />
        </>
      )}
      {kind === "keypad" && (
        <>
          <rect x="10" y="10" width="28" height="28" rx="2" />
          <path d="M16 16h4M24 16h4M32 16" />
          <circle cx="18" cy="20" r="1.4" />
          <circle cx="24" cy="20" r="1.4" />
          <circle cx="30" cy="20" r="1.4" />
          <circle cx="18" cy="26" r="1.4" />
          <circle cx="24" cy="26" r="1.4" />
          <circle cx="30" cy="26" r="1.4" />
          <circle cx="18" cy="32" r="1.4" />
          <circle cx="24" cy="32" r="1.4" />
          <circle cx="30" cy="32" r="1.4" />
        </>
      )}
      {kind === "buzzer" && (
        <>
          <rect x="16" y="18" width="16" height="14" rx="2" />
          <circle cx="24" cy="25" r="4" />
          <path d="M20 18v-4h8v4" />
        </>
      )}
      {kind === "transistor" && (
        <>
          <circle cx="24" cy="24" r="10" />
          <path d="M20 16v16M20 24h8l4-6M28 24l4 6" />
        </>
      )}
      {kind === "diode" && (
        <>
          <path d="M8 24h10M30 24h10" />
          <path d="M18 16l12 8-12 8z" />
          <path d="M30 16v16" />
        </>
      )}
      {kind === "pot" && (
        <>
          <rect x="10" y="18" width="28" height="12" rx="2" />
          <circle cx="24" cy="24" r="5" />
          <path d="M24 20v8" />
        </>
      )}
      {kind === "encoder" && (
        <>
          <rect x="12" y="20" width="24" height="14" rx="2" />
          <circle cx="24" cy="18" r="6" />
          <path d="M24 14v8" />
        </>
      )}
      {kind === "stepper" && (
        <>
          <circle cx="24" cy="22" r="10" />
          <path d="M24 12v20M14 22h20" />
          <rect x="20" y="32" width="8" height="6" />
        </>
      )}
      {kind === "sensor" && (
        <>
          <rect x="12" y="14" width="24" height="20" rx="2" />
          <circle cx="24" cy="24" r="5" />
          <path d="M18 38h12" />
        </>
      )}
      {kind === "jumper" && <path d="M10 30c8-16 20-16 28 0" />}
    </svg>
  );
}

function glyphKind(id: string): string {
  const key = id.toLowerCase();
  if (key.includes("breadboard") || key === "bb") return "breadboard";
  if (key.includes("devkit") || key.includes("xiao") || key === "mcu" || key.includes("arduino") || key.includes("pico")) {
    return "board";
  }
  if (key.includes("pir")) return "pir";
  if (key.includes("servo")) return "servo";
  if (key.includes("oled")) return "oled";
  if (key.includes("lcd")) return "lcd";
  if (key.includes("tm1637") || key.includes("4digit") || key.includes("display")) return "display";
  if (key.includes("relay")) return "relay";
  if (key.includes("shifter") || key.includes("bss138") || key === "sh") return "shifter";
  if (key.includes("ext-5v") || key.includes("power") || key === "ext5v") return "power";
  if (key.includes("hc-sr04") || key.includes("sonar") || key.includes("ultrasonic")) return "sonar";
  if (key.includes("rc522") || key.includes("rfid")) return "rfid";
  if (key.includes("74ahct") || key.includes("buffer") || key === "buf") return "buffer";
  if (key.includes("ws2812") || key.includes("neo") || key.includes("strip") || key.includes("ring")) {
    return "neo";
  }
  if (key.includes("cap-") || key.includes("capacitor") || key.startsWith("cap")) return "cap";
  if (key.includes("joystick")) return "joystick";
  if (key.includes("keypad")) return "keypad";
  if (key.includes("buzzer")) return "buzzer";
  if (key.includes("transistor") || key.includes("pn2222")) return "transistor";
  if (key.includes("diode")) return "diode";
  if (key.includes("potentiometer") || key.includes("pot-")) return "pot";
  if (key.includes("encoder")) return "encoder";
  if (key.includes("stepper") || key.includes("uln2003") || key.includes("28byj")) return "stepper";
  if (key.includes("led")) return "led";
  if (key.includes("resistor") || key === "r1" || key.startsWith("r_")) return "resistor";
  if (key.includes("button") || key === "btn") return "button";
  if (
    key.includes("dht") ||
    key.includes("bme") ||
    key.includes("mpu") ||
    key.includes("ldr") ||
    key.includes("soil") ||
    key.includes("sound") ||
    key.includes("ds18") ||
    key.includes("ir-receiver")
  ) {
    return "sensor";
  }
  if (key.includes("jumper")) return "jumper";
  return "sensor";
}
