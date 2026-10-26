import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { composeBuild } from "../src/lib/compose";
import { CURATED_IDEAS, ideasFor } from "../src/lib/ideas/catalog";
import { catalogPartIds } from "../src/lib/parts/catalog";
import type { Component } from "../src/lib/specs/schema";
import {
  RAW_BUILDS,
  RAW_CHIPS,
  RAW_COMPONENTS,
  RAW_PARTS_CATALOG,
  RAW_PARTS_OVERLAY,
  RAW_WIRE_COLORS,
} from "../src/lib/specs/files";
import { validateCatalog } from "../src/lib/specs/validate";

export function pioBin(): string | null {
  const candidates = [
    process.env.PLATFORMIO_BIN,
    "pio",
    join(process.env.HOME ?? "", ".platformio/penv/bin/pio"),
    "/usr/local/bin/pio",
  ].filter((p): p is string => Boolean(p));
  for (const bin of candidates) {
    const probe = spawnSync(bin, ["--version"], { encoding: "utf8" });
    if (probe.status === 0) return bin;
  }
  return null;
}

export function shouldCompile(): boolean {
  if (process.env.VERCEL === "1") return false;
  if (process.env.SKIP_COMPILE === "1") return false;
  return pioBin() != null;
}

function flashCode(built: {
  steps: Array<{ code?: Record<string, string> }>;
}): Record<string, string> | null {
  for (const step of built.steps) {
    if (step.code?.["src/main.cpp"] && step.code["platformio.ini"]) {
      return step.code;
    }
  }
  return null;
}

function compileOne(
  pio: string,
  name: string,
  files: Record<string, string>,
  dir: string,
): string | null {
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "platformio.ini"), files["platformio.ini"]);
  writeFileSync(join(dir, "src/main.cpp"), files["src/main.cpp"]);
  const result = spawnSync(pio, ["run", "-d", dir], {
    encoding: "utf8",
    timeout: 600_000,
    env: { ...process.env },
  });
  if (result.status === 0) return null;
  const out = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const tail = out.trim().split("\n").slice(-40).join("\n");
  return tail || `pio run failed (${result.status})`;
}

export function compileCatalog(
  components: Record<string, Component>,
  breadboard: Component,
  opts: { boardId?: string } = {},
): { ran: number; failed: string[] } {
  const pio = pioBin();
  if (!pio) return { ran: 0, failed: [] };
  const root = join(tmpdir(), "pinout-pio");
  mkdirSync(root, { recursive: true });
  const failed: string[] = [];
  let ran = 0;
  const boards = Object.values(components).filter((c) => c.kind === "board");
  const selected = opts.boardId
    ? boards.filter((b) => b.id === opts.boardId)
    : boards;
  if (opts.boardId && selected.length === 0) {
    return { ran: 0, failed: [`unknown board: ${opts.boardId}`] };
  }

  for (const board of selected) {
    const fits = ideasFor(board, (breadboard as { grid?: { rows: number } }).grid?.rows ?? 63, false);
    const dir = join(root, board.id);
    for (const idea of CURATED_IDEAS) {
      if (!fits.some((f) => f.id === idea.id)) continue;
      const built = composeBuild(
        { idea: idea.blurb, boardId: board.id, partIds: idea.partIds },
        components,
        breadboard as never,
      );
      const files = flashCode(built);
      if (!files) {
        failed.push(`${board.id} × ${idea.id}: no sketch`);
        continue;
      }
      ran += 1;
      const name = `${board.id}__${idea.id}`;
      const err = compileOne(pio, name, files, dir);
      if (err) failed.push(`${name}\n${err}`);
      else console.log(`PASS compile: ${name}`);
    }
  }

  const host =
    boards.find((b) => b.id === "esp32-s3-devkitc-1-n16r8") ?? boards[0];
  if (host && (!opts.boardId || opts.boardId === host.id)) {
    const covered = new Set<string>();
    for (const idea of CURATED_IDEAS) {
      for (const id of idea.partIds) covered.add(id);
    }
    const rest = catalogPartIds().filter(
      (id) =>
        !covered.has(id) &&
        !["breadboard-830", "jumper-male-male", "jumper-male-female", "jumper-female-female"].includes(
          id,
        ),
    );
    const dir = join(root, host.id);
    for (const partId of rest) {
      if (!components[partId]) continue;
      const built = composeBuild(
        { idea: `catalog ${partId}`, boardId: host.id, partIds: [partId] },
        components,
        breadboard as never,
      );
      const files = flashCode(built);
      if (!files) {
        failed.push(`${host.id} × ${partId}: no sketch`);
        continue;
      }
      ran += 1;
      const name = `sample__${partId}`;
      const err = compileOne(pio, name, files, dir);
      if (err) failed.push(`${name}\n${err}`);
      else console.log(`PASS compile: ${name}`);
    }
  }
  return { ran, failed };
}

function parseBoardArg(): string | undefined {
  const fromEnv = process.env.PIO_BOARD?.trim();
  if (fromEnv) return fromEnv;
  const flag = process.argv.indexOf("--board");
  if (flag >= 0) return process.argv[flag + 1];
  const eq = process.argv.find((a) => a.startsWith("--board="));
  return eq ? eq.slice("--board=".length) : undefined;
}

function main(): void {
  const { catalog, issues } = validateCatalog({
    components: RAW_COMPONENTS,
    builds: RAW_BUILDS,
    wireColors: RAW_WIRE_COLORS,
    chips: RAW_CHIPS,
    partsCatalog: RAW_PARTS_CATALOG,
    partsOverlay: RAW_PARTS_OVERLAY,
  });
  if (!catalog || issues.length) {
    console.error("FAIL: spec catalog");
    for (const issue of issues) console.error(`  ${issue.path}: ${issue.message}`);
    process.exit(1);
  }
  if (!pioBin()) {
    console.error("FAIL: pio not found");
    process.exit(1);
  }
  const boardId = parseBoardArg();
  const { ran, failed } = compileCatalog(catalog.components, catalog.breadboard, { boardId });
  if (failed.length) {
    console.error(`FAIL: compile (${failed.length}/${ran})`);
    for (const line of failed) console.error(line);
    process.exit(1);
  }
  console.log(`PASS: compiled ${ran} sketches`);
}

if (existsSync(join(process.cwd(), "scripts/check-compile.ts")) && process.argv[1]?.endsWith("check-compile.ts")) {
  main();
}
