# Schema additions for parts (Maker, 2026-10-26). For merging into schema.md.

**Files**
- `gen_parts.py` (with `parts_sensors.py`, `parts_outputs.py`, `parts_passives.py`) writes `components/<id>.json` for 42 new parts. Run it with `python3 gen_parts.py`.
- `parts-overlay.json`: the `part` block for the 7 parts `gen.py` owns (sg90-servo, hc-sr501-pir, led-5mm-red, resistor-220, tactile-button-6mm, ssd1306-oled-128x64-i2c, breadboard-830). On merge, either copy these into gen.py or have the app merge overlay into the component.
- `parts-catalog.json`: the pickable parts list `{count, categories{cat:[ids]}}`. The app should only offer ids listed here.
- `validate_parts.py` checks all 49 parts, runs 18 negative tests, then runs `validate.py` unchanged.
- `sources/parts/urls.json` holds every source URL; cached copies are in `sources/parts/`.

**Component additions** (everything else matches schema.md)
- `kind` stays one of the 5 schema kinds. Displays use `sensor`, like the existing SSD1306; the finer grouping is `part.category`.
- `headers[].pin_order_approx: true` means clones vary. The header `note` must then say to read the silkscreen (enforced).
- A `headers[].pitch` or any value may be `{"value","approx":true,"note"}`. An approx without a note fails validation.
- `safety[]` (relay only) is plain-words safety text the guide must show.
- `controls[]` covers trimpots and jumpers, as on the PIR.

**`part` block** (required on every catalog part)
- `category`: sensor | display | actuator | input | passive | wire | power | breadboard
- `supply_v`: `{min, max|null, note?}`, the part's own supply range.
- `logic`: `{level, ...}`, the signal level the MCU sees.
- `compat`: `{mcu_3v3:{status,needs[]}, mcu_5v:{status,needs[]}}`. Status is yes | with_conditions | no. Anything other than yes needs at least one `needs` entry, written as an instruction the guide can show.
- `interface`: `{type, i2c_addresses?[]}`. I2C parts must list 7-bit addresses.
- `current_ma`: `{typ?, max?, max_per_led?, note}`, taken only from sources. Arithmetic estimates are labelled as arithmetic.
- `required_passives[]`: `{kind, value, between[], source?, optional?, placement?, for?}`
- `mounting`: breadboard | off_board | off_board_or_breadboard_edge | breadboard_rails | base | (jumpers: a free-text route)
- `lib_deps[]`: PlatformIO `owner/name`. Only ids verified against api.registry.platformio.org are allowed (whitelist in validate_parts.py).
- `approx_fields[]`: the fields that are approx, for UI badges.
- `no_gnd_pin?`: the reason an active-category part has no GND pin.

**Validator rules worth porting into validate.py**
- A part whose `supply_v.max` < 4.5 can't be plain "yes" on 5V MCUs.
- A part whose `supply_v.min` ≥ 4.5 with non-3.3V logic can't be plain "yes" on 3.3V MCUs.
- Builds should fail any net joining a GPIO to a pin whose part `compat.mcu_3v3.status` is with_conditions unless the build includes the listed passive or level shifter. That's not implemented yet because builds don't use these parts yet.
