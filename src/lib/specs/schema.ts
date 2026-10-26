import { z } from "zod";

/** A millimetre value, or an approximate {value, approx} wrapper from the catalog. */
export const DimValueSchema = z.union([
  z.number(),
  z
    .object({
      value: z.number(),
      approx: z.boolean().optional(),
      note: z.string().optional(),
      source: z.string().optional(),
    })
    .passthrough(),
]);

export type DimValue = z.infer<typeof DimValueSchema>;

export function dim(value: DimValue | undefined | null, fallback = 0): number {
  if (value == null) return fallback;
  if (typeof value === "number") return value;
  return value.value;
}

export function isApprox(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === "object" &&
      "approx" in value &&
      (value as { approx?: boolean }).approx,
  );
}

export const PinFlagsSchema = z
  .object({
    input_only: z.boolean().optional(),
    strapping: z.boolean().optional(),
    usb: z.boolean().optional(),
    psram_flash_reserved: z.boolean().optional(),
    boot_sensitive: z.boolean().optional(),
  })
  .passthrough();

export const PinSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    gpio: z.number().nullable().optional(),
    header: z.number().optional(),
    position: z
      .object({
        index: z.number(),
        x: z.number(),
        y: z.number(),
      })
      .passthrough(),
    functions: z.array(z.string()).default([]),
    alt_functions: z.array(z.string()).optional(),
    voltage: z.string().optional(),
    flags: PinFlagsSchema.optional(),
    warnings: z.array(z.string()).optional(),
    physical_pin: z.number().optional(),
  })
  .passthrough();

export type Pin = z.infer<typeof PinSchema>;

export const HeaderSchema = z
  .object({
    id: z.string(),
    origin_mm: z.tuple([z.number(), z.number()]),
    pitch: DimValueSchema,
    count: z.number(),
    orientation: z.string().optional(),
    pin1: z.string().optional(),
    pin_order_approx: z.boolean().optional(),
    kind: z.string().optional(),
    side: z.string().optional(),
    note: z.string().optional(),
  })
  .passthrough();

export const ProvenanceSchema = z
  .object({
    sources: z.array(z.string()).min(1),
    revision: z.string().optional(),
    verified_by: z.string(),
    verified_on: z.string().optional(),
    notes: z.string().optional(),
    pins_from: z.string().optional(),
  })
  .passthrough();

export const FeatureSchema = z
  .object({
    id: z.string(),
    kind: z.string(),
    position_mm: z
      .object({
        x: z.number().optional(),
        y: z.number().optional(),
        z: z.number().optional(),
      })
      .passthrough()
      .optional(),
    approx: z.boolean().optional(),
    note: z.string().optional(),
    label: z.string().optional(),
    gpio: z.unknown().optional(),
    connector: z.string().optional(),
  })
  .passthrough();

export const BodySchema = z
  .object({
    length_mm: DimValueSchema.optional(),
    width_mm: DimValueSchema.optional(),
    height_mm: DimValueSchema.optional(),
    diameter_mm: DimValueSchema.optional(),
    pcb_thickness_mm: DimValueSchema.optional(),
    outline_offset_from_pin1: z
      .object({ x: z.number(), y: z.number() })
      .passthrough()
      .optional(),
    lead_spacing_mm: DimValueSchema.optional(),
    lens_diameter_mm: DimValueSchema.optional(),
    span_holes: z.number().optional(),
    lead_pitch_mm: z.unknown().optional(),
    note: z.string().optional(),
    source: z.string().optional(),
  })
  .passthrough();

export const ComponentSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    kind: z.enum(["board", "breadboard", "sensor", "actuator", "passive"]),
    body: BodySchema.optional(),
    colors: z.record(z.string(), z.unknown()).optional(),
    coordinate_frame: z.unknown().optional(),
    headers: z.array(HeaderSchema).optional(),
    pins: z.array(PinSchema).optional(),
    safe_gpio: z.array(z.number()).optional(),
    caution_gpio: z.record(z.string(), z.string()).optional(),
    no_go_gpio: z.record(z.string(), z.string()).optional(),
    features: z.array(FeatureSchema).optional(),
    provenance: ProvenanceSchema,
    grid: z.unknown().optional(),
    rails: z.unknown().optional(),
    header_row_spacing_mm: DimValueSchema.optional(),
    electrical: z.unknown().optional(),
    power: z.unknown().optional(),
    controls: z.unknown().optional(),
    wire_length_mm: DimValueSchema.optional(),
    safety: z.array(z.string()).optional(),
    part: z
      .object({
        category: z.enum([
          "sensor",
          "display",
          "actuator",
          "input",
          "passive",
          "wire",
          "power",
          "breadboard",
        ]),
        supply_v: z
          .object({
            min: z.number().nullable().optional(),
            max: z.number().nullable().optional(),
            note: z.string().optional(),
          })
          .passthrough(),
        logic: z
          .object({
            level: z.string().optional(),
          })
          .passthrough(),
        compat: z
          .object({
            mcu_3v3: z
              .object({
                status: z.enum(["yes", "with_conditions", "no"]),
                needs: z.array(z.string()).default([]),
              })
              .passthrough(),
            mcu_5v: z
              .object({
                status: z.enum(["yes", "with_conditions", "no"]),
                needs: z.array(z.string()).default([]),
              })
              .passthrough(),
          })
          .passthrough(),
        interface: z
          .object({
            type: z.string(),
            i2c_addresses: z.array(z.string()).optional(),
          })
          .passthrough(),
        current_ma: z.unknown().optional(),
        required_passives: z.array(z.unknown()).default([]),
        mounting: z.string(),
        lib_deps: z.array(z.string()).default([]),
        approx_fields: z.array(z.string()).default([]),
        no_gnd_pin: z.string().optional(),
      })
      .passthrough()
      .optional(),
    /** Incoming: 3.3V vs 5V logic (Uno/Nano). Warn when a 3.3V-only part hits 5V. */
    logic_voltage: z.enum(["3.3V", "5V"]).optional(),
    /** Incoming: `chips/<chip>.json` — pin safety is never inferred. */
    chip: z.string().optional(),
    /** Incoming: breadboard vs off-board female-header boards (Uno R3). */
    placement: z.enum(["breadboard", "off_board_headers"]).optional(),
    logic: z
      .object({
        logic_voltage_v: z.number().optional(),
        five_v_logic: z.boolean().optional(),
        pin_voltage: z.string().optional(),
        warning: z.string().optional(),
      })
      .passthrough()
      .optional(),
    breadboard_fit: z
      .object({
        fits_830: z.boolean(),
        off_board: z.boolean().optional(),
        connector: z.string().optional(),
        straddle: z.record(z.string(), z.string()).optional(),
        free_holes_per_row: z
          .object({
            left: z.number().optional(),
            right: z.number().optional(),
          })
          .passthrough()
          .optional(),
        rows: z.string().optional(),
        note: z.string().optional(),
      })
      .passthrough()
      .optional(),
    platformio: z
      .object({
        board: z.string().optional(),
        platform: z.string().optional(),
        framework: z.string().optional(),
        core: z.string().optional(),
        arduino: z
          .object({
            platform: z.string().optional(),
            framework: z.string().optional(),
            note: z.string().optional(),
          })
          .passthrough()
          .optional(),
        alt: z.unknown().optional(),
        alt_frameworks: z.array(z.string()).optional(),
        note: z.string().optional(),
        source: z.string().optional(),
      })
      .passthrough()
      .optional(),
    defaults: z
      .object({
        i2c: z
          .object({ sda: z.number(), scl: z.number() })
          .passthrough()
          .optional(),
        spi: z
          .object({
            sck: z.number().optional(),
            mosi: z.number().optional(),
            miso: z.number().optional(),
            cs: z.number().optional(),
          })
          .passthrough()
          .optional(),
        uart0: z.unknown().optional(),
        led_builtin: z.number().nullable().optional(),
        pio: z
          .object({
            platform: z.string(),
            board: z.string(),
            framework: z.string(),
          })
          .passthrough()
          .optional(),
        chip: z.string().optional(),
        placement: z.enum(["breadboard", "off_board_headers"]).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type Component = z.infer<typeof ComponentSchema>;

export const BreadboardGridSchema = z
  .object({
    rows: z.number(),
    columns: z.array(z.string()),
    pitch: z.number(),
    hole_id_format: z.string().optional(),
    column_y_mm: z.record(z.string(), z.number()),
    connected_strips: z.string().optional(),
    center_gap: z.unknown().optional(),
  })
  .passthrough();

export const RailSchema = z
  .object({
    id: z.string(),
    side: z.string().optional(),
    polarity: z.string(),
    color: z.string().optional(),
    y_mm: DimValueSchema,
  })
  .passthrough();

export const BreadboardSchema = ComponentSchema.extend({
  kind: z.literal("breadboard"),
  grid: BreadboardGridSchema,
  rails: z.array(RailSchema),
  rail_hole_id_format: z.string().optional(),
  rail_notes: z.array(z.string()).optional(),
});

export type Breadboard = z.infer<typeof BreadboardSchema>;

export const PlacementSchema = z
  .object({
    part: z.string(),
    anchor_hole: z.string().nullable().optional(),
    rotation_deg: z.number().optional(),
    pin_holes: z.record(z.string(), z.string()).optional(),
    off_board: z.boolean().optional(),
    position_hint: z.string().optional(),
    note: z.string().optional(),
  })
  .passthrough();

export type Placement = z.infer<typeof PlacementSchema>;

export const ConnectionSchema = z
  .object({
    id: z.string(),
    from: z.string(),
    to: z.string(),
    color: z.string(),
    length_mm: z.number().optional(),
    net: z.string().optional(),
    note: z.string().optional(),
  })
  .passthrough();

export type Connection = z.infer<typeof ConnectionSchema>;

export const StepSchema = z
  .object({
    n: z.number(),
    heading: z.string(),
    body: z.string(),
    parts_needed: z.array(z.string()).default([]),
    highlight: z.array(z.string()).default([]),
    connections_added: z.array(z.string()).default([]),
    camera: z.string(),
    callout: z.string(),
    safety: z.array(z.string()).default([]),
    check: z.string(),
    code: z.record(z.string(), z.string()).optional(),
  })
  .passthrough();

export type Step = z.infer<typeof StepSchema>;

export const BuildPartSchema = z
  .object({
    id: z.string(),
    component: z.string(),
    qty: z.number(),
    note: z.string().optional(),
  })
  .passthrough();

export const BuildSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    summary: z.string(),
    board: z.string(),
    parts: z.array(BuildPartSchema),
    placements: z.array(PlacementSchema),
    connections: z.array(ConnectionSchema),
    steps: z.array(StepSchema),
    provenance: z
      .object({
        verified_by: z.string().optional(),
        verified_on: z.string().optional(),
        pins_from: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type Build = z.infer<typeof BuildSchema>;

export const WireColorsSchema = z
  .object({
    power: z.record(z.string(), z.string()),
    names: z.record(z.string(), z.string()),
    signal_palette: z.array(
      z.object({ name: z.string(), hex: z.string() }).passthrough(),
    ),
    conventions: z.record(z.string(), z.string()),
  })
  .passthrough();

export type WireColors = z.infer<typeof WireColorsSchema>;

export const ChipSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    logic_voltage_v: z.number(),
    five_v_tolerant: z.boolean(),
    gpio_numbers: z.array(z.number()).optional(),
    safe_gpio: z.array(z.number()),
    caution_gpio: z.record(z.string(), z.string()),
    no_go_gpio: z.record(z.string(), z.string()),
    strapping_gpio: z.array(z.number()).optional(),
    input_only_gpio: z.array(z.number()).optional(),
    usb_gpio: z
      .union([z.record(z.string(), z.number()), z.null()])
      .optional(),
    uart0: z
      .object({
        tx: z.number().optional(),
        rx: z.number().optional(),
      })
      .passthrough()
      .optional(),
    platformio: z.unknown().optional(),
    label_aliases: z.unknown().optional(),
    provenance: ProvenanceSchema,
  })
  .passthrough();

export type Chip = z.infer<typeof ChipSchema>;
