import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { composeBuild } from "../src/lib/compose";
import { CURATED_IDEAS, ideasFor } from "../src/lib/ideas/catalog";
import { catalogPartIds } from "../src/lib/parts/catalog";
import type { Component } from "../src/lib/specs/schema";

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
  root: string,
): string | null {
  const dir = join(root, name.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 80));
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "platformio.ini"), files["platformio.ini"]);
  writeFileSync(join(dir, "src/main.cpp"), files["src/main.cpp"]);
  const result = spawnSync(pio, ["run", "-d", dir], {
    encoding: "utf8",
    timeout: 600_000,
    env: {
      ...process.env,
      PLATFORMIO_CORE_DIR: process.env.PLATFORMIO_CORE_DIR ?? join(root, ".pio-core"),
    },
  });
  if (result.status === 0) return null;
  const out = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const tail = out.trim().split("\n").slice(-40).join("\n");
  return tail || `pio run failed (${result.status})`;
}

export function compileCatalog(
  components: Record<string, Component>,
  breadboard: Component,
): { ran: number; failed: string[] } {
  const pio = pioBin();
  if (!pio) return { ran: 0, failed: [] };
  const root = join(tmpdir(), "pinout-pio");
  mkdirSync(root, { recursive: true });
  const failed: string[] = [];
  let ran = 0;
  const boards = Object.values(components).filter((c) => c.kind === "board");
  const jobs: Array<{ name: string; files: Record<string, string> }> = [];

  for (const board of boards) {
    const fits = ideasFor(board, (breadboard as { grid?: { rows: number } }).grid?.rows ?? 63, false);
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
      jobs.push({ name: `${board.id}__${idea.id}`, files });
    }
  }

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
  const host =
    boards.find((b) => b.id === "esp32-s3-devkitc-1-n16r8") ?? boards[0];
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
    jobs.push({ name: `sample__${partId}`, files });
  }

  for (const job of jobs) {
    ran += 1;
    const err = compileOne(pio, job.name, job.files, root);
    if (err) failed.push(`${job.name}\n${err}`);
    else console.log(`PASS compile: ${job.name}`);
  }
  return { ran, failed };
}

if (existsSync(join(process.cwd(), "scripts/check-compile.ts")) && process.argv[1]?.endsWith("check-compile.ts")) {
  console.log("Run via check:specs so the catalog is already loaded.");
}
