import { generateText, Output } from "ai";
import { z } from "zod";
import { gatewayModel } from "@/lib/ai/model";
import { catalogSummary } from "@/lib/specs/load";

export const runtime = "nodejs";
export const maxDuration = 30;

const QuestionSchema = z.object({
  questions: z
    .array(
      z.object({
        id: z.string(),
        prompt: z.string(),
        multi: z.boolean(),
        options: z.array(
          z.object({
            id: z.string(),
            label: z.string(),
            catalogId: z.string().optional(),
          }),
        ),
      }),
    )
    .max(5),
});

export async function POST(request: Request) {
  const body = (await request.json()) as { idea?: string };
  const idea = (body.idea ?? "").trim();
  if (!idea) {
    return Response.json({ error: "Tell Pinout what you want to build." }, { status: 400 });
  }

  const catalog = catalogSummary();
  const boards = catalog.boards
    .map((b) => `${b.id} (${b.name})`)
    .join("; ");
  const parts = catalog.parts.map((p) => `${p.id}: ${p.name}`).join("; ");

  try {
    const { output } = await generateText({
      model: gatewayModel(),
      instructions: `You write short hardware intake questions for Pinout, an ESP32 wiring guide.
Rules:
- At most 5 questions, usually 3.
- Options must be chips the user can tap. Prefer catalog ids.
- Ask which board they have, which catalog parts they already have, and only the clarifications that change the wiring.
- Never invent pins, voltages, or parts that are not in the catalog.
- Do not ask for pin numbers. Pin assignment is deterministic and never comes from you.
Catalog boards: ${boards}
Catalog parts: ${parts}`,
      prompt: `Idea: ${idea}`,
      output: Output.object({
        name: "IntakeQuestions",
        schema: QuestionSchema,
      }),
    });

    return Response.json({ idea, questions: output.questions.slice(0, 5) });
  } catch (error) {
    console.error("ask failed", error);
    return Response.json({
      idea,
      questions: fallbackQuestions(catalog),
    });
  }
}

function fallbackQuestions(catalog: ReturnType<typeof catalogSummary>) {
  return [
    {
      id: "board",
      prompt: "Which board are you building on?",
      multi: false,
      options: catalog.boards.map((b) => ({
        id: b.id,
        label: b.name.split("(")[0].trim(),
        catalogId: b.id,
      })),
    },
    {
      id: "parts",
      prompt: "Which of these do you already have?",
      multi: true,
      options: catalog.parts.map((p) => ({
        id: p.id,
        label: p.name,
        catalogId: p.id,
      })),
    },
    {
      id: "power",
      prompt: "How will you power the build?",
      multi: false,
      options: [
        { id: "usb", label: "USB from the computer" },
        { id: "usb-plus-cap", label: "USB, and I can add a capacitor" },
      ],
    },
  ];
}
