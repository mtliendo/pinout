export type AskCatalog = {
  boards: Array<{ id: string; name: string }>;
  parts: Array<{ id: string; name: string }>;
};

export function fallbackQuestions(catalog: AskCatalog) {
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
        { id: "usb", label: "USB from the computer", catalogId: "" },
        { id: "usb-plus-cap", label: "USB, and I can add a capacitor", catalogId: "" },
      ],
    },
  ];
}
