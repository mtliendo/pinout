import { RAW_BUILDS, RAW_COMPONENTS, RAW_WIRE_COLORS } from "../src/lib/specs/files";
import { validateCatalog } from "../src/lib/specs/validate";

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

console.log(
  `PASS: ${Object.keys(catalog.components).length} components, ${
    Object.keys(catalog.builds).length
  } builds`,
);
