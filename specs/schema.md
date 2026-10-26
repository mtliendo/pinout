# Pinout spec format

**Directory layout**
- `components/<id>.json`: one per part.
- `builds/<id>.json`: guided builds.
- `wire-colors.json`, then `validate.py` (run it: `python3 validate.py`, which exits non-zero on error).

**Coordinates**
- Units are mm. The origin is pin 1 of the part (the boards note the exact offset to the PCB corner).
- +X runs along the header, +Y across, and +Z up.
- Any value given as `{"value":n,"approx":true,"note":...}` is not dimensioned by the source.

## Component
- `id`, `name`, `kind`: one of board, breadboard, sensor, actuator or passive.
- `body`: length, width and height in mm.
- `colors`: color hints for rendering.
- `coordinate_frame`
- `headers[]`: `{id, origin_mm:[x,y], pitch, count, orientation, pin1}`
- `pins[]`:
  - `{id, label, gpio|null, header, position:{index,x,y}, functions[], alt_functions[], voltage, flags{input_only, strapping, usb, psram_flash_reserved, boot_sensitive}, warnings[]}`
  - Pin ids: `J1.4` and so on for DevKit headers, `L.1`/`R.1` for XIAO, and names like `VCC`/`OUT` for modules.
- `safe_gpio[]`: the only GPIOs a build may use for signals.
- `caution_gpio{}` and `no_go_gpio{}`: each maps a GPIO to its reason.
- `features[]`: `{id, kind, position_mm, approx}` for USB, buttons, LEDs and the antenna.
- `provenance`: `{sources[], revision, verified_by:"Maker", verified_on, notes}`

## Breadboard
- `grid`: 63 rows by columns a-j. Hole ids look like `e10`. Rows a-e are connected to each other, and so are f-j.
- `center_gap`: the gap between columns e and f.
- `rails[]`: L-, L+, R+ and R-. Rail holes are written `L+@21`, meaning the rail hole nearest row 21.

## Build
- `parts[]`: `{id, component, qty}`
- `placements[]`: `{part, anchor_hole, rotation_deg, pin_holes{pinId:hole}}`, or `off_board:true` with a `position_hint`.
- `connections[]`: `{id, from, to, color, length_mm, net}`. The endpoints are a hole (`a4`, `L+@40`) or a part pin (`pir:OUT`).
- `steps[]`:
  - `{n, heading, body, parts_needed[], highlight[], connections_added[], camera, callout, safety[], check}`
  - The last step also has `code{filename: text}`.
