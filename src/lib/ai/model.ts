export function gatewayModel(): string {
  return process.env.AI_GATEWAY_MODEL ?? "openai/gpt-4.1";
}
