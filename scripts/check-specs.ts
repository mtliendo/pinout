import { breadboardForSize, BREADBOARD_PRESETS } from "../src/lib/breadboards";
import { composeBuild, inferPartsFromIdea } from "../src/lib/compose";
import { RAW_BUILDS, RAW_COMPONENTS, RAW_WIRE_COLORS } from "../src/lib/specs/files";
import type { Build } from "../src/lib/specs/schema";
import { validateBuild, validateCatalog } from "../src/lib/specs/validate";

const { catalog, issues } = validateCatalog({
  components: RAW_COMPONENTS,
  builds: RAW_BUILDS,
  wireColors: RAW_WIRE_COLORS,
});

if (!catalog || issues.length) {
  console.error("FAIL: spec catalog");
  for (const issue of issues) {
    console.error(`  ${issue.path}: ${issue.message}`);
  }
  process.exit(1);
}

const loaded = catalog;

console.log(
  `PASS: ${Object.keys(loaded.components).length} components, ${
    Object.keys(loaded.builds).length
  } builds`,
);

const ref = loaded.builds["pir-servo-s3"];
if (!ref) {
  console.error("FAIL: missing reference build pir-servo-s3");
  process.exit(1);
}

function expectRejects(label: string, mutate: (build: Build) => void, needle: RegExp) {
  const bad = structuredClone(ref);
  mutate(bad);
  const errors = validateBuild(bad, loaded.components, loaded.breadboard);
  const hit = errors.find((line) => needle.test(line));
  if (!hit) {
    console.error(`FAIL: ${label}`);
    console.error(`  expected /${needle.source}/`);
    console.error(`  got: ${errors.join(" | ") || "(no errors)"}`);
    process.exit(1);
  }
  console.log(`PASS: ${label} -> ${hit}`);
}

// Same three catches as specs/tools/validate.py.
expectRejects(
  "made-up pin",
  (build) => {
    build.connections.push({
      id: "w_fake_pin",
      from: "mcu:J9.9",
      to: "a10",
      color: "yellow",
      net: "FAKE",
    });
  },
  /not a real pin/,
);

expectRejects(
  "GPIO wired to 5V",
  (build) => {
    build.connections.push({
      id: "w_gpio_to_5v",
      from: "mcu:J1.4",
      to: "L+@10",
      color: "red",
      net: "5V",
    });
  },
  /GPIO4 shares a net with 5V/,
);

expectRejects(
  "unfed right ground rail",
  (build) => {
    build.connections.push({
      id: "w_unfed_rail",
      from: "j40",
      to: "R-@40",
      color: "black",
      net: "GND",
    });
  },
  /rail R- is used but never fed/,
);

expectRejects(
  "non-safe PSRAM GPIO35",
  (build) => {
    build.connections.push({
      id: "w_psram",
      from: "mcu:J3.13",
      to: "a40",
      color: "yellow",
      net: "BAD",
    });
  },
  /non-safe GPIO35/,
);

const motion = composeBuild(
  {
    idea: "motion-triggered servo that waves when someone walks by",
    boardId: "esp32-s3-devkitc-1-n16r8",
    partIds: inferPartsFromIdea(
      "motion-triggered servo that waves when someone walks by",
    ),
  },
  loaded.components,
  loaded.breadboard,
);

if (motion.id !== "pir-servo-s3" || motion.steps.length !== 6) {
  console.error(
    `FAIL: motion idea should compose the 6-step reference (got ${motion.id}, ${motion.steps.length} steps)`,
  );
  process.exit(1);
}

const refNets = new Set(ref.connections.map((w) => `${w.from}->${w.to}:${w.net}`));
const motionNets = new Set(
  motion.connections.map((w) => `${w.from}->${w.to}:${w.net}`),
);
for (const net of refNets) {
  if (!motionNets.has(net)) {
    console.error(`FAIL: motion compose missing reference net ${net}`);
    process.exit(1);
  }
}
console.log("PASS: motion idea composes equivalent pir-servo-s3 nets");

const IDEAS = [
  {
    label: "motion",
    idea: "motion-triggered servo that waves when someone walks by",
  },
  {
    label: "button-oled",
    idea: "button that toggles an LED and shows status on an OLED",
  },
] as const;

for (const board of Object.values(loaded.components).filter((c) => c.kind === "board")) {
  for (const idea of IDEAS) {
    try {
      const built = composeBuild(
        {
          idea: idea.idea,
          boardId: board.id,
          partIds: inferPartsFromIdea(idea.idea),
        },
        loaded.components,
        loaded.breadboard,
      );
      const errors = validateBuild(built, loaded.components, loaded.breadboard);
      if (errors.length) {
        console.error(`FAIL: ${board.id} × ${idea.label}`);
        for (const line of errors) console.error(`  ${line}`);
        process.exit(1);
      }
      const usedGpio = new Set<number>();
      for (const wire of built.connections) {
        for (const end of [wire.from, wire.to]) {
          const pinId = end.startsWith("mcu:") ? end.slice(4) : "";
          const pin = pinId
            ? board.pins?.find((p) => p.id === pinId)
            : undefined;
          if (typeof pin?.gpio === "number") usedGpio.add(pin.gpio);
        }
      }
      for (const step of built.steps) {
        const cpp = step.code?.["src/main.cpp"] ?? "";
        for (const match of cpp.matchAll(/PIN = (\d+)/g)) {
          usedGpio.add(Number(match[1]));
        }
      }
      for (const gpio of usedGpio) {
        if (!(board.safe_gpio ?? []).includes(gpio)) {
          console.error(`FAIL: ${board.id} × ${idea.label} used non-safe GPIO${gpio}`);
          process.exit(1);
        }
      }
      if (board.id === "xiao-esp32c3" && idea.label === "button-oled") {
        const cpp = built.steps.find((s) => s.code)?.code?.["src/main.cpp"] ?? "";
        if (!/SDA_PIN = 6/.test(cpp) || !/SCL_PIN = 7/.test(cpp)) {
          console.error(`FAIL: XIAO C3 I2C must be GPIO6/7\n${cpp}`);
          process.exit(1);
        }
      }
      console.log(`PASS: ${board.id} × ${idea.label} (${built.steps.length} steps)`);
    } catch (error) {
      console.error(`FAIL: ${board.id} × ${idea.label}`);
      console.error(`  ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  }
}

const mini = breadboardForSize(loaded.breadboard, BREADBOARD_PRESETS[0]);
const c3Mini = composeBuild(
  {
    idea: "button that toggles an LED and shows status on an OLED",
    boardId: "xiao-esp32c3",
    partIds: inferPartsFromIdea("button that toggles an LED and shows status on an OLED"),
  },
  loaded.components,
  mini,
);
const miniErrors = validateBuild(c3Mini, loaded.components, mini);
if (miniErrors.length) {
  console.error("FAIL: XIAO C3 on mini-170");
  for (const line of miniErrors) console.error(`  ${line}`);
  process.exit(1);
}
console.log(`PASS: xiao-esp32c3 × button-oled on mini-170 (${c3Mini.steps.length} steps)`);
