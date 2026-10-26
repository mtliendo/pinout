import { generateText, Output } from "ai";
import { z } from "zod";
import { composeBuild, inferBoardFromAnswers, inferPartsFromIdea } from "@/lib/compose";
import { gatewayModel } from "@/lib/ai/model";
import { loadCatalog } from "@/lib/specs/load";
import { validateBuild } from "@/lib/specs/validate";

export const runtime = "nodejs";
export const maxDuration = 45;

const PlanSchema = z.object({
  title: z.string(),
  summary: z.string(),
  boardId: z.string(),
  partIds: z.array(z.string()),
});

export async function POST(request: Request) {
  const body = (await request.json()) as {
    idea?: string;
    answers?: Record<string, string | string[]>;
  };
  const idea = (body.idea ?? "").trim();
  const answers = body.answers ?? {};
  if (!idea) {
    return Response.json({ error: "Missing idea" }, { status: 400 });
  }

  const catalog = loadCatalog();
  const boardIds = Object.values(catalog.components)
    .filter((c) => c.kind === "board")
    .map((c) => c.id);
  const partIds = Object.values(catalog.components)
    .filter((c) => c.kind !== "board" && c.kind !== "breadboard")
    .map((c) => c.id);

  let plan: z.infer<typeof PlanSchema> | null = null;
  try {
    const { output } = await generateText({
      model: gatewayModel(),
      instructions: `Compose an ESP32 hardware build for Pinout.
HARD RULES:
- Choose boardId only from: ${boardIds.join(", ")}
- Choose partIds only from: ${partIds.join(", ")}
- Never invent a part, pin, GPIO, or hole.
- Never assign pins. Deterministic code assigns signals from each board's safe_gpio.
- Prefer the fewest catalog parts that make the idea work.
- A motion/PIR/servo idea should include hc-sr501-pir, sg90-servo, led-5mm-red, resistor-220.
- A button + LED + OLED idea should include tactile-button-6mm, led-5mm-red, resistor-220, ssd1306-oled-128x64-i2c.
- Always imply breadboard-830; do not list it.`,
      prompt: `Idea: ${idea}\nAnswers: ${JSON.stringify(answers)}`,
      output: Output.object({
        name: "BuildPlan",
        schema: PlanSchema,
      }),
    });
    plan = output;
  } catch (error) {
    console.error("compose plan failed", error);
  }

  const chosenBoard =
    plan && boardIds.includes(plan.boardId)
      ? plan.boardId
      : inferBoardFromAnswers(answers);

  const chosenParts = unique(
    [
      ...(plan?.partIds ?? []).filter((id) => partIds.includes(id)),
      ...partsFromAnswers(answers, partIds),
      ...inferPartsFromIdea(idea),
    ],
  );

  try {
    let build = composeBuild(
      {
        idea,
        boardId: chosenBoard,
        partIds: chosenParts,
        title: plan?.title,
        summary: plan?.summary,
      },
      catalog.components,
      catalog.breadboard,
    );

    let errors = validateBuild(build, catalog.components, catalog.breadboard);
    if (errors.length) {
      build = composeBuild(
        {
          idea,
          boardId: "esp32-s3-devkitc-1-n16r8",
          partIds: inferPartsFromIdea(idea),
          title: plan?.title,
          summary: plan?.summary,
        },
        catalog.components,
        catalog.breadboard,
      );
      errors = validateBuild(build, catalog.components, catalog.breadboard);
    }
    if (errors.length) {
      return Response.json(
        { error: "Validator rejected the build", details: errors },
        { status: 422 },
      );
    }

    const used = new Set(build.parts.map((p) => p.component));
    used.add("breadboard-830");
    used.add(build.board);
    const components = Object.fromEntries(
      Object.entries(catalog.components).filter(([key]) => used.has(key)),
    );

    return Response.json({
      build,
      components,
      breadboard: catalog.breadboard,
      wireColors: catalog.wireColors,
      plan: {
        boardId: chosenBoard,
        partIds: chosenParts,
        llm: plan,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Compose failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function partsFromAnswers(
  answers: Record<string, string | string[]>,
  allowed: string[],
): string[] {
  return Object.values(answers)
    .flat()
    .filter((value): value is string => typeof value === "string")
    .filter((value) => allowed.includes(value));
}
