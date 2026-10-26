import { generateText, Output } from "ai";
import { z } from "zod";
import { composeBuild, inferBoardFromAnswers, inferPartsFromIdea } from "@/lib/compose";
import { friendlyComposeError } from "@/lib/compose-error";
import { breadboardForSize, inferBreadboardSize } from "@/lib/breadboards";
import { gatewayModel } from "@/lib/ai/model";
import { isCatalogPart } from "@/lib/parts/catalog";
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
  const allowedParts = new Set(partIds);
  const size = inferBreadboardSize(answers);
  const breadboard = breadboardForSize(catalog.breadboard, size);

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
- Always imply a breadboard; do not list it. Size is chosen separately.
- No photo-of-parts. No free-text parts.`,
      prompt: `Idea: ${idea}\nAnswers: ${JSON.stringify(answers)}`,
      abortSignal: AbortSignal.timeout(8000),
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
      : inferBoardFromAnswers(answers, boardIds);

  const chosenParts = unique(
    [
      ...(plan?.partIds ?? []).filter((id) => isCatalogPart(id, allowedParts)),
      ...partsFromAnswers(answers, partIds),
      ...inferPartsFromIdea(idea).filter((id) => isCatalogPart(id, allowedParts)),
    ],
  );

  const attempt = (partList: string[]) =>
    composeBuild(
      {
        idea,
        boardId: chosenBoard,
        partIds: partList,
        title: plan?.title,
        summary: plan?.summary,
      },
      catalog.components,
      breadboard,
    );

  try {
    let build = attempt(chosenParts);
    let errors = validateBuild(build, catalog.components, breadboard);
    if (errors.length) {
      console.error("compose validator", {
        board: chosenBoard,
        parts: chosenParts,
        size,
        errors,
      });
      build = attempt(inferPartsFromIdea(idea).filter((id) => isCatalogPart(id, allowedParts)));
      errors = validateBuild(build, catalog.components, breadboard);
    }
    if (errors.length) {
      console.error("compose validator after retry", {
        board: chosenBoard,
        errors,
      });
      return Response.json(
        {
          error:
            "Pinout could not seat that circuit on this board. Try another board, or different catalog parts.",
          code: "compose_failed",
        },
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
      breadboard,
      wireColors: catalog.wireColors,
      plan: {
        boardId: chosenBoard,
        partIds: chosenParts,
        breadboard: size,
        llm: plan,
      },
    });
  } catch (error) {
    const details =
      error instanceof Error ? error.message : "Compose failed";
    console.error("compose rejected", {
      board: chosenBoard,
      parts: chosenParts,
      size,
      details,
    });
    return Response.json(friendlyComposeError(error), { status: 422 });
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
