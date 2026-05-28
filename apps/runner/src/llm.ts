import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-haiku-4-5";

export const LLM_ENABLED = !!process.env.ANTHROPIC_API_KEY;

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}
