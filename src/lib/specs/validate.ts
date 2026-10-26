import {
  BreadboardSchema,
  BuildSchema,
  ComponentSchema,
  PinFlagsSchema,
  WireColorsSchema,
  type Breadboard,
  type Build,
  type Component,
  type Pin,
  type WireColors,
} from "./schema";

export type ValidationIssue = { path: string; message: string };

export type Catalog = {
  components: Record<string, Component>;
  breadboard: Breadboard;
  builds: Record<string, Build>;
  wireColors: WireColors;
};

const HOLE = /^([a-j])(\d+)$/;
const RAIL = /^(L\+|L-|R\+|R-)@(\d+)$/;

const FIVE_V_MODULES = new Set(["hc-sr501-pir", "sg90-servo"]);

export function holeNode(
  hole: string,
  breadboard: Breadboard,
): string | null {
  const rows = breadboard.grid.rows;
  const hm = HOLE.exec(hole);
  if (hm) {
    const row = Number(hm[2]);
    if (row < 1 || row > rows) return null;
    return `strip:${"abcde".includes(hm[1]) ? "L" : "R"}${row}`;
  }
  const rm = RAIL.exec(hole);
  if (rm) {
    const row = Number(rm[2]);
    if (row < 1 || row > rows) return null;
    return `rail:${rm[1]}`;
  }
  return null;
}

function findRoot(
  parent: Record<string, string>,
  node: string,
): string {
  parent[node] ??= node;
  while (parent[node] !== node) {
    parent[node] = parent[parent[node]];
    node = parent[node];
  }
  return node;
}

function union(
  parent: Record<string, string>,
  a: string,
  b: string,
): void {
  parent[findRoot(parent, a)] = findRoot(parent, b);
}

function riskyFlags(flags: Pin["flags"]): boolean {
  const parsed = PinFlagsSchema.safeParse(flags ?? {});
  const f = parsed.success ? parsed.data : {};
  return Boolean(
    f.strapping || f.usb || f.psram_flash_reserved || f.input_only,
  );
}

function isFiveVoltPin(component: Component, pin: Pin): boolean {
  if (pin.label === "5V") return true;
  if (pin.id === "VCC" && FIVE_V_MODULES.has(component.id)) return true;
  return false;
}

/** Port of specs/tools/validate.py: catalog integrity plus per-build electrical rules. */
export function validateCatalog(raw: {
  components: unknown[];
  builds: unknown[];
  wireColors: unknown;
}): { catalog: Catalog | null; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const components: Record<string, Component> = {};

  for (const rawComp of raw.components) {
    const parsed = ComponentSchema.safeParse(rawComp);
    if (!parsed.success) {
      issues.push({
        path: `components/${(rawComp as { id?: string })?.id ?? "?"}`,
        message: parsed.error.issues.map((i) => i.message).join("; "),
      });
      continue;
    }
    const comp = parsed.data;
    const required =
      comp.kind === "breadboard"
        ? (["id", "name", "kind", "provenance"] as const)
        : (["id", "name", "kind", "pins", "provenance"] as const);
    for (const key of required) {
      if (comp[key] == null) {
        issues.push({
          path: `components/${comp.id}`,
          message: `missing ${key}`,
        });
      }
    }
    const provenance = comp.provenance;
    if (
      !provenance?.sources?.length ||
      provenance.verified_by !== "Maker"
    ) {
      issues.push({
        path: `components/${comp.id}`,
        message: "provenance incomplete",
      });
    }
    const pinIds = (comp.pins ?? []).map((p) => p.id);
    if (pinIds.length !== new Set(pinIds).size) {
      issues.push({
        path: `components/${comp.id}`,
        message: "duplicate pin ids",
      });
    }
    for (const gpio of comp.safe_gpio ?? []) {
      const pins = (comp.pins ?? []).filter((p) => p.gpio === gpio);
      if (comp.kind === "board" && pins.length === 0) {
        issues.push({
          path: `components/${comp.id}`,
          message: `safe gpio ${gpio} not on a header pin`,
        });
      }
      for (const pin of pins) {
        if (riskyFlags(pin.flags)) {
          issues.push({
            path: `components/${comp.id}`,
            message: `safe gpio ${gpio} has a risky flag`,
          });
        }
      }
    }
    components[comp.id] = comp;
  }

  const wireParsed = WireColorsSchema.safeParse(raw.wireColors);
  if (!wireParsed.success) {
    issues.push({
      path: "wire-colors.json",
      message: wireParsed.error.issues.map((i) => i.message).join("; "),
    });
  }

  const breadRaw = components["breadboard-830"];
  const breadParsed = BreadboardSchema.safeParse(breadRaw);
  if (!breadParsed.success) {
    issues.push({
      path: "components/breadboard-830",
      message: breadParsed.error.issues.map((i) => i.message).join("; "),
    });
  }

  const builds: Record<string, Build> = {};
  for (const rawBuild of raw.builds) {
    const parsed = BuildSchema.safeParse(rawBuild);
    if (!parsed.success) {
      issues.push({
        path: `builds/${(rawBuild as { id?: string })?.id ?? "?"}`,
        message: parsed.error.issues.map((i) => i.message).join("; "),
      });
      continue;
    }
    builds[parsed.data.id] = parsed.data;
    if (breadParsed.success) {
      issues.push(
        ...validateBuild(parsed.data, components, breadParsed.data).map(
          (message) => ({
            path: `builds/${parsed.data.id}`,
            message,
          }),
        ),
      );
    }
  }

  if (issues.length || !breadParsed.success || !wireParsed.success) {
    return { catalog: null, issues };
  }

  return {
    catalog: {
      components,
      breadboard: breadParsed.data,
      builds,
      wireColors: wireParsed.data,
    },
    issues,
  };
}

/**
 * Runtime / compose-time checks from validate.py:
 * real pins and holes, safe GPIO only, never a GPIO on a 5V net.
 */
export function validateBuild(
  build: Build,
  components: Record<string, Component>,
  breadboard: Breadboard,
): string[] {
  const err: string[] = [];
  const parts: Record<string, string> = {};
  for (const part of build.parts) {
    parts[part.id] = part.component;
  }

  const parent: Record<string, string> = {};
  const used: Record<string, string> = {};
  const pinmeta: Record<string, { component: Component; pin: Pin }> = {};

  for (const placement of build.placements) {
    const component = components[parts[placement.part]];
    if (!component) {
      err.push(`placement part ${placement.part} unknown`);
      continue;
    }
    const pins = Object.fromEntries(
      (component.pins ?? []).map((p) => [p.id, p]),
    );
    for (const [pinId, hole] of Object.entries(placement.pin_holes ?? {})) {
      if (!pins[pinId]) {
        err.push(
          `${placement.part}.${pinId} not a pin of ${component.id}`,
        );
        continue;
      }
      const node = holeNode(hole, breadboard);
      if (!node) {
        err.push(`bad hole ${hole}`);
        continue;
      }
      if (used[hole]) {
        err.push(`hole ${hole} used twice (${used[hole]})`);
      }
      used[hole] = `${placement.part}:${pinId}`;
      const pinNode = `${placement.part}:${pinId}`;
      union(parent, pinNode, node);
      pinmeta[pinNode] = { component, pin: pins[pinId] };
    }
  }

  const endpoint = (value: string): string | null => {
    if (value.includes(":")) {
      const [partId, pinId] = value.split(":", 2);
      const component = components[parts[partId]];
      const pin = component?.pins?.find((p) => p.id === pinId);
      if (!component || !pin) {
        err.push(`endpoint ${value} not a real pin`);
        return null;
      }
      pinmeta[value] = { component, pin };
      return value;
    }
    const node = holeNode(value, breadboard);
    if (!node) {
      err.push(`endpoint ${value} not a real hole`);
      return null;
    }
    return node;
  };

  const connectionIds = new Set<string>();
  const touched = new Set<string>();
  for (const wire of build.connections) {
    connectionIds.add(wire.id);
    const a = endpoint(wire.from);
    const z = endpoint(wire.to);
    if (a && z) {
      union(parent, a, z);
      touched.add(a);
      touched.add(z);
    }
  }

  for (const step of build.steps) {
    for (const id of step.connections_added ?? []) {
      if (!connectionIds.has(id)) {
        err.push(`step ${step.n} unknown connection ${id}`);
      }
    }
  }

  const nets: Record<
    string,
    Array<{ node: string; component: Component; pin: Pin }>
  > = {};
  for (const [node, meta] of Object.entries(pinmeta)) {
    const root = findRoot(parent, node);
    (nets[root] ??= []).push({ node, ...meta });
  }

  const railFive = findRoot(parent, "rail:L+");
  findRoot(parent, "rail:R+");

  const usedRails = new Set<string>();
  for (const wire of build.connections) {
    for (const end of [wire.from, wire.to]) {
      const match = RAIL.exec(end);
      if (match) usedRails.add(match[1]);
    }
  }
  const powerName = (pin: Pin) => {
    const label = (pin.label ?? "").toUpperCase();
    const id = pin.id.toUpperCase();
    return (
      label === "G" ||
      label === "GND" ||
      label === "5V" ||
      label === "3V3" ||
      label === "3.3V" ||
      id === "GND" ||
      id === "5V" ||
      id === "3V3" ||
      id === "G"
    );
  };
  for (const rail of usedRails) {
    const root = findRoot(parent, `rail:${rail}`);
    const fed = Object.entries(pinmeta).some(([node, { component, pin }]) => {
      return (
        findRoot(parent, node) === root &&
        component.kind === "board" &&
        powerName(pin)
      );
    });
    if (!fed) {
      err.push(`rail ${rail} is used but never fed from a board power pin`);
    }
  }

  for (const [root, members] of Object.entries(nets)) {
    if (![...touched].some((t) => findRoot(parent, t) === root)) continue;
    const five =
      members.some(({ component, pin }) => isFiveVoltPin(component, pin)) ||
      root === railFive ||
      root === findRoot(parent, "rail:R+");
    for (const { node, component, pin } of members) {
      const gpio = pin.gpio;
      if (component.kind === "board" && gpio != null) {
        if (!(component.safe_gpio ?? []).includes(gpio)) {
          err.push(`signal on non-safe GPIO${gpio} (${node})`);
        }
        if (five) {
          err.push(`GPIO${gpio} shares a net with 5V!`);
        }
      }
    }
  }

  return err;
}

export function assertValidBuild(
  build: Build,
  components: Record<string, Component>,
  breadboard: Breadboard,
): void {
  const errors = validateBuild(build, components, breadboard);
  if (errors.length) {
    throw new Error(`Invalid build ${build.id}:\n${errors.join("\n")}`);
  }
}
