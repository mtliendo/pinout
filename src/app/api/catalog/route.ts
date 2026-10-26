import { catalogSummary } from "@/lib/specs/load";

export const runtime = "nodejs";

export function GET() {
  return Response.json(catalogSummary());
}
