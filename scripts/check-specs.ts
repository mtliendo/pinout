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
